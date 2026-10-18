import { isAbsolute, resolve } from "node:path";

/** Корень репозитория: относительные пути из .env считаются от него, а не от текущей папки процесса. */
const REPO_ROOT = new URL("../../..", import.meta.url).pathname;

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

export const config = {
  llmBaseUrl: required("LLM_BASE_URL"),
  llmApiKey: required("LLM_API_KEY"),
  specModel: process.env.SPEC_MODEL ?? "gpt-6.1-sol",
  codeModel: process.env.CODE_MODEL ?? "gpt-6.1-sol",
  /** Модель картинок для спрайтов; пусто — спрайты не генерируются, игры рисуют emoji. */
  imageModel: process.env.IMAGE_MODEL ?? "gpt-image-2.5",
  /** service_tier для запросов к LLM; "priority" включает fast-режим Sol. Пусто — не передаём. */
  serviceTier: process.env.LLM_SERVICE_TIER || undefined,
  port: Number(process.env.PORT ?? 8787),
  dataDir: (() => {
    const d = process.env.DATA_DIR ?? "./data";
    return isAbsolute(d) ? d : resolve(REPO_ROOT, d);
  })(),
  publicUrl: process.env.PUBLIC_URL ?? "http://localhost:5173",
  /** Жёсткий дедлайн одной операции генерации, правки или исправления. */
  operationTimeoutMs: Number(process.env.OPERATION_TIMEOUT_MS ?? 240_000),
  webDist: process.env.WEB_DIST ?? new URL("../../web/dist", import.meta.url).pathname,
};
