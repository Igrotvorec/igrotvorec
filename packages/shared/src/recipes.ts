import recipesJson from "./genre-recipes.json";
import extraJson from "./genre-recipes-extra.json";
import type { Audience } from "./spec";

/**
 * Рецепты жанров эпохи Flash и мобильных казуалок (research/genre-recipes.json и genre-recipes-extra.json, источники —
 * research/genre-recipes*-sources.md): прогрессия с числами, типы объектов, бонусы, эффекты, типичные
 * ошибки генерации. Спека выбирает рецепт, код получает общие правила и один рецепт.
 */
interface Recipe {
  id: string;
  genre: string;
  name_ru: string;
  coreLoop: string;
  audienceTweaks: Record<Audience, unknown>;
  [k: string]: unknown;
}
const base = recipesJson as unknown as { conventions: Record<string, unknown>; genres: Recipe[] };
/** Дополнительные жанры (поиск предметов, раскраска, отличия, гонка) — conventions общие. */
const extra = extraJson as unknown as { genres: Recipe[] };
const data = { conventions: base.conventions, genres: [...base.genres, ...extra.genres] };

export const RECIPE_IDS = data.genres.map((g) => g.id);

/** Метки источников [S:…] и [H] нужны людям, в промпте они только тратят токены. */
const stripTags = (s: string) => s.replace(/\s*\[(S:[a-z0-9-]+|H)\]/g, "");

/** Строки «id — суть» для выбора рецепта на этапе спеки. */
export function recipeMenu(): string {
  return data.genres.map((g) => `- ${g.id}: ${stripTags(g.coreLoop)}`).join("\n");
}

/** Общие правила и рецепт для промпта кода; правки только для своей аудитории. */
export function recipeForPrompt(id: string | undefined, audience: Audience): string {
  const conventions = stripTags(JSON.stringify(data.conventions));
  const r = data.genres.find((g) => g.id === id);
  if (!r) return `Universal design conventions (JSON):\n${conventions}`;
  const { audienceTweaks, references: _refs, ...rest } = r;
  const recipe = { ...rest, audienceTweak: audienceTweaks[audience] };
  return `Universal design conventions (JSON):\n${conventions}\n\nGenre recipe "${r.id}" (JSON; follow its progression numbers, object kinds, juice and pitfalls, adapted to the spec):\n${stripTags(JSON.stringify(recipe))}`;
}
