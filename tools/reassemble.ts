/**
 * Пересобирает HTML всех версий с текущим рантаймом: код игры, спека и спрайты берутся из БД,
 * меняется только встроенный kit. Нужен после улучшений рантайма (например, снимков для галереи).
 *
 *   DATA_DIR=./data-demo bun --env-file=.env tools/reassemble.ts
 */
import { assembleGame } from "../packages/runtime/src/index";
import { db, gamePath, getVersion } from "../apps/server/src/db";
import { kitConfig } from "../apps/server/src/pipeline";

const ids = db.query("SELECT id FROM versions").all() as { id: string }[];
let n = 0;
for (const { id } of ids) {
  const v = getVersion(id)!;
  await Bun.write(gamePath(id), assembleGame(kitConfig(v.spec, v.assets), v.code, v.spec.language));
  n++;
}
console.log(`пересобрано версий: ${n}`);
