import assert from "node:assert/strict";
import test from "node:test";
import { mech } from "@legion/content";
import { ARMOR_CONSTANT, armorMultiplier, averageDamage, shotDamage } from "./combat.js";

const factorAt3 = 1 - (3 * ARMOR_CONSTANT) / (1 + ARMOR_CONSTANT * 3);

test("armor value uses the Warcraft III mitigation curve", () => {
  assert.equal(armorMultiplier(0), 1);
  assert.ok(Math.abs(armorMultiplier(3) - factorAt3) < 1e-12);
  assert.ok(armorMultiplier(3) < 1);
  assert.ok(Math.abs(armorMultiplier(-1) - (2 - (1 - ARMOR_CONSTANT) ** 1)) < 1e-12);
  assert.ok(armorMultiplier(-1) > 1);
});

test("pierce hits light armor harder than fortified", () => {
  const infantry = mech.towers.find((tower) => tower.name === "Infantry");
  assert.ok(infantry);
  const damage = averageDamage(infantry.stats.damageMin, infantry.stats.damageMax);
  assert.equal(damage, 49.5);
  assert.equal(infantry.stats.attackType, "pierce");

  const light = shotDamage(infantry.stats.attackType, damage, 3, "light");
  const fortified = shotDamage(infantry.stats.attackType, damage, 3, "fortified");

  assert.ok(Math.abs(light - damage * 1.3 * factorAt3) < 1e-9);
  assert.ok(Math.abs(fortified - damage * 0.7 * factorAt3) < 1e-9);
  assert.ok(light > fortified);
  assert.ok(Math.abs(light / fortified - 1.3 / 0.7) < 1e-12);
});

test("siege hits fortified armor harder than light", () => {
  const tempest = mech.towers.find((tower) => tower.name === "Tempest");
  assert.ok(tempest);
  const damage = averageDamage(tempest.stats.damageMin, tempest.stats.damageMax);
  assert.equal(tempest.stats.attackType, "siege");

  const light = shotDamage(tempest.stats.attackType, damage, 3, "light");
  const fortified = shotDamage(tempest.stats.attackType, damage, 3, "fortified");

  assert.ok(Math.abs(light - damage * 0.9 * factorAt3) < 1e-9);
  assert.ok(Math.abs(fortified - damage * 1.25 * factorAt3) < 1e-9);
  assert.ok(fortified > light);
});

test("chaos ignores armor type and spells ignore armor value", () => {
  const pyro = mech.towers.find((tower) => tower.name === "Pyro");
  assert.ok(pyro);
  const damage = averageDamage(pyro.stats.damageMin, pyro.stats.damageMax);
  assert.equal(pyro.stats.attackType, "chaos");
  assert.equal(shotDamage(pyro.stats.attackType, damage, 3, "light"), shotDamage(pyro.stats.attackType, damage, 3, "fortified"));

  assert.equal(shotDamage("spells", 10, 0, "heavy"), 10);
  assert.equal(shotDamage("spells", 10, 100, "heavy"), 10);
});
