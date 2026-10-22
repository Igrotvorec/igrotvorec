/**
 * Токены загрузки обложки: сервер выдаёт их автору вместе с новой версией. Хранятся в sessionStorage,
 * чтобы пережить переход на страницу игры и перезагрузку вкладки, но не уходили дальше этой вкладки.
 */
const mem = new Map<string, string>();
const key = (versionId: string) => `gg:thumb-token:${versionId}`;

export function rememberThumbToken(versionId: string, token: string) {
  mem.set(versionId, token);
  try {
    sessionStorage.setItem(key(versionId), token);
  } catch {
    /* хранилище недоступно — хватит памяти */
  }
}

export function thumbTokenFor(versionId: string): string | null {
  if (mem.has(versionId)) return mem.get(versionId)!;
  try {
    return sessionStorage.getItem(key(versionId));
  } catch {
    return null;
  }
}
