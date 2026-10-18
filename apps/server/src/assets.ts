import sharp from "sharp";
import { AUDIENCE_PROFILES, type GameSpec } from "@gg/shared";
import { config } from "./config";
import { llm } from "./llm";

/** Готовые спрайты: ключ → data:URI (WebP с прозрачностью, до 256px). */
export type SpriteMap = Record<string, string>;

const SPRITE_PX = 256;

function spritePrompt(spec: GameSpec, description: string) {
  const p = AUDIENCE_PROFILES[spec.audience];
  return [
    `Single game sprite: ${description}.`,
    `Style: clean 2D casual mobile game art, bold readable silhouette, soft shading, thick dark outline; ${p.paletteHint}.`,
    `Colors that fit this palette: primary ${spec.palette.primary}, accent ${spec.palette.accent}.`,
    "Centered, whole object visible, no text, no letters, no frame, no shadow on the ground, transparent background.",
  ].join(" ");
}

async function generateSprite(spec: GameSpec, description: string, signal: AbortSignal): Promise<string> {
  const res = await llm.images.generate(
    {
      model: config.imageModel,
      prompt: spritePrompt(spec, description),
      size: "1024x1024",
      quality: "low",
      background: "transparent",
      output_format: "png",
      n: 1,
    },
    { signal },
  );
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error("image model returned no data");
  // trim убирает пустые поля вокруг объекта, чтобы спрайт занимал весь прямоугольник отрисовки.
  const webp = await sharp(Buffer.from(b64, "base64"))
    .trim()
    .resize(SPRITE_PX, SPRITE_PX, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82, alphaQuality: 90 })
    .toBuffer();
  return `data:image/webp;base64,${webp.toString("base64")}`;
}

/**
 * Генерирует спрайты параллельно. Ошибка одного спрайта не валит игру:
 * рантайм нарисует вместо него запасной emoji. `reuse` — уже готовые спрайты прошлой версии.
 */
export async function generateSprites(spec: GameSpec, signal: AbortSignal, reuse: SpriteMap = {}): Promise<SpriteMap> {
  if (!config.imageModel) return {};
  const out: SpriteMap = {};
  await Promise.all(
    (spec.sprites ?? []).map(async (s) => {
      if (reuse[s.key]) {
        out[s.key] = reuse[s.key]!;
        return;
      }
      try {
        out[s.key] = await generateSprite(spec, s.description, signal);
      } catch (e) {
        if (!signal.aborted) console.warn(`[sprite ${s.key}]`, (e as Error).message);
      }
    }),
  );
  return out;
}

/** Ждёт спрайты, но не дольше grace после того, как код уже готов: игра важнее картинок. */
export async function settleSprites(pending: Promise<SpriteMap>, graceMs: number): Promise<SpriteMap> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<SpriteMap>((ok) => (timer = setTimeout(() => ok({}), graceMs)));
  try {
    return await Promise.race([pending, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Декодирует data:URI спрайта в байты (для обложки в галерее). */
export function spriteBytes(dataUri: string): ArrayBuffer | null {
  const m = dataUri.match(/^data:image\/webp;base64,(.+)$/);
  if (!m) return null;
  const buf = Buffer.from(m[1]!, "base64");
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}
