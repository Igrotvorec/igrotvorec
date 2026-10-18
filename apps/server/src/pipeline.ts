import { AUDIENCE_PROFILES, GameSpecSchema, gameSpecJsonSchema, type GameSpec, type GenEvent } from "@gg/shared";
import { assembleGame, type KitConfig } from "@gg/runtime";
import { config } from "./config";
import { checkGameCode, extractCode } from "./check";
import { chatJson, chatStream } from "./llm";
import * as prompts from "./prompts";
import { addVersion, createGame, getGame, getVersion } from "./db";
import { observationsFor } from "./stats";

type Emit = (e: GenEvent) => void;

export const REPAIR_PREFIX = "auto-fix: ";

function kitConfig(spec: GameSpec): KitConfig {
  const p = AUDIENCE_PROFILES[spec.audience];
  return {
    title: spec.title,
    instructions: spec.howToPlay,
    palette: spec.palette,
    uiScale: p.uiScale,
    speed: p.speedMultiplier,
  };
}

/** Clamp harmless overflows (long strings, too many items) instead of failing the whole generation. */
function normalizeSpec(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const r = { ...(raw as Record<string, unknown>) };
  const limits: Record<string, number> = { title: 40, concept: 400, coreMechanic: 400, controls: 200, howToPlay: 120, winCondition: 200, loseCondition: 200 };
  for (const [k, max] of Object.entries(limits)) if (typeof r[k] === "string") r[k] = (r[k] as string).slice(0, max);
  if (Array.isArray(r.mustHave)) r.mustHave = r.mustHave.slice(0, 8).map((x) => String(x).slice(0, 200));
  if (typeof r.roundSeconds === "number") r.roundSeconds = Math.min(300, Math.max(15, Math.round(r.roundSeconds)));
  if (typeof r.language === "string") r.language = r.language.slice(0, 5);
  const pal = (r.palette && typeof r.palette === "object" ? r.palette : {}) as Record<string, unknown>;
  const hex = (v: unknown, fallback: string) => (typeof v === "string" && /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : fallback);
  r.palette = {
    background: hex(pal.background, "#10131a"),
    primary: hex(pal.primary, "#ffcc00"),
    accent: hex(pal.accent, "#ff4d6d"),
    text: hex(pal.text, "#ffffff"),
  };
  return r;
}

async function makeSpec(system: string, user: string, signal: AbortSignal): Promise<GameSpec> {
  const raw = await chatJson<unknown>({
    model: config.specModel,
    system,
    user,
    signal,
    schemaName: "game_spec",
    schema: gameSpecJsonSchema,
  });
  const parsed = GameSpecSchema.safeParse(normalizeSpec(raw));
  if (!parsed.success) throw new Error(`Spec failed validation: ${parsed.error.issues.map((i) => i.path.join(".") + " " + i.message).join("; ")}`);
  return parsed.data;
}

/**
 * Generate code, statically check it, and allow exactly one LLM fix if the check fails.
 * Returns checked code or throws with the remaining errors.
 */
async function makeCode(spec: GameSpec, user: string, emit: Emit, signal: AbortSignal): Promise<string> {
  emit({ type: "stage", stage: "code", message: "Пишу код игры" });
  let code = extractCode(
    await chatStream({ model: config.codeModel, system: prompts.CODE_SYSTEM, user, signal, onChars: (chars) => emit({ type: "progress", chars }) }),
  );
  emit({ type: "stage", stage: "check", message: "Проверяю код" });
  let result = checkGameCode(code);
  if (result.ok) return code;

  emit({ type: "stage", stage: "code", message: "Исправляю найденные ошибки" });
  code = extractCode(
    await chatStream({
      model: config.codeModel,
      system: prompts.CODE_SYSTEM,
      user: prompts.repairUser(spec, code, result.errors.join("\n")),
      signal,
      onChars: (chars) => emit({ type: "progress", chars }),
    }),
  );
  result = checkGameCode(code);
  if (!result.ok) throw new Error(`Код не прошёл проверку: ${result.errors.join("; ")}`);
  return code;
}

async function save(gameId: string, spec: GameSpec, code: string, instruction: string, started: number, emit: Emit) {
  emit({ type: "stage", stage: "save", message: "Публикую игру" });
  const html = assembleGame(kitConfig(spec), code, spec.language);
  const v = await addVersion({ gameId, spec, code, html, instruction, model: config.codeModel, genMs: Date.now() - started });
  emit({ type: "done", gameId, versionId: v.id, version: v.version });
}

export async function generate(prompt: string, emit: Emit, signal: AbortSignal) {
  const started = Date.now();
  emit({ type: "stage", stage: "spec", message: "Разбираю запрос" });
  const spec = await makeSpec(prompts.SPEC_SYSTEM, prompts.specUser(prompt), signal);
  emit({ type: "spec", spec });
  const obs = observationsFor(spec.audience, spec.genre);
  if (obs.lines.length) emit({ type: "stage", stage: "spec", message: `Учитываю статистику: ${obs.sessions} сессий` });
  const code = await makeCode(spec, prompts.codeUser(spec, obs.lines), emit, signal);
  const gameId = createGame(prompt);
  await save(gameId, spec, code, prompt, started, emit);
}

export async function edit(gameId: string, instruction: string, emit: Emit, signal: AbortSignal) {
  const started = Date.now();
  const game = getGame(gameId);
  if (!game) throw new Error("Игра не найдена");
  const current = getVersion(game.latestVersionId)!;
  emit({ type: "stage", stage: "spec", message: "Обновляю описание игры" });
  const spec = await makeSpec(prompts.EDIT_SPEC_SYSTEM, prompts.editSpecUser(current.spec, instruction), signal);
  emit({ type: "spec", spec });
  const code = await makeCode(spec, prompts.editUser(spec, current.code, instruction), emit, signal);
  await save(gameId, spec, code, instruction, started, emit);
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
  if (current.instruction.startsWith(REPAIR_PREFIX)) throw new Error("Автоисправление уже применялось к этой версии");
  // Only the latest version may be repaired: a repair becomes the new latest, so this also
  // caps repairs at one per version and never overwrites newer edits.
  if (getGame(current.gameId)?.latestVersionId !== versionId) throw new Error("Можно исправить только последнюю версию");
  const code = await makeCode(current.spec, prompts.repairUser(current.spec, current.code, error.slice(0, 2000)), emit, signal);
  await save(current.gameId, current.spec, code, REPAIR_PREFIX + error.slice(0, 200), started, emit);
}
