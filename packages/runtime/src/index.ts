const kitJs = await Bun.file(new URL("./kit.js", import.meta.url)).text();
const kitCss = await Bun.file(new URL("./kit.css", import.meta.url)).text();

export interface KitConfig {
  title: string;
  instructions: string;
  palette: { background: string; primary: string; accent: string; text: string };
  uiScale: number;
  speed: number;
  hud?: boolean;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Keep inline script content from closing its own <script> element. */
const scriptSafe = (s: string) => s.replace(/<\/(script)/gi, "<\\/$1").replace(/<!--/g, "<\\!--");

/** Assemble a self-contained game document: runtime + config + generated game code. */
export function assembleGame(config: KitConfig, gameCode: string, lang = "ru"): string {
  return `<!doctype html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<title>${escapeHtml(config.title)}</title>
<style>${kitCss}</style>
</head>
<body>
<canvas id="gg-canvas"></canvas>
<script>${scriptSafe(kitJs)}</script>
<script>var kit = GG.init(${scriptSafe(JSON.stringify(config))});</script>
<script>
${scriptSafe(gameCode)}
</script>
<script>GG.boot();</script>
</body>
</html>
`;
}

export { kitJs };
