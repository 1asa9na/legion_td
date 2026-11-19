export type AttackType =
  | "pierce"
  | "normal"
  | "magic"
  | "siege"
  | "chaos"
  | "hero"
  | "spells";

export type ArmorType =
  | "light"
  | "medium"
  | "heavy"
  | "fortified"
  | "unarmored"
  | "hero"
  | "divine";

export interface CombatStats {
  hp: number;
  armor: number;
  armorType: ArmorType;
  attackType: AttackType;
  damageMin: number;
  damageMax: number;
  cooldown: number;
  range: number;
}

export interface Tower {
  buildingId: string;
  fighterId: string;
  name: string;
  goldCost: number;
  value: number;
  sellGold: number;
  food: number;
  upgradesTo: string[];
  stats: CombatStats;
}

export interface Creep {
  id: string;
  name: string;
  stats: CombatStats;
}

export interface Wave {
  level: number;
  creepId: string;
  count: number;
  bounty: number;
  prepareSeconds: number;
  endRoundGold: number;
  attackType: AttackType;
  armorType: ArmorType;
  boss: boolean;
  air: boolean;
  ranged: boolean;
}

export interface BonusWave {
  level: number;
  creepId: string;
  count: number;
  bounty: number;
  attackType: AttackType;
  armorType: ArmorType;
}

export interface CatalogData {
  builderId: string;
  sellPercent: number;
  towers: Tower[];
  creeps: Record<string, Creep>;
  waves: Wave[];
  bonus: BonusWave;
}
