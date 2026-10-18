/**
 * Dev-only benchmark: generates games for a prompt set, then playtests each.
 *   bun tools/bench.ts [promptsFile] [concurrency]
 * promptsFile: one prompt per line (default: built-in set). Writes data/bench-<ts>.json.
 */
import type { GenEvent } from "../packages/shared/src/api";
import { tryGame } from "./try-game";

const BASE = process.env.BASE ?? "http://localhost:8787";
const DEFAULT = [
  "Замути змейку для бабушки",
  "Кликер с котиками для ребёнка 6 лет",
  "Три в ряд с фруктами, раунд на минуту",
  "Викторина про космос для школьника",
  "Раннер на скейте для подростка, уворачиваться от конусов",
];

const [file, conc = "3"] = process.argv.slice(2);
const prompts = file ? (await Bun.file(file).text()).split("\n").map((s) => s.trim()).filter(Boolean) : DEFAULT;

async function generate(prompt: string) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/generate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt }) });
  const text = await res.text();
  const events = text
    .split("\n")
    .filter((l) => l.startsWith("data:"))
    .map((l) => JSON.parse(l.slice(5)) as GenEvent);
  const done = events.find((e) => e.type === "done") as Extract<GenEvent, { type: "done" }> | undefined;
  const error = events.find((e) => e.type === "error") as Extract<GenEvent, { type: "error" }> | undefined;
  const spec = events.find((e) => e.type === "spec") as Extract<GenEvent, { type: "spec" }> | undefined;
  const fixed = events.some((e) => e.type === "stage" && e.message.startsWith("Исправляю"));
  return { prompt, ms: Date.now() - t0, gameId: done?.gameId, error: error?.message, genre: spec?.spec.genre, audience: spec?.spec.audience, staticFix: fixed };
}

const results: Awaited<ReturnType<typeof generate>>[] = [];
const queue = [...prompts];
await Promise.all(
  Array.from({ length: Number(conc) }, async () => {
    for (let p = queue.shift(); p; p = queue.shift()) {
      const r = await generate(p);
      console.log(`${(r.ms / 1000).toFixed(0)}s ${r.gameId ?? "FAIL"} ${r.genre ?? ""}/${r.audience ?? ""} ${r.staticFix ? "(static fix)" : ""} ${r.error ?? ""} — ${p}`);
      results.push(r);
    }
  }),
);

await Bun.$`mkdir -p data/shots`;
const rows = [];
for (const r of results) {
  const play = r.gameId ? await tryGame(r.gameId, "data/shots", BASE).catch((e: Error) => ({ errors: [e.message] })) : null;
  rows.push({ ...r, play });
  console.log(r.gameId, play && "errors" in play && play.errors.length ? `RUNTIME ERRORS: ${play.errors.join(" | ")}` : "ok");
}
const ok = rows.filter((r) => r.gameId && r.play && r.play.errors.length === 0).length;
console.log(`\n${ok}/${rows.length} generated and ran without runtime errors; median ${Math.round(rows.map((r) => r.ms).sort((a, b) => a - b)[Math.floor(rows.length / 2)]! / 1000)}s`);
await Bun.write(`data/bench-${Date.now()}.json`, JSON.stringify(rows, null, 2));
