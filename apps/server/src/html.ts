import { randomUUID } from "node:crypto";
import { renameSync } from "node:fs";
import { RUNTIME_MARK, assembleGame } from "@gg/runtime";
import { gamePath, getVersion } from "./db";
import { kitConfig } from "./pipeline";

/** Опубликованный файл заменяется только целиком: уникальный временный файл на каждого писателя и rename. */
export async function writeAtomic(path: string, content: string) {
  const tmp = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await Bun.write(tmp, content);
    renameSync(tmp, path);
  } catch (e) {
    await Bun.file(tmp).delete().catch(() => {});
    throw e;
  }
}

/** Собирает HTML версии заново с текущим рантаймом из кода, спеки и спрайтов в БД. */
export function rebuildHtml(versionId: string): string | null {
  const v = getVersion(versionId);
  return v ? assembleGame(kitConfig(v.spec, v.assets), v.code, v.spec.language) : null;
}

/**
 * HTML версии, гарантированно собранный текущим рантаймом. Если файл остался от старой сборки
 * (обновили рантайм, а volume с играми прежний), пересобираем его при первом запросе.
 * Поэтому адрес /g/:id?r=<версия рантайма> всегда соответствует содержимому и может кэшироваться навсегда.
 */
export async function currentHtml(versionId: string): Promise<string | null> {
  const file = Bun.file(gamePath(versionId));
  if (!(await file.exists())) return null;
  const html = await file.text();
  if (html.includes(RUNTIME_MARK)) return html;
  const fresh = rebuildHtml(versionId);
  if (!fresh) return html;
  await writeAtomic(gamePath(versionId), fresh);
  return fresh;
}
