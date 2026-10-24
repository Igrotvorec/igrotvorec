import sharp from "sharp";
import { AUDIENCE_PROFILES, type GameSpec } from "@gg/shared";
import { config } from "./config";
import { llm } from "./llm";
import { STYLE as PHASER_STYLE } from "./prompts-phaser";

/**
 * Общий лимит одновременных запросов к модели картинок: при параллельных генерациях (бенчмарк, жюри
 * с нескольких телефонов) прокси не успевал, и картинки падали по таймауту.
 */
const IMAGE_CONCURRENCY = Number(process.env.IMAGE_CONCURRENCY ?? 8);
let imagesRunning = 0;
const imageQueue: (() => void)[] = [];
async function withImageSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (imagesRunning >= IMAGE_CONCURRENCY) await new Promise<void>((ok) => imageQueue.push(ok));
  imagesRunning++;
  try {
    return await fn();
  } finally {
    imagesRunning--;
    imageQueue.shift()?.();
  }
}

/** Готовые картинки: ключ спрайта → data:URI (WebP с прозрачностью, до 256px); "bg" — фон сцены Phaser 720×1280. */
export type SpriteMap = Record<string, string>;

const SPRITE_PX = 256;

function spritePrompt(spec: GameSpec, description: string) {
  const p = AUDIENCE_PROFILES[spec.audience];
  return [
    `Single game sprite: ${description}.`,
    spec.engine === "phaser"
      ? `Style: ${PHASER_STYLE}; ${p.paletteHint}.`
      : `Style: clean 2D casual mobile game art, bold readable silhouette, soft shading, thick dark outline; ${p.paletteHint}.`,
    `Colors that fit this palette: primary ${spec.palette.primary}, accent ${spec.palette.accent}.`,
    "Centered, whole object visible, no text, no letters, no frame, no shadow on the ground, transparent background.",
  ].join(" ");
}

async function generateSprite(spec: GameSpec, description: string, signal: AbortSignal): Promise<string> {
  const res = await withImageSlot(() => llm.images.generate(
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
  ));
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

/** Сетка листа спрайтов по числу объектов: колонки × строки на холсте 1536×1024. */
function sheetGrid(n: number): { cols: number; rows: number; pos: string[] } {
  if (n <= 3) return { cols: n, rows: 1, pos: n === 2 ? ["left", "right"] : ["left", "center", "right"] };
  if (n === 4) return { cols: 2, rows: 2, pos: ["top-left", "top-right", "bottom-left", "bottom-right"] };
  return { cols: 3, rows: 2, pos: ["top-left", "top-center", "top-right", "bottom-left", "bottom-center", "bottom-right"] };
}

/**
 * Режет лист спрайтов по самим объектам, а не по сетке: модель рисует крупные объекты с заходом
 * за границы ячеек. Связные области альфа-канала (на сетке 1/4) сопоставляются ячейкам по положению,
 * у вырезанного объекта стираются куски соседей. null — объектов меньше, чем нужно.
 */
async function sliceSheet(png: Buffer, n: number, cols: number, rows: number): Promise<Buffer[] | null> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, S = 4;
  const sw = Math.floor(W / S), sh = Math.floor(H / S);
  const label = new Int32Array(sw * sh);
  const solid = (x: number, y: number) => data[((y * S + 2) * W + x * S + 2) * 4 + 3]! > 40;
  type Comp = { id: number; area: number; x0: number; y0: number; x1: number; y1: number; sx: number; sy: number };
  const comps: Comp[] = [];
  const stack: number[] = [];
  for (let y = 0; y < sh; y++)
    for (let x = 0; x < sw; x++) {
      if (label[y * sw + x] || !solid(x, y)) continue;
      const c: Comp = { id: comps.length + 1, area: 0, x0: x, y0: y, x1: x, y1: y, sx: 0, sy: 0 };
      label[y * sw + x] = c.id;
      stack.push(y * sw + x);
      while (stack.length) {
        const i = stack.pop()!;
        const cx = i % sw, cy = (i / sw) | 0;
        c.area++;
        c.sx += cx;
        c.sy += cy;
        if (cx < c.x0) c.x0 = cx;
        if (cx > c.x1) c.x1 = cx;
        if (cy < c.y0) c.y0 = cy;
        if (cy > c.y1) c.y1 = cy;
        for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]] as const) {
          if (nx < 0 || ny < 0 || nx >= sw || ny >= sh) continue;
          const j = ny * sw + nx;
          if (!label[j] && solid(nx, ny)) {
            label[j] = c.id;
            stack.push(j);
          }
        }
      }
      comps.push(c);
    }
  const big = comps.filter((c) => c.area >= sw * sh * 0.004).sort((a, b) => b.area - a.area).slice(0, n);
  if (big.length < n) return null;
  // Мелкие отколовшиеся части (искры, детали) приклеиваем к ближайшему крупному объекту.
  const owner = new Map<number, number>();
  for (const c of big) owner.set(c.id, c.id);
  for (const c of comps) {
    if (owner.has(c.id)) continue;
    const cx = c.sx / c.area, cy = c.sy / c.area;
    let best: Comp | null = null, bd = Infinity;
    for (const b of big) {
      const dx = Math.max(b.x0 - cx, 0, cx - b.x1), dy = Math.max(b.y0 - cy, 0, cy - b.y1);
      const d = Math.hypot(dx, dy);
      if (d < bd) (bd = d), (best = b);
    }
    if (best && bd < 10) {
      owner.set(c.id, best.id);
      best.x0 = Math.min(best.x0, c.x0);
      best.y0 = Math.min(best.y0, c.y0);
      best.x1 = Math.max(best.x1, c.x1);
      best.y1 = Math.max(best.y1, c.y1);
    }
  }
  // Ячейки по порядку описания; каждому объекту — ближайшая свободная ячейка (жадно по расстоянию).
  const cells = Array.from({ length: n }, (_, k) => ({ k, x: ((k % cols) + 0.5) * (sw / cols), y: (((k / cols) | 0) + 0.5) * (sh / rows) }));
  const pairs = big.flatMap((b) => cells.map((c) => ({ b, c, d: Math.hypot(b.sx / b.area - c.x, b.sy / b.area - c.y) }))).sort((a, b) => a.d - b.d);
  const byCell = new Map<number, Comp>();
  const used = new Set<number>();
  for (const p of pairs) if (!byCell.has(p.c.k) && !used.has(p.b.id)) byCell.set(p.c.k, p.b), used.add(p.b.id);

  const out: Buffer[] = [];
  for (let k = 0; k < n; k++) {
    const b = byCell.get(k)!;
    const pad = 2;
    const left = Math.max(0, (b.x0 - pad) * S), top = Math.max(0, (b.y0 - pad) * S);
    const right = Math.min(W, (b.x1 + pad + 1) * S), bottom = Math.min(H, (b.y1 + pad + 1) * S);
    const cw = right - left, ch = bottom - top;
    const crop = Buffer.alloc(cw * ch * 4);
    for (let y = 0; y < ch; y++)
      for (let x = 0; x < cw; x++) {
        const gx = left + x, gy = top + y;
        const src = (gy * W + gx) * 4, dst = (y * cw + x) * 4;
        const lab = label[Math.min(sh - 1, (gy / S) | 0) * sw + Math.min(sw - 1, (gx / S) | 0)]!;
        // Пиксели чужого объекта стираем, остальное (включая полупрозрачное свечение) оставляем.
        const foreign = lab !== 0 && owner.get(lab) !== undefined && owner.get(lab) !== b.id;
        data.copy(crop, dst, src, src + 4);
        if (foreign) crop[dst + 3] = 0;
      }
    out.push(
      await sharp(await sharp(crop, { raw: { width: cw, height: ch, channels: 4 } }).png().toBuffer())
        .trim()
        .resize(SPRITE_PX, SPRITE_PX, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82, alphaQuality: 90 })
        .toBuffer(),
    );
  }
  return out;
}

/** Все спрайты игры одной картинкой: единый стиль и один запрос вместо шести. */
async function generateSpriteSheet(spec: GameSpec, items: { key: string; description: string }[], signal: AbortSignal): Promise<SpriteMap | null> {
  const p = AUDIENCE_PROFILES[spec.audience];
  const { cols, rows, pos } = sheetGrid(items.length);
  const prompt = `Game sprite sheet: exactly ${items.length} separate game objects arranged in a ${cols} columns × ${rows} rows grid, all in ONE consistent art style: ${PHASER_STYLE}; ${p.paletteHint}; colors that fit ${spec.palette.primary} and ${spec.palette.accent}.
${items.map((it, i) => `${i + 1}. ${pos[i]} cell: ${it.description}.`).join("\n")}
Each object is fully inside its own cell, centered, with wide empty transparent margins; objects never touch each other or the cell borders. No grid lines, no labels, no numbers, no text, no ground shadows. Transparent background.`;
  const res = await withImageSlot(() =>
    llm.images.generate({ model: config.imageModel, prompt, size: "1536x1024", quality: "low", background: "transparent", output_format: "png", n: 1 }, { signal }),
  );
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) return null;
  const parts = await sliceSheet(Buffer.from(b64, "base64"), items.length, cols, rows);
  if (!parts) return null;
  return Object.fromEntries(items.map((it, i) => [it.key, `data:image/webp;base64,${parts[i]!.toString("base64")}`]));
}

/** Фон сцены для Phaser: портретная картинка без персонажей и текста, WebP 720×1280. */
async function generateBackground(spec: GameSpec, signal: AbortSignal): Promise<string> {
  const p = AUDIENCE_PROFILES[spec.audience];
  const res = await withImageSlot(() => llm.images.generate(
    {
      model: config.imageModel,
      prompt: `Mobile game background, portrait full-screen scene: ${spec.background}. Style: ${PHASER_STYLE}; ${p.paletteHint}; colors around ${spec.palette.background} and ${spec.palette.primary}. No characters, no text, no UI, no logos; calm, uncluttered middle area for gameplay.`,
      size: "1024x1536",
      quality: "low",
      output_format: "png",
      n: 1,
    },
    { signal },
  ));
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error("image model returned no data");
  const webp = await sharp(Buffer.from(b64, "base64")).resize(720, 1280, { fit: "cover" }).webp({ quality: 74 }).toBuffer();
  return `data:image/webp;base64,${webp.toString("base64")}`;
}

/**
 * Генерирует спрайты (и фон для Phaser) параллельно. Ошибка одного спрайта не валит игру:
 * рантайм нарисует вместо него запасной emoji. `reuse` — уже готовые спрайты прошлой версии.
 */
export async function generateSprites(spec: GameSpec, signal: AbortSignal, reuse: SpriteMap = {}, out: SpriteMap = {}): Promise<SpriteMap> {
  if (!config.imageModel) return out;
  const background =
    spec.engine === "phaser" && spec.background
      ? reuse.bg
        ? Promise.resolve((out.bg = reuse.bg))
        : generateBackground(spec, signal).then(
            (v) => (out.bg = v),
            (e) => {
              if (!signal.aborted) console.warn("[background]", (e as Error).message);
            },
          )
      : Promise.resolve();
  const fresh = (spec.sprites ?? []).filter((s) => !reuse[s.key]);
  for (const s of spec.sprites ?? []) if (reuse[s.key]) out[s.key] = reuse[s.key]!;
  // Phaser: все новые спрайты одним листом (единый стиль, один запрос); не вышло — по одному, как раньше.
  if (spec.engine === "phaser" && fresh.length >= 2) {
    const sheet = generateSpriteSheet(spec, fresh, signal).then(
      (m) => m,
      (e) => {
        if (!signal.aborted) console.warn("[sheet]", (e as Error).message);
        return null;
      },
    );
    await Promise.all([
      background,
      sheet.then(async (m) => {
        if (m) return void Object.assign(out, m);
        if (!signal.aborted) console.warn("[sheet] не удалось разрезать, рисую спрайты по одному");
        await Promise.all(fresh.map((s) => generateSprite(spec, s.description, signal).then((v) => void (out[s.key] = v), () => {})));
      }),
    ]);
    return out;
  }
  await Promise.all([
    background,
    ...(spec.sprites ?? []).map(async (s) => {
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
  ]);
  return out;
}

/**
 * Ждёт картинки, но не дольше grace после того, как код уже готов: игра важнее картинок.
 * По таймауту возвращает то, что успело дорисоваться (`out` заполняется по мере готовности).
 */
export async function settleSprites(pending: Promise<SpriteMap>, out: SpriteMap, graceMs: number): Promise<SpriteMap> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((ok) => (timer = setTimeout(ok, graceMs)));
  try {
    await Promise.race([pending, timeout]);
    return { ...out };
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
