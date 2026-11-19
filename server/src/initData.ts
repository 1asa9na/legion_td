import { createHmac, timingSafeEqual } from "node:crypto";

/** Start Game and the menu button use the same bot. initData older than this is rejected. */
export const INIT_DATA_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const CLOCK_SKEW_MS = 30_000;

export interface TelegramPlayer {
  id: number;
  username?: string;
  firstName?: string;
}

/**
 * Check a Telegram Mini App initData string.
 * The secret is HMAC-SHA256 of the bot token, keyed by "WebAppData".
 * Returns the player, or undefined when the signature, age, or user is unusable.
 */
export function verifyInitData(
  initData: string,
  botToken: string,
  nowMs: number,
  maxAgeMs = INIT_DATA_MAX_AGE_MS,
): TelegramPlayer | undefined {
  if (!initData || !botToken) return undefined;

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash || hash.length % 2 !== 0) return undefined;

  const pairs: [string, string][] = [];
  for (const [key, value] of params.entries()) {
    if (key === "hash") continue;
    pairs.push([key, value]);
  }
  pairs.sort((left, right) => (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0));
  const dataCheckString = pairs.map(([key, value]) => `${key}=${value}`).join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secretKey).update(dataCheckString).digest();
  const actual = Buffer.from(hash, "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return undefined;

  const authDate = Number(params.get("auth_date"));
  if (!Number.isSafeInteger(authDate)) return undefined;
  const ageMs = nowMs - authDate * 1000;
  if (ageMs > maxAgeMs || ageMs < -CLOCK_SKEW_MS) return undefined;

  const rawUser = params.get("user");
  if (!rawUser) return undefined;
  let parsed: { id?: unknown; username?: unknown; first_name?: unknown };
  try {
    parsed = JSON.parse(rawUser) as { id?: unknown; username?: unknown; first_name?: unknown };
  } catch {
    return undefined;
  }
  if (typeof parsed.id !== "number" || !Number.isSafeInteger(parsed.id)) return undefined;

  const player: TelegramPlayer = { id: parsed.id };
  if (typeof parsed.username === "string" && parsed.username) player.username = parsed.username;
  if (typeof parsed.first_name === "string" && parsed.first_name) player.firstName = parsed.first_name;
  return player;
}
