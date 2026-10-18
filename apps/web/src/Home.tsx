import { useEffect, useState } from "react";
import type { GameSummary } from "@gg/shared";
import { listGames } from "./api";
import { AUDIENCE_LABEL, GENRE_LABEL, PROMPT_EXAMPLES } from "./labels";
import { Progress } from "./Progress";
import { useOperation } from "./useOperation";
import { navigate } from "./router";

export function Home() {
  const [prompt, setPrompt] = useState("");
  const [games, setGames] = useState<GameSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { state: op, run, cancel } = useOperation((e) => navigate(`/games/${e.gameId}`));

  useEffect(() => {
    listGames().then(setGames, (e: Error) => setLoadError(e.message));
  }, []);

  const submit = (text: string) => {
    const p = text.trim();
    if (p.length < 3 || op.running) return;
    run("/api/generate", { prompt: p });
  };

  return (
    <main className="home">
      <section className="create">
        <h1>Опишите игру</h1>
        <form
          className="prompt-form"
          onSubmit={(e) => {
            e.preventDefault();
            submit(prompt);
          }}
        >
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(prompt);
              }
            }}
            placeholder="Например: замути змейку для бабушки"
            maxLength={500}
            rows={3}
            disabled={op.running}
            autoFocus
          />
          <button type="submit" className="btn-primary" disabled={op.running || prompt.trim().length < 3}>
            Создать игру
          </button>
        </form>
        {!op.running && (
          <div className="chips">
            {PROMPT_EXAMPLES.map((ex) => (
              <button key={ex} type="button" className="chip" onClick={() => setPrompt(ex)}>
                {ex}
              </button>
            ))}
          </div>
        )}
        {op.running && <Progress op={op} onCancel={cancel} />}
        {op.error && <p className={op.error.startsWith("Не могу") ? "notice" : "error"}>{op.error}</p>}
      </section>

      <section className="gallery">
        <h2>Галерея</h2>
        {loadError && <p className="error">{loadError}</p>}
        {games === null && !loadError && <p className="muted">Загрузка…</p>}
        {games?.length === 0 && <p className="muted">Пока нет игр</p>}
        <div className="cards">
          {games?.map((g) => (
            <a
              key={g.id}
              className="card"
              href={`/games/${g.id}`}
              onClick={(e) => {
                e.preventDefault();
                navigate(`/games/${g.id}`);
              }}
            >
              <div className="card-art" style={{ background: g.palette.background, color: g.palette.primary }}>
                <span style={{ color: g.palette.text }}>{g.title}</span>
                <i style={{ background: g.palette.primary }} />
                <i style={{ background: g.palette.accent }} />
              </div>
              <div className="card-meta">
                <span>{GENRE_LABEL[g.genre]}</span>
                <span>{AUDIENCE_LABEL[g.audience]}</span>
                {g.versions > 1 && <span>v{g.versions}</span>}
              </div>
              <p className="card-prompt">{g.prompt}</p>
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}
