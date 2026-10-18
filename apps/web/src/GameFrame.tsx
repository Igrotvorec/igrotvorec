import { useEffect, useMemo, useRef } from "react";
import { STORAGE_MAX_BYTES, STORAGE_MAX_KEYS, parseGameMessage } from "@gg/shared";

/** Каждый статус помнит свою версию, поэтому устаревший статус не применится к другой. */
export type FrameStatus = { versionId: string } & (
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "error"; message: string }
  | { kind: "stuck" }
);

const storeKey = (gameId: string, key: string) => `gg:/play/${gameId}:${key}`;

/** Та же квота на игру, что и в /play: одна игра не может забить общий localStorage. */
function fitsQuota(gameId: string, fullKey: string, value: string) {
  const prefix = storeKey(gameId, "");
  let keys = 0;
  let bytes = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(prefix) || k === fullKey) continue;
    keys++;
    bytes += k.length + (localStorage.getItem(k) ?? "").length;
  }
  return keys + 1 <= STORAGE_MAX_KEYS && bytes + fullKey.length + value.length <= STORAGE_MAX_BYTES;
}

/**
 * Игра в sandbox-iframe; компонент работает доверенной оболочкой: отвечает на запросы хранилища
 * и передаёт диагностику рантайма. Протокол тот же, что у страницы /play.
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
          /* хранилище недоступно */
        }
        win.postMessage({ gg: 1, type: "storage:value", reqId: m.reqId, value }, "*");
      } else if (m.type === "storage:set") {
        try {
          const full = storeKey(gameId, m.key);
          if (fitsQuota(gameId, full, m.value)) localStorage.setItem(full, m.value);
        } catch {
          /* хранилище недоступно */
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
