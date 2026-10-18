import { useEffect, useState } from "react";
import type { SegmentStatsDto } from "@gg/shared";
import { getStats } from "./api";
import { AUDIENCE_LABEL, GENRE_LABEL } from "./labels";

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

export function Stats() {
  const [data, setData] = useState<{ minSessions: number; segments: SegmentStatsDto[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    getStats().then(setData, (e: Error) => setError(e.message));
  }, []);

  return (
    <main className="stats">
      <h1>Статистика игр</h1>
      <p className="muted">
        Сегменты с {data?.minSessions ?? "…"}+ сессиями учитываются при генерации новых игр.
      </p>
      {error && <p className="error">{error}</p>}
      {data && data.segments.length === 0 && <p className="muted">Пока нет сыгранных раундов</p>}
      {data && data.segments.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Аудитория</th>
                <th>Жанр</th>
                <th>Игр</th>
                <th>Сессий</th>
                <th>Раундов</th>
                <th>Побед</th>
                <th>Повторы</th>
                <th>Средний раунд</th>
                <th>Ошибки</th>
              </tr>
            </thead>
            <tbody>
              {data.segments.map((s) => (
                <tr key={`${s.audience}-${s.genre}`} className={s.sessions >= data.minSessions ? "" : "dim"}>
                  <td>{AUDIENCE_LABEL[s.audience]}</td>
                  <td>{GENRE_LABEL[s.genre]}</td>
                  <td>{s.games}</td>
                  <td>{s.sessions}</td>
                  <td>{s.rounds}</td>
                  <td>{pct(s.wins, s.finished)}</td>
                  <td>{pct(s.replaySessions, s.sessions)}</td>
                  <td>{s.avgRoundSec != null ? `${s.avgRoundSec} с` : "—"}</td>
                  <td>{s.errorSessions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
