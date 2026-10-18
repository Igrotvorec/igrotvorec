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
  port: Number(process.env.PORT ?? 8787),
  dataDir: process.env.DATA_DIR ?? "./data",
  publicUrl: process.env.PUBLIC_URL ?? "http://localhost:5173",
  /** Hard deadline for one generate/edit/repair operation. */
  operationTimeoutMs: Number(process.env.OPERATION_TIMEOUT_MS ?? 240_000),
  webDist: process.env.WEB_DIST ?? new URL("../../web/dist", import.meta.url).pathname,
};
