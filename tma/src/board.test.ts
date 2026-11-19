import assert from "node:assert/strict";
import test from "node:test";
import { mech } from "@legion/content";
import { LEFT_LANE, towerPosition } from "@legion/sim";
import {
  buildCommand,
  fitLane,
  lockSend,
  nearestCell,
  prepareSeconds,
  project,
  refusalText,
  rootTowers,
  sellPayout,
  unlockSend,
} from "./board.ts";

test("a known lane point lands in the fitted rectangle", () => {
  const path = [
    { x: 0, y: 100 },
    { x: 0, y: 0 },
  ];
  const frame = fitLane(216, 216, path, 10, 16);
  const scale = 184 / 120;
  const spawn = project(frame, path[0]);
  const king = project(frame, path[1]);
  assert.equal(spawn.x, 16 + 10 * scale);
  assert.equal(spawn.y, 16 + 10 * scale);
  assert.ok(spawn.y < king.y);
  assert.ok(spawn.x >= 16 && spawn.x <= 200);
  assert.ok(king.y >= 16 && king.y <= 200);

  const phone = fitLane(390, 700);
  const top = project(phone, LEFT_LANE[0]);
  const bottom = project(phone, LEFT_LANE[LEFT_LANE.length - 1]);
  assert.ok(top.y < bottom.y);
  assert.ok(top.x >= 16 && top.x <= 374);
  assert.ok(bottom.y >= 16 && bottom.y <= 684);
});

test("roots are the six Mech bases", () => {
  assert.deepEqual(
    rootTowers().map((tower) => [tower.name, tower.fighterId, tower.goldCost]),
    [
      ["Peewee", "h00M", 25],
      ["Infantry", "h00O", 60],
      ["Captain", "h00P", 110],
      ["Tempest", "h00N", 140],
      ["Cyborg", "h00Q", 210],
      ["Neotank", "h00S", 360],
    ],
  );
});

test("a fresh tower sells for the list, and combat disables the sale", () => {
  const peewee = mech.towers.find((tower) => tower.name === "Peewee");
  assert.ok(peewee);
  assert.equal(sellPayout(peewee.value, peewee.sellGold, true, "prepare"), peewee.value);
  assert.equal(sellPayout(peewee.value, peewee.sellGold, false, "prepare"), peewee.sellGold);
  assert.equal(sellPayout(peewee.value, peewee.sellGold, true, "combat"), null);
  assert.equal(peewee.value, 25);
  assert.equal(peewee.sellGold, 12);
});

test("a build command names the fighter, slot, and side", () => {
  assert.deepEqual(buildCommand("h00M", 0, "north"), {
    type: "build",
    fighterId: "h00M",
    slot: 0,
    side: "north",
  });
});

test("the nearest cell is the one under the finger", () => {
  const frame = fitLane(390, 700);
  const north = towerPosition(LEFT_LANE, 0, "north");
  const south = towerPosition(LEFT_LANE, 3, "south");
  assert.deepEqual(nearestCell(project(frame, north).x, project(frame, north).y, frame), {
    slot: 0,
    side: "north",
  });
  assert.deepEqual(nearestCell(project(frame, south).x, project(frame, south).y, frame), {
    slot: 3,
    side: "south",
  });
});

test("the same button waits for the report or a later snapshot", () => {
  const first = lockSend(null, "build:0:north", 10);
  assert.deepEqual(first, { key: "build:0:north", tick: 10 });
  assert.equal(lockSend(first, "build:0:north", 10), null);
  assert.deepEqual(lockSend(first, "sell:1", 10), { key: "sell:1", tick: 10 });
  assert.equal(unlockSend(first, 10, false), first);
  assert.equal(unlockSend(first, 11, false), null);
  assert.equal(unlockSend(first, 10, true), null);
});

test("prepare time rounds up, and a refusal is one Russian line", () => {
  assert.equal(prepareSeconds(90_000), 90);
  assert.equal(prepareSeconds(1), 1);
  assert.equal(refusalText("gold"), "не хватает золота");
  assert.equal(refusalText("round"), "продажа после волны");
  assert.equal(refusalText("nope"), "не вышло");
});
