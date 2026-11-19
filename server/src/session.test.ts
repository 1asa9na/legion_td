import assert from "node:assert/strict";
import test from "node:test";
import { mech } from "@legion/content";
import { readIntent } from "./intent.js";
import { MatchSession } from "./session.js";

const peewee = mech.towers.find((tower) => tower.name === "Peewee");

test("build and sell wait for the tick, and a copy of the snapshot stays still", () => {
  assert.ok(peewee);
  const session = new MatchSession({ openingPrepareMs: 60_000, startingGold: 100 });
  const build = readIntent({ type: "build", fighterId: peewee.fighterId, slot: 0, side: "north" });
  assert.equal(build.kind, "queue");
  if (build.kind !== "queue") return;
  session.push(build.command);
  assert.equal(session.match.state.towers.length, 0);

  const [report] = session.tick();
  assert.equal(report?.ok, true);
  assert.equal(session.match.state.gold, 100 - peewee.goldCost);
  assert.equal(session.match.state.phase, "prepare");
  assert.equal(session.match.state.income, 0);

  const picture = session.snapshot();
  picture.gold = 0;
  picture.towers.push(picture.towers[0]);
  assert.equal(session.match.state.gold, 100 - peewee.goldCost);
  assert.equal(session.match.state.towers.length, 1);

  const sell = readIntent({ type: "sell", id: report?.id });
  assert.equal(sell.kind, "queue");
  if (sell.kind !== "queue") return;
  session.push(sell.command);
  const [sold] = session.tick();
  assert.equal(sold?.ok, true);
  assert.equal(session.match.state.gold, 100 - peewee.goldCost + peewee.value);
  assert.equal(session.match.state.towers.length, 0);
});

test("race, send, and a broken command answer immediately", () => {
  assert.deepEqual(readIntent({ type: "race", race: "mech" }), { kind: "now", report: { ok: true } });
  assert.deepEqual(readIntent({ type: "race", race: "elemental" }), {
    kind: "now",
    report: { ok: false, reason: "race" },
  });
  assert.deepEqual(readIntent({ type: "send", creepId: "h002" }), {
    kind: "now",
    report: { ok: false, reason: "unsupported" },
  });
  assert.equal(readIntent({ type: "build", fighterId: "h001", slot: 1.5, side: "north" }).kind, "now");
  assert.equal(readIntent({ type: "send" }).kind, "now");
  assert.equal(readIntent(null).kind, "now");
});
