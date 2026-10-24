const kitJs = await Bun.file(new URL("./kit.js", import.meta.url)).text();
const kitCss = await Bun.file(new URL("./kit.css", import.meta.url)).text();
const phaserKitJs = await Bun.file(new URL("./phaser-kit.js", import.meta.url)).text();
const phaserJs = await Bun.file(Bun.resolveSync("phaser/dist/phaser.min.js", import.meta.dir)).text();

/** Хэш рантайма и шаблона: входит в URL /g/:id?r=…, поэтому после пересборки браузер не держит старый HTML из кэша. */
// Шаблон сборки (этот файл) тоже меняет HTML, поэтому входит в хэш вместе с kit.js и kit.css.
const template = await Bun.file(new URL(import.meta.url)).text();
export const RUNTIME_VERSION = Bun.hash(kitJs + kitCss + phaserKitJs + template).toString(36).slice(0, 8);
/** Метка в HTML игры: по ней сервер узнаёт, собран ли файл текущим рантаймом. */
export const RUNTIME_MARK = `<meta name="gg-runtime" content="${RUNTIME_VERSION}">`;

export interface KitConfig {
  title: string;
  instructions: string;
  palette: { background: string; primary: string; accent: string; text: string };
  uiScale: number;
  speed: number;
  hud?: boolean;
  /** key → { src: data:URI или пусто, fallback: emoji } */
  sprites?: Record<string, { src?: string; fallback: string }>;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Не даёт встроенному коду закрыть собственный тег <script>. */
const scriptSafe = (s: string) => s.replace(/<\/(script)/gi, "<\\/$1").replace(/<!--/g, "<\\!--");

/** Собирает самодостаточный документ игры: рантайм + конфиг + сгенерированный код. */
export function assembleGame(config: KitConfig, gameCode: string, lang = "ru"): string {
  return `<!doctype html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="utf-8">
${RUNTIME_MARK}
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

export interface PhaserKitConfig extends KitConfig {
  /** Фон сцены 720×1280 (data:URI) или null. */
  background: string | null;
  /** Настроение фоновой музыки: happy | calm | tense; пусто — без музыки. */
  music?: string;
}

const PHASER_CSS = `#gg-root{position:fixed;inset:0}#gg-root canvas{display:block}
.gg-mute{position:fixed;z-index:15;top:calc(var(--gg-frame-y) + 8px*var(--gg-k));right:calc(var(--gg-frame-x) + 8px*var(--gg-k));width:calc(36px*var(--gg-k));height:calc(36px*var(--gg-k));border:0;border-radius:50%;background:rgba(0,0,0,.35);color:#fff;font-size:calc(17px*var(--gg-k));line-height:1;cursor:pointer;touch-action:manipulation}`;

/** Документ игры на Phaser: движок, наш рантайм, конфиг, код сцены. Всё встроено, внешних ресурсов нет. */
export function assemblePhaserGame(config: PhaserKitConfig, gameCode: string, lang = "ru"): string {
  return `<!doctype html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="utf-8">
${RUNTIME_MARK}
<meta name="gg-engine" content="phaser">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<title>${escapeHtml(config.title)}</title>
<style>${kitCss}
${PHASER_CSS}</style>
</head>
<body>
<div id="gg-root"></div>
<script>${scriptSafe(phaserJs)}</script>
<script>${scriptSafe(phaserKitJs)}</script>
<script>var GG = __GG.init(${scriptSafe(JSON.stringify(config))});</script>
<script>${scriptSafe(gameCode)}</script>
<script>__GG.boot();</script>
</body>
</html>`;
}
