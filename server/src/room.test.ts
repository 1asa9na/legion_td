import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { mech } from "@legion/content";
import { Client } from "colyseus.js";
import type { MatchState } from "@legion/sim";
import { createGameServer } from "./game.js";
import type { RoomReport } from "./intent.js";
import { INIT_DATA_MAX_AGE_MS } from "./initData.js";

const BOT_TOKEN = "123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw";

function sign(fields: Record<string, string>): string {
  const pairs = Object.entries(fields).sort((left, right) => (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0));
  const dataCheckString = pairs.map(([key, value]) => `${key}=${value}`).join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const hash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  return new URLSearchParams([...pairs, ["hash", hash]]).toString();
}

function freshInitData(id: number): string {
  return sign({
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id, first_name: "Klemens", username: "klemens" }),
  });
}

test("the match room rejects a browser and plays one signed player", async (t) => {
  const previous = process.env.BOT_TOKEN;
  process.env.BOT_TOKEN = BOT_TOKEN;
  const { httpServer, gameServer } = createGameServer(false);
  t.after(async () => {
    if (previous === undefined) delete process.env.BOT_TOKEN;
    else process.env.BOT_TOKEN = previous;
    await gameServer.gracefullyShutdown(false);
  });

  await gameServer.listen(0);
  const address = httpServer.address();
  assert.ok(address && typeof address !== "string");
  const endpoint = `http://127.0.0.1:${address.port}`;

  const health = await fetch(`${endpoint}/health`);
  assert.equal((await health.json()).ok, true);

  const denied = await fetch(`${endpoint}/matchmake/joinOrCreate/match`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  const deniedBody = (await denied.json()) as { error?: string };
  assert.equal(deniedBody.error, "auth");

  const stale = sign({
    auth_date: String(Math.floor((Date.now() - INIT_DATA_MAX_AGE_MS) / 1000) - 5),
    user: JSON.stringify({ id: 7, first_name: "Klemens" }),
  });
  const expired = await fetch(`${endpoint}/matchmake/joinOrCreate/match`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ initData: stale }),
  });
  assert.equal(((await expired.json()) as { error?: string }).error, "auth");

  const peewee = mech.towers.find((tower) => tower.name === "Peewee");
  assert.ok(peewee);
  const client = new Client(endpoint);
  const room = await client.joinOrCreate("match", { initData: freshInitData(42) });
  t.after(() => room.leave());

  const opened = await once<MatchState>(room, "state");
  assert.equal(opened.phase, "prepare");
  assert.equal(opened.income, 0);
  assert.equal(opened.gold, 100);
  assert.equal(opened.towers.length, 0);

  const reportPromise = once<RoomReport>(room, "report");
  room.send("command", { type: "build", fighterId: peewee.fighterId, slot: 0, side: "north" });
  const report = await reportPromise;
  assert.equal(report.ok, true);

  const built = await waitFor<MatchState>(room, "state", (state) => state.towers.length === 1);
  assert.equal(built.gold, 100 - peewee.goldCost);
  assert.equal(built.towers[0]?.fighterId, peewee.fighterId);

  const race = once<RoomReport>(room, "report");
  room.send("command", { type: "race", race: "elemental" });
  assert.deepEqual(await race, { ok: false, reason: "race" });

  const send = once<RoomReport>(room, "report");
  room.send("command", { type: "send", creepId: "h002" });
  assert.deepEqual(await send, { ok: false, reason: "unsupported" });

  const other = await new Client(endpoint).joinOrCreate("match", { initData: freshInitData(43) });
  t.after(() => other.leave());
  assert.notEqual(other.roomId, room.roomId);
});

function once<T>(room: { onMessage: (type: string, callback: (message: T) => void) => void }, type: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no ${type}`)), 2000);
    room.onMessage(type, (message) => {
      clearTimeout(timer);
      resolve(message);
    });
  });
}

function waitFor<T>(
  room: { onMessage: (type: string, callback: (message: T) => void) => void },
  type: string,
  ready: (message: T) => boolean,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no matching ${type}`)), 2000);
    room.onMessage(type, (message) => {
      if (!ready(message)) return;
      clearTimeout(timer);
      resolve(message);
    });
  });
}
