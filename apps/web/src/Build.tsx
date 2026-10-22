import { useEffect, useState } from "react";
import { CheckIcon as Check } from "@phosphor-icons/react";
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

/** Шаги пайплайна с длительностями. Этап может повториться (исправление кода), считаем по последнему входу. */
export function Steps({ op }: { op: OpState }) {
  const now = useNow(op.running);
  const current = STEPS.findIndex((s) => s.stage === op.stage);
  return (
    <ol className="steps">
      {STEPS.map((s, i) => {
        const marks = op.marks.filter((m) => m.stage === s.stage);
        const first = marks[0];
        const next = op.marks.find((m) => first && m.at > first.at && STEPS.findIndex((x) => x.stage === m.stage) > i);
        const state = i < current ? "done" : i === current ? "active" : "";
        let detail = marks.at(-1)?.message ?? s.idle;
        if (s.stage === "code" && op.chars > 0) detail = `${(op.chars / 1000).toFixed(1)} тыс. символов`;
        if (s.stage === "spec" && state === "done" && op.spec) detail = op.spec.title;
        const ms = first ? Math.max(0, (next ? next.at : state === "active" ? now : first.at) - first.at) : 0;
        return (
          <li key={s.stage} className={`step ${state}`}>
            <span className="step-icon">{state === "done" && <Check size={13} weight="bold" />}</span>
            <div>
              <div className="step-label">{s.label}</div>
              <div className="step-detail">{detail}</div>
            </div>
            <span className="step-time">{first && state ? sec(ms) : ""}</span>
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
export function Build({ prompt, op, onCancel }: { prompt: string; op: OpState; onCancel: () => void }) {
  const spec = op.spec;
  const palette = spec?.palette;
  return (
    <section className="build" aria-live="polite">
      <div>
        <h1>Собираем игру</h1>
        <p className="build-prompt">{prompt}</p>
        <Steps op={op} />
        <div className="build-foot">
          <span className="muted">
            Прошло <Elapsed op={op} />
          </span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>
            Отменить
          </button>
        </div>
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
                <div className="field-label">Спрайты рисуются параллельно с кодом</div>
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
