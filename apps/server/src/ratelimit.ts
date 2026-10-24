import type { Context } from "hono";
import { getConnInfo } from "hono/bun";

/**
 * Лимит операций с LLM (генерация, правка, автоисправление) на один IP за скользящий час.
 * Публичный сайт без регистрации: без лимита любой скрипт сожжёт квоту модели.
 * Хранится в памяти процесса — для одного сервера этого достаточно.
 */
const LIMIT = Number(process.env.RATE_LIMIT_PER_HOUR ?? 30);
const WINDOW_MS = 60 * 60 * 1000;
/** За Caddy адрес клиента приходит в X-Forwarded-For; без прокси заголовку верить нельзя. */
const TRUST_PROXY = process.env.TRUST_PROXY === "1";

const hits = new Map<string, number[]>();

export function clientIp(c: Context): string {
  if (TRUST_PROXY) {
    // Caddy перезаписывает заголовок адресом клиента, поэтому берём первый элемент.
    const fwd = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
    if (fwd) return fwd;
  }
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    return "unknown";
  }
}

/** Засчитывает операцию; возвращает, через сколько секунд можно повторить, или 0, если можно сейчас. */
export function takeOperation(ip: string): number {
  if (LIMIT <= 0) return 0;
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= LIMIT) {
    hits.set(ip, list);
    return Math.ceil((list[0]! + WINDOW_MS - now) / 1000);
  }
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 10_000) for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  return 0;
}
