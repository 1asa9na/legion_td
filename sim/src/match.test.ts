import assert from "node:assert/strict";
import test from "node:test";
import { creeps, king, mech, waves, type Creep, type Wave } from "@legion/content";
import { averageDamage, shotDamage } from "./combat.js";
import { SIM_TICK_HZ } from "./clock.js";
import { OPENING_PREPARE_MS, SPAWN_HOLD_MS } from "./lane.js";
import { createMatch, step, type Match, type MatchOptions } from "./match.js";

function waveOf(count: number): Wave {
  return { ...waves[0], count };
}

function started(options: MatchOptions = {}): Match {
  return createMatch({ openingPrepareMs: 0, ...options });
}

function finish(match: Match, cap = 4000): void {
  for (let i = 0; i < cap && match.state.outcome === "playing"; i += 1) step(match);
}

test("the opening wait is 90 seconds, then the whole wave spawns", () => {
  const match = createMatch({ startingGold: 0 });
  assert.equal(match.state.prepareMs, OPENING_PREPARE_MS);
  assert.equal(match.state.income, 0);
  assert.equal(match.state.roundGold, waves[0].endRoundGold);
  assert.equal(match.state.kingHp, king.stats.hp);
  for (let i = 0; i < 10; i += 1) step(match);
  assert.equal(match.state.tick, 10);
  assert.equal(match.state.phase, "prepare");
  assert.equal(match.state.prepareMs, OPENING_PREPARE_MS - 1000);

  const spawn = createMatch({ startingGold: 0 });
  for (let i = 0; i < (OPENING_PREPARE_MS / 100) - 1; i += 1) step(spawn);
  assert.equal(spawn.state.phase, "prepare");
  step(spawn);
  assert.equal(spawn.state.phase, "combat");
  assert.equal(spawn.state.creeps.length, waves[0].count);
  assert.equal(spawn.state.holdMs, SPAWN_HOLD_MS - 100);
  assert.equal(spawn.state.creeps[0].distance, 0);
});

test("creeps stand for two seconds, then walk at their own speed", () => {
  const match = started({ waves: [waveOf(1)], startingGold: 0 });
  const crab = creeps[waves[0].creepId];
  for (let i = 0; i < SPAWN_HOLD_MS / 100; i += 1) step(match);
  assert.equal(match.state.creeps.length, 1);
  assert.equal(match.state.creeps[0].distance, 0);
  assert.equal(match.state.holdMs, 0);
  step(match);
  assert.equal(match.state.creeps[0].distance, (crab.stats.moveSpeed * SIM_TICK_HZ) / 100);
});

test("a fresh tower sells for the list value, and only between rounds", () => {
  const peewee = mech.towers.find((tower) => tower.name === "Peewee");
  assert.ok(peewee);
  const match = createMatch({ startingGold: 100 });
  const [built] = step(match, [{ type: "build", fighterId: peewee.fighterId, slot: 0, side: "north" }]);
  assert.equal(built.ok, true);
  assert.equal(match.state.gold, 100 - peewee.goldCost);

  const [sold] = step(match, [{ type: "sell", id: built.id ?? 0 }]);
  assert.equal(sold.ok, true);
  assert.equal(match.state.gold, 100 - peewee.goldCost + peewee.value);

  const fighting = started({ waves: [waveOf(1)], startingGold: 100 });
  const [again] = step(fighting, [{ type: "build", fighterId: peewee.fighterId, slot: 0, side: "north" }]);
  assert.equal(fighting.state.phase, "combat");
  const [blocked] = step(fighting, [{ type: "sell", id: again.id ?? 0 }]);
  assert.equal(blocked.reason, "round");
  assert.equal(fighting.state.towers.length, 1);
});

test("after a round the same tower sells for half the list", () => {
  const infantry = mech.towers.find((tower) => tower.name === "Infantry");
  assert.ok(infantry);
  const match = started({ waves: [waveOf(1), waves[1]], startingGold: 100 });
  const [built] = step(match, [{ type: "build", fighterId: infantry.fighterId, slot: 0, side: "north" }]);
  assert.equal(match.state.phase, "prepare");
  assert.equal(match.state.waveLevel, 2);
  const before = match.state.gold;
  const [sold] = step(match, [{ type: "sell", id: built.id ?? 0 }]);
  assert.equal(sold.ok, true);
  assert.equal(match.state.gold, before + infantry.sellGold);
  assert.equal(infantry.sellGold, Math.trunc(infantry.value * 0.5));
});

test("a fresh Doomsday Machine refunds the whole sell-list value", () => {
  const neotank = mech.towers.find((tower) => tower.name === "Neotank");
  const doomsday = mech.towers.find((tower) => tower.name === "Doomsday Machine");
  assert.ok(neotank && doomsday);
  const match = createMatch({ startingGold: 1000 });
  const [built] = step(match, [{ type: "build", fighterId: neotank.fighterId, slot: 1, side: "north" }]);
  step(match, [{ type: "upgrade", id: built.id ?? 0, fighterId: doomsday.fighterId }]);
  step(match, [{ type: "sell", id: built.id ?? 0 }]);
  assert.equal(match.state.gold, 1000 - neotank.goldCost - doomsday.goldCost + doomsday.value);
  assert.equal(doomsday.value, 850);
  assert.equal(doomsday.sellGold, 425);
});

test("illegal build commands leave the lane unchanged", () => {
  const peewee = mech.towers.find((tower) => tower.name === "Peewee");
  const veteran = mech.towers.find((tower) => tower.name === "Veteran");
  const pyro = mech.towers.find((tower) => tower.name === "Pyro");
  assert.ok(peewee && veteran && pyro);
  const match = createMatch({ startingGold: 20 });
  const [poor] = step(match, [{ type: "build", fighterId: peewee.fighterId, slot: 0, side: "north" }]);
  assert.equal(poor.reason, "gold");
  match.state.gold = 200;
  const [notRoot] = step(match, [{ type: "build", fighterId: veteran.fighterId, slot: 0, side: "north" }]);
  assert.equal(notRoot.reason, "root");
  const [unknown] = step(match, [{ type: "build", fighterId: "nope", slot: 0, side: "north" }]);
  assert.equal(unknown.reason, "unknown");
  const [slot] = step(match, [{ type: "build", fighterId: peewee.fighterId, slot: 99, side: "north" }]);
  assert.equal(slot.reason, "slot");
  const [built] = step(match, [{ type: "build", fighterId: peewee.fighterId, slot: 0, side: "north" }]);
  const [occupied] = step(match, [{ type: "build", fighterId: peewee.fighterId, slot: 0, side: "north" }]);
  assert.equal(occupied.reason, "occupied");
  const [badPath] = step(match, [{ type: "upgrade", id: built.id ?? 0, fighterId: pyro.fighterId }]);
  assert.equal(badPath.reason, "path");
  assert.equal(match.state.towers.length, 1);
});

test("infantry kills the crab and both sides shoot when they are in range", () => {
  const infantry = mech.towers.find((tower) => tower.name === "Infantry");
  const peewee = mech.towers.find((tower) => tower.name === "Peewee");
  const crab = creeps[waves[0].creepId];
  assert.ok(infantry && peewee);
  const shot = shotDamage(
    infantry.stats.attackType,
    averageDamage(infantry.stats.damageMin, infantry.stats.damageMax),
    crab.stats.armor,
    crab.stats.armorType,
  );
  assert.ok(shot >= crab.stats.hp);

  const match = started({ waves: [waveOf(1)], startingGold: 100 });
  step(match, [{ type: "build", fighterId: infantry.fighterId, slot: 0, side: "south" }]);
  assert.equal(match.state.outcome, "cleared");
  assert.equal(match.state.kingHp, king.stats.hp);

  const fight = started({ waves: [waveOf(1)], startingGold: 100 });
  step(fight, [{ type: "build", fighterId: peewee.fighterId, slot: 0, side: "north" }]);
  const tower = fight.state.towers[0];
  const alive = fight.state.creeps[0];
  assert.ok(alive);
  assert.ok(alive.hp < crab.stats.hp);
  assert.ok(tower.hp < peewee.stats.hp);
});

test("a full wave pays no bounty, and the tail still reaches the king", () => {
  const crab = creeps[waves[0].creepId];
  const bite = shotDamage(
    crab.stats.attackType,
    averageDamage(crab.stats.damageMin, crab.stats.damageMax),
    king.stats.armor,
    king.stats.armorType,
  );
  const match = started({ waves: [waveOf(waves[0].count)], startingGold: 50 });
  finish(match);
  assert.equal(match.state.outcome, "cleared");
  assert.equal(match.state.gold, 50 + waves[0].endRoundGold);
  // The king kills one crab every 0.9s. At 225 speed the tail closes and eight crabs land one hit.
  let expected = king.stats.hp;
  for (let hit = 0; hit < 8; hit += 1) expected -= bite;
  assert.equal(match.state.kingHp, expected);
});

test("a single-creep wave keeps its bounty when the king makes the kill", () => {
  const match = started({ waves: [waveOf(1)], startingGold: 50 });
  finish(match);
  assert.equal(match.state.outcome, "cleared");
  assert.equal(match.state.gold, 50 + waves[0].bounty + waves[0].endRoundGold);
  assert.equal(match.state.kingHp, king.stats.hp);
});

test("a creep that survives the king's first shot hits back", () => {
  const tough: Creep = {
    id: "tough",
    name: "Tough",
    stats: {
      hp: 400,
      armor: 0,
      armorType: "unarmored",
      attackType: "normal",
      damageMin: 20,
      damageMax: 20,
      cooldown: 1,
      range: 90,
      moveSpeed: 400,
      collision: 12,
      acquire: 800,
    },
  };
  const wave: Wave = { ...waves[0], creepId: tough.id, count: 2, prepareSeconds: 0 };
  const match = started({ creeps: { [tough.id]: tough }, waves: [wave], startingGold: 0 });
  step(match);
  finish(match, 8000);
  assert.equal(match.state.outcome, "cleared");
  assert.ok(match.state.kingHp < king.stats.hp);
  assert.ok(match.state.kingHp > 0);
  assert.equal(match.state.gold, waves[0].endRoundGold);
});

test("pierce still wounds light armor more than fortified armor", () => {
  const infantry = mech.towers.find((tower) => tower.name === "Infantry");
  assert.ok(infantry);
  const fighterId = infantry.fighterId;
  const attack = infantry.stats.attackType;
  const damage = averageDamage(infantry.stats.damageMin, infantry.stats.damageMax);

  function wound(armorType: "light" | "fortified"): number {
    const creep: Creep = {
      id: armorType,
      name: armorType,
      stats: {
        hp: 500,
        armor: 3,
        armorType,
        attackType: "normal",
        damageMin: 1,
        damageMax: 1,
        cooldown: 9,
        range: 1,
        moveSpeed: 0,
        collision: 12,
        acquire: 1,
      },
    };
    const wave: Wave = { ...waves[0], creepId: creep.id, count: 1 };
    const match = started({ creeps: { [creep.id]: creep }, waves: [wave], startingGold: 100 });
    step(match, [{ type: "build", fighterId, slot: 0, side: "north" }]);
    assert.equal(match.state.creeps.length, 1);
    return 500 - match.state.creeps[0].hp;
  }

  const light = wound("light");
  const fortified = wound("fortified");
  assert.ok(Math.abs(light - shotDamage(attack, damage, 3, "light")) < 1e-9);
  assert.ok(Math.abs(fortified - shotDamage(attack, damage, 3, "fortified")) < 1e-9);
  assert.ok(light > fortified);
});

test("the next prepare uses the wave table", () => {
  const infantry = mech.towers.find((tower) => tower.name === "Infantry");
  assert.ok(infantry);
  const match = started({ waves: [waveOf(1), waves[1]], startingGold: 100 });
  step(match, [{ type: "build", fighterId: infantry.fighterId, slot: 0, side: "north" }]);
  assert.equal(match.state.outcome, "playing");
  assert.equal(match.state.phase, "prepare");
  assert.equal(match.state.waveLevel, 2);
  assert.equal(match.state.prepareMs, waves[1].prepareSeconds * 1000);
  assert.equal(match.state.income, 0);
  assert.equal(match.state.roundGold, waves[1].endRoundGold);
});

test("a far tower does not shoot, and two runs stay identical", () => {
  const peewee = mech.towers.find((tower) => tower.name === "Peewee");
  assert.ok(peewee);
  const fighterId = peewee.fighterId;
  const crab = creeps[waves[0].creepId];
  const shot = shotDamage(
    peewee.stats.attackType,
    averageDamage(peewee.stats.damageMin, peewee.stats.damageMax),
    crab.stats.armor,
    crab.stats.armorType,
  );

  function play(slot: number): string {
    const match = started({ waves: [waveOf(1)], startingGold: 100 });
    step(match, [{ type: "build", fighterId, slot, side: "north" }]);
    const hp = match.state.creeps[0]?.hp;
    assert.equal(hp, slot === 0 ? crab.stats.hp - shot : crab.stats.hp);
    finish(match);
    return JSON.stringify(match.state);
  }

  const near = play(0);
  assert.equal(play(0), near);
  assert.notEqual(play(11), near);
});

test("a missing creep is rejected before the match starts", () => {
  assert.throws(() => createMatch({ waves: [{ ...waves[0], creepId: "missing" }], creeps: {} }));
});
