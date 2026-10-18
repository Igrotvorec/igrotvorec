import { z } from "zod";

export const AUDIENCES = ["kids", "teens", "adults", "seniors", "general"] as const;
export type Audience = (typeof AUDIENCES)[number];

export const GENRES = ["arcade", "match3", "runner", "quiz", "clicker", "puzzle", "other"] as const;
export type Genre = (typeof GENRES)[number];

export const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const HexColor = z.string().regex(HEX_COLOR);

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
});
export type GameSpec = z.infer<typeof GameSpecSchema>;

/** JSON-схема spec для structured output LLM. Синхронизируется с GameSpecSchema вручную. */
const gameSpecJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "title", "audience", "genre", "concept", "coreMechanic", "controls", "howToPlay", "winCondition",
    "loseCondition", "mustHave", "palette", "difficulty", "roundSeconds", "language",
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
