import { useEffect, useState } from "react";
import type { OpState, Stage } from "./useOperation";

const STEPS: { stage: Stage; label: string }[] = [
  { stage: "spec", label: "Разбор запроса" },
  { stage: "code", label: "Код игры" },
  { stage: "check", label: "Проверка" },
  { stage: "save", label: "Публикация" },
];

export function Progress({ op, onCancel }: { op: OpState; onCancel: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!op.running) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [op.running]);

  const current = STEPS.findIndex((s) => s.stage === op.stage);
  const seconds = Math.max(0, Math.round((now - op.startedAt) / 1000));

  return (
    <div className="progress" aria-live="polite">
      <ol className="steps">
        {STEPS.map((s, i) => (
          <li key={s.stage} className={i < current ? "done" : i === current ? "active" : ""}>
            <span className="dot" />
            {s.label}
            {s.stage === "code" && i === current && op.chars > 0 && <span className="muted"> · {(op.chars / 1000).toFixed(1)}k символов</span>}
          </li>
        ))}
      </ol>
      {op.spec && (
        <p className="spec-line">
          <strong>{op.spec.title}</strong> — {op.spec.howToPlay}
        </p>
      )}
      <div className="progress-foot">
        <span className="muted">{op.message} · {seconds} с</span>
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Отменить
        </button>
      </div>
    </div>
  );
}
