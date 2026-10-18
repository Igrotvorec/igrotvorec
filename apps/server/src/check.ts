import * as acorn from "acorn";

/** Pull JS out of an LLM reply that may wrap it in markdown fences or add prose. */
export function extractCode(reply: string): string {
  const fenced = [...reply.matchAll(/```(?:js|javascript)?\s*\n([\s\S]*?)```/gi)].map((m) => m[1] ?? "");
  if (fenced.length) return fenced.sort((a, b) => b.length - a.length)[0]!.trim();
  return reply.replace(/^```(?:js|javascript)?\s*/i, "").replace(/```\s*$/, "").trim();
}

const FORBIDDEN: [RegExp, string][] = [
  [/\bfetch\s*\(/, "fetch()"],
  [/\bXMLHttpRequest\b/, "XMLHttpRequest"],
  [/\bWebSocket\b/, "WebSocket"],
  [/\bimport\s*\(/, "dynamic import()"],
  [/\beval\s*\(/, "eval()"],
  [/\bnew\s+Function\b/, "new Function"],
  [/\b(localStorage|sessionStorage|indexedDB)\b/, "browser storage (use kit.storage)"],
  [/\bdocument\.cookie\b/, "document.cookie"],
  [/\b(alert|confirm|prompt)\s*\(/, "alert/confirm/prompt"],
  [/https?:\/\//, "external URL"],
];

export interface CheckResult {
  ok: boolean;
  errors: string[];
}

/** Static checks only: syntax, size, forbidden APIs, required runtime hooks. Never executes the code. */
export function checkGameCode(code: string): CheckResult {
  const errors: string[] = [];
  if (code.length < 200) errors.push("Code is too short to be a game");
  if (code.length > 120_000) errors.push("Code is too large (over 120 KB)");
  try {
    acorn.parse(code, { ecmaVersion: 2022, sourceType: "script" });
  } catch (e) {
    errors.push(`SyntaxError: ${(e as Error).message}`);
  }
  for (const [re, label] of FORBIDDEN) if (re.test(code)) errors.push(`Forbidden API: ${label}`);
  for (const hook of ["kit.onStart", "kit.onRender"]) if (!code.includes(hook)) errors.push(`Missing ${hook}(...)`);
  if (!/kit\.(win|lose)\s*\(/.test(code)) errors.push("Game never calls kit.win() or kit.lose(), so a round cannot end");
  return { ok: errors.length === 0, errors };
}
