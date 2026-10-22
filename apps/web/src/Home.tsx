import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRightIcon as ArrowRight, SparkleIcon as Sparkle } from "@phosphor-icons/react";
import type { GameSummary, Genre } from "@gg/shared";
import { listGames } from "./api";
import { Art } from "./Art";
import { Build } from "./Build";
import { ErrorNote } from "./ErrorNote";
import { useAutosize } from "./useAutosize";
import { AUDIENCE_LABEL, GENRE_LABEL, PROMPT_EXAMPLES } from "./labels";
import { Phone } from "./Phone";
import { useOperation } from "./useOperation";
import { Link, navigate } from "./router";

export function Home() {
  const [prompt, setPrompt] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [games, setGames] = useState<GameSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [genre, setGenre] = useState<Genre | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Если пока шла генерация пользователь ушёл смотреть другую игру, не выдёргиваем его оттуда.
  const { state: op, run, cancel } = useOperation((e) => {
    if (location.pathname === "/") navigate(`/games/${e.gameId}`);
  });
  useAutosize(inputRef, prompt);

  useEffect(() => {
    listGames().then(setGames, (e: Error) => setLoadError(e.message));
  }, []);

  const submit = (text: string) => {
    const p = text.trim();
    if (p.length < 3 || op.running) return;
    setSubmitted(p);
    run("/api/generate", { prompt: p });
  };

  const genres = useMemo(() => {
    const counts = new Map<Genre, number>();
    for (const g of games ?? []) counts.set(g.genre, (counts.get(g.genre) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [games]);
  const shown = genre ? games?.filter((g) => g.genre === genre) : games;
  // Витрина: сначала игры со снимками, они выглядят как настоящий экран.
  const showcase = useMemo(
    () => [...(games ?? [])].sort((a, b) => Number(!!b.thumbVersionId) - Number(!!a.thumbVersionId)).slice(0, 3),
    [games],
  );

  return (
    <main className="page">
      {op.running ? (
        <Build prompt={submitted} op={op} onCancel={cancel} />
      ) : (
        <section className="hero">
          <div>
            <h1>
              Мини-игры для суперапа
              <br />
              по текстовому запросу
            </h1>
            <p className="hero-sub">Опишите игру и для кого она. Генератор напишет код, проверит запуск и даст ссылку, которая откроется в WebView.</p>
            <form
              className="composer"
              onSubmit={(e) => {
                e.preventDefault();
                submit(prompt);
              }}
            >
              <Sparkle className="composer-icon" size={20} weight="fill" aria-hidden />
              <label htmlFor="prompt" className="sr-only">
                Описание игры
              </label>
              <textarea
                id="prompt"
                ref={inputRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit(prompt);
                  }
                }}
                placeholder="Например: змейка для бабушки с крупными кнопками"
                maxLength={500}
                rows={1}
                autoFocus
              />
              <button type="submit" className="btn btn-primary" disabled={prompt.trim().length < 3}>
                Создать игру
                <ArrowRight size={16} weight="bold" aria-hidden />
              </button>
            </form>
            <ErrorNote op={op} />
            <div className="try">
              <span className="try-label">Попробуйте:</span>
              {PROMPT_EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  className="chip"
                  onClick={() => {
                    setPrompt(ex);
                    inputRef.current?.focus();
                  }}
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
          {showcase.length > 0 && (
            <div className="showcase" aria-hidden>
              {showcase.map((g) => (
                <Link key={g.id} to={`/games/${g.id}`} tabIndex={-1}>
                  <Phone>
                    <Art palette={g.palette} title={g.title} thumbId={g.thumbVersionId} coverId={g.hasCover ? g.latestVersionId : null} />
                  </Phone>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      <section aria-labelledby="gallery">
        <div className="section-head">
          <h2 id="gallery">Галерея</h2>
        </div>
        {genres.length > 1 && (
          <div className="filters" role="group" aria-label="Жанр">
            <button type="button" className="chip" aria-pressed={genre === null} onClick={() => setGenre(null)}>
              Все <span className="count">{games?.length}</span>
            </button>
            {genres.map(([g, n]) => (
              <button key={g} type="button" className="chip" aria-pressed={genre === g} onClick={() => setGenre(genre === g ? null : g)}>
                {GENRE_LABEL[g]} <span className="count">{n}</span>
              </button>
            ))}
          </div>
        )}
        {genres.length <= 1 && <div style={{ height: 24 }} />}
        {loadError && <p className="alert alert-err">{loadError}</p>}
        {games === null && !loadError && (
          <div className="grid">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="skeleton" style={{ aspectRatio: "2 / 3" }} />
            ))}
          </div>
        )}
        {games?.length === 0 && <p className="empty">Здесь появятся созданные игры. Опишите первую в поле выше.</p>}
        {shown && shown.length > 0 && (
          <div className="grid">
            {shown.map((g) => (
              <Link key={g.id} to={`/games/${g.id}`} className="card">
                <div className="card-art">
                  <Art palette={g.palette} title={g.title} thumbId={g.thumbVersionId} coverId={g.hasCover ? g.latestVersionId : null} showTitle={false} />
                </div>
                <div>
                  <div className="card-title">{g.title}</div>
                  <p className="card-desc">{g.prompt}</p>
                </div>
                <div className="card-meta">
                  <span className="tag">{GENRE_LABEL[g.genre]}</span>
                  <span className="tag">{AUDIENCE_LABEL[g.audience]}</span>
                  {g.versions > 1 && <span className="tag">v{g.versions}</span>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
