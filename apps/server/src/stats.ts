import { AUDIENCE_PROFILES, type Audience, type Genre, type SegmentStatsDto } from "@gg/shared";
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

/** Агрегирует телеметрию /play по «аудитория × жанр». Знаменатели показываются, а не прячутся. */
export function segmentStats(): SegmentStats[] {
  const rows = db
    .query(
      `SELECT json_extract(v.spec, '$.audience') AS audience, json_extract(v.spec, '$.genre') AS genre,
              v.game_id, e.session, e.type, e.play_ms
       FROM events e JOIN versions v ON v.id = e.version_id`,
    )
    .all() as Row[];

  const segs = new Map<string, { s: SegmentStats; games: Set<string>; sessions: Map<string, number>; errors: Set<string>; playMs: number[] }>();
  for (const r of rows) {
    const key = `${r.audience}|${r.genre}`;
    let seg = segs.get(key);
    if (!seg) {
      seg = {
        s: { audience: r.audience, genre: r.genre, games: 0, sessions: 0, rounds: 0, finished: 0, wins: 0, replaySessions: 0, avgRoundSec: null, errorSessions: 0 },
        games: new Set(),
        sessions: new Map(),
        errors: new Set(),
        playMs: [],
      };
      segs.set(key, seg);
    }
    seg.games.add(r.game_id);
    if (!seg.sessions.has(r.session)) seg.sessions.set(r.session, 0);
    if (r.type === "round_start") {
      seg.s.rounds++;
      seg.sessions.set(r.session, seg.sessions.get(r.session)! + 1);
    } else if (r.type === "won" || r.type === "lost") {
      seg.s.finished++;
      if (r.type === "won") seg.s.wins++;
      if (r.play_ms) seg.playMs.push(r.play_ms);
    } else if (r.type === "error") seg.errors.add(r.session);
  }

  return [...segs.values()].map(({ s, games, sessions, errors, playMs }) => ({
    ...s,
    games: games.size,
    sessions: sessions.size,
    replaySessions: [...sessions.values()].filter((n) => n > 1).length,
    avgRoundSec: playMs.length ? Math.round(playMs.reduce((a, b) => a + b, 0) / playMs.length / 1000) : null,
    errorSessions: errors.size,
  }));
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
