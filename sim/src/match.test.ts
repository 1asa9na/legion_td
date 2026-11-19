import assert from "node:assert/strict";
import test from "node:test";
import { creeps, mech, waves, type ArmorType, type Creep, type Wave } from "@legion/content";
import { shotDamage, averageDamage } from "./combat.js";
import { SIM_TICK_HZ } from "./clock.js";
import { createMatch, step, type Match } from "./match.js";

function waveOf(count: number, prepareSeconds = 0): Wave {
  return { ...waves[0], count, prepareSeconds };
}

function finish(match: Match, cap = 400): void {
  for (let i = 0; i < cap && match.state.outcome === "playing"; i += 1) step(match);
}

test("ten ticks are one second of prepare", () => {
  const match = createMatch();
  assert.equal(SIM_TICK_HZ, 10);
  assert.equal(match.state.prepareMs, waves[0].prepareSeconds * 1000);
  assert.equal(match.state.income, waves[0].endRoundGold);
  for (let i = 0; i < 10; i += 1) step(match);
  assert.equal(match.state.tick, 10);
  assert.equal(match.state.phase, "prepare");
  assert.equal(match.state.prepareMs, 35_000);
  assert.equal(match.state.creeps.length, 0);
});

test("wave 1 waits out its prepare time, then spawns a crab", () => {
  const match = createMatch({ startingGold: 0 });
  for (let i = 0; i < waves[0].prepareSeconds * SIM_TICK_HZ - 1; i += 1) step(match);
  assert.equal(match.state.phase, "prepare");
  step(match);
  assert.equal(match.state.phase, "combat");
  assert.equal(match.state.creeps.length, 1);
  assert.equal(match.state.creeps[0].creepId, waves[0].creepId);
  assert.equal(match.state.creeps[0].hp, creeps[waves[0].creepId].stats.hp);
  assert.equal(match.state.spawnLeft, waves[0].count - 1);
});

test("building spends gold and selling returns half the catalog value", () => {
  const peewee = mech.towers.find((tower) => tower.name === "Peewee");
  assert.ok(peewee);
  const match = createMatch({ startingGold: 100 });
  const [built] = step(match, [{ type: "build", fighterId: peewee.fighterId, slot: 0, side: "north" }]);
  assert.equal(built.ok, true);
  assert.equal(match.state.gold, 100 - peewee.goldCost);
  assert.equal(match.state.towers.length, 1);

  const [sold] = step(match, [{ type: "sell", id: built.id ?? 0 }]);
  assert.equal(sold.ok, true);
  assert.equal(peewee.sellGold, Math.trunc(peewee.value * mech.sellPercent));
  assert.equal(match.state.gold, 100 - peewee.goldCost + peewee.sellGold);
  assert.equal(match.state.towers.length, 0);
});

test("an upgrade sells for half its listed value", () => {
  const peewee = mech.towers.find((tower) => tower.name === "Peewee");
  const veteran = mech.towers.find((tower) => tower.name === "Veteran");
  assert.ok(peewee && veteran);
  const match = createMatch({ startingGold: 200 });
  const [built] = step(match, [{ type: "build", fighterId: peewee.fighterId, slot: 2, side: "south" }]);
  const [upgraded] = step(match, [{ type: "upgrade", id: built.id ?? 0, fighterId: veteran.fighterId }]);
  assert.equal(upgraded.ok, true);
  assert.equal(match.state.towers[0].fighterId, veteran.fighterId);
  assert.equal(match.state.towers[0].slot, 2);

  step(match, [{ type: "sell", id: built.id ?? 0 }]);
  assert.equal(veteran.sellGold, Math.trunc(veteran.value * 0.5));
  assert.equal(match.state.gold, 200 - peewee.goldCost - veteran.goldCost + veteran.sellGold);
});

test("Doomsday Machine refunds the sell list, not half the gold spent", () => {
  const neotank = mech.towers.find((tower) => tower.name === "Neotank");
  const doomsday = mech.towers.find((tower) => tower.name === "Doomsday Machine");
  assert.ok(neotank && doomsday);
  const spent = neotank.goldCost + doomsday.goldCost;
  assert.equal(spent, 810);
  assert.equal(doomsday.value, 850);
  assert.equal(doomsday.sellGold, 425);

  const match = createMatch({ startingGold: 1000 });
  const [built] = step(match, [{ type: "build", fighterId: neotank.fighterId, slot: 1, side: "north" }]);
  step(match, [{ type: "upgrade", id: built.id ?? 0, fighterId: doomsday.fighterId }]);
  step(match, [{ type: "sell", id: built.id ?? 0 }]);
  assert.equal(match.state.gold, 1000 - spent + doomsday.sellGold);
  assert.notEqual(doomsday.sellGold, Math.trunc(spent * 0.5));
});

test("illegal build and sell commands leave gold alone", () => {
  const peewee = mech.towers.find((tower) => tower.name === "Peewee");
  const veteran = mech.towers.find((tower) => tower.name === "Veteran");
  const pyro = mech.towers.find((tower) => tower.name === "Pyro");
  assert.ok(peewee && veteran && pyro);
  const match = createMatch({ startingGold: 20 });

  const [poor] = step(match, [{ type: "build", fighterId: peewee.fighterId, slot: 0, side: "north" }]);
  assert.deepEqual(poor, { ok: false, reason: "gold" });

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
  const [missing] = step(match, [{ type: "sell", id: 999 }]);
  assert.equal(missing.reason, "missing");
  assert.equal(match.state.towers.length, 1);

  const gold = match.state.gold;
  const [sold, rebuilt] = step(match, [
    { type: "sell", id: built.id ?? 0 },
    { type: "build", fighterId: peewee.fighterId, slot: 0, side: "north" },
  ]);
  assert.equal(sold.ok, true);
  assert.equal(rebuilt.ok, true);
  assert.equal(match.state.gold, gold + peewee.sellGold - peewee.goldCost);
});

test("killing the crab from wave 1 pays its bounty, then the round income", () => {
  const infantry = mech.towers.find((tower) => tower.name === "Infantry");
  const crab = creeps[waves[0].creepId];
  assert.ok(infantry);
  const shot = shotDamage(
    infantry.stats.attackType,
    averageDamage(infantry.stats.damageMin, infantry.stats.damageMax),
    crab.stats.armor,
    crab.stats.armorType,
  );
  assert.ok(shot >= crab.stats.hp);

  const match = createMatch({
    waves: [waveOf(1)],
    startingGold: 100,
    kingHp: 1000,
  });
  const [built] = step(match, [{ type: "build", fighterId: infantry.fighterId, slot: 0, side: "south" }]);
  assert.equal(built.ok, true);
  assert.equal(match.state.outcome, "cleared");
  assert.equal(match.state.creeps.length, 0);
  assert.equal(match.state.kingHp, 1000);
  assert.equal(match.state.gold, 100 - infantry.goldCost + waves[0].bounty + waves[0].endRoundGold);
});

test("a creep that walks off the lane leaks its remaining life into the king", () => {
  const match = createMatch({
    waves: [waveOf(1)],
    startingGold: 0,
    kingHp: 1000,
  });
  finish(match);
  assert.equal(match.state.outcome, "cleared");
  assert.equal(match.state.kingHp, 1000 - creeps[waves[0].creepId].stats.hp);
  assert.equal(match.state.gold, waves[0].endRoundGold);
});

test("one Peewee hit, then the crab leaks for what it has left", () => {
  const peewee = mech.towers.find((tower) => tower.name === "Peewee");
  const crab = creeps[waves[0].creepId];
  assert.ok(peewee);
  const shot = shotDamage(
    peewee.stats.attackType,
    averageDamage(peewee.stats.damageMin, peewee.stats.damageMax),
    crab.stats.armor,
    crab.stats.armorType,
  );
  assert.ok(shot < crab.stats.hp);

  const match = createMatch({
    waves: [waveOf(1)],
    startingGold: 100,
    kingHp: 1000,
  });

  let hits = 0;
  let seenHp = crab.stats.hp;
  step(match, [{ type: "build", fighterId: peewee.fighterId, slot: 0, side: "north" }]);
  for (let i = 0; i < 200; i += 1) {
    const creep = match.state.creeps[0];
    if (creep && creep.hp < seenHp) {
      hits += 1;
      seenHp = creep.hp;
    }
    if (match.state.outcome !== "playing") break;
    step(match);
  }

  assert.equal(hits, 1);
  assert.equal(match.state.outcome, "cleared");
  assert.equal(match.state.gold, 100 - peewee.goldCost + waves[0].endRoundGold);
  assert.ok(Math.abs(1000 - match.state.kingHp - (crab.stats.hp - shot)) < 1e-9);
});

test("the same pierce shot wounds a light creep more than a fortified one", () => {
  const infantry = mech.towers.find((tower) => tower.name === "Infantry");
  assert.ok(infantry);
  const fighterId = infantry.fighterId;
  const attackType = infantry.stats.attackType;
  const damage = averageDamage(infantry.stats.damageMin, infantry.stats.damageMax);

  function wound(armorType: ArmorType): number {
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
        cooldown: 1,
        range: 90,
      },
    };
    const wave: Wave = {
      ...waves[0],
      creepId: creep.id,
      count: 1,
      prepareSeconds: 0,
      armorType,
    };
    const match = createMatch({
      creeps: { [creep.id]: creep },
      waves: [wave],
      startingGold: 100,
    });
    step(match, [{ type: "build", fighterId, slot: 0, side: "north" }]);
    assert.equal(match.state.creeps.length, 1);
    return 500 - match.state.creeps[0].hp;
  }

  const light = wound("light");
  const fortified = wound("fortified");
  assert.ok(Math.abs(light - shotDamage(attackType, damage, 3, "light")) < 1e-9);
  assert.ok(Math.abs(fortified - shotDamage(attackType, damage, 3, "fortified")) < 1e-9);
  assert.ok(light > fortified);
});

test("Pyro clears Mech wave 1 and the round pays bounty plus income", () => {
  const infantry = mech.towers.find((tower) => tower.name === "Infantry");
  const pyro = mech.towers.find((tower) => tower.name === "Pyro");
  assert.ok(infantry && pyro);
  const match = createMatch({
    waves: [waveOf(waves[0].count)],
    startingGold: 500,
    kingHp: 1000,
  });
  const [built, upgraded] = step(match, [
    { type: "build", fighterId: infantry.fighterId, slot: 0, side: "north" },
    { type: "upgrade", id: 1, fighterId: pyro.fighterId },
  ]);
  assert.equal(built.ok, true);
  assert.equal(upgraded.ok, true);

  finish(match);
  assert.equal(match.state.outcome, "cleared");
  assert.equal(match.state.kingHp, 1000);
  assert.equal(
    match.state.gold,
    500 - infantry.goldCost - pyro.goldCost + waves[0].count * waves[0].bounty + waves[0].endRoundGold,
  );
});

test("the next wave opens its prepare after the round income is paid", () => {
  const infantry = mech.towers.find((tower) => tower.name === "Infantry");
  assert.ok(infantry);
  const match = createMatch({
    waves: [waveOf(1), waves[1]],
    startingGold: 100,
  });
  step(match, [{ type: "build", fighterId: infantry.fighterId, slot: 0, side: "north" }]);
  assert.equal(match.state.outcome, "playing");
  assert.equal(match.state.phase, "prepare");
  assert.equal(match.state.waveLevel, 2);
  assert.equal(match.state.prepareMs, waves[1].prepareSeconds * 1000);
  assert.equal(match.state.income, waves[1].endRoundGold);
  assert.equal(match.state.gold, 100 - infantry.goldCost + waves[0].bounty + waves[0].endRoundGold);
});

test("a leak that drops the king ends the match without paying the round", () => {
  const match = createMatch({
    waves: [waveOf(2)],
    startingGold: 50,
    kingHp: 10,
  });
  finish(match);
  assert.equal(match.state.outcome, "defeated");
  assert.equal(match.state.kingHp, 0);
  assert.equal(match.state.gold, 50);
  const [after] = step(match, [{ type: "build", fighterId: "h00M", slot: 0, side: "north" }]);
  assert.equal(after.reason, "ended");
  assert.equal(match.state.gold, 50);
});

test("a tower out of range does not shoot, and two runs stay identical", () => {
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
    const match = createMatch({
      waves: [waveOf(1)],
      startingGold: 100,
      kingHp: 1000,
    });
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
