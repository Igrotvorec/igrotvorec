import type { GameDetail, GameStatsDto, GameSummary, GenEvent, SegmentStatsDto } from "@gg/shared";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const listGames = () => fetch("/api/games").then((r) => json<GameSummary[]>(r));
export const getGame = (id: string) => fetch(`/api/games/${id}`).then((r) => json<GameDetail>(r));
export const getStats = () => fetch("/api/stats").then((r) => json<{ minSessions: number; segments: SegmentStatsDto[] }>(r));
export const getGameStats = (id: string) => fetch(`/api/games/${id}/stats`).then((r) => json<GameStatsDto>(r));
export const getCode = (versionId: string) => fetch(`/api/versions/${versionId}/code`).then((r) => json<{ code: string }>(r));
export const postThumb = (versionId: string, image: string, token: string) =>
  fetch(`/api/thumbs/${versionId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ image, token }) }).catch(() => {});
let configPromise: Promise<{ publicUrl: string; runtimeVersion: string }> | null = null;
/** Конфиг не меняется за время жизни страницы: запрашиваем один раз, при ошибке пробуем снова. */
export const getConfig = () =>
  (configPromise ??= fetch("/api/config")
    .then((r) => json<{ publicUrl: string; runtimeVersion: string }>(r))
    .catch((e) => {
      configPromise = null;
      throw e;
    }));

/** Делает POST и читает SSE-ответ, вызывая onEvent на каждое событие. Завершается вместе с потоком. */
export async function streamOp(url: string, body: unknown, onEvent: (e: GenEvent) => void, signal?: AbortSignal) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    const err = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(err?.error ?? `HTTP ${res.status}`);
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const data = chunk
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trimStart())
        .join("\n");
      if (!data) continue;
      try {
        onEvent(JSON.parse(data) as GenEvent);
      } catch {
        /* битое событие пропускаем */
      }
    }
  }
}
