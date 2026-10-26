/**
 * Картинка для превью ссылки (og:image) 1200×630: логотип, заголовок и три кадра игр из галереи.
 *   DATA_DIR=./data-demo bun tools/make-og.ts <versionId> <versionId> <versionId>
 * Кадры — настоящие обложки игр (data/thumbs), шрифт — Golos Text, как на сайте.
 */
import puppeteer from "puppeteer-core";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const DATA = join(ROOT, process.env.DATA_DIR ?? "data");
const ids = process.argv.slice(2);
if (ids.length !== 3) throw new Error("нужно три versionId");
const font = readFileSync(join(ROOT, "apps/web/node_modules/@fontsource-variable/golos-text/files/golos-text-cyrillic-wght-normal.woff2")).toString("base64");
const thumbs = ids.map((id) => "data:image/webp;base64," + readFileSync(join(DATA, "thumbs", `${id}.webp`)).toString("base64"));
/** Значок как в шапке сайта (Phosphor GameController, fill). */
const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" fill="#ffffff" viewBox="0 0 256 256"><path d="M247.44,173.75a.68.68,0,0,0,0-.14L231.05,89.44c0-.06,0-.12,0-.18A60.08,60.08,0,0,0,172,40H83.89a59.88,59.88,0,0,0-59,49.52L8.58,173.61a.68.68,0,0,0,0,.14,36,36,0,0,0,60.9,31.71l.35-.37L109.52,160h37l39.71,45.09c.11.13.23.25.35.37A36.08,36.08,0,0,0,212,216a36,36,0,0,0,35.43-42.25ZM104,112H96v8a8,8,0,0,1-16,0v-8H72a8,8,0,0,1,0-16h8V88a8,8,0,0,1,16,0v8h8a8,8,0,0,1,0,16Zm40-8a8,8,0,0,1,8-8h24a8,8,0,0,1,0,16H152A8,8,0,0,1,144,104Zm84.37,87.47a19.84,19.84,0,0,1-12.9,8.23A20.09,20.09,0,0,1,198,194.31L167.8,160H172a60,60,0,0,0,51-28.38l8.74,45A19.82,19.82,0,0,1,228.37,191.47Z"></path></svg>`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: Golos; src: url(data:font/woff2;base64,${font}) format("woff2"); font-weight: 400 900; }
* { box-sizing: border-box; margin: 0; }
body { width: 1200px; height: 630px; font-family: Golos, sans-serif; background: #ffffff; color: #0f0f10; overflow: hidden; position: relative; }
.glow { position: absolute; right: -120px; top: -160px; width: 760px; height: 900px; background: radial-gradient(closest-side, #eef1fe, #ffffff00); }
.left { position: absolute; left: 72px; top: 0; bottom: 0; width: 600px; display: flex; flex-direction: column; justify-content: center; gap: 30px; }
.mark { display: flex; align-items: center; gap: 16px; font-size: 34px; font-weight: 700; letter-spacing: -0.02em; }
.mark span { width: 58px; height: 58px; border-radius: 15px; background: #2448f5; display: grid; place-items: center; }
h1 { font-size: 66px; line-height: 1.02; font-weight: 800; letter-spacing: -0.035em; }
h1 em { font-style: normal; color: #2448f5; }
p { font-size: 26px; line-height: 1.35; color: #393b41; max-width: 520px; }
.phones { position: absolute; right: 40px; top: 40px; width: 520px; height: 560px; }
.phone { position: absolute; width: 230px; height: 470px; border-radius: 36px; background: #0f0f10; padding: 9px; box-shadow: 0 30px 60px -20px #0f0f1055; }
.phone img { width: 100%; height: 100%; object-fit: cover; object-position: top; border-radius: 28px; display: block; }
.p1 { left: 0; top: 70px; transform: rotate(-8deg); }
.p3 { right: 0; top: 70px; transform: rotate(8deg); }
.p2 { left: 145px; top: 20px; width: 250px; height: 510px; z-index: 2; }
</style></head><body>
<div class="glow"></div>
<div class="left">
  <div class="mark"><span>${icon}</span>Игротворец</div>
  <h1>Мини-игра<br>по одной фразе<br><em>за две минуты</em></h1>
  <p>Опишите игру и для кого она — получите ссылку для WebView.</p>
</div>
<div class="phones">
  <div class="phone p1"><img src="${thumbs[0]}"></div>
  <div class="phone p3"><img src="${thumbs[2]}"></div>
  <div class="phone p2"><img src="${thumbs[1]}"></div>
</div>
</body></html>`;

const b = await puppeteer.launch({ executablePath: process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const page = await b.newPage();
await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ type: "jpeg", quality: 90, path: join(ROOT, "apps/web/public/og.jpg") });
await b.close();
console.log("apps/web/public/og.jpg");
