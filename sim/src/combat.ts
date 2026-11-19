import { damageMultiplier, type ArmorType, type AttackType } from "@legion/content";

/** Warcraft III melee armor constant. Each point of armor is worth this before diminishing returns. */
export const ARMOR_CONSTANT = 0.06;

/**
 * Fraction of typed damage that gets through the armor value.
 * Non-negative armor: 1 - (a * c) / (1 + c * a).
 * Negative armor: 2 - (1 - c) ^ |a|.
 */
export function armorMultiplier(armor: number): number {
  if (armor >= 0) {
    return 1 - (armor * ARMOR_CONSTANT) / (1 + ARMOR_CONSTANT * armor);
  }
  return 2 - (1 - ARMOR_CONSTANT) ** -armor;
}

/** Mean of the damage range. The sim does not roll dice, so a replay stays fixed. */
export function averageDamage(min: number, max: number): number {
  return (min + max) / 2;
}

/**
 * One tower shot.
 * Attack type against armor type comes from the catalog table.
 * Armor value then reduces the result, except for spell damage, which ignores it.
 */
export function shotDamage(
  attack: AttackType,
  damage: number,
  armor: number,
  armorType: ArmorType,
): number {
  const typed = damage * damageMultiplier(attack, armorType);
  if (attack === "spells") return typed;
  return typed * armorMultiplier(armor);
}
