import { useEffect, useMemo, useRef } from "react";
import { parseGameMessage } from "@gg/shared";

/** Every status names the version it came from, so a stale status never applies to another version. */
export type FrameStatus = { versionId: string } & (
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "error"; message: string }
  | { kind: "stuck" }
);

const storeKey = (gameId: string, key: string) => `gg:/play/${gameId}:${key}`;

/**
 * Sandboxed game iframe acting as the trusted shell: answers storage requests and reports
 * runtime diagnostics. Same protocol as the /play page.
 */
export function GameFrame({
  gameId,
  versionId,
  reloadKey,
  onStatus,
}: {
  gameId: string;
  versionId: string;
  reloadKey: number;
  onStatus: (s: FrameStatus) => void;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const runId = useMemo(() => Math.random().toString(36).slice(2, 12), [versionId, reloadKey]);
  const statusRef = useRef(onStatus);
  statusRef.current = onStatus;

  useEffect(() => {
    statusRef.current({ versionId, kind: "loading" });
    let booted = false;
    let failed = false;
    const timer = setTimeout(() => {
      if (!booted) statusRef.current({ versionId, kind: "stuck" });
    }, 6000);

    const onMessage = (e: MessageEvent) => {
      const win = ref.current?.contentWindow;
      if (!win || e.source !== win) return;
      const m = parseGameMessage(e.data, runId);
      if (!m) return;
      if (m.type === "boot") booted = true;
      else if (m.type === "ready" && !failed) statusRef.current({ versionId, kind: "ready" });
      else if (m.type === "error") {
        if (failed) return;
        failed = true;
        const where = m.line ? ` (строка ${m.line}${m.col ? ":" + m.col : ""})` : "";
        statusRef.current({ versionId, kind: "error", message: `${m.message}${where}${m.stack ? "\n" + m.stack : ""}` });
      } else if (m.type === "storage:get") {
        let value: string | null = null;
        try {
          value = localStorage.getItem(storeKey(gameId, m.key));
        } catch {
          /* storage unavailable */
        }
        win.postMessage({ gg: 1, type: "storage:value", reqId: m.reqId, value }, "*");
      } else if (m.type === "storage:set") {
        try {
          localStorage.setItem(storeKey(gameId, m.key), m.value);
        } catch {
          /* storage unavailable */
        }
      }
    };
    window.addEventListener("message", onMessage);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
    };
  }, [gameId, versionId, runId]);

  return (
    <iframe
      key={runId}
      ref={ref}
      className="game-frame"
      title="Игра"
      sandbox="allow-scripts"
      allow="autoplay; vibrate"
      src={`/g/${versionId}#run=${runId}`}
    />
  );
}
