import type { GameDetail, GameSummary, GenEvent, SegmentStatsDto } from "@gg/shared";

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
export const getConfig = () => fetch("/api/config").then((r) => json<{ publicUrl: string }>(r));

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
