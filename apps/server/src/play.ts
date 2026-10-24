import { RUNTIME_VERSION } from "@gg/runtime";
/**
 * Доверенная оболочка /play: полноэкранная страница, которая держит игру в sandbox-iframe,
 * владеет хранилищем (у игры с opaque origin нет localStorage) и отправляет телеметрию.
 */
/** og-теги: ссылка на игру в Telegram или VK показывается карточкой с названием, правилами и кадром. */
export function playShell(opts: { title: string; versionId: string; background: string; description: string; url: string; image: string | null; tuning?: number }): string {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  // Множитель автоподбора входит в адрес /g: после калибровки браузер не возьмёт старый HTML из кэша.
  const data = JSON.stringify({ versionId: opts.versionId, runtime: RUNTIME_VERSION + (opts.tuning ? "-" + opts.tuning : "") }).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<meta name="theme-color" content="${esc(opts.background)}">
<title>${esc(opts.title)}</title>
<meta name="description" content="${esc(opts.description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Игротворец">
<meta property="og:title" content="${esc(opts.title)}">
<meta property="og:description" content="${esc(opts.description)}">
<meta property="og:url" content="${esc(opts.url)}">
${opts.image ? `<meta property="og:image" content="${esc(opts.image)}">
<meta name="twitter:card" content="summary_large_image">
` : ""}<style>html,body{margin:0;height:100%;overflow:hidden;background:${esc(opts.background)};overscroll-behavior:none}iframe{position:fixed;inset:0;width:100%;height:100%;border:0;display:block}</style>
</head>
<body>
<iframe id="game" sandbox="allow-scripts" allow="autoplay; vibrate" title="${esc(opts.title)}"></iframe>
<script>
(function () {
  var cfg = ${data};
  var runId = Math.random().toString(36).slice(2, 12);
  var session = runId;
  var frame = document.getElementById("game");
  var storeKey = function (k) { return "gg:" + location.pathname + ":" + k; };
  var errorSent = false;
  // Квота на игру: общий localStorage origin не должен забиваться одной игрой.
  var MAX_KEYS = 32, MAX_BYTES = 32768;
  function fitsQuota(fullKey, value) {
    var prefix = storeKey(""), keys = 0, bytes = 0;
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k || k.indexOf(prefix) !== 0 || k === fullKey) continue;
        keys++;
        bytes += k.length + (localStorage.getItem(k) || "").length;
      }
    } catch (err) { return false; }
    return keys + 1 <= MAX_KEYS && bytes + fullKey.length + value.length <= MAX_BYTES;
  }
  function send(type, extra) {
    var body = JSON.stringify(Object.assign({ versionId: cfg.versionId, session: session, type: type }, extra || {}));
    try { navigator.sendBeacon ? navigator.sendBeacon("/api/events", new Blob([body], { type: "application/json" })) : fetch("/api/events", { method: "POST", body: body, headers: { "content-type": "application/json" }, keepalive: true }); } catch (e) {}
  }
  window.addEventListener("message", function (e) {
    if (e.source !== frame.contentWindow) return;
    var m = e.data;
    if (!m || typeof m !== "object" || Array.isArray(m) || m.gg !== 1 || m.runId !== runId || typeof m.type !== "string") return;
    if (m.type === "storage:get" && typeof m.key === "string" && m.key.length < 64) {
      var v = null;
      try { v = localStorage.getItem(storeKey(m.key)); } catch (err) {}
      frame.contentWindow.postMessage({ gg: 1, type: "storage:value", reqId: m.reqId, value: v }, "*");
    } else if (m.type === "storage:set" && typeof m.key === "string" && m.key.length < 64 && typeof m.value === "string" && m.value.length <= 2048) {
      if (fitsQuota(storeKey(m.key), m.value)) try { localStorage.setItem(storeKey(m.key), m.value); } catch (err) {}
    } else if (m.type === "state") {
      if (m.state === "playing") send("round_start");
      // Время раунда без пауз считает рантайм; ограничиваем, чтобы событие не отбросила схема сервера.
      else if (m.state === "won" || m.state === "lost") send(m.state, { score: Math.min(Math.max(Math.floor(Number(m.score) || 0), 0), 1e9), playMs: Math.min(Math.max(Math.round(Number(m.activeMs) || 0), 0), 3600000) });
    } else if (m.type === "error" && !errorSent) {
      errorSent = true;
      send("error");
    }
  });
  document.addEventListener("visibilitychange", function () {
    if (document.hidden && frame.contentWindow) frame.contentWindow.postMessage({ gg: 1, type: "pause" }, "*");
  });
  send("open");
  frame.src = "/g/" + encodeURIComponent(cfg.versionId) + "?r=" + encodeURIComponent(cfg.runtime) + "#run=" + runId;
})();
</script>
</body>
</html>`;
}
