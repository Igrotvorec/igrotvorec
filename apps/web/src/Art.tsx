import type { GameSpec } from "@gg/shared";

/**
 * Обложка игры по убыванию качества: снимок стартовой сцены, спрайт на цвете игры,
 * просто цвет игры с названием. Растягивается на родителя (position: relative).
 */
export function Art({
  palette,
  title,
  thumbId,
  coverId,
  showTitle = true,
}: {
  palette: GameSpec["palette"];
  title: string;
  thumbId?: string | null;
  coverId?: string | null;
  showTitle?: boolean;
}) {
  return (
    <div className="art" style={{ background: palette.background, color: palette.text }}>
      {thumbId ? (
        <img className="shot" src={`/thumb/${thumbId}`} alt="" loading="lazy" decoding="async" />
      ) : (
        <>
          {coverId && (
            <img
              className="sprite"
              src={`/cover/${coverId}`}
              alt=""
              loading="lazy"
              onError={(e) => (e.currentTarget.style.display = "none")}
            />
          )}
          {showTitle && <span className="art-title">{title}</span>}
        </>
      )}
    </div>
  );
}
