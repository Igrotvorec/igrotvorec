import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config";

/** Секрет хранится рядом с данными: токены переживают перезапуск сервера. */
const secretPath = join(config.dataDir, ".thumb-secret");
if (!existsSync(secretPath)) writeFileSync(secretPath, randomBytes(32).toString("hex"), { mode: 0o600 });
const secret = readFileSync(secretPath, "utf8").trim();

/**
 * Право загрузить обложку версии. Выдаётся только автору в событии done (генерация, правка,
 * исправление) и не появляется в публичном API, поэтому посторонний не может подменить обложку.
 */
export function thumbToken(versionId: string): string {
  return createHmac("sha256", secret).update(`thumb:${versionId}`).digest("hex").slice(0, 32);
}

export function thumbTokenValid(versionId: string, token: string): boolean {
  const want = Buffer.from(thumbToken(versionId));
  const got = Buffer.from(token);
  return got.length === want.length && timingSafeEqual(got, want);
}
