import { useEffect, useState } from "react";
import type { GameStatsDto } from "@gg/shared";
import { getGameStats } from "./api";
import { pct } from "./labels";

/** Метрики /play для одной игры: в целом и по версиям. */
export function GameAnalytics({ gameId }: { gameId: string }) {
  const [data, setData] = useState<GameStatsDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    getGameStats(gameId).then(setData, (e: Error) => setError(e.message));
  }, [gameId]);

  if (error) return <div className="analytics"><p className="alert alert-err">{error}</p></div>;
  if (!data) return <div className="analytics"><div className="skeleton" style={{ height: 110 }} /></div>;
  const t = data.total;
  if (t.sessions === 0)
    return (
      <div className="analytics">
        <p className="empty">Статистика появится, когда в игру сыграют по ссылке или QR-коду.</p>
      </div>
    );

  return (
    <div className="analytics">
      <div className="metrics">
        <Metric label="Сессии" value={String(t.sessions)} note={`${t.rounds} раундов`} />
        <Metric label="Победы" value={pct(t.wins, t.finished)} note={`${t.wins} из ${t.finished} завершённых`} />
        <Metric label="Повторная игра" value={pct(t.replaySessions, t.sessions)} note={`${t.replaySessions} из ${t.sessions} сессий`} />
        <Metric label="Средний раунд" value={t.avgRoundSec != null ? `${t.avgRoundSec} с` : "—"} note={t.errorSessions ? `ошибки в ${t.errorSessions} сессиях` : "без ошибок"} />
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Версия</th>
              <th className="r">Сессии</th>
              <th className="r">Раунды</th>
              <th className="r">Победы</th>
              <th className="r">Повторы</th>
              <th className="r">Средний раунд</th>
              <th className="r">Ошибки</th>
            </tr>
          </thead>
          <tbody>
            {[...data.versions].reverse().map((v) => (
              <tr key={v.versionId} className={v.sessions ? "" : "dim"}>
                <td>v{v.version}</td>
                <td className="r">{v.sessions}</td>
                <td className="r">{v.rounds}</td>
                <td className="r">{pct(v.wins, v.finished)}</td>
                <td className="r">{pct(v.replaySessions, v.sessions)}</td>
                <td className="r">{v.avgRoundSec != null ? `${v.avgRoundSec} с` : "—"}</td>
                <td className="r">{v.errorSessions}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      <div className="metric-note">{note}</div>
    </div>
  );
}
