/**
 * Плейтест для разработки (не часть пайплайна генерации).
 * Открывает /play/:gameId в локальном Chrome с размером телефона, читает сообщения рантайма,
 * жмёт «Играть», несколько секунд шлёт тапы и свайпы и сохраняет скриншоты.
 *
 *   bun tools/try-game.ts <gameId> [outDir] [baseUrl]
 */
import puppeteer from "puppeteer-core";


const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export async function tryGame(id: string, dir: string, baseUrl: string) {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
  const report = { id, boot: false, ready: false, painted: null as boolean | null, errors: [] as string[], states: [] as string[] };
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.exposeFunction("__ggReport", (m: { type: string; message?: string; painted?: boolean; state?: string }) => {
      if (m.type === "boot") report.boot = true;
      if (m.type === "ready") report.ready = true;
      if (m.type === "frame") report.painted = !!m.painted;
      if (m.type === "error") report.errors.push(m.message ?? "?");
      if (m.type === "state" && m.state) report.states.push(m.state);
    });
    await page.evaluateOnNewDocument(() => {
      window.addEventListener("message", (e) => {
        const d = e.data as { gg?: number } | null;
        if (d && d.gg === 1) (window as unknown as { __ggReport: (m: unknown) => void }).__ggReport(d);
      });
    });
    await page.goto(`${baseUrl}/play/${id}`, { waitUntil: "load" });
    await new Promise((r) => setTimeout(r, 1500));
    await page.screenshot({ path: `${dir}/${id}-start.png` });

    const frame = page.frames().find((f) => f.url().includes("/g/"));
    if (!frame) throw new Error("game iframe not found");
    const btn = await frame.$(".gg-btn");
    if (btn) await btn.click();
    await new Promise((r) => setTimeout(r, 400));
    const cx = 195, cy = 422;
    const dirs = [[0, -80], [80, 0], [0, 80], [-80, 0]] as const;
    for (let i = 0; i < 16; i++) {
      if (i % 2) {
        await page.touchscreen.tap(cx + ((i * 37) % 120) - 60, cy + ((i * 53) % 200) - 100);
      } else {
        const [dx, dy] = dirs[(i / 2) % 4]!;
        await page.touchscreen.touchStart(cx, cy);
        await page.touchscreen.touchMove(cx + dx, cy + dy);
        await page.touchscreen.touchEnd();
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    await page.screenshot({ path: `${dir}/${id}-play.png` });
  } finally {
    await browser.close();
  }
  return report;
}

if (import.meta.main) {
  const [gameId, outDir = "./data/shots", base = "http://localhost:8787"] = process.argv.slice(2);
  if (!gameId) throw new Error("usage: bun tools/try-game.ts <gameId> [outDir] [baseUrl]");
  await Bun.$`mkdir -p ${outDir}`;
  console.log(JSON.stringify(await tryGame(gameId, outDir, base), null, 2));
}
