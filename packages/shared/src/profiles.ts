import type { Audience, Genre } from "./spec";
import profilesJson from "./audience-profiles.json";

/**
 * Профили аудиторий: конкретные ограничения дизайна, которые генератор применяет к целевой аудитории.
 * Каждое значение подкреплено источником или помечено как эвристика в `sources`.
 */
export interface AudienceProfile {
  id: Audience;
  label: string;
  /** Множитель UI рантайма (кнопки, шрифты). 1 — стандартная цель 48px. */
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

/**
 * Значения собраны с первоисточниками (research/audience-profiles.json, вывод цифр —
 * research/audience-sources.md); `kind: "heuristic"` отмечает оценки без прямого источника.
 */
export const AUDIENCE_PROFILES = profilesJson as Record<Audience, AudienceProfile>;
