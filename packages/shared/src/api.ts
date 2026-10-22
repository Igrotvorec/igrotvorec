import type { GameSpec } from "./spec";

export type VersionKind = "create" | "edit" | "repair";

export interface GameVersion {
  id: string;
  gameId: string;
  version: number;
  kind: VersionKind;
  spec: GameSpec;
  instruction: string;
  createdAt: number;
  /** Есть снимок стартовой сцены (/thumb/:id). */
  hasThumb: boolean;
}

export interface GameSummary {
  id: string;
  prompt: string;
  title: string;
  audience: GameSpec["audience"];
  genre: GameSpec["genre"];
  palette: GameSpec["palette"];
  latestVersionId: string;
  hasCover: boolean;
  /** Самая новая версия со снимком: после правки снимок появится, когда новую версию откроют. */
  thumbVersionId: string | null;
  versions: number;
  createdAt: number;
}

export interface GameDetail extends GameSummary {
  history: GameVersion[];
}

/** SSE-события во время генерации, правки или исправления игры. */
export type GenEvent =
  | { type: "stage"; stage: "spec" | "code" | "check" | "save"; message: string }
  | { type: "spec"; spec: GameSpec }
  | { type: "progress"; chars: number }
  /** thumbToken — право загрузить обложку новой версии; получает только автор. */
  | { type: "done"; gameId: string; versionId: string; version: number; thumbToken: string }
  /** kind "refusal" — осознанный отказ модели (вредный или не игровой запрос), а не сбой. */
  | { type: "error"; message: string; kind?: "refusal" }
  | { type: "ping" };

/** Агрегат телеметрии /play по сегменту «аудитория × жанр». */
export interface SegmentStatsDto {
  audience: GameSpec["audience"];
  genre: GameSpec["genre"];
  games: number;
  sessions: number;
  rounds: number;
  finished: number;
  wins: number;
  /** Сессии, в которых начато больше одного раунда. */
  replaySessions: number;
  avgRoundSec: number | null;
  errorSessions: number;
}

/** Метрики /play: по игре целиком или по одной версии. */
export interface PlayStats {
  sessions: number;
  rounds: number;
  finished: number;
  wins: number;
  replaySessions: number;
  avgRoundSec: number | null;
  errorSessions: number;
}

export interface GameStatsDto {
  total: PlayStats;
  versions: ({ versionId: string; version: number } & PlayStats)[];
}
