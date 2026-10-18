import type { GameSpec } from "./spec";

export interface GameVersion {
  id: string;
  gameId: string;
  version: number;
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
  versions: number;
  createdAt: number;
}

export interface GameDetail extends GameSummary {
  history: GameVersion[];
}

/** Server-sent events emitted while a game is generated, edited or repaired. */
export type GenEvent =
  | { type: "stage"; stage: "spec" | "code" | "check" | "save"; message: string }
  | { type: "spec"; spec: GameSpec }
  | { type: "progress"; chars: number }
  | { type: "done"; gameId: string; versionId: string; version: number }
  | { type: "error"; message: string }
  | { type: "ping" };
