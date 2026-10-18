import OpenAI from "openai";
import { config } from "./config";

/**
 * Single OpenAI-compatible client (cliproxyapi). SDK retries are disabled: the pipeline owns
 * retries (one repair at most) and the operation deadline, so latency numbers stay honest.
 */
export const llm = new OpenAI({
  baseURL: config.llmBaseUrl,
  apiKey: config.llmApiKey,
  maxRetries: 0,
  timeout: 180_000,
});

export interface ChatOpts {
  model: string;
  system: string;
  user: string;
  signal: AbortSignal;
}

export async function chatJson<T>(opts: ChatOpts & { schemaName: string; schema: object }): Promise<T> {
  const res = await llm.chat.completions.create(
    {
      model: opts.model,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: opts.schemaName, strict: true, schema: opts.schema as Record<string, unknown> },
      },
    },
    { signal: opts.signal },
  );
  const text = res.choices[0]?.message?.content;
  if (!text) throw new Error("LLM returned an empty response");
  return JSON.parse(text) as T;
}

/** Streams a completion, reporting accumulated length; returns the full text. */
export async function chatStream(opts: ChatOpts & { onChars: (n: number) => void }): Promise<string> {
  const stream = await llm.chat.completions.create(
    {
      model: opts.model,
      stream: true,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
    },
    { signal: opts.signal },
  );
  let out = "";
  let lastReport = 0;
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (!delta) continue;
    out += delta;
    if (out.length - lastReport > 400) {
      lastReport = out.length;
      opts.onChars(out.length);
    }
  }
  opts.onChars(out.length);
  return out;
}
