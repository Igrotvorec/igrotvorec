import type { OpState } from "./useOperation";

/** Отказ модели — нейтральная подсказка, сбой — красная ошибка. */
export function ErrorNote({ op }: { op: OpState }) {
  if (!op.error) return null;
  return (
    <p className={`alert ${op.refusal ? "alert-notice" : "alert-err"}`} role={op.refusal ? "status" : "alert"} style={{ marginTop: 12 }}>
      {op.error}
    </p>
  );
}
