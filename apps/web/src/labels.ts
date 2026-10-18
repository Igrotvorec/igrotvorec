import type { Audience, Genre } from "@gg/shared";

export const AUDIENCE_LABEL: Record<Audience, string> = {
  kids: "Дети",
  teens: "Подростки",
  adults: "Взрослые",
  seniors: "Пожилые",
  general: "Все",
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
  "Кликер с котиками для ребёнка 6 лет",
  "Три в ряд с фруктами, раунд на минуту",
  "Викторина про космос для школьника",
  "Раннер на скейте для подростка, уворачиваться от конусов",
];

export const EDIT_EXAMPLES = ["Сделай кнопки больше", "Добавь уровни", "Сделай медленнее", "Ярче цвета", "Добавь жизни"];
