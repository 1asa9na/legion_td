import type { ArmorType, AttackType } from "./types.js";

/**
 * Column order of DamageBonus* in war3mapMisc.txt:
 * light, medium, heavy, fortified, normal, hero, divine, unarmored.
 * In this map the normal column is a copy of fortified.
 */
export const ARMOR_COLUMN: Record<ArmorType, number> = {
  light: 0,
  medium: 1,
  heavy: 2,
  fortified: 3,
  hero: 5,
  divine: 6,
  unarmored: 7,
};

export const damageBonus: Record<AttackType, readonly number[]> = {
  pierce: [1.3, 0.8, 0.9, 0.7, 0.7, 1, 1, 1],
  normal: [0.9, 1.2, 0.9, 0.8, 0.8, 1, 1, 1],
  magic: [1.1, 0.8, 1.2, 0.7, 0.7, 1, 1, 1],
  siege: [0.9, 0.9, 0.9, 1.25, 1.25, 1, 1, 1],
  chaos: [1, 1, 1, 1, 1, 1, 1, 1],
  spells: [1, 1, 1, 1, 1, 1, 1, 1],
  hero: [1, 1, 1, 1, 1, 1, 0.35, 1],
};

export function damageMultiplier(attack: AttackType, armor: ArmorType): number {
  return damageBonus[attack][ARMOR_COLUMN[armor]];
}
