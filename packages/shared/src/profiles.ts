import type { Audience, Genre } from "./spec";

/**
 * Audience profiles: concrete design constraints the generator applies per target audience.
 * Seed values are design heuristics plus public super-app observations; `sources` says which.
 * Data-collection agents replace/extend these with sourced numbers.
 */
export interface AudienceProfile {
  id: Audience;
  label: string;
  /** Multiplier for runtime UI (buttons, fonts). 1 = default 48px hit target. */
  uiScale: number;
  minTapTargetPx: number;
  minFontPx: number;
  speedMultiplier: number;
  roundSeconds: [number, number];
  paletteHint: string;
  preferredGenres: Genre[];
  avoid: string[];
  notes: string[];
  sources: { title: string; url?: string; kind: "observation" | "heuristic" | "guideline" }[];
}

export const AUDIENCE_PROFILES: Record<Audience, AudienceProfile> = {
  seniors: {
    id: "seniors",
    label: "Пожилые",
    uiScale: 1.6,
    minTapTargetPx: 72,
    minFontPx: 26,
    speedMultiplier: 0.6,
    roundSeconds: [60, 180],
    paletteHint: "high contrast, calm colors, dark text on light background, no flashing",
    preferredGenres: ["quiz", "puzzle", "match3", "arcade"],
    avoid: ["fast reflex sections", "tiny text", "multi-finger gestures", "time pressure under 3s", "flashing"],
    notes: [
      "One action per tap, no swipes required (offer tap alternative)",
      "Short clear instruction on the start screen",
      "Forgiving: extra lives or no instant fail",
    ],
    sources: [
      { title: "Word games (Сбер «Ловлю на слове») attract 30+ audience; avg 53 min", url: "https://habr.com/ru/articles/1018528/", kind: "observation" },
      { title: "Large touch targets for older adults", kind: "heuristic" },
    ],
  },
  kids: {
    id: "kids",
    label: "Дети",
    uiScale: 1.4,
    minTapTargetPx: 64,
    minFontPx: 22,
    speedMultiplier: 0.8,
    roundSeconds: [30, 90],
    paletteHint: "bright saturated colors, friendly rounded shapes, cheerful",
    preferredGenres: ["runner", "clicker", "arcade", "match3"],
    avoid: ["reading-heavy rules", "violence", "losing too fast", "dark themes"],
    notes: ["Instant feedback with sound and particles on every success", "Icons over text"],
    sources: [
      { title: "Альфа «Рыбки в банке» — runner for kids", url: "https://habr.com/ru/articles/1018528/", kind: "observation" },
    ],
  },
  teens: {
    id: "teens",
    label: "Подростки",
    uiScale: 1.0,
    minTapTargetPx: 48,
    minFontPx: 16,
    speedMultiplier: 1.2,
    roundSeconds: [30, 90],
    paletteHint: "bold neon or trendy contrast, dynamic",
    preferredGenres: ["runner", "arcade", "clicker"],
    avoid: ["slow pacing", "childish visuals"],
    notes: ["Score chase and best-score display", "Ramp difficulty quickly"],
    sources: [{ title: "Leaderboards/leagues drive repeat sessions (Т-Банк «Ряд наград»)", url: "https://habr.com/ru/articles/1018528/", kind: "observation" }],
  },
  adults: {
    id: "adults",
    label: "Взрослые",
    uiScale: 1.1,
    minTapTargetPx: 52,
    minFontPx: 18,
    speedMultiplier: 1.0,
    roundSeconds: [45, 120],
    paletteHint: "clean modern palette, moderate contrast",
    preferredGenres: ["match3", "puzzle", "quiz", "arcade"],
    avoid: ["long tutorials"],
    notes: ["Playable one-handed in a short break", "Best-score persistence"],
    sources: [
      { title: "Match-3 with leagues: 3M players, 36M rounds (Т-Банк «Ряд наград»)", url: "https://habr.com/ru/articles/1018528/", kind: "observation" },
      { title: "Beeline in-app catalog: farm, match-3, arcade, quizzes", url: "https://bor.beeline.ru/games/games-page/", kind: "observation" },
    ],
  },
  general: {
    id: "general",
    label: "Все",
    uiScale: 1.15,
    minTapTargetPx: 56,
    minFontPx: 18,
    speedMultiplier: 1.0,
    roundSeconds: [30, 120],
    paletteHint: "friendly, readable, medium saturation",
    preferredGenres: ["arcade", "match3", "clicker", "quiz"],
    avoid: ["complex controls"],
    notes: ["Understandable within 5 seconds without reading"],
    sources: [{ title: "Яндекс Игры requirements: one-handed control, adequate tap targets", url: "https://yandex.ru/dev/games/doc/ru/concepts/requirements.html", kind: "guideline" }],
  },
};
