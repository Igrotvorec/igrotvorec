/**
 * Обложки для игр, у которых их нет (например, сгенерированных бенчмарком без открытия превью).
 * Открывает каждую игру в Chrome с того же origin, получает кадр от рантайма и отправляет его
 * с токеном автора, вычисленным из секрета сервера (нужен тот же DATA_DIR).
 *
 *   DATA_DIR=./data-demo bun --env-file=.env tools/make-thumbs.ts [baseUrl]
 */
import puppeteer from "puppeteer-core";
import { db } from "../apps/server/src/db";
import { thumbToken } from "../apps/server/src/thumbs";

const BASE = process.argv[2] ?? "http://localhost:8787";
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const rows = db
  .query(
    `SELECT v.id FROM versions v JOIN games g ON g.id = v.game_id
     WHERE g.listed = 1 AND v.has_thumb = 0 AND v.version = (SELECT MAX(version) FROM versions WHERE game_id = g.id)`,
  )
  .all() as { id: string }[];
const runtime = ((await (await fetch(`${BASE}/api/config`)).json()) as { runtimeVersion: string }).runtimeVersion;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
let ok = 0;
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.goto(`${BASE}/api/health`);
  for (const { id } of rows) {
    const status = await page.evaluate(
      async (id, runtime, token) => {
        const frame = document.createElement("iframe");
        frame.setAttribute("sandbox", "allow-scripts");
        frame.style.cssText = "position:fixed;inset:0;width:390px;height:844px;border:0";
        const got = new Promise<string | null>((done) => {
          const t = setTimeout(() => done(null), 15000);
          addEventListener("message", function on(e) {
            if (e.source !== frame.contentWindow || e.data?.type !== "thumb") return;
            removeEventListener("message", on);
            clearTimeout(t);
            done(e.data.image);
          });
        });
        frame.src = `/g/${id}?r=${runtime}#run=thumbs&thumb=1`;
        document.body.appendChild(frame);
        const image = await got;
        frame.remove();
        if (!image) return "нет кадра";
        const res = await fetch(`/api/thumbs/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ image, token }) });
        return String(res.status);
      },
      id,
      runtime,
      thumbToken(id),
    );
    if (status === "204") ok++;
    console.log(id, status);
  }
} finally {
  await browser.close();
}
console.log(`обложек: ${ok}/${rows.length}`);
