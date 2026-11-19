export { SIM_TICK_HZ, TICK_MS } from "./clock.js";
export { ARMOR_CONSTANT, armorMultiplier, averageDamage, shotDamage } from "./combat.js";
export {
  CELL_SIZE,
  DEFAULT_CREEP_SPEED,
  LANE_SLOTS,
  SPAWN_INTERVAL_MS,
  inRange,
  pathLength,
  towerPosition,
} from "./lane.js";
export type { Side } from "./lane.js";
export {
  DEFAULT_KING_HP,
  DEFAULT_STARTING_GOLD,
  createMatch,
  step,
} from "./match.js";
export type {
  Command,
  CommandFailure,
  CommandReport,
  CreepState,
  Match,
  MatchOptions,
  MatchState,
  Outcome,
  Phase,
  TowerState,
} from "./match.js";
