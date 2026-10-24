import type { Audience, Genre } from "@gg/shared";

export const AUDIENCE_LABEL: Record<Audience, string> = {
  kids: "Дети",
  teens: "Подростки",
  adults: "Взрослые",
  seniors: "Пожилые",
  general: "Для всех",
};

export const GENRE_LABEL: Record<Genre, string> = {
  arcade: "Аркада",
  match3: "Три в ряд",
  runner: "Раннер",
  quiz: "Викторина",
  clicker: "Кликер",
  puzzle: "Головоломка",
  other: "Другое",
};

export const PROMPT_EXAMPLES = [
  "Замути змейку для бабушки",
  "Платформер по облакам для школьника",
  "Космический шутер с волнами и боссом",
  "Режь овощи взмахом, бомбы не трогай",
  "Тир на ярмарке, сбивай банки",
];

export const EDIT_EXAMPLES = ["Сделай кнопки больше", "Добавь уровни", "Сделай медленнее", "Ярче цвета", "Добавь жизни"];

const rtf = new Intl.RelativeTimeFormat("ru", { numeric: "auto" });

/** «5 минут назад», «вчера», затем дата. */
export function timeAgo(ts: number) {
  const s = Math.round((ts - Date.now()) / 1000);
  if (s > -60) return "только что";
  if (s > -3600) return rtf.format(Math.round(s / 60), "minute");
  if (s > -86400) return rtf.format(Math.round(s / 3600), "hour");
  if (s > -7 * 86400) return rtf.format(Math.round(s / 86400), "day");
  return new Date(ts).toLocaleDateString("ru", { day: "numeric", month: "short" });
}

export const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
