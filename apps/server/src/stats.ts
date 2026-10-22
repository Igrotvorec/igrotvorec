import { AUDIENCE_PROFILES, type Audience, type GameStatsDto, type Genre, type PlayStats, type SegmentStatsDto } from "@gg/shared";
import { db } from "./db";

/** Сколько сессий нужно в сегменте, прежде чем его наблюдения начнут влиять на генерацию. */
export const MIN_SESSIONS = 5;

export type SegmentStats = SegmentStatsDto;

interface Row {
  audience: Audience;
  genre: Genre;
  game_id: string;
  session: string;
  type: string;
  play_ms: number | null;
}

/** Копит метрики /play по набору событий; знаменатели показываются, а не прячутся. */
class Acc {
  rounds = 0;
  finished = 0;
  wins = 0;
  sessions = new Map<string, number>();
  errors = new Set<string>();
  playMs: number[] = [];

  add(r: { session: string; type: string; play_ms: number | null }) {
    if (!this.sessions.has(r.session)) this.sessions.set(r.session, 0);
    if (r.type === "round_start") {
      this.rounds++;
      this.sessions.set(r.session, this.sessions.get(r.session)! + 1);
    } else if (r.type === "won" || r.type === "lost") {
      this.finished++;
      if (r.type === "won") this.wins++;
      if (r.play_ms) this.playMs.push(r.play_ms);
    } else if (r.type === "error") this.errors.add(r.session);
  }

  result(): PlayStats {
    return {
      sessions: this.sessions.size,
      rounds: this.rounds,
      finished: this.finished,
      wins: this.wins,
      replaySessions: [...this.sessions.values()].filter((n) => n > 1).length,
      avgRoundSec: this.playMs.length ? Math.round(this.playMs.reduce((a, b) => a + b, 0) / this.playMs.length / 1000) : null,
      errorSessions: this.errors.size,
    };
  }
}

/** Агрегирует телеметрию /play по «аудитория × жанр». */
export function segmentStats(): SegmentStats[] {
  const rows = db
    .query(
      `SELECT json_extract(v.spec, '$.audience') AS audience, json_extract(v.spec, '$.genre') AS genre,
              v.game_id, e.session, e.type, e.play_ms
       FROM events e JOIN versions v ON v.id = e.version_id`,
    )
    .all() as Row[];

  const segs = new Map<string, { audience: Audience; genre: Genre; games: Set<string>; acc: Acc }>();
  for (const r of rows) {
    const key = `${r.audience}|${r.genre}`;
    let seg = segs.get(key);
    if (!seg) segs.set(key, (seg = { audience: r.audience, genre: r.genre, games: new Set(), acc: new Acc() }));
    seg.games.add(r.game_id);
    seg.acc.add(r);
  }
  return [...segs.values()].map((s) => ({ audience: s.audience, genre: s.genre, games: s.games.size, ...s.acc.result() }));
}

/** Метрики одной игры: в целом и по каждой версии. */
export function gameStats(gameId: string): GameStatsDto {
  const versions = db.query("SELECT id, version FROM versions WHERE game_id = ? ORDER BY version").all(gameId) as { id: string; version: number }[];
  const rows = db
    .query(`SELECT e.version_id, e.session, e.type, e.play_ms FROM events e JOIN versions v ON v.id = e.version_id WHERE v.game_id = ?`)
    .all(gameId) as { version_id: string; session: string; type: string; play_ms: number | null }[];
  const total = new Acc();
  const per = new Map(versions.map((v) => [v.id, new Acc()]));
  for (const r of rows) {
    total.add(r);
    per.get(r.version_id)?.add(r);
  }
  return {
    total: total.result(),
    versions: versions.map((v) => ({ versionId: v.id, version: v.version, ...per.get(v.id)!.result() })),
  };
}

const pct = (a: number, b: number) => `${Math.round((a / b) * 100)}%`;

/**
 * Превращает наблюдения по целевому сегменту в конкретные указания для генерации.
 * Если данных мало, ничего не возвращает.
 */
export function observationsFor(audience: Audience, genre: Genre): { lines: string[]; sessions: number } {
  const all = segmentStats();
  const seg = all.find((s) => s.audience === audience && s.genre === genre);
  const lines: string[] = [];
  const profile = AUDIENCE_PROFILES[audience];

  if (seg && seg.sessions >= MIN_SESSIONS && seg.finished > 0) {
    const winRate = seg.wins / seg.finished;
    lines.push(`Observed on our platform for ${profile.label} / ${genre}: ${seg.sessions} sessions, ${seg.finished} finished rounds, win rate ${pct(seg.wins, seg.finished)}, replay in ${pct(seg.replaySessions, seg.sessions)} of sessions${seg.avgRoundSec != null ? `, average round ${seg.avgRoundSec}s` : ""}.`);
    if (winRate < 0.25) lines.push("Players rarely win in this segment: make the goal easier to reach (lower target or more time/lives).");
    else if (winRate > 0.85) lines.push("Players almost always win in this segment: add a little challenge (slightly higher target or ramping speed).");
    if (seg.avgRoundSec != null && seg.avgRoundSec < profile.roundSeconds[0] / 2) lines.push(`Rounds end much faster than the intended ${profile.roundSeconds[0]}s: reduce early-game punishment.`);
  }

  // Сигнал по другим жанрам той же аудитории: какие жанры переигрывают чаще.
  const sameAudience = all.filter((s) => s.audience === audience && s.sessions >= MIN_SESSIONS);
  if (sameAudience.length >= 2) {
    const ranked = [...sameAudience].sort((a, b) => b.replaySessions / b.sessions - a.replaySessions / a.sessions);
    const top = ranked[0]!;
    if (top.genre !== genre) lines.push(`For ${profile.label}, ${top.genre} games get the most replays (${pct(top.replaySessions, top.sessions)} of ${top.sessions} sessions); borrow its pacing and feedback style where it fits.`);
  }
  return { lines, sessions: seg?.sessions ?? 0 };
}
