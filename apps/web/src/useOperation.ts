import { useCallback, useRef, useState } from "react";
import type { GameSpec, GenEvent } from "@gg/shared";
import { streamOp } from "./api";

export type Stage = "spec" | "code" | "check" | "save";

/** Отметка смены этапа: по соседним отметкам считается длительность шага. */
export interface StageMark {
  stage: Stage;
  message: string;
  at: number;
}

export interface OpState {
  running: boolean;
  stage: Stage | null;
  message: string;
  marks: StageMark[];
  chars: number;
  spec: GameSpec | null;
  error: string | null;
  startedAt: number;
}

const idle: OpState = { running: false, stage: null, message: "", marks: [], chars: 0, spec: null, error: null, startedAt: 0 };

/** Ведёт одну SSE-операцию (генерация, правка, исправление) и отдаёт её текущий прогресс. */
export function useOperation(onDone: (e: Extract<GenEvent, { type: "done" }>) => void) {
  const [state, setState] = useState<OpState>(idle);
  const abortRef = useRef<AbortController | null>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  const run = useCallback(async (url: string, body: unknown) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setState({ ...idle, running: true, startedAt: Date.now() });
    let finished = false;
    try {
      await streamOp(
        url,
        body,
        (e) => {
          if (e.type === "stage")
            setState((s) => ({ ...s, stage: e.stage, message: e.message, marks: [...s.marks, { stage: e.stage, message: e.message, at: Date.now() }] }));
          else if (e.type === "progress") setState((s) => ({ ...s, chars: e.chars }));
          else if (e.type === "spec") setState((s) => ({ ...s, spec: e.spec }));
          else if (e.type === "error") {
            finished = true;
            setState((s) => ({ ...s, running: false, error: e.message }));
          } else if (e.type === "done") {
            finished = true;
            setState((s) => ({ ...s, running: false }));
            doneRef.current(e);
          }
        },
        ac.signal,
      );
      if (!finished) setState((s) => ({ ...s, running: false, error: "Соединение прервалось" }));
    } catch (err) {
      if (ac.signal.aborted) return;
      setState((s) => ({ ...s, running: false, error: (err as Error).message }));
    }
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setState(idle);
  }, []);

  const reset = useCallback(() => setState(idle), []);

  return { state, run, cancel, reset };
}
