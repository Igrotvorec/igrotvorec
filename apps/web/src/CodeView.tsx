import { useEffect, useMemo, useState } from "react";
import { highlight } from "sugar-high";
import type { GameVersion } from "@gg/shared";
import { getCode } from "./api";

/** Код игры, который написала модель. Рантайм (kit) общий для всех игр и здесь не показывается. */
export function CodeView({ version }: { version: GameVersion }) {
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setCode(null);
    setError(null);
    // Ответ по прошлой версии, пришедший позже, не должен подменить код текущей.
    let current = true;
    getCode(version.id).then(
      (r) => current && setCode(r.code),
      (e: Error) => current && setError(e.message),
    );
    return () => {
      current = false;
    };
  }, [version.id]);
  // sugar-high экранирует исходник и возвращает разметку только из своих span-ов.
  const html = useMemo(() => (code ? highlight(code) : ""), [code]);

  return (
    <div className="code">
      <div className="code-head">
        <span>game.js · v{version.version}</span>
        <span className="num">{code ? `${code.split("\n").length} строк` : ""}</span>
      </div>
      {error && <p className="alert alert-err" style={{ margin: 18 }}>{error}</p>}
      {code === null && !error && <div className="skeleton" style={{ margin: 18, height: 240 }} />}
      {code && (
        <pre>
          <code dangerouslySetInnerHTML={{ __html: html }} />
        </pre>
      )}
    </div>
  );
}
