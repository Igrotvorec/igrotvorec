import { Hono, type Context } from "hono";
import { streamSSE } from "hono/streaming";
import { serveStatic } from "hono/bun";
import { z } from "zod";
import type { GenEvent } from "@gg/shared";
import { config } from "./config";
import { addEvent, gamePath, getGame, getVersion, listGames } from "./db";
import { edit, generate, repair } from "./pipeline";
import { playShell } from "./play";
import { MIN_SESSIONS, segmentStats } from "./stats";

const app = new Hono();

/** CSP для документов игр: opaque origin, без сети, только встроенный код. */
const GAME_CSP = [
  "sandbox allow-scripts",
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "media-src data: blob:",
  "font-src data:",
  "connect-src 'none'",
  "frame-ancestors 'self'",
].join("; ");

/**
 * CSP для доверенной оболочки /play. Главное — frame-src 'self': вложенная игра не может
 * сама перейти на чужой сайт (sandbox этого не запрещает), поэтому фишинг внутри страницы невозможен.
 */
const SHELL_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "frame-src 'self'",
  "connect-src 'self'",
  "img-src 'self' data:",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

/** Лимит событий телеметрии на сессию, чтобы одним скриптом нельзя было накрутить статистику. */
const MAX_EVENTS_PER_SESSION = 200;
const sessionEvents = new Map<string, number>();

let running = 0;
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT ?? 8);

/** Выполняет операцию пайплайна как SSE-поток с ping-сообщениями и жёстким дедлайном. */
function sseOperation(run: (emit: (e: GenEvent) => void, signal: AbortSignal) => Promise<void>) {
  return (c: Context) =>
    streamSSE(c, async (stream) => {
      if (running >= MAX_CONCURRENT) {
        await stream.writeSSE({ data: JSON.stringify({ type: "error", message: "Сервер занят, попробуйте через минуту" }) });
        return;
      }
      running++;
      const ac = new AbortController();
      const deadline = setTimeout(() => ac.abort(new Error("timeout")), config.operationTimeoutMs);
      stream.onAbort(() => ac.abort(new Error("client closed")));
      let queue: Promise<unknown> = Promise.resolve();
      const emit = (e: GenEvent) => {
        queue = queue.then(() => stream.writeSSE({ data: JSON.stringify(e) })).catch(() => {});
      };
      const ping = setInterval(() => emit({ type: "ping" }), 5000);
      try {
        await run(emit, ac.signal);
      } catch (err) {
        const message = ac.signal.aborted ? "Превышено время генерации" : (err as Error).message || "Ошибка генерации";
        console.error("[gen]", err);
        emit({ type: "error", message });
      } finally {
        clearInterval(ping);
        clearTimeout(deadline);
        running--;
        await queue;
      }
    });
}

const GenerateBody = z.object({ prompt: z.string().trim().min(3).max(500) });
const EditBody = z.object({ instruction: z.string().trim().min(2).max(500) });
const RepairBody = z.object({ versionId: z.string().max(32), error: z.string().min(1).max(4000) });
const EventBody = z.object({
  versionId: z.string().max(32),
  session: z.string().max(32),
  type: z.enum(["open", "round_start", "won", "lost", "error"]),
  score: z.number().int().min(0).max(1e9).optional(),
  playMs: z.number().int().min(0).max(36e5).optional(),
});

app.post("/api/generate", async (c) => {
  const body = GenerateBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "Запрос должен быть от 3 до 500 символов" }, 400);
  return sseOperation((emit, signal) => generate(body.data.prompt, emit, signal))(c);
});

app.post("/api/games/:id/edit", async (c) => {
  const body = EditBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "Опишите правку (от 2 до 500 символов)" }, 400);
  const id = c.req.param("id");
  return sseOperation((emit, signal) => edit(id, body.data.instruction, emit, signal))(c);
});

app.post("/api/repair", async (c) => {
  const body = RepairBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "bad request" }, 400);
  return sseOperation((emit, signal) => repair(body.data.versionId, body.data.error, emit, signal))(c);
});

app.get("/api/games", (c) => c.json(listGames()));

app.get("/api/stats", (c) => c.json({ minSessions: MIN_SESSIONS, segments: segmentStats() }));

app.get("/api/config", (c) => c.json({ publicUrl: config.publicUrl }));

app.get("/api/games/:id", (c) => {
  const g = getGame(c.req.param("id"));
  return g ? c.json(g) : c.json({ error: "not found" }, 404);
});

app.post("/api/events", async (c) => {
  const body = EventBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success || !getVersion(body.data.versionId)) return c.body(null, 204);
  const n = (sessionEvents.get(body.data.session) ?? 0) + 1;
  if (sessionEvents.size > 50_000) sessionEvents.clear();
  sessionEvents.set(body.data.session, n);
  if (n <= MAX_EVENTS_PER_SESSION) addEvent(body.data);
  return c.body(null, 204);
});

app.get("/g/:versionId", async (c) => {
  const id = c.req.param("versionId");
  if (!/^[a-f0-9]{10}$/.test(id)) return c.notFound();
  const file = Bun.file(gamePath(id));
  if (!(await file.exists())) return c.notFound();
  return c.body(await file.text(), 200, {
    "content-type": "text/html; charset=utf-8",
    "content-security-policy": GAME_CSP,
    "x-content-type-options": "nosniff",
    "cache-control": "public, max-age=31536000, immutable",
  });
});

app.get("/play/:gameId", (c) => {
  const game = getGame(c.req.param("gameId"));
  if (!game) return c.text("Игра не найдена", 404);
  const wanted = c.req.query("v");
  const version = (wanted && game.history.find((v) => v.id === wanted || String(v.version) === wanted)) || game.history.at(-1)!;
  return c.html(playShell({ title: version.spec.title, versionId: version.id, background: version.spec.palette.background }), 200, {
    "content-security-policy": SHELL_CSP,
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  });
});

app.use("/*", serveStatic({ root: config.webDist }));
// SPA-fallback: root обязателен, иначе абсолютный путь склеивается с "./" и даёт 404.
const spaIndex = serveStatic({ root: config.webDist, path: "index.html" });
// Пути с расширением — это файлы: отсутствующий ассет должен давать 404, а не страницу.
app.get("*", async (c, next) => {
  if (/\.[a-z0-9]+$/i.test(c.req.path)) return c.notFound();
  return (await spaIndex(c, next)) ?? c.notFound();
});

Bun.serve({ port: config.port, fetch: app.fetch, idleTimeout: 30 });
console.log(`server on :${config.port}`);
