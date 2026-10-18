import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { GameDetail, GameSpec, GameSummary, GameVersion } from "@gg/shared";
import { config } from "./config";

mkdirSync(join(config.dataDir, "games"), { recursive: true });

const db = new Database(join(config.dataDir, "gamegen.sqlite"), { create: true, strict: true });
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
db.exec(`
CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  prompt TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS versions (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id),
  version INTEGER NOT NULL,
  spec TEXT NOT NULL,
  code TEXT NOT NULL,
  instruction TEXT NOT NULL,
  model TEXT NOT NULL,
  gen_ms INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (game_id, version)
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version_id TEXT NOT NULL,
  session TEXT NOT NULL,
  type TEXT NOT NULL,
  score INTEGER,
  play_ms INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS events_version ON events(version_id);
`);

const shortId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 10);

export const gamePath = (versionId: string) => join(config.dataDir, "games", `${versionId}.html`);

interface VersionRow {
  id: string;
  game_id: string;
  version: number;
  spec: string;
  code: string;
  instruction: string;
  created_at: number;
}

const toVersion = (r: VersionRow): GameVersion => ({
  id: r.id,
  gameId: r.game_id,
  version: r.version,
  spec: JSON.parse(r.spec) as GameSpec,
  instruction: r.instruction,
  createdAt: r.created_at,
});

export function createGame(prompt: string): string {
  const id = shortId();
  db.query("INSERT INTO games (id, prompt, created_at) VALUES (?, ?, ?)").run(id, prompt, Date.now());
  return id;
}

/** Сначала пишет HTML на диск, потом строку версии: ссылка появляется, только когда готово и то и другое. */
export async function addVersion(v: {
  gameId: string;
  spec: GameSpec;
  code: string;
  html: string;
  instruction: string;
  model: string;
  genMs: number;
}): Promise<{ id: string; version: number }> {
  const id = shortId();
  await Bun.write(gamePath(id), v.html);
  const insert = db.transaction(() => {
    const row = db.query("SELECT COALESCE(MAX(version), 0) AS n FROM versions WHERE game_id = ?").get(v.gameId) as { n: number };
    const version = row.n + 1;
    db.query(
      "INSERT INTO versions (id, game_id, version, spec, code, instruction, model, gen_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(id, v.gameId, version, JSON.stringify(v.spec), v.code, v.instruction, v.model, v.genMs, Date.now());
    return version;
  });
  return { id, version: insert() };
}

export function getVersion(id: string): (GameVersion & { code: string }) | null {
  const r = db.query("SELECT * FROM versions WHERE id = ?").get(id) as VersionRow | null;
  return r ? { ...toVersion(r), code: r.code } : null;
}

export function getGame(id: string): GameDetail | null {
  const g = db.query("SELECT * FROM games WHERE id = ?").get(id) as { id: string; prompt: string; created_at: number } | null;
  if (!g) return null;
  const rows = db.query("SELECT * FROM versions WHERE game_id = ? ORDER BY version").all(id) as VersionRow[];
  if (!rows.length) return null;
  const history = rows.map(toVersion);
  const latest = history[history.length - 1]!;
  return {
    id: g.id,
    prompt: g.prompt,
    title: latest.spec.title,
    audience: latest.spec.audience,
    genre: latest.spec.genre,
    palette: latest.spec.palette,
    latestVersionId: latest.id,
    versions: history.length,
    createdAt: g.created_at,
    history,
  };
}

export function listGames(limit = 60): GameSummary[] {
  const rows = db
    .query(
      `SELECT g.id, g.prompt, g.created_at, v.id AS vid, v.spec, v.version
       FROM games g JOIN versions v ON v.game_id = g.id
       WHERE v.version = (SELECT MAX(version) FROM versions WHERE game_id = g.id)
       ORDER BY g.created_at DESC LIMIT ?`,
    )
    .all(limit) as { id: string; prompt: string; created_at: number; vid: string; spec: string; version: number }[];
  return rows.map((r) => {
    const spec = JSON.parse(r.spec) as GameSpec;
    return {
      id: r.id,
      prompt: r.prompt,
      title: spec.title,
      audience: spec.audience,
      genre: spec.genre,
      palette: spec.palette,
      latestVersionId: r.vid,
      versions: r.version,
      createdAt: r.created_at,
    };
  });
}

export function addEvent(e: { versionId: string; session: string; type: string; score?: number; playMs?: number }) {
  db.query("INSERT INTO events (version_id, session, type, score, play_ms, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    e.versionId,
    e.session,
    e.type,
    e.score ?? null,
    e.playMs ?? null,
    Date.now(),
  );
}

export { db };
