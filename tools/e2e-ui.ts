/**
 * Сквозной сценарий интерфейса в Chrome: промпт → страница игры → проверка запуска в превью →
 * правка чипом → новая версия. Скриншоты каждого шага в data/shots/e2e-*.png.
 *
 *   bun tools/e2e-ui.ts [webUrl] [prompt]
 */
import puppeteer, { type Page } from "puppeteer-core";

const WEB = process.argv[2] ?? "http://localhost:5173";
const PROMPT = process.argv[3] ?? "Кликер с котиками для ребёнка 6 лет";
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT = "data/shots";

const t0 = Date.now();
const log = (msg: string) => console.log(`${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s  ${msg}`);
const statusText = (page: Page) => page.$eval(".stage-play .status", (el) => el.textContent ?? "").catch(() => "");

async function waitStatus(page: Page, timeoutMs: number) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const s = await statusText(page);
    if (s.includes("Запуск проверен") || s.startsWith("Ошибка") || s.includes("не ответила")) return s;
    if (Date.now() > until) return `таймаут, статус: ${s}`;
    await new Promise((r) => setTimeout(r, 500));
  }
}

await Bun.$`mkdir -p ${OUT}`;
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
let failed = false;
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  if (process.env.SCHEME) await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: process.env.SCHEME }]);
  page.on("pageerror", (e) => log(`pageerror: ${(e as Error).message}`));

  await page.goto(WEB, { waitUntil: "networkidle0" });
  await page.type("textarea", PROMPT);
  await page.click(".composer button[type=submit]");
  log(`отправлен промпт «${PROMPT}»`);
  await page.waitForSelector(".build", { timeout: 10_000 });
  await page.waitForSelector(".spec-card", { timeout: 60_000 }).catch(() => {});
  await page.screenshot({ path: `${OUT}/e2e-1-progress.png` });

  await page.waitForFunction(() => location.pathname.startsWith("/games/"), { timeout: 240_000 });
  log(`игра создана: ${await page.evaluate(() => location.pathname)}`);
  const s1 = await waitStatus(page, 20_000);
  log(`превью v1: ${s1}`);
  if (!s1.includes("Запуск проверен")) failed = true;
  await page.screenshot({ path: `${OUT}/e2e-2-game.png` });

  const chip = (await page.$$(".quick .chip"))[0];
  if (!chip) throw new Error("нет чипов правки");
  const chipText = await chip.evaluate((el) => el.textContent);
  await chip.click();
  await page.click(".edit-box button[type=submit]");
  log(`правка: «${chipText}»`);
  await page.waitForFunction(() => document.querySelectorAll(".versions li").length >= 2, { timeout: 240_000 });
  const versions = await page.$$eval(".versions .v-text", (els) => els.map((e) => e.textContent));
  log(`версии: ${versions.join(" | ")}`);
  const s2 = await waitStatus(page, 20_000);
  log(`превью v2: ${s2}`);
  if (!s2.includes("Запуск проверен")) failed = true;
  await page.screenshot({ path: `${OUT}/e2e-3-edited.png` });

  const share = await page.$eval(".share-link", (el) => el.textContent).catch(() => null);
  log(`ссылка: ${share}`);
  if (!share) failed = true;
} catch (e) {
  failed = true;
  log(`ОШИБКА: ${(e as Error).message}`);
} finally {
  await browser.close();
}
log(failed ? "ПРОВАЛ" : "ОК");
if (failed) process.exitCode = 1;
