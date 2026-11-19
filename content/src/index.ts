export type {
  ArmorType,
  AttackType,
  BonusWave,
  CombatStats,
  Creep,
  Tower,
  Wave,
} from "./types.js";
export { ARMOR_COLUMN, damageBonus, damageMultiplier } from "./armor.js";
import { data } from "./data.js";

export const mech = {
  id: "mech" as const,
  builderId: data.builderId,
  sellPercent: data.sellPercent,
  towers: data.towers,
};

export const waves = data.waves;
export const bonusWave = data.bonus;
export const creeps = data.creeps;

export const catalog = {
  race: mech.id,
  builderId: mech.builderId,
  towers: mech.towers,
  waves,
  bonusWave,
  creeps,
};
