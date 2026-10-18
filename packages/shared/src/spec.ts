import { z } from "zod";

export const AUDIENCES = ["kids", "teens", "adults", "seniors", "general"] as const;
export type Audience = (typeof AUDIENCES)[number];

export const GENRES = ["arcade", "match3", "runner", "quiz", "clicker", "puzzle", "other"] as const;
export type Genre = (typeof GENRES)[number];

const HexColor = z.string().regex(/^#[0-9a-fA-F]{3,8}$/);

export const GameSpecSchema = z.object({
  title: z.string().min(1).max(40),
  audience: z.enum(AUDIENCES),
  genre: z.enum(GENRES),
  concept: z.string().min(1).max(400),
  coreMechanic: z.string().min(1).max(400),
  controls: z.string().min(1).max(200),
  /** One short line for the start screen. */
  howToPlay: z.string().min(1).max(120),
  winCondition: z.string().min(1).max(200),
  loseCondition: z.string().min(1).max(200),
  /** Rules the user explicitly asked for; repair and edits must keep them. */
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

/** JSON schema handed to the LLM for structured output. Kept in sync with GameSpecSchema by hand. */
export const gameSpecJsonSchema = {
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
