import assert from "node:assert/strict";
import test from "node:test";
import { bonusWave, creeps, damageBonus, damageMultiplier, king, mech, waves } from "./index.js";

// Strings from Trig_Setup_Tower_Properties and Trig_Setup_Creep_Properties.
const SELL_LIST = ",25,150,60,230,215,110,300,140,405,210,500,360,850";
const WAVE_COUNTS =
  ",12,15,12,12,12,12,10,12,15,01,18,15,15,08,12,15,12,15,12,01,12,16,12,12,18,12,12,06,10,01";
const BOUNTIES = ",3,4,4,5,5,5,6,6,5,51,6,6,7,10,8,8,9,8,10,86,10,9,11,11,9,12,12,23,14,123,0,";

function commaValues(text: string): number[] {
  return text
    .split(",")
    .filter((part) => part !== "")
    .map((part) => Number(part));
}

function fixedWidthValues(text: string): number[] {
  const values: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === ",") {
      values.push(Number.parseInt(text.slice(index + 1, index + 3), 10));
    }
  }
  return values;
}

test("mech sell list has one entry per tower", () => {
  const expected = commaValues(SELL_LIST);
  assert.equal(mech.builderId, "u000");
  assert.equal(mech.sellPercent, 0.5);
  assert.equal(mech.towers.length, expected.length);
  for (const [index, tower] of mech.towers.entries()) {
    assert.equal(tower.value, expected[index]);
    assert.equal(tower.sellGold, Math.trunc(tower.value * mech.sellPercent));
  }
});

test("tower value is the gold spent to reach it", () => {
  const byFighter = new Map(mech.towers.map((tower) => [tower.fighterId, tower]));
  const builtFrom = new Map<string, string>();
  for (const tower of mech.towers) {
    for (const upgradeId of tower.upgradesTo) {
      assert.equal(builtFrom.has(upgradeId), false);
      builtFrom.set(upgradeId, tower.fighterId);
    }
  }

  for (const tower of mech.towers) {
    let spent = 0;
    let current: string | undefined = tower.fighterId;
    const seen = new Set<string>();
    while (current !== undefined) {
      assert.equal(seen.has(current), false);
      seen.add(current);
      const step = byFighter.get(current);
      assert.ok(step);
      spent += step.goldCost;
      current = builtFrom.get(current);
    }
    if (tower.fighterId === "h00V") {
      assert.equal(spent, 810);
      assert.equal(tower.value, 850);
    } else {
      assert.equal(tower.value, spent);
    }
  }
});

test("pyro deals 100 damage per second", () => {
  const pyro = mech.towers.find((tower) => tower.fighterId === "h00Y");
  assert.ok(pyro);
  assert.equal(pyro.name, "Pyro");
  const average = (pyro.stats.damageMin + pyro.stats.damageMax) / 2;
  assert.equal(average / pyro.stats.cooldown, 100);
  assert.equal(pyro.stats.attackType, "chaos");
  assert.equal(pyro.stats.armorType, "heavy");
});

test("waves follow the creep setup", () => {
  const counts = fixedWidthValues(WAVE_COUNTS);
  const bounties = commaValues(BOUNTIES);
  assert.equal(waves.length, 30);
  assert.equal(counts.length, 30);
  assert.equal(bounties.length, 31);

  for (const [index, wave] of waves.entries()) {
    const level = index + 1;
    const creep = creeps[wave.creepId];
    assert.ok(creep);
    assert.equal(wave.level, level);
    assert.equal(wave.count, counts[index]);
    assert.equal(wave.bounty, bounties[index]);
    assert.equal(wave.prepareSeconds, 35 + level);
    assert.equal(wave.endRoundGold, Math.floor((5 * level) / 3) + 12);
    assert.equal(wave.attackType, creep.stats.attackType);
    assert.equal(wave.armorType, creep.stats.armorType);
  }

  assert.equal(waves[0].creepId, "h002");
  assert.equal(creeps[waves[0].creepId].name, "Crab");
  assert.equal(waves[9].count, 1);
  assert.equal(waves[9].bounty, 51);
  assert.equal(waves[9].boss, true);
  assert.equal(bonusWave.level, 31);
  assert.equal(bonusWave.creepId, "h05L");
  assert.equal(bonusWave.count, 5);
  assert.equal(bonusWave.bounty, bounties[30]);
  assert.equal(creeps[bonusWave.creepId].name, "Legion Lord");
});

test("armor table matches war3mapMisc", () => {
  assert.deepEqual(damageBonus.pierce, [1.3, 0.8, 0.9, 0.7, 0.7, 1, 1, 1]);
  assert.deepEqual(damageBonus.normal, [0.9, 1.2, 0.9, 0.8, 0.8, 1, 1, 1]);
  assert.deepEqual(damageBonus.magic, [1.1, 0.8, 1.2, 0.7, 0.7, 1, 1, 1]);
  assert.deepEqual(damageBonus.siege, [0.9, 0.9, 0.9, 1.25, 1.25, 1, 1, 1]);
  assert.equal(damageBonus.pierce[3], damageBonus.pierce[4]);
  assert.equal(damageBonus.hero[6], 0.35);
  assert.equal(damageMultiplier("pierce", "light"), 1.3);
  assert.equal(damageMultiplier("siege", "fortified"), 1.25);
  assert.equal(damageMultiplier("normal", "unarmored"), 1);
});

test("movement and the king come from the unit data", () => {
  const crab = creeps[waves[0].creepId];
  assert.equal(crab.stats.moveSpeed, 225);
  assert.equal(crab.stats.collision, 12);
  assert.equal(crab.stats.acquire, 600);
  assert.equal(king.id, "h00K");
  assert.equal(king.name, "The King");
  assert.equal(king.stats.hp, 2600);
  assert.equal(king.stats.armor, 5);
  assert.equal(king.stats.armorType, "hero");
  assert.equal(king.stats.attackType, "hero");
  assert.equal(king.stats.range, 715);
  assert.equal(king.stats.damageMin, 31);
  assert.equal(king.stats.damageMax, 41);
});
