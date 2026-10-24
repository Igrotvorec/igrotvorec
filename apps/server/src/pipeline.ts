import {
  AUDIENCE_PROFILES,
  GameSpecSchema,
  HEX_COLOR,
  MUSIC_MOODS,
  phaserSpecResponseJsonSchema,
  specResponseJsonSchema,
  type GameEngine,
  type GameSpec,
  type GenEvent,
  type VersionKind,
} from "@gg/shared";
import { assembleGame, assemblePhaserGame, type KitConfig } from "@gg/runtime";
import { thumbToken } from "./thumbs";
import { config } from "./config";
import { checkGameCode, extractCode } from "./check";
import { chatJson, chatStream } from "./llm";
import * as kitPrompts from "./prompts";
import * as phaserPrompts from "./prompts-phaser";
import { addVersion, createGame, getGame, getVersion } from "./db";
import { observationsFor } from "./stats";
import { generateSprites, settleSprites, type SpriteMap } from "./assets";

/** Сколько ждать картинки после готовности кода. */
const SPRITE_GRACE_MS = 20_000;

/** Движок новых игр. Старые версии правятся и чинятся своим движком (spec.engine, по умолчанию kit). */
const NEW_GAME_ENGINE: GameEngine = process.env.GAME_ENGINE === "kit" ? "kit" : "phaser";
export const engineOf = (spec: GameSpec): GameEngine => spec.engine ?? "kit";

/** Всё, что зависит от движка: промпты, схема спеки, число спрайтов. */
const ENGINES = {
  kit: { prompts: kitPrompts, schema: specResponseJsonSchema, maxSprites: 3 },
  phaser: { prompts: phaserPrompts, schema: phaserSpecResponseJsonSchema, maxSprites: 6 },
} as const;

type Emit = (e: GenEvent) => void;

/** Отказ по содержанию запроса: показывается пользователю как есть. */
export class RefusalError extends Error {}

export function kitConfig(spec: GameSpec, assets: SpriteMap): KitConfig {
  const p = AUDIENCE_PROFILES[spec.audience];
  return {
    title: spec.title,
    instructions: spec.howToPlay,
    palette: spec.palette,
    uiScale: p.uiScale,
    speed: p.speedMultiplier,
    sprites: Object.fromEntries((spec.sprites ?? []).map((s) => [s.key, { src: assets[s.key], fallback: s.fallback }])),
  };
}

/** Собирает HTML версии её движком. Используется и при публикации, и при пересборке под новый рантайм. */
export function assembleVersion(spec: GameSpec, assets: SpriteMap, code: string): string {
  if (engineOf(spec) === "kit") return assembleGame(kitConfig(spec, assets), code, spec.language);
  const base = kitConfig(spec, assets);
  return assemblePhaserGame({ ...base, background: assets.bg ?? null, music: spec.music }, code, spec.language);
}

/** Обрезает безобидные превышения (длинные строки, лишние пункты), чтобы не валить всю генерацию. */
export function normalizeSpec(raw: unknown, maxSprites = 3): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const r = { ...(raw as Record<string, unknown>) };
  const limits: Record<string, number> = { title: 40, concept: 400, coreMechanic: 400, controls: 200, howToPlay: 120, winCondition: 200, loseCondition: 200 };
  for (const [k, max] of Object.entries(limits)) if (typeof r[k] === "string") r[k] = (r[k] as string).slice(0, max);
  if (Array.isArray(r.mustHave)) r.mustHave = r.mustHave.slice(0, 8).map((x) => String(x).slice(0, 200));
  if (typeof r.roundSeconds === "number") r.roundSeconds = Math.min(300, Math.max(15, Math.round(r.roundSeconds)));
  if (typeof r.language === "string") r.language = r.language.slice(0, 5);
  const pal = (r.palette && typeof r.palette === "object" ? r.palette : {}) as Record<string, unknown>;
  const hex = (v: unknown, fallback: string) => (typeof v === "string" && HEX_COLOR.test(v) ? v : fallback);
  if (Array.isArray(r.sprites)) {
    const seen = new Set<string>();
    r.sprites = r.sprites
      .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
      .map((x) => ({
        key: String(x.key ?? "").toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/^[^a-z]+/, "").slice(0, 16),
        description: String(x.description ?? "").slice(0, 200),
        fallback: [...String(x.fallback ?? "⭐")].slice(0, 2).join("") || "⭐",
      }))
      .filter((x) => x.key && x.description && !seen.has(x.key) && seen.add(x.key))
      .slice(0, maxSprites);
  } else r.sprites = [];
  r.palette = {
    background: hex(pal.background, "#10131a"),
    primary: hex(pal.primary, "#ffcc00"),
    accent: hex(pal.accent, "#ff4d6d"),
    text: hex(pal.text, "#ffffff"),
  };
  return r;
}

async function makeSpec(engine: GameEngine, system: string, user: string, signal: AbortSignal): Promise<GameSpec> {
  const raw = await chatJson<{ allowed?: unknown; refusalReason?: unknown; spec?: unknown }>({
    model: config.specModel,
    system,
    user,
    signal,
    schemaName: "game_spec_response",
    schema: ENGINES[engine].schema,
  });
  signal.throwIfAborted();
  if (raw.allowed !== true) {
    const reason = typeof raw.refusalReason === "string" && raw.refusalReason.trim() ? raw.refusalReason.trim().slice(0, 300) : "запрос не похож на игру";
    // Причину показываем как есть: модель пишет её законченной фразой для пользователя.
    throw new RefusalError(reason.charAt(0).toUpperCase() + reason.slice(1));
  }
  const norm = normalizeSpec(raw.spec, ENGINES[engine].maxSprites) as Record<string, unknown>;
  norm.engine = engine;
  if (engine === "phaser") {
    norm.background = typeof norm.background === "string" && norm.background.trim() ? norm.background.slice(0, 400) : "soft gradient sky";
    if (!MUSIC_MOODS.includes(norm.music as (typeof MUSIC_MOODS)[number])) norm.music = "happy";
  } else {
    delete norm.background;
    delete norm.music;
  }
  const parsed = GameSpecSchema.safeParse(norm);
  if (!parsed.success) throw new Error(`Spec failed validation: ${parsed.error.issues.map((i) => i.path.join(".") + " " + i.message).join("; ")}`);
  return parsed.data;
}

/** Стрим ответа модели; отмена (дедлайн, закрытие клиента) не должна выглядеть как полный ответ. */
async function streamCode(engine: GameEngine, user: string, emit: Emit, signal: AbortSignal): Promise<string> {
  const text = await chatStream({ model: config.codeModel, system: ENGINES[engine].prompts.CODE_SYSTEM, user, signal, onChars: (chars) => emit({ type: "progress", chars }) });
  signal.throwIfAborted();
  return extractCode(text);
}

/**
 * Генерирует код, проверяет его статически и даёт ровно одну попытку исправления через LLM.
 * Возвращает проверенный код или бросает ошибку с оставшимися проблемами.
 */
async function makeCode(spec: GameSpec, user: string, emit: Emit, signal: AbortSignal): Promise<string> {
  const engine = engineOf(spec);
  emit({ type: "stage", stage: "code", message: "Пишу код игры" });
  let code = await streamCode(engine, user, emit, signal);
  emit({ type: "stage", stage: "check", message: "Проверяю код" });
  let result = checkGameCode(code, engine);
  if (result.ok) return code;

  emit({ type: "stage", stage: "code", message: "Исправляю найденные ошибки" });
  code = await streamCode(engine, ENGINES[engine].prompts.repairUser(spec, code, result.errors.join("\n")), emit, signal);
  result = checkGameCode(code, engine);
  if (!result.ok) throw new Error(`Код не прошёл проверку: ${result.errors.join("; ")}`);
  return code;
}

async function save(
  v: { gameId: string; baseVersionId: string | null; kind: VersionKind; spec: GameSpec; code: string; assets: SpriteMap; instruction: string; started: number },
  emit: Emit,
  signal: AbortSignal,
) {
  // Последняя точка отмены: после неё версия публикуется целиком.
  signal.throwIfAborted();
  emit({ type: "stage", stage: "save", message: "Публикую игру" });
  const html = assembleVersion(v.spec, v.assets, v.code);
  const saved = await addVersion({ ...v, html, model: config.codeModel, genMs: Date.now() - v.started });
  emit({ type: "done", gameId: v.gameId, versionId: saved.id, version: saved.version, thumbToken: thumbToken(saved.id) });
}

async function waitSprites(pending: Promise<SpriteMap>, out: SpriteMap, emit: Emit): Promise<SpriteMap> {
  emit({ type: "stage", stage: "check", message: "Дорисовываю графику" });
  return settleSprites(pending, out, SPRITE_GRACE_MS);
}

export async function generate(prompt: string, emit: Emit, signal: AbortSignal) {
  const started = Date.now();
  emit({ type: "stage", stage: "spec", message: "Разбираю запрос" });
  const engine = NEW_GAME_ENGINE;
  const P = ENGINES[engine].prompts;
  const spec = await makeSpec(engine, P.SPEC_SYSTEM, kitPrompts.specUser(prompt), signal);
  emit({ type: "spec", spec });
  const art: SpriteMap = {};
  const sprites = generateSprites(spec, signal, {}, art);
  const obs = observationsFor(spec.audience, spec.genre);
  if (obs.lines.length) emit({ type: "stage", stage: "spec", message: `Учитываю статистику: ${obs.sessions} сессий` });
  const code = await makeCode(spec, P.codeUser(spec, obs.lines), emit, signal);
  const assets = await waitSprites(sprites, art, emit);
  signal.throwIfAborted();
  const gameId = createGame(prompt);
  await save({ gameId, baseVersionId: null, kind: "create", spec, code, assets, instruction: prompt, started }, emit, signal);
}

export async function edit(gameId: string, instruction: string, emit: Emit, signal: AbortSignal) {
  const started = Date.now();
  const game = getGame(gameId);
  if (!game) throw new Error("Игра не найдена");
  const current = getVersion(game.latestVersionId)!;
  emit({ type: "stage", stage: "spec", message: "Обновляю описание игры" });
  // Правка остаётся на движке версии: старую игру на kit не переписываем на Phaser незаметно.
  const engine = engineOf(current.spec);
  const P = ENGINES[engine].prompts;
  const spec = await makeSpec(engine, P.EDIT_SPEC_SYSTEM, P.editSpecUser(current.spec, instruction), signal);
  emit({ type: "spec", spec });
  // Картинки с теми же ключами и описанием (и фон с тем же описанием) берём из прошлой версии.
  const reuse: SpriteMap = {};
  for (const sp of spec.sprites) {
    const old = current.spec.sprites?.find((o) => o.key === sp.key);
    if (old && old.description === sp.description && current.assets[sp.key]) reuse[sp.key] = current.assets[sp.key]!;
  }
  if (spec.background && spec.background === current.spec.background && current.assets.bg) reuse.bg = current.assets.bg;
  const art: SpriteMap = {};
  const sprites = generateSprites(spec, signal, reuse, art);
  const code = await makeCode(spec, P.editUser(spec, current.code, instruction), emit, signal);
  const assets = await waitSprites(sprites, art, emit);
  await save({ gameId, baseVersionId: current.id, kind: "edit", spec, code, assets, instruction, started }, emit, signal);
}

const repairing = new Set<string>();

/** Исправление ошибки выполнения из превью. Не чинит версию, которая сама является исправлением. */
export async function repair(versionId: string, error: string, emit: Emit, signal: AbortSignal) {
  if (repairing.has(versionId)) throw new Error("Эта версия уже исправляется");
  repairing.add(versionId);
  try {
    await repairOnce(versionId, error, emit, signal);
  } finally {
    repairing.delete(versionId);
  }
}

async function repairOnce(versionId: string, error: string, emit: Emit, signal: AbortSignal) {
  const started = Date.now();
  const current = getVersion(versionId);
  if (!current) throw new Error("Версия не найдена");
  if (current.kind === "repair") throw new Error("Автоисправление уже применялось к этой версии");
  // Чинить можно только последнюю версию; при публикации это проверяется ещё раз атомарно,
  // поэтому исправление, начатое до чужой правки, её не затрёт.
  if (getGame(current.gameId)?.latestVersionId !== versionId) throw new Error("Можно исправить только последнюю версию");
  const P = ENGINES[engineOf(current.spec)].prompts;
  const code = await makeCode(current.spec, P.repairUser(current.spec, current.code, error.slice(0, 2000)), emit, signal);
  await save(
    { gameId: current.gameId, baseVersionId: current.id, kind: "repair", spec: current.spec, code, assets: current.assets, instruction: `Автоисправление: ${error.split("\n")[0]!.slice(0, 200)}`, started },
    emit,
    signal,
  );
}
