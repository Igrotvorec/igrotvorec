import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import type { GameDetail } from "@gg/shared";
import { getConfig, getGame } from "./api";
import { GameFrame, type FrameStatus } from "./GameFrame";
import { AUDIENCE_LABEL, EDIT_EXAMPLES, GENRE_LABEL } from "./labels";
import { Progress } from "./Progress";
import { useOperation } from "./useOperation";
import { navigate } from "./router";

export function GameView({ id }: { id: string }) {
  const [game, setGame] = useState<GameDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [status, setStatus] = useState<FrameStatus | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [instruction, setInstruction] = useState("");
  const [opKind, setOpKind] = useState<"edit" | "repair">("edit");
  const repairedRef = useRef(new Set<string>());

  const load = useCallback(
    (selectLatest: boolean) =>
      getGame(id).then(
        (g) => {
          setGame(g);
          if (selectLatest) setSelected(g.latestVersionId);
        },
        (e: Error) => setLoadError(e.message),
      ),
    [id],
  );
  useEffect(() => {
    setGame(null);
    load(true);
  }, [load]);

  const { state: op, run, cancel } = useOperation(() => {
    // Бывшая последняя версия заменена новой — автоисправлять её уже не нужно.
    if (game) repairedRef.current.add(game.latestVersionId);
    setInstruction("");
    load(true);
  });
  const repairing = op.running && opKind === "repair";

  const version = game?.history.find((v) => v.id === selected) ?? game?.history.at(-1);
  const isLatest = !!game && version?.id === game.latestVersionId;

  // Одно автоисправление ошибки выполнения в последней версии (но не в самом исправлении).
  useEffect(() => {
    if (!status || status.kind !== "error" || !version || status.versionId !== version.id || !isLatest || op.running) return;
    if (version.kind === "repair" || repairedRef.current.has(version.id)) return;
    repairedRef.current.add(version.id);
    setOpKind("repair");
    run("/api/repair", { versionId: version.id, error: status.message });
  }, [status, version, isLatest, op.running, run]);

  if (loadError) return <main className="game-view"><p className="error">{loadError}</p></main>;
  if (!game || !version) return <main className="game-view"><p className="muted">Загрузка…</p></main>;

  const submitEdit = (text: string) => {
    const t = text.trim();
    if (t.length < 2 || op.running) return;
    setOpKind("edit");
    run(`/api/games/${game.id}/edit`, { instruction: t });
  };

  return (
    <main className="game-view">
      <section className="game-side">
        <button type="button" className="btn-ghost back" onClick={() => navigate("/")}>
          ← Все игры
        </button>
        <h1>{version.spec.title}</h1>
        <div className="tags">
          <span>{GENRE_LABEL[version.spec.genre]}</span>
          <span>{AUDIENCE_LABEL[version.spec.audience]}</span>
          <span>v{version.version}</span>
        </div>
        <p className="muted prompt-quote">«{game.prompt}»</p>
        <p>{version.spec.howToPlay}</p>

        <form
          className="edit-form"
          onSubmit={(e) => {
            e.preventDefault();
            submitEdit(instruction);
          }}
        >
          <label htmlFor="edit">Что изменить?</label>
          <div className="edit-row">
            <input
              id="edit"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="Например: сделай кнопки больше"
              maxLength={500}
              disabled={op.running}
            />
            <button type="submit" className="btn-primary" disabled={op.running || instruction.trim().length < 2}>
              Изменить
            </button>
          </div>
          {!op.running && (
            <div className="chips">
              {EDIT_EXAMPLES.map((ex) => (
                <button key={ex} type="button" className="chip" onClick={() => submitEdit(ex)}>
                  {ex}
                </button>
              ))}
            </div>
          )}
        </form>
        {op.running && <Progress op={op} onCancel={cancel} />}
        {op.error && <p className={op.error.startsWith("Не могу") ? "notice" : "error"}>{op.error}</p>}

        <Share gameId={game.id} />

        <div className="versions">
          <h2>Версии</h2>
          <ol>
            {[...game.history].reverse().map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  className={v.id === version.id ? "version active" : "version"}
                  onClick={() => setSelected(v.id)}
                >
                  <span className="v-num">v{v.version}</span>
                  <span className="v-text">
                    {v.kind === "repair" ? "Автоисправление ошибки" : v.instruction}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="game-stage">
        <div className="phone">
          <GameFrame gameId={game.id} versionId={version.id} reloadKey={reloadKey} onStatus={setStatus} />
        </div>
        <div className="frame-status">
          <StatusLine status={status?.versionId === version.id ? status : null} repairing={repairing} />
          <button type="button" className="btn-ghost" onClick={() => setReloadKey((n) => n + 1)}>
            Перезапустить
          </button>
        </div>
      </section>
    </main>
  );
}

function StatusLine({ status, repairing }: { status: FrameStatus | null; repairing: boolean }) {
  if (repairing) return <span className="status warn">Нашли ошибку, исправляем</span>;
  if (!status) return <span className="status">Запуск…</span>;
  switch (status.kind) {
    case "loading":
      return <span className="status">Запуск…</span>;
    case "ready":
      return <span className="status ok">Запуск проверен</span>;
    case "stuck":
      return <span className="status warn">Игра не ответила за 6 секунд</span>;
    case "error":
      return (
        <span className="status err" title={status.message}>
          Ошибка: {status.message.split("\n")[0]}
        </span>
      );
  }
}

function Share({ gameId }: { gameId: string }) {
  const [url, setUrl] = useState("");
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getConfig()
      .then((c) => c.publicUrl)
      .catch(() => location.origin)
      .then((base) => {
        const u = `${base.replace(/\/$/, "")}/play/${gameId}`;
        setUrl(u);
        return QRCode.toDataURL(u, { margin: 1, width: 240 });
      })
      .then(setQr)
      .catch(() => setQr(""));
  }, [gameId]);

  if (!url) return null;
  return (
    <div className="share">
      {qr && <img src={qr} alt="QR-код ссылки на игру" width={120} height={120} />}
      <div>
        <h2>Ссылка на игру</h2>
        <a href={url} target="_blank" rel="noreferrer" className="share-url">
          {url.replace(/^https?:\/\//, "")}
        </a>
        <button
          type="button"
          className="btn-ghost"
          onClick={() =>
            navigator.clipboard?.writeText(url).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            })
          }
        >
          {copied ? "Скопировано" : "Копировать"}
        </button>
      </div>
    </div>
  );
}
