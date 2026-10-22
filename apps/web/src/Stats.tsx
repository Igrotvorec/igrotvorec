import { useEffect, useState } from "react";
import type { SegmentStatsDto } from "@gg/shared";
import { getStats } from "./api";
import { AUDIENCE_LABEL, GENRE_LABEL, pct } from "./labels";

export function Stats() {
  const [data, setData] = useState<{ minSessions: number; segments: SegmentStatsDto[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    getStats().then(setData, (e: Error) => setError(e.message));
  }, []);
  const segments = data ? [...data.segments].sort((a, b) => b.sessions - a.sessions) : [];

  return (
    <main className="page stats-page">
      <h1>Аналитика</h1>
      <p className="lead">
        Сыгранные раунды по аудиториям и жанрам. Сегменты, где набралось от {data?.minSessions ?? "…"} сессий, учитываются при генерации новых игр; меньшее число сессий отмечено серым.
      </p>
      {error && <p className="alert alert-err">{error}</p>}
      {!data && !error && <div className="skeleton" style={{ height: 240 }} />}
      {data && segments.length === 0 && <p className="empty">Пока никто не играл. Откройте любую игру по ссылке или QR-коду.</p>}
      {segments.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Аудитория</th>
                <th>Жанр</th>
                <th className="r">Игры</th>
                <th className="r">Сессии</th>
                <th className="r">Раунды</th>
                <th className="r">Победы</th>
                <th className="r">Повторы</th>
                <th className="r">Средний раунд</th>
                <th className="r">Ошибки</th>
              </tr>
            </thead>
            <tbody>
              {segments.map((s) => {
                const low = s.sessions < data!.minSessions;
                return (
                  <tr key={`${s.audience}-${s.genre}`}>
                    <td>{AUDIENCE_LABEL[s.audience]}</td>
                    <td>{GENRE_LABEL[s.genre]}</td>
                    <td className="r">{s.games}</td>
                    <td className={low ? "r low" : "r"}>{s.sessions}</td>
                    <td className="r">{s.rounds}</td>
                    <td className="r">{pct(s.wins, s.finished)}</td>
                    <td className="r">{pct(s.replaySessions, s.sessions)}</td>
                    <td className="r">{s.avgRoundSec != null ? `${s.avgRoundSec} с` : "—"}</td>
                    <td className="r">{s.errorSessions}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
