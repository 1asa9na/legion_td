import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { INIT_DATA_MAX_AGE_MS, verifyInitData } from "./initData.js";

const BOT_TOKEN = "123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw";
const AUTH_DATE = 1_700_000_000;
const USER = '{"id":42,"first_name":"Klemens","username":"klemens"}';
const KNOWN_HASH = "2c3e2539be2a4475e0bfe0ea7771838aba614977c4f940172a40819c507454c0";

function sign(fields: Record<string, string>, botToken = BOT_TOKEN): string {
  const pairs = Object.entries(fields).sort((left, right) => (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0));
  const dataCheckString = pairs.map(([key, value]) => `${key}=${value}`).join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  return new URLSearchParams([...pairs, ["hash", hash]]).toString();
}

test("a known initData signature resolves the player", () => {
  const initData = sign({
    auth_date: String(AUTH_DATE),
    query_id: "AAE",
    user: USER,
  });
  assert.equal(new URLSearchParams(initData).get("hash"), KNOWN_HASH);

  const player = verifyInitData(initData, BOT_TOKEN, AUTH_DATE * 1000);
  assert.deepEqual(player, { id: 42, username: "klemens", firstName: "Klemens" });
});

test("a bad hash, a stale date, or a missing user is rejected", () => {
  const initData = sign({ auth_date: String(AUTH_DATE), query_id: "AAE", user: USER });
  const now = AUTH_DATE * 1000;
  assert.equal(verifyInitData(initData, "other-token", now), undefined);
  const tampered = new URLSearchParams(initData);
  tampered.set("hash", `${KNOWN_HASH.slice(0, -1)}1`);
  assert.equal(verifyInitData(tampered.toString(), BOT_TOKEN, now), undefined);
  assert.equal(verifyInitData(initData, BOT_TOKEN, now + INIT_DATA_MAX_AGE_MS + 1000), undefined);
  assert.equal(verifyInitData(initData, BOT_TOKEN, now - 31_000), undefined);
  assert.equal(verifyInitData(sign({ auth_date: String(AUTH_DATE), query_id: "AAE" }), BOT_TOKEN, now), undefined);
  assert.equal(verifyInitData("", BOT_TOKEN, now), undefined);
});
