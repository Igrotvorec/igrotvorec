import { useEffect, useState } from "react";
import { ArrowClockwiseIcon as ArrowClockwise, CheckIcon as Check, XIcon as X } from "@phosphor-icons/react";
import { AUDIENCE_LABEL, GENRE_LABEL } from "./labels";
import { Phone } from "./Phone";
import type { OpState, Stage } from "./useOperation";

const STEPS: { stage: Stage; label: string; idle: string }[] = [
  { stage: "spec", label: "Разбор запроса", idle: "Жанр, аудитория, правила" },
  { stage: "code", label: "Код игры", idle: "Логика поверх нашего рантайма" },
  { stage: "check", label: "Проверка и графика", idle: "Синтаксис, запрещённые API, спрайты" },
  { stage: "save", label: "Сборка и публикация", idle: "Один HTML, ссылка /play" },
];

const sec = (ms: number) => `${(ms / 1000).toFixed(1)} с`;

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

/** Отрезки времени по этапам: этап может повторяться (самоисправление кода), время складывается. */
function segments(op: OpState, now: number) {
  return op.marks.map((m, i) => ({ ...m, end: op.marks[i + 1]?.at ?? (op.running ? now : op.finishedAt || m.at) }));
}

const STANDARD_SPEC_MESSAGES = new Set(["Разбираю запрос", "Обновляю описание игры"]);

/** Шаги пайплайна с длительностями; при сбое текущий шаг отмечается как упавший. */
export function Steps({ op }: { op: OpState }) {
  const now = useNow(op.running);
  const segs = segments(op, now);
  const current = STEPS.findIndex((s) => s.stage === op.stage);
  const failed = !op.running && !!op.error;
  return (
    <ol className="steps">
      {STEPS.map((s, i) => {
        const own = segs.filter((g) => g.stage === s.stage);
        const state = i < current ? "done" : i === current ? (failed ? "failed" : "active") : "";
        const ms = own.reduce((sum, g) => sum + Math.max(0, g.end - g.at), 0);
        let detail = s.idle;
        if (state) {
          detail = own.at(-1)?.message ?? s.idle;
          if (s.stage === "code") {
            const retry = own.length > 1;
            const chars = op.chars > 0 ? `${(op.chars / 1000).toFixed(1)} тыс. символов` : "";
            const what =
              state === "failed" ? (retry ? "Исправить не удалось" : "Код не дописан") : retry ? "Исправляю найденные ошибки" : state === "done" ? "" : "Пишу код игры";
            detail = [what, chars].filter(Boolean).join(" · ");
            if (!detail) detail = s.idle;
          }
          if (state === "failed" && s.stage !== "code") detail = `Остановлено: ${detail.charAt(0).toLowerCase()}${detail.slice(1)}`;
          if (s.stage === "spec" && op.spec) {
            // Сообщение о статистике — единственное видимое свидетельство, что аналитика влияет на генерацию.
            const extra = own.map((g) => g.message).find((m) => !STANDARD_SPEC_MESSAGES.has(m));
            detail = extra ? `${op.spec.title} · ${extra.charAt(0).toLowerCase()}${extra.slice(1)}` : op.spec.title;
          }
        }
        return (
          <li key={s.stage} className={`step ${state}`}>
            <span className="step-icon">
              {state === "done" && <Check size={13} weight="bold" />}
              {state === "failed" && <X size={13} weight="bold" />}
            </span>
            <div>
              <div className="step-label">{s.label}</div>
              <div className="step-detail">{detail}</div>
            </div>
            <span className="step-time">{state && own.length ? sec(ms) : ""}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function Elapsed({ op }: { op: OpState }) {
  const now = useNow(op.running);
  return <span className="num">{Math.max(0, Math.round((now - op.startedAt) / 1000))} с</span>;
}

/** Экран генерации новой игры: шаги, спецификация по мере готовности и заготовка экрана в цветах игры. */
export function Build({
  prompt,
  op,
  onCancel,
  onRetry,
  onEdit,
}: {
  prompt: string;
  op: OpState;
  onCancel: () => void;
  onRetry: () => void;
  onEdit: () => void;
}) {
  const failed = !op.running && !!op.error;
  const spec = op.spec;
  const palette = spec?.palette;
  return (
    <section className="build">
      <p className="sr-only" aria-live="polite">
        {op.message}
      </p>
      <div>
        <h1>{failed ? "Игра не собралась" : "Собираем игру"}</h1>
        <p className="build-prompt">{prompt}</p>
        <Steps op={op} />
        {failed ? (
          <div className="build-fail" role="alert">
            <p>Не получилось собрать игру. Попробуйте ещё раз или переформулируйте запрос.</p>
            <details>
              <summary>Подробности</summary>
              <code>{op.error}</code>
            </details>
            <div className="build-foot">
              <button type="button" className="btn btn-primary btn-sm" onClick={onRetry}>
                <ArrowClockwise size={16} aria-hidden /> Повторить
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={onEdit}>
                Изменить запрос
              </button>
            </div>
          </div>
        ) : (
          <div className="build-foot">
            <span className="muted">
              Прошло <Elapsed op={op} />
            </span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>
              Отменить
            </button>
          </div>
        )}
        {spec && (
          <div className="spec-card">
            <div>
              <h3>{spec.title}</h3>
              <p className="muted" style={{ marginTop: 4 }}>
                {spec.howToPlay}
              </p>
            </div>
            <div className="tags">
              <span className="tag">{GENRE_LABEL[spec.genre]}</span>
              <span className="tag">{AUDIENCE_LABEL[spec.audience]}</span>
              <span className="tag">{spec.roundSeconds} с на раунд</span>
            </div>
            <div>
              <div className="field-label">Палитра</div>
              <div className="swatches">
                {Object.entries(spec.palette).map(([k, v]) => (
                  <span className="swatch" key={k}>
                    <i style={{ background: v }} />
                    {v.toUpperCase()}
                  </span>
                ))}
              </div>
            </div>
            {spec.sprites && spec.sprites.length > 0 && (
              <div>
                {/* Описания спрайтов — английский промпт для модели картинок, в интерфейсе только значки. */}
                <div className="field-label">{failed ? "Спрайты" : spec.background ? "Фон и спрайты рисуются параллельно с кодом" : "Спрайты рисуются параллельно с кодом"}</div>
                <div className="sprite-row" aria-hidden>
                  {spec.sprites.map((s) => (
                    <span key={s.key}>{s.fallback}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <Phone className="build-phone">
        <div
          className="build-screen"
          style={palette ? { background: palette.background, color: palette.text } : { background: "var(--stage)", color: "var(--muted)" }}
        >
          {spec ? (
            <>
              <div className="build-emoji" aria-hidden>
                {spec.sprites?.map((s) => <span key={s.key}>{s.fallback}</span>)}
              </div>
              <h3>{spec.title}</h3>
            </>
          ) : (
            <span>Разбираем запрос</span>
          )}
          <div className="build-bar" style={palette ? { color: palette.primary } : undefined}>
            <i />
          </div>
        </div>
      </Phone>
    </section>
  );
}
