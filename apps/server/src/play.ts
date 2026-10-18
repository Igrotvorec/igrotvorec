/**
 * Trusted /play shell: full-screen page that hosts the generated game in a sandboxed iframe,
 * owns storage (the opaque-origin game cannot use localStorage) and forwards telemetry.
 */
export function playShell(opts: { title: string; versionId: string; background: string }): string {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const data = JSON.stringify({ versionId: opts.versionId }).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<meta name="theme-color" content="${esc(opts.background)}">
<title>${esc(opts.title)}</title>
<style>html,body{margin:0;height:100%;overflow:hidden;background:${esc(opts.background)};overscroll-behavior:none}iframe{position:fixed;inset:0;width:100%;height:100%;border:0;display:block}</style>
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
  var roundStart = 0;
  var errorSent = false;
  function send(type, extra) {
    var body = JSON.stringify(Object.assign({ versionId: cfg.versionId, session: session, type: type }, extra || {}));
    try { navigator.sendBeacon ? navigator.sendBeacon("/api/events", new Blob([body], { type: "application/json" })) : fetch("/api/events", { method: "POST", body: body, headers: { "content-type": "application/json" }, keepalive: true }); } catch (e) {}
  }
  window.addEventListener("message", function (e) {
    if (e.source !== frame.contentWindow) return;
    var m = e.data;
    if (!m || m.gg !== 1 || m.runId !== runId || typeof m.type !== "string") return;
    if (m.type === "storage:get" && typeof m.key === "string" && m.key.length < 64) {
      var v = null;
      try { v = localStorage.getItem(storeKey(m.key)); } catch (err) {}
      frame.contentWindow.postMessage({ gg: 1, type: "storage:value", reqId: m.reqId, value: v }, "*");
    } else if (m.type === "storage:set" && typeof m.key === "string" && m.key.length < 64 && typeof m.value === "string" && m.value.length <= 2048) {
      try { localStorage.setItem(storeKey(m.key), m.value); } catch (err) {}
    } else if (m.type === "state") {
      if (m.state === "playing") { roundStart = Date.now(); send("round_start"); }
      else if (m.state === "won" || m.state === "lost") send(m.state, { score: Number(m.score) || 0, playMs: roundStart ? Date.now() - roundStart : 0 });
    } else if (m.type === "error" && !errorSent) {
      errorSent = true;
      send("error");
    }
  });
  document.addEventListener("visibilitychange", function () {
    if (document.hidden && frame.contentWindow) frame.contentWindow.postMessage({ gg: 1, type: "pause" }, "*");
  });
  send("open");
  frame.src = "/g/" + encodeURIComponent(cfg.versionId) + "#run=" + runId;
})();
</script>
</body>
</html>`;
}
