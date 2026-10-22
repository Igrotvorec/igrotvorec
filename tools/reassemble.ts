/**
 * Пересобирает HTML всех версий с текущим рантаймом: код игры, спека и спрайты берутся из БД,
 * меняется только встроенный kit. Сервер и сам пересобирает устаревший файл при первом запросе
 * (apps/server/src/html.ts), инструмент нужен, чтобы сделать это заранее для всей базы.
 *
 *   DATA_DIR=./data-demo bun --env-file=.env tools/reassemble.ts
 */
import { db, gamePath } from "../apps/server/src/db";
import { rebuildHtml, writeAtomic } from "../apps/server/src/html";

const ids = db.query("SELECT id FROM versions").all() as { id: string }[];
let n = 0;
for (const { id } of ids) {
  const html = rebuildHtml(id);
  if (!html) continue;
  await writeAtomic(gamePath(id), html);
  n++;
}
console.log(`пересобрано версий: ${n}`);
