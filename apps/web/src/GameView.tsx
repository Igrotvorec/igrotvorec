import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  ArrowSquareOutIcon as ArrowSquareOut,
  ArrowClockwiseIcon as ArrowClockwise,
  ChartBarIcon as ChartBar,
  CodeIcon as Code,
  CopyIcon as Copy,
  DownloadSimpleIcon as DownloadSimple,
  CheckIcon as Check,
  PlayIcon as Play,
  PlusIcon as Plus,
} from "@phosphor-icons/react";
import type { GameDetail, GameSummary, GameVersion } from "@gg/shared";
import { getConfig, getGame, listGames } from "./api";
import { Art } from "./Art";
import { Elapsed, Steps } from "./Build";
import { ErrorNote } from "./ErrorNote";
import { useAutosize } from "./useAutosize";
import { rememberThumbToken, thumbTokenFor } from "./thumbTokens";
import { CodeView } from "./CodeView";
import { GameAnalytics } from "./GameAnalytics";
import { GameFrame, type FrameStatus } from "./GameFrame";
import { AUDIENCE_LABEL, EDIT_EXAMPLES, GENRE_LABEL, timeAgo } from "./labels";
import { Phone } from "./Phone";
import { useOperation } from "./useOperation";
import { Link } from "./router";

type Tab = "play" | "code" | "stats";
const TABS: { id: Tab; label: string }[] = [
  { id: "play", label: "Игра" },
  { id: "code", label: "Код" },
  { id: "stats", label: "Аналитика" },
];

export function GameView({ id }: { id: string }) {
  const [game, setGame] = useState<GameDetail | null>(null);
  const [games, setGames] = useState<GameSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [status, setStatus] = useState<FrameStatus | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [tab, setTab] = useState<Tab>("play");
  const [instruction, setInstruction] = useState("");
  const [opKind, setOpKind] = useState<"edit" | "repair">("edit");
  const repairedRef = useRef(new Set<string>());
  const editRef = useRef<HTMLTextAreaElement>(null);
  useAutosize(editRef, instruction);

  // Ответы могут прийти не по порядку (обновление после снимка и после правки): применяем только самый свежий запрос.
  const loadSeq = useRef(0);
  const load = useCallback(
    (selectLatest: boolean) => {
      const seq = ++loadSeq.current;
      return getGame(id).then(
        (g) => {
          if (seq !== loadSeq.current) return;
          setLoadError(null);
          setGame(g);
          if (selectLatest) setSelected(g.latestVersionId);
        },
        (e: Error) => {
          if (seq === loadSeq.current) setLoadError(e.message);
        },
      );
    },
    [id],
  );
  useEffect(() => {
    setGame(null);
    setLoadError(null);
    setTab("play");
    load(true);
  }, [load]);
  useEffect(() => {
    listGames().then(setGames, () => {});
  }, [game?.latestVersionId]);

  const { state: op, run, cancel } = useOperation((e) => {
    rememberThumbToken(e.versionId, e.thumbToken);
    // Бывшая последняя версия заменена новой — автоисправлять её уже не нужно.
    if (game) repairedRef.current.add(game.latestVersionId);
    setInstruction("");
    setTab("play");
    // Новую версию выбираем сразу по id из done: более поздний фоновый refresh не вернёт старую.
    setSelected(e.versionId);
    load(false);
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

  if (loadError)
    return (
      <main className="page">
        <p className="alert alert-err" style={{ marginTop: 32 }}>
          {loadError === "not found" ? "Игра не найдена" : loadError}
        </p>
      </main>
    );
  if (!game || !version)
    return (
      <main className="workspace">
        <aside className="side" />
        <div className="stage-col">
          <div className="stage-card skeleton" />
        </div>
        <aside className="panel" />
      </main>
    );

  const submitEdit = (text: string) => {
    const t = text.trim();
    if (t.length < 2 || op.running) return;
    setOpKind("edit");
    run(`/api/games/${game.id}/edit`, { instruction: t });
  };
  const playUrl = `/play/${game.id}${isLatest ? "" : `?v=${version.version}`}`;

  return (
    <main className="workspace">
      <aside className="side" aria-label="Игры">
        <nav className="side-list">
          {games.map((g) => (
            <Link key={g.id} to={`/games/${g.id}`} className="side-item" aria-current={g.id === game.id ? "page" : undefined}>
              <span className="side-thumb">
                <Art palette={g.palette} title={g.title} thumbId={g.thumbVersionId} coverId={g.hasCover ? g.latestVersionId : null} showTitle={false} />
              </span>
              <span>{g.title}</span>
            </Link>
          ))}
        </nav>
        <Link to="/" className="btn btn-secondary side-new">
          <Plus size={16} aria-hidden /> Новая игра
        </Link>
      </aside>

      <div className="stage-col">
        <section className="stage-card">
          <div className="stage-bar">
            <Tabs tab={tab} onSelect={setTab} />
            <div className="stage-actions">
              <button
                type="button"
                className="icon-btn icon-btn-lg"
                aria-label="Перезапустить игру"
                title="Перезапустить игру"
                onClick={() => {
                  setTab("play");
                  setReloadKey((n) => n + 1);
                }}
              >
                <ArrowClockwise size={18} aria-hidden />
              </button>
              <a className="icon-btn icon-btn-lg" href={playUrl} target="_blank" rel="noreferrer" aria-label="Открыть игру в новой вкладке" title="Открыть игру в новой вкладке">
                <ArrowSquareOut size={18} aria-hidden />
              </a>
              <a className="icon-btn icon-btn-lg" href={`/api/versions/${version.id}/download`} download aria-label="Скачать HTML для игры без интернета" title="Скачать HTML для игры без интернета">
                <DownloadSimple size={18} aria-hidden />
              </a>
            </div>
          </div>
          <div className="stage-body" role="tabpanel" id="stage-panel" aria-labelledby={`tab-${tab}`}>
            {tab === "play" && (
              <div className="stage-play">
                <Phone>
                  <GameFrame
                    gameId={game.id}
                    versionId={version.id}
                    reloadKey={reloadKey}
                    onStatus={setStatus}
                    thumbToken={version.hasThumb ? null : thumbTokenFor(version.id)}
                    onThumb={() => load(false)}
                    tuneToken={version.spec.engine === "phaser" && !version.spec.tuning ? thumbTokenFor(version.id) : null}
                    tuning={version.spec.tuning?.factor}
                    onTuned={() => load(false)}
                  />
                </Phone>
                <div className="stage-statuses">
                  <StatusLine status={status?.versionId === version.id ? status : null} repairing={repairing} />
                  <TuningLine tuning={version.spec.tuning} pending={version.spec.engine === "phaser" && !version.spec.tuning && !!thumbTokenFor(version.id)} />
                </div>
              </div>
            )}
            {tab === "code" && <CodeView version={version} />}
            {tab === "stats" && <GameAnalytics gameId={game.id} />}
            {op.running && tab === "play" && (
              <div className="stage-overlay">
                <span className="status warn">
                  <span>{repairing ? "Исправляем ошибку запуска" : "Собираем новую версию"}</span>
                </span>
              </div>
            )}
          </div>
        </section>
      </div>

      <aside className="panel">
        <div>
          <h1>{version.spec.title}</h1>
          <p className="panel-meta">
            {GENRE_LABEL[version.spec.genre]} · {AUDIENCE_LABEL[version.spec.audience]} · v{version.version}, {timeAgo(version.createdAt)}
          </p>
          <p className="quote">{game.prompt}</p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitEdit(instruction);
          }}
        >
          <h2>
            <label htmlFor="edit">Что изменить?</label>
          </h2>
          {!isLatest && (
            <p className="edit-base">
              Правка применится к последней версии v{game.history.at(-1)!.version}.{" "}
              <button type="button" className="link" onClick={() => setSelected(game.latestVersionId)}>
                Открыть её
              </button>
            </p>
          )}
          <div className="edit-box">
            <textarea
              id="edit"
              ref={editRef}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submitEdit(instruction);
                }
              }}
              placeholder="Например: сделай игру медленнее и добавь три жизни"
              maxLength={500}
              disabled={op.running}
            />
            <div className="edit-actions">
              <span className="edit-count">{instruction.length}/500</span>
              <button type="submit" className="btn btn-primary btn-sm" disabled={op.running || instruction.trim().length < 2}>
                Применить
              </button>
            </div>
          </div>
          {!op.running && (
            <div className="quick">
              {EDIT_EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  className="chip"
                  onClick={() => {
                    setInstruction(ex);
                    editRef.current?.focus();
                  }}
                >
                  {ex}
                </button>
              ))}
            </div>
          )}
          {op.running && (
            <div className="mini-steps">
              <p className="sr-only" aria-live="polite">
                {op.message}
              </p>
              <Steps op={op} />
              <div className="mini-foot">
                <span>
                  {repairing ? "Автоисправление" : "Правка"} · <Elapsed op={op} />
                </span>
                <button type="button" className="btn btn-quiet btn-sm" onClick={cancel}>
                  Отменить
                </button>
              </div>
            </div>
          )}
          <ErrorNote op={op} />
        </form>

        <section>
          <h2>Версии</h2>
          <ol className="versions">
            {[...game.history].reverse().map((v) => (
              <VersionRow key={v.id} v={v} current={v.id === version.id} latest={v.id === game.latestVersionId} onSelect={() => setSelected(v.id)} />
            ))}
          </ol>
        </section>

        <Share gameId={game.id} versionId={version.id} />
      </aside>
    </main>
  );
}

/** Вкладки по шаблону WAI-ARIA: одна в порядке Tab, стрелки и Home/End переключают. */
function Tabs({ tab, onSelect }: { tab: Tab; onSelect: (t: Tab) => void }) {
  const icons: Record<Tab, React.ReactNode> = {
    play: <Play size={16} weight="fill" aria-hidden />,
    code: <Code size={16} weight="bold" aria-hidden />,
    stats: <ChartBar size={16} weight="bold" aria-hidden />,
  };
  const move = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const i = TABS.findIndex((t) => t.id === tab);
    const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const t = TABS[(next + TABS.length) % TABS.length]!.id;
    onSelect(t);
    document.getElementById(`tab-${t}`)?.focus();
  };
  return (
    <div className="tabs" role="tablist" aria-label="Режим" onKeyDown={move}>
      {TABS.map((t) => (
        <button
          key={t.id}
          id={`tab-${t.id}`}
          type="button"
          role="tab"
          className="tab"
          aria-selected={t.id === tab}
          aria-controls="stage-panel"
          tabIndex={t.id === tab ? 0 : -1}
          onClick={() => onSelect(t.id)}
        >
          {icons[t.id]}
          {t.label}
        </button>
      ))}
    </div>
  );
}

function VersionRow({ v, current, latest, onSelect }: { v: GameVersion; current: boolean; latest: boolean; onSelect: () => void }) {
  const title = v.kind === "repair" ? "Автоисправление ошибки" : v.kind === "create" ? "Создана по запросу" : v.instruction;
  return (
    <li>
      <button type="button" className="version" aria-current={current} onClick={onSelect}>
        <span className="v-num">v{v.version}</span>
        <span className="side-thumb">
          <Art palette={v.spec.palette} title={v.spec.title} thumbId={v.hasThumb ? v.id : null} showTitle={false} />
        </span>
        <span className="v-text">
          <span className="v-title" title={title}>
            {title}
          </span>
          <span className="v-time">{timeAgo(v.createdAt)}</span>
        </span>
        {latest && <span className="tag tag-accent">Последняя</span>}
      </button>
    </li>
  );
}

/** Итог автоподбора сложности ботами: сколько раз из 8 выигрывает небрежный игрок. */
function TuningLine({ tuning, pending }: { tuning: GameVersion["spec"]["tuning"]; pending: boolean }) {
  if (!tuning)
    return pending ? (
      <span className="status">
        <span>Подбираю сложность</span>
      </span>
    ) : null;
  if (tuning.skipped) return null;
  const detail = `Хороший бот проходит за ${Math.round((tuning.goodMs ?? 0) / 1000)} с, небрежный выигрывает ${tuning.carelessWins ?? 0} из 8, игра наугад ${tuning.randomWon ? "иногда выигрывает" : "не выигрывает"}. Скорость ×${tuning.factor}, жизней ${tuning.lives ?? "—"}.`;
  return (
    <span className="status ok" title={detail}>
      <span>Сложность подобрана: небрежный {tuning.carelessWins ?? 0}/8</span>
    </span>
  );
}

function StatusLine({ status, repairing }: { status: FrameStatus | null; repairing: boolean }) {
  if (repairing)
    return (
      <span className="status warn">
        <span>Нашли ошибку, исправляем</span>
      </span>
    );
  if (!status || status.kind === "loading")
    return (
      <span className="status">
        <span>Запуск</span>
      </span>
    );
  switch (status.kind) {
    case "ready":
      return (
        <span className="status ok">
          <span>Запуск проверен</span>
        </span>
      );
    case "stuck":
      return (
        <span className="status warn">
          <span>Игра не ответила за 6 секунд</span>
        </span>
      );
    case "error":
      return (
        <span className="status err" title={status.message}>
          <span>Ошибка: {status.message.split("\n")[0]}</span>
        </span>
      );
  }
}

function Share({ gameId, versionId }: { gameId: string; versionId: string }) {
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
        return QRCode.toDataURL(u, { margin: 0, width: 240 });
      })
      .then(setQr)
      .catch(() => setQr(""));
  }, [gameId]);

  if (!url) return null;
  return (
    <section>
      <h2>Поделиться</h2>
      <div className="share">
        {qr ? <img src={qr} alt="QR-код ссылки на игру" /> : <span />}
        <div className="share-side">
          <div className="share-url">
            <span className="share-link" title={url}>
              {new URL(url).pathname}
            </span>
            <button
              type="button"
              className="icon-btn"
              aria-label={copied ? "Скопировано" : "Скопировать ссылку"}
              title={copied ? "Скопировано" : "Скопировать ссылку"}
              onClick={() =>
                navigator.clipboard?.writeText(url).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                })
              }
            >
              {copied ? <Check size={16} weight="bold" /> : <Copy size={16} />}
            </button>
          </div>
          <a className="link" href={url} target="_blank" rel="noreferrer">
            Открыть в новой вкладке <ArrowSquareOut size={14} aria-hidden />
          </a>
          <a className="link" href={`/api/versions/${versionId}/download`} download>
            Скачать для офлайна <DownloadSimple size={14} aria-hidden />
          </a>
        </div>
      </div>
    </section>
  );
}
