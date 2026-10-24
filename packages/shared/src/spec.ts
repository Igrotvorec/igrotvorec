import { z } from "zod";
import { RECIPE_IDS } from "./recipes";

export const AUDIENCES = ["kids", "teens", "adults", "seniors", "general"] as const;
export type Audience = (typeof AUDIENCES)[number];

export const GENRES = ["arcade", "match3", "runner", "quiz", "clicker", "puzzle", "other"] as const;
export type Genre = (typeof GENRES)[number];

export const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const HexColor = z.string().regex(HEX_COLOR);

export const MUSIC_MOODS = ["happy", "calm", "tense"] as const;
/** Стиль HUD Phaser-игры: модель спеки выбирает под тему, чтобы игры не выглядели одинаково. */
/** levels — уровни подряд (победа на уровне ведёт на следующий); endless — без победы, рекорд по счёту. */
export const GAME_MODES = ["levels", "endless"] as const;
export const HUD_STYLES = ["chips", "corners", "themed-panel", "icon-meter"] as const;

export const GameSpecSchema = z.object({
  title: z.string().min(1).max(40),
  audience: z.enum(AUDIENCES),
  genre: z.enum(GENRES),
  concept: z.string().min(1).max(400),
  coreMechanic: z.string().min(1).max(400),
  controls: z.string().min(1).max(200),
  /** Одна короткая строка для стартового экрана. */
  howToPlay: z.string().min(1).max(120),
  winCondition: z.string().min(1).max(200),
  loseCondition: z.string().min(1).max(200),
  /** Правила, которые пользователь попросил явно; исправления и правки обязаны их сохранить. */
  mustHave: z.array(z.string().max(200)).max(8),
  palette: z.object({
    background: HexColor,
    primary: HexColor,
    accent: HexColor,
    text: HexColor,
  }),
  difficulty: z.enum(["very_easy", "easy", "normal", "hard"]),
  roundSeconds: z.number().int().min(15).max(300),
  language: z.string().min(2).max(5),
  /** Ключевые объекты, которые рисуются сгенерированными картинками; у каждого есть запасной emoji. */
  sprites: z
    .array(
      z.object({
        key: z.string().regex(/^[a-z][a-z0-9_]{0,15}$/),
        description: z.string().min(1).max(200),
        fallback: z.string().min(1).max(8),
      }),
    )
    .max(6),
  /** Движок версии: phaser — новые игры, kit — прежний маленький рантайм (старые игры). Нет поля — kit. */
  engine: z.enum(["kit", "phaser"]).optional(),
  /** Описание фона сцены для иллюстратора (Phaser). */
  background: z.string().max(400).optional(),
  /** Настроение фоновой музыки (Phaser). */
  music: z.enum(MUSIC_MOODS).optional(),
  /** Режим забега (Phaser). */
  mode: z.enum(GAME_MODES).optional(),
  /** Стиль HUD (Phaser). */
  hudStyle: z.enum(HUD_STYLES).optional(),
  /** Рецепт жанра из research/genre-recipes.json или "custom" (Phaser). */
  recipe: z.string().max(32).optional(),
  /** Итог автоподбора сложности ботами в превью автора (Phaser); factor умножает GG.speed. */
  tuning: z
    .object({
      factor: z.number(),
      failed: z.boolean().optional(),
      warmupLeak: z.boolean().optional(),
      stall: z.boolean().optional(),
      ceiling: z.boolean().optional(),
      lives: z.number().optional(),
      timeLimitSec: z.number().optional(),
      goodMs: z.number().optional(),
      carelessWins: z.number().optional(),
      carelessMs: z.number().optional(),
      randomWon: z.boolean().optional(),
      skipped: z.boolean().optional(),
    })
    .optional(),
  /** Баланс числами (Phaser): код обязан брать значения отсюда (GG.balance). */
  balance: z
    .object({
      warmupSec: z.number(),
      lives: z.number().int(),
      cleanRunSec: z.number(),
      timeLimitSec: z.number(),
      spawnPerSec: z.number(),
    })
    .optional(),
});
export type GameSpec = z.infer<typeof GameSpecSchema>;
export type GameEngine = NonNullable<GameSpec["engine"]>;

/** JSON-схема spec для structured output LLM. Синхронизируется с GameSpecSchema вручную. */
const gameSpecJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "title", "audience", "genre", "concept", "coreMechanic", "controls", "howToPlay", "winCondition",
    "loseCondition", "mustHave", "palette", "difficulty", "roundSeconds", "language", "sprites",
  ],
  properties: {
    title: { type: "string" },
    audience: { type: "string", enum: [...AUDIENCES] },
    genre: { type: "string", enum: [...GENRES] },
    concept: { type: "string" },
    coreMechanic: { type: "string" },
    controls: { type: "string" },
    howToPlay: { type: "string" },
    winCondition: { type: "string" },
    loseCondition: { type: "string" },
    mustHave: { type: "array", items: { type: "string" } },
    palette: {
      type: "object",
      additionalProperties: false,
      required: ["background", "primary", "accent", "text"],
      properties: {
        background: { type: "string" },
        primary: { type: "string" },
        accent: { type: "string" },
        text: { type: "string" },
      },
    },
    difficulty: { type: "string", enum: ["very_easy", "easy", "normal", "hard"] },
    roundSeconds: { type: "integer" },
    language: { type: "string" },
    sprites: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "description", "fallback"],
        properties: {
          key: { type: "string" },
          description: { type: "string" },
          fallback: { type: "string" },
        },
      },
    },
  },
} as const;

/**
 * Ответ spec-этапа: решение о допустимости запроса плюс сама spec.
 * При allowed=false spec заполняется формально и не используется.
 */
export const specResponseJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["allowed", "refusalReason", "spec"],
  properties: {
    allowed: { type: "boolean" },
    refusalReason: { type: "string" },
    spec: gameSpecJsonSchema,
  },
} as const;

/** Спека игры на Phaser: та же схема плюс фон и музыка (strict-режим требует их в required). */
export const phaserSpecResponseJsonSchema = (() => {
  const s = JSON.parse(JSON.stringify(specResponseJsonSchema)) as {
    properties: { spec: { required: string[]; properties: Record<string, unknown> } };
  };
  s.properties.spec.properties.background = { type: "string" };
  s.properties.spec.properties.music = { type: "string", enum: [...MUSIC_MOODS] };
  s.properties.spec.properties.hudStyle = { type: "string", enum: [...HUD_STYLES] };
  s.properties.spec.properties.mode = { type: "string", enum: [...GAME_MODES] };
  s.properties.spec.properties.recipe = { type: "string", enum: [...RECIPE_IDS, "custom"] };
  s.properties.spec.properties.balance = {
    type: "object",
    additionalProperties: false,
    required: ["warmupSec", "lives", "cleanRunSec", "timeLimitSec", "spawnPerSec"],
    properties: {
      warmupSec: { type: "number" },
      lives: { type: "integer" },
      cleanRunSec: { type: "number" },
      timeLimitSec: { type: "number" },
      spawnPerSec: { type: "number" },
    },
  };
  s.properties.spec.required.push("background", "music", "recipe", "balance", "hudStyle", "mode");
  return s;
})();
