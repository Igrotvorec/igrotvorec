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
  | { type: "done"; gameId: string; versionId: string; version: number }
  | { type: "error"; message: string }
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
