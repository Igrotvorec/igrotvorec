/**
 * Пересобирает HTML всех версий с текущим рантаймом: код игры, спека и спрайты берутся из БД,
 * меняется только встроенный kit. Нужен после улучшений рантайма (например, снимков для галереи).
 *
 *   DATA_DIR=./data-demo bun --env-file=.env tools/reassemble.ts
 */
import { renameSync } from "node:fs";
import { assembleGame } from "../packages/runtime/src/index";
import { db, gamePath, getVersion } from "../apps/server/src/db";
import { kitConfig } from "../apps/server/src/pipeline";

const ids = db.query("SELECT id FROM versions").all() as { id: string }[];
let n = 0;
for (const { id } of ids) {
  const v = getVersion(id)!;
  // Файл уже опубликован: пишем во временный и подменяем rename, чтобы /g не отдал обрезанный HTML.
  const tmp = `${gamePath(id)}.tmp`;
  await Bun.write(tmp, assembleGame(kitConfig(v.spec, v.assets), v.code, v.spec.language));
  renameSync(tmp, gamePath(id));
  n++;
}
console.log(`пересобрано версий: ${n}`);
