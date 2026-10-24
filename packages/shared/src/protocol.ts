/**
 * Протокол postMessage между игрой в sandbox-iframe (opaque origin) и доверенной оболочкой
 * (превью генератора или страница /play). Каждое сообщение несёт `gg: 1` и runId, выданный
 * оболочкой, поэтому старый iframe не может писать в новый запуск.
 */

export type GameToShell =
  | { gg: 1; runId: string; type: "boot" }
  | { gg: 1; runId: string; type: "ready" }
  | { gg: 1; runId: string; type: "frame"; painted: boolean }
  | { gg: 1; runId: string; type: "input" }
  | { gg: 1; runId: string; type: "error"; message: string; stack?: string; line?: number; col?: number }
  | { gg: 1; runId: string; type: "state"; state: "start" | "playing" | "won" | "lost"; score?: number; activeMs?: number }
  | { gg: 1; runId: string; type: "storage:get"; reqId: number; key: string }
  | { gg: 1; runId: string; type: "storage:set"; key: string; value: string }
  | { gg: 1; runId: string; type: "thumb"; image: string }
  | { gg: 1; runId: string; type: "tune"; report: TuneReport | null };

export type ShellToGame =
  | { gg: 1; type: "storage:value"; reqId: number; value: string | null }
  | { gg: 1; type: "pause" }
  | { gg: 1; type: "resume" };

export const MAX_STORAGE_VALUE = 2048;

/** Итог автоподбора сложности ботами (phaser-kit.js, tuneDifficulty). */
export interface TuneReport {
  /** Подбор не попал в цель (край лестницы, наугад выигрывает, цель набирается в разминке). */
  failed: boolean;
  warmupLeak: boolean;
  /** Множитель GG.speed, при котором баланс попал в цель. */
  factor: number;
  /** Жизни после подбора (вторая ручка, когда скорость упёрлась в край). */
  lives: number;
  /** Время раунда после подбора (третья ручка; 0 — без таймера). */
  timeLimitSec: number;
  goodMs: number;
  carelessWins: number;
  carelessMs: number;
  randomWon: boolean;
  tried: number;
  ms: number;
}
const TUNE_FACTORS = [0.6, 0.75, 0.9, 1, 1.15, 1.35, 1.6, 1.9];
/** Снимок стартовой сцены 270×480 JPEG; с запасом, сервер всё равно перекодирует. */
export const MAX_THUMB_CHARS = 300_000;
const THUMB_PREFIX = "data:image/jpeg;base64,";

const GAME_TYPES = new Set(["boot", "ready", "frame", "input", "error", "state", "storage:get", "storage:set", "thumb", "tune"]);

/** Проверяет форму недоверенного сообщения от игры и обрезает поля до безопасной длины. */
export function parseGameMessage(data: unknown, runId: string): GameToShell | null {
  // Массив с именованными полями проходит structured clone, но JSON.stringify даёт "[]" — отклоняем.
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const m = data as Record<string, unknown>;
  if (m.gg !== 1 || m.runId !== runId || typeof m.type !== "string" || !GAME_TYPES.has(m.type)) return null;
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined);
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  switch (m.type) {
    case "boot":
    case "ready":
    case "input":
      return { gg: 1, runId, type: m.type };
    case "frame":
      return { gg: 1, runId, type: "frame", painted: m.painted === true };
    case "error": {
      const message = str(m.message, 1000);
      if (message === undefined) return null;
      return { gg: 1, runId, type: "error", message, stack: str(m.stack, 1500), line: num(m.line), col: num(m.col) };
    }
    case "state": {
      if (m.state !== "start" && m.state !== "playing" && m.state !== "won" && m.state !== "lost") return null;
      return { gg: 1, runId, type: "state", state: m.state, score: num(m.score), activeMs: num(m.activeMs) };
    }
    case "storage:get": {
      const key = str(m.key, 64);
      const reqId = num(m.reqId);
      if (key === undefined || reqId === undefined || (m.key as string).length > 64) return null;
      return { gg: 1, runId, type: "storage:get", reqId, key };
    }
    case "storage:set": {
      if (typeof m.key !== "string" || m.key.length > 64 || typeof m.value !== "string" || m.value.length > MAX_STORAGE_VALUE) return null;
      return { gg: 1, runId, type: "storage:set", key: m.key, value: m.value };
    }
    case "tune": {
      if (m.report === null) return { gg: 1, runId, type: "tune", report: null };
      const r = m.report as Record<string, unknown> | undefined;
      if (!r || typeof r !== "object" || Array.isArray(r)) return null;
      const n = (v: unknown, max: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max ? v : null);
      const factor = n(r.factor, 2);
      if (factor === null || !TUNE_FACTORS.includes(factor)) return null;
      const report: TuneReport = {
        failed: r.failed === true,
        warmupLeak: r.warmupLeak === true,
        factor,
        lives: Math.round(n(r.lives, 9) ?? 3) || 3,
        timeLimitSec: Math.round(n(r.timeLimitSec, 600) ?? 0),
        goodMs: n(r.goodMs, 600_000) ?? 0,
        carelessWins: n(r.carelessWins, 8) ?? 0,
        carelessMs: n(r.carelessMs, 600_000) ?? 0,
        randomWon: r.randomWon === true,
        tried: n(r.tried, 10) ?? 0,
        ms: n(r.ms, 600_000) ?? 0,
      };
      return { gg: 1, runId, type: "tune", report };
    }
    case "thumb": {
      if (typeof m.image !== "string" || m.image.length > MAX_THUMB_CHARS || !m.image.startsWith(THUMB_PREFIX)) return null;
      return { gg: 1, runId, type: "thumb", image: m.image };
    }
  }
  return null;
}

/** Квота хранилища одной игры в доверенной оболочке. */
export const STORAGE_MAX_KEYS = 32;
export const STORAGE_MAX_BYTES = 32768;
