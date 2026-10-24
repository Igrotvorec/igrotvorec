/**
 * То, что обычно делает превью автора, для игр, которые никто не открывал (бенчмарк, демо-галерея):
 * снимок для обложки и автоподбор сложности ботами. Открывает каждую игру в Chrome с того же origin,
 * получает кадр и отчёт подбора от рантайма и отправляет их с токеном автора (нужен тот же DATA_DIR).
 *
 *   DATA_DIR=./data-demo bun --env-file=.env tools/make-thumbs.ts [baseUrl] [--retune]
 *
 * --retune: сбросить прошлую калибровку игр галереи и пересобрать их HTML без неё (иначе новый подбор
 * считал бы от уже ускоренной или замедленной игры), затем откалибровать заново.
 */
import puppeteer from "puppeteer-core";
import { db } from "../apps/server/src/db";
import { thumbToken } from "../apps/server/src/thumbs";
import { gamePath } from "../apps/server/src/db";
import { rebuildHtml, writeAtomic } from "../apps/server/src/html";

const BASE = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "http://localhost:8787";
if (process.argv.includes("--retune")) {
  const listed = db
    .query(`SELECT v.id FROM versions v JOIN games g ON g.id = v.game_id WHERE g.listed = 1 AND json_extract(v.spec, '$.tuning') IS NOT NULL`)
    .all() as { id: string }[];
  for (const { id } of listed) {
    db.query("UPDATE versions SET spec = json_remove(spec, '$.tuning') WHERE id = ?").run(id);
    await writeAtomic(gamePath(id), rebuildHtml(id)!);
  }
  console.log(`сброшено калибровок: ${listed.length}`);
}
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const rows = db
  .query(
    `SELECT v.id FROM versions v JOIN games g ON g.id = v.game_id
     WHERE g.listed = 1 AND v.version = (SELECT MAX(version) FROM versions WHERE game_id = g.id)
       AND (v.has_thumb = 0 OR (json_extract(v.spec, '$.engine') = 'phaser' AND json_extract(v.spec, '$.tuning') IS NULL))`,
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
        let tuneStatus = "нет";
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
        const tuned = new Promise<unknown>((done) => {
          const t = setTimeout(() => done(undefined), 90000);
          addEventListener("message", function on(e) {
            if (e.source !== frame.contentWindow || e.data?.type !== "tune") return;
            removeEventListener("message", on);
            clearTimeout(t);
            done(e.data.report);
          });
        });
        frame.src = `/g/${id}?r=${runtime}#run=thumbs&thumb=1&tune=1`;
        document.body.appendChild(frame);
        const image = await got;
        let thumbStatus = "нет кадра";
        if (image) {
          const res = await fetch(`/api/thumbs/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ image, token }) });
          thumbStatus = String(res.status);
        }
        const report = await tuned;
        if (report !== undefined) {
          const res = await fetch(`/api/versions/${id}/tune`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ report, token }) });
          tuneStatus = `${res.status} ${JSON.stringify(report)}`;
        }
        frame.remove();
        return `обложка ${thumbStatus}; сложность ${tuneStatus}`;
      },
      id,
      runtime,
      thumbToken(id),
    );
    if (status.startsWith("обложка 204")) ok++;
    console.log(id, status);
  }
} finally {
  await browser.close();
}
console.log(`обложек: ${ok}/${rows.length}`);
