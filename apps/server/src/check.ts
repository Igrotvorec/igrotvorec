import * as acorn from "acorn";
import * as walk from "acorn-walk";

/** Достаёт JS из ответа LLM, даже если он обёрнут в markdown-блок или окружён текстом. */
export function extractCode(reply: string): string {
  const fenced = [...reply.matchAll(/```(?:js|javascript)?\s*\n([\s\S]*?)```/gi)].map((m) => m[1] ?? "");
  if (fenced.length) return fenced.sort((a, b) => b.length - a.length)[0]!.trim();
  return reply.replace(/^```(?:js|javascript)?\s*/i, "").replace(/```\s*$/, "").trim();
}

/** Глобальные идентификаторы, обращение к которым в игре запрещено. */
const FORBIDDEN_GLOBALS: Record<string, string> = {
  fetch: "сеть (fetch)",
  XMLHttpRequest: "сеть (XMLHttpRequest)",
  WebSocket: "сеть (WebSocket)",
  EventSource: "сеть (EventSource)",
  Worker: "Web Worker",
  SharedWorker: "Web Worker",
  importScripts: "importScripts",
  eval: "eval",
  Function: "конструктор Function",
  localStorage: "хранилище браузера (используйте kit.storage)",
  sessionStorage: "хранилище браузера (используйте kit.storage)",
  indexedDB: "хранилище браузера (используйте kit.storage)",
  alert: "alert/confirm/prompt",
  confirm: "alert/confirm/prompt",
  prompt: "alert/confirm/prompt",
  atob: "декодирование скрытого кода (atob)",
  top: "доступ к родительской странице",
  parent: "доступ к родительской странице",
  opener: "доступ к родительской странице",
  location: "навигация (location)",
};

/** Свойства, запрещённые у любого объекта (window.fetch, navigator.sendBeacon, document.cookie...). */
const FORBIDDEN_PROPS: Record<string, string> = {
  fetch: "сеть (fetch)",
  sendBeacon: "сеть (sendBeacon)",
  cookie: "cookie",
  localStorage: "хранилище браузера (используйте kit.storage)",
  sessionStorage: "хранилище браузера (используйте kit.storage)",
  indexedDB: "хранилище браузера (используйте kit.storage)",
  postMessage: "postMessage (общение с оболочкой — только через kit)",
  open: "window.open",
  top: "доступ к родительской странице",
  parent: "доступ к родительской странице",
  opener: "доступ к родительской странице",
  location: "навигация (location)",
  createElement: "работа с DOM (рисуйте на канвасе)",
  appendChild: "работа с DOM (рисуйте на канвасе)",
  innerHTML: "работа с DOM (рисуйте на канвасе)",
  outerHTML: "работа с DOM (рисуйте на канвасе)",
  write: "document.write",
  submit: "отправка формы",
};

/** Объекты, у которых свойства из FORBIDDEN_PROPS реально опасны; у игровых объектов (node.parent) — нет. */
const PROP_OWNERS = new Set(["window", "self", "globalThis", "document", "navigator", "frames"]);

export interface CheckResult {
  ok: boolean;
  errors: string[];
}

/**
 * Только статические проверки: синтаксис, размер, запрещённые API, обязательные хуки.
 * Анализируется AST: текст в строках и комментариях (например, вопрос викторины про localStorage)
 * не считается. Код не исполняется. Настоящая граница безопасности — sandbox и CSP; эта проверка
 * отсекает очевидные нарушения до публикации.
 */
export function checkGameCode(code: string): CheckResult {
  const errors = new Set<string>();
  if (code.length < 200) errors.add("Code is too short to be a game");
  if (code.length > 120_000) errors.add("Code is too large (over 120 KB)");

  let ast: acorn.Node | null = null;
  try {
    ast = acorn.parse(code, { ecmaVersion: 2022, sourceType: "script" });
  } catch (e) {
    errors.add(`SyntaxError: ${(e as Error).message}`);
  }

  if (ast) {
    // Имена, объявленные в коде игры (let location = ...), — локальные переменные, а не глобалы.
    const declared = new Set<string>();
    const collect = (p: acorn.Pattern | null | undefined): void => {
      if (!p) return;
      if (p.type === "Identifier") declared.add(p.name);
      else if (p.type === "ObjectPattern") for (const prop of p.properties) collect(prop.type === "RestElement" ? prop.argument : prop.value);
      else if (p.type === "ArrayPattern") for (const el of p.elements) collect(el);
      else if (p.type === "RestElement") collect(p.argument);
      else if (p.type === "AssignmentPattern") collect(p.left);
    };
    walk.full(ast, (n) => {
      if (n.type === "VariableDeclarator") collect((n as acorn.VariableDeclarator).id);
      else if (n.type === "FunctionDeclaration" || n.type === "FunctionExpression" || n.type === "ArrowFunctionExpression") {
        const f = n as acorn.Function;
        f.params.forEach(collect);
        if (f.id) declared.add(f.id.name);
      } else if (n.type === "CatchClause") collect((n as acorn.CatchClause).param);
      else if (n.type === "ClassDeclaration" && (n as acorn.ClassDeclaration).id) declared.add((n as acorn.ClassDeclaration).id!.name);
    });

    walk.ancestor(ast, {
      Identifier(node, _state, ancestors) {
        const name = (node as acorn.Identifier).name;
        const label = FORBIDDEN_GLOBALS[name];
        if (!label || declared.has(name)) return;
        const parent = ancestors[ancestors.length - 2];
        // obj.fetch — свойство, а не глобал; { fetch: 1 } — ключ объекта.
        if (parent?.type === "MemberExpression" && (parent as acorn.MemberExpression).property === node && !(parent as acorn.MemberExpression).computed) return;
        if (parent?.type === "Property" && (parent as acorn.Property).key === node && !(parent as acorn.Property).computed && !(parent as acorn.Property).shorthand) return;
        if (parent?.type === "MethodDefinition" || parent?.type === "PropertyDefinition") return;
        errors.add(`Forbidden API: ${label}`);
      },
      MemberExpression(node) {
        const m = node as acorn.MemberExpression;
        const prop = !m.computed && m.property.type === "Identifier" ? m.property.name : m.property.type === "Literal" ? String((m.property as acorn.Literal).value) : null;
        // window["fe" + "tch"] и подобные вычисляемые обращения к глобальным объектам.
        if (m.computed && m.property.type !== "Literal" && m.object.type === "Identifier" && PROP_OWNERS.has(m.object.name)) errors.add("Forbidden API: вычисляемое обращение к window/document");
        if (!prop) return;
        const label = FORBIDDEN_PROPS[prop];
        if (label && m.object.type === "Identifier" && PROP_OWNERS.has(m.object.name)) errors.add(`Forbidden API: ${label}`);
      },
      NewExpression(node) {
        const callee = (node as acorn.NewExpression).callee;
        if (callee.type === "Identifier" && callee.name === "Function") errors.add("Forbidden API: конструктор Function");
      },
      CallExpression(node) {
        const c = node as acorn.CallExpression;
        // setTimeout("код строкой") — тот же eval.
        if (c.callee.type === "Identifier" && (c.callee.name === "setTimeout" || c.callee.name === "setInterval") && c.arguments[0]?.type === "Literal") errors.add("Forbidden API: строковый код в setTimeout/setInterval");
      },
    });
  }

  for (const hook of ["kit.onStart", "kit.onRender"]) if (!code.includes(hook)) errors.add(`Missing ${hook}(...)`);
  if (!/kit\.(win|lose)\s*\(/.test(code)) errors.add("Game never calls kit.win() or kit.lose(), so a round cannot end");
  return { ok: errors.size === 0, errors: [...errors] };
}
