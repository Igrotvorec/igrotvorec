import type { Genre } from "./spec";

/**
 * Паттерны удачных механик из публичных кейсов суперапок (research/mechanics-sources.md).
 * Это примеры существующего дизайна, а не прогноз результата: в промпт они идут как
 * рекомендации «опирается на кейс», без обещаний retention.
 */
export interface MechanicPattern {
  id: string;
  genres: Genre[];
  /** Короткая подсказка для LLM (на английском — так её стабильнее понимает модель). */
  hint: string;
  source: { title: string; url: string };
}

export const MECHANIC_PATTERNS: MechanicPattern[] = [
  {
    id: "familiar-core-story-goal",
    genres: ["match3", "puzzle", "arcade"],
    hint: "Wrap one familiar core action in a small visible story goal (e.g. help a character find treasure).",
    source: { title: "Билайн «Приключения Рози» (match-3 с сюжетной целью)", url: "https://bor.beeline.ru/games/games-page/" },
  },
  {
    id: "moves-limit-instead-of-timer",
    genres: ["match3", "puzzle"],
    hint: "When fast reactions are not the point, limit moves (e.g. 20 moves) instead of a strict timer.",
    source: { title: "Т-Банк «Ряд наград»: 20 ходов без ограничения времени", url: "https://www.tbank.ru/finance/blog/match-three/" },
  },
  {
    id: "visible-progress-map",
    genres: ["other", "arcade", "clicker"],
    hint: "Show progress toward the goal visually (a track, map or bar) with a clear next step and reward.",
    source: { title: "Билайн «Бонусный движ»: кубик и карта прогресса, 1 млн клиентов", url: "https://beelinenow.ru/articles/geymifikatsiya-v-telekome-beeline-igry/" },
  },
  {
    id: "quiz-story-feedback",
    genres: ["quiz"],
    hint: "Frame questions in a concrete theme or story, give instant right/wrong feedback and a round summary.",
    source: { title: "Билайн «КиберКвиз»: сюжетная обучающая викторина", url: "https://beelinenow.ru/articles/geymifikatsiya-v-telekome-beeline-igry/" },
  },
  {
    id: "limited-attempts-achievements",
    genres: ["quiz", "puzzle"],
    hint: "Limited attempts with a clear result and a next milestone (e.g. 6 tries, then show achievement).",
    source: { title: "СберСпасибо «Ловлю на слове»: слово дня, попытки и достижения", url: "https://www.sostav.ru/publication/sberspasibo-58872.html" },
  },
  {
    id: "core-plus-collection",
    genres: ["puzzle", "clicker"],
    hint: "After the main goal, let the player keep discovering items in a small collection.",
    source: { title: "Альфа «Алхимия акций»: ежедневная цель плюс коллекция", url: "https://vc.ru/alfabank/2017574-alfa-bank-igry-iskusstvennyj-intellekt" },
  },
  {
    id: "runner-coins-boosters",
    genres: ["runner"],
    hint: "Runner: collectible coins along the path and an occasional short booster pickup.",
    source: { title: "Т-Банк «Магия отпуска»: раннер с монетами и бустерами", url: "https://www.tbank.ru/finance/blog/vacation-magic/" },
  },
  {
    id: "stable-core-fresh-theme",
    genres: ["arcade", "clicker", "match3", "runner", "puzzle", "quiz", "other"],
    hint: "Keep controls simple and stable; novelty comes from theme, goal and objects, not new controls.",
    source: { title: "Билайн «Моя Ферма»: еженедельные события поверх стабильного ядра", url: "https://bor.beeline.ru/games/games-page/" },
  },
];

export function patternsFor(genre: Genre): MechanicPattern[] {
  return MECHANIC_PATTERNS.filter((p) => p.genres.includes(genre));
}
