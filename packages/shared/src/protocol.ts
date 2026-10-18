/**
 * postMessage protocol between a sandboxed game iframe (opaque origin) and the trusted shell
 * (the generator preview or the /play page). Every message carries `gg: 1` and the runId the
 * shell assigned, so a stale iframe cannot report into a newer run.
 */

export type GameToShell =
  | { gg: 1; runId: string; type: "boot" }
  | { gg: 1; runId: string; type: "ready" }
  | { gg: 1; runId: string; type: "frame"; painted: boolean }
  | { gg: 1; runId: string; type: "input" }
  | { gg: 1; runId: string; type: "error"; message: string; stack?: string; line?: number; col?: number }
  | { gg: 1; runId: string; type: "state"; state: "start" | "playing" | "won" | "lost"; score?: number }
  | { gg: 1; runId: string; type: "storage:get"; reqId: number; key: string }
  | { gg: 1; runId: string; type: "storage:set"; key: string; value: string };

export type ShellToGame =
  | { gg: 1; type: "storage:value"; reqId: number; value: string | null }
  | { gg: 1; type: "pause" }
  | { gg: 1; type: "resume" };

export const MAX_MESSAGE_BYTES = 4096;
export const MAX_STORAGE_VALUE = 2048;

const GAME_TYPES = new Set(["boot", "ready", "frame", "input", "error", "state", "storage:get", "storage:set"]);

/** Shape-check an untrusted message from a game iframe. */
export function parseGameMessage(data: unknown, runId: string): GameToShell | null {
  if (!data || typeof data !== "object") return null;
  const m = data as Record<string, unknown>;
  if (m.gg !== 1 || m.runId !== runId || typeof m.type !== "string" || !GAME_TYPES.has(m.type)) return null;
  try {
    if (JSON.stringify(m).length > MAX_MESSAGE_BYTES) return null;
  } catch {
    return null;
  }
  if (m.type === "storage:get" && (typeof m.key !== "string" || typeof m.reqId !== "number")) return null;
  if (m.type === "storage:set" && (typeof m.key !== "string" || typeof m.value !== "string" || m.value.length > MAX_STORAGE_VALUE)) return null;
  if (m.type === "error" && typeof m.message !== "string") return null;
  return m as unknown as GameToShell;
}
