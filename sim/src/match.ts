import {
  creeps as catalogCreeps,
  mech,
  waves as catalogWaves,
  type ArmorType,
  type Creep,
  type Tower,
  type Wave,
} from "@legion/content";
import { averageDamage, shotDamage } from "./combat.js";
import {
  CELL_SIZE,
  DEFAULT_CREEP_SPEED,
  LANE_SLOTS,
  SPAWN_INTERVAL_MS,
  inRange,
  pathLength,
  towerPosition,
  type Side,
} from "./lane.js";
import { TICK_MS } from "./clock.js";

export const DEFAULT_STARTING_GOLD = 100;
export const DEFAULT_KING_HP = 1000;

export type Phase = "prepare" | "combat";
export type Outcome = "playing" | "defeated" | "cleared";

export type Command =
  | { type: "build"; fighterId: string; slot: number; side: Side }
  | { type: "upgrade"; id: number; fighterId: string }
  | { type: "sell"; id: number };

export type CommandFailure =
  | "ended"
  | "gold"
  | "occupied"
  | "unknown"
  | "root"
  | "path"
  | "missing"
  | "slot";

export interface CommandReport {
  ok: boolean;
  reason?: CommandFailure;
  id?: number;
}

export interface TowerState {
  id: number;
  fighterId: string;
  slot: number;
  side: Side;
  cooldownMs: number;
}

export interface CreepState {
  id: number;
  creepId: string;
  hp: number;
  maxHp: number;
  armor: number;
  armorType: ArmorType;
  bounty: number;
  position: number;
}

export interface MatchState {
  tick: number;
  phase: Phase;
  outcome: Outcome;
  waveIndex: number;
  waveLevel: number;
  prepareMs: number;
  gold: number;
  income: number;
  kingHp: number;
  kingMaxHp: number;
  towers: TowerState[];
  creeps: CreepState[];
  spawnLeft: number;
  spawnMs: number;
  nextId: number;
}

export interface MatchOptions {
  towers?: readonly Tower[];
  creeps?: Readonly<Record<string, Creep>>;
  waves?: readonly Wave[];
  startingGold?: number;
  kingHp?: number;
  creepSpeed?: number;
  slots?: number;
  cellSize?: number;
}

interface MatchRules {
  towers: readonly Tower[];
  towerById: Map<string, Tower>;
  roots: Set<string>;
  creeps: Readonly<Record<string, Creep>>;
  waves: readonly Wave[];
  creepSpeed: number;
  slots: number;
  cellSize: number;
}

export interface Match {
  readonly rules: MatchRules;
  state: MatchState;
}

export function createMatch(options: MatchOptions = {}): Match {
  const towers = options.towers ?? mech.towers;
  const creeps = options.creeps ?? catalogCreeps;
  const waves = options.waves ?? catalogWaves;
  const towerById = new Map(towers.map((tower) => [tower.fighterId, tower]));
  const upgraded = new Set(towers.flatMap((tower) => tower.upgradesTo));
  for (const wave of waves) {
    if (!creeps[wave.creepId]) {
      throw new Error(`wave ${wave.level} references unknown creep ${wave.creepId}`);
    }
  }

  const kingHp = options.kingHp ?? DEFAULT_KING_HP;
  const match: Match = {
    rules: {
      towers,
      towerById,
      roots: new Set(towers.map((tower) => tower.fighterId).filter((id) => !upgraded.has(id))),
      creeps,
      waves,
      creepSpeed: options.creepSpeed ?? DEFAULT_CREEP_SPEED,
      slots: options.slots ?? LANE_SLOTS,
      cellSize: options.cellSize ?? CELL_SIZE,
    },
    state: {
      tick: 0,
      phase: "prepare",
      outcome: waves.length === 0 ? "cleared" : "playing",
      waveIndex: 0,
      waveLevel: waves[0]?.level ?? 0,
      prepareMs: 0,
      gold: options.startingGold ?? DEFAULT_STARTING_GOLD,
      income: waves[0]?.endRoundGold ?? 0,
      kingHp,
      kingMaxHp: kingHp,
      towers: [],
      creeps: [],
      spawnLeft: 0,
      spawnMs: 0,
      nextId: 1,
    },
  };
  if (match.state.outcome === "playing") beginPrepare(match);
  return match;
}

export function step(match: Match, commands: readonly Command[] = []): CommandReport[] {
  if (match.state.outcome !== "playing") {
    return commands.map(() => ({ ok: false, reason: "ended" as const }));
  }
  const reports = commands.map((command) => applyCommand(match, command));
  if (match.state.phase === "prepare") tickPrepare(match);
  else tickCombat(match);
  match.state.tick += 1;
  return reports;
}

function beginPrepare(match: Match): void {
  const wave = match.rules.waves[match.state.waveIndex];
  match.state.phase = "prepare";
  match.state.waveLevel = wave.level;
  match.state.prepareMs = Math.round(wave.prepareSeconds * 1000);
  match.state.income = wave.endRoundGold;
  match.state.spawnLeft = 0;
  match.state.spawnMs = 0;
  match.state.creeps = [];
}

function beginCombat(match: Match): void {
  const wave = match.rules.waves[match.state.waveIndex];
  match.state.phase = "combat";
  match.state.prepareMs = 0;
  match.state.spawnLeft = wave.count;
  match.state.spawnMs = 0;
  match.state.income = wave.endRoundGold;
}

function tickPrepare(match: Match): void {
  match.state.prepareMs -= TICK_MS;
  if (match.state.prepareMs > 0) return;
  match.state.prepareMs = 0;
  beginCombat(match);
  tickCombat(match);
}

function tickCombat(match: Match): void {
  const { state, rules } = match;
  const wave = rules.waves[state.waveIndex];

  state.spawnMs -= TICK_MS;
  if (state.spawnLeft > 0 && state.spawnMs <= 0) {
    spawnCreep(match, wave);
    state.spawnLeft -= 1;
    state.spawnMs += SPAWN_INTERVAL_MS;
  }

  const towers = [...state.towers].sort((a, b) => a.id - b.id);
  for (const tower of towers) {
    const definition = rules.towerById.get(tower.fighterId);
    if (!definition) continue;
    tower.cooldownMs -= TICK_MS;
    if (tower.cooldownMs > 0) continue;
    const target = pickTarget(match, tower, definition);
    if (!target) {
      if (tower.cooldownMs < 0) tower.cooldownMs = 0;
      continue;
    }
    target.hp -= shotDamage(
      definition.stats.attackType,
      averageDamage(definition.stats.damageMin, definition.stats.damageMax),
      target.armor,
      target.armorType,
    );
    tower.cooldownMs += Math.round(definition.stats.cooldown * 1000);
  }

  const alive: CreepState[] = [];
  for (const creep of state.creeps) {
    if (creep.hp <= 0) {
      state.gold += creep.bounty;
      continue;
    }
    alive.push(creep);
  }
  state.creeps = alive;

  const end = pathLength(rules.slots, rules.cellSize);
  const walking: CreepState[] = [];
  const stepUnits = (rules.creepSpeed * TICK_MS) / 1000;
  for (const creep of state.creeps) {
    creep.position += stepUnits;
    if (creep.position < end) {
      walking.push(creep);
      continue;
    }
    state.kingHp -= creep.hp;
    if (state.kingHp <= 0) {
      state.kingHp = 0;
      state.outcome = "defeated";
      state.creeps = [];
      return;
    }
  }
  state.creeps = walking;

  if (state.spawnLeft > 0 || state.creeps.length > 0) return;

  state.gold += wave.endRoundGold;
  const next = state.waveIndex + 1;
  if (next >= rules.waves.length) {
    state.outcome = "cleared";
    return;
  }
  state.waveIndex = next;
  beginPrepare(match);
}

function spawnCreep(match: Match, wave: Wave): void {
  const creep = match.rules.creeps[wave.creepId];
  match.state.creeps.push({
    id: match.state.nextId,
    creepId: creep.id,
    hp: creep.stats.hp,
    maxHp: creep.stats.hp,
    armor: creep.stats.armor,
    armorType: creep.stats.armorType,
    bounty: wave.bounty,
    position: 0,
  });
  match.state.nextId += 1;
}

function pickTarget(match: Match, tower: TowerState, definition: Tower): CreepState | undefined {
  const origin = towerPosition(tower.slot, tower.side, match.rules.cellSize);
  let best: CreepState | undefined;
  for (const creep of match.state.creeps) {
    if (creep.hp <= 0) continue;
    if (!inRange(origin.x, origin.y, creep.position, definition.stats.range)) continue;
    if (
      best === undefined ||
      creep.position > best.position ||
      (creep.position === best.position && creep.id < best.id)
    ) {
      best = creep;
    }
  }
  return best;
}

function applyCommand(match: Match, command: Command): CommandReport {
  switch (command.type) {
    case "build":
      return buildTower(match, command.fighterId, command.slot, command.side);
    case "upgrade":
      return upgradeTower(match, command.id, command.fighterId);
    case "sell":
      return sellTower(match, command.id);
  }
}

function buildTower(match: Match, fighterId: string, slot: number, side: Side): CommandReport {
  const definition = match.rules.towerById.get(fighterId);
  if (!definition) return { ok: false, reason: "unknown" };
  if (!match.rules.roots.has(fighterId)) return { ok: false, reason: "root" };
  if (!validSlot(match, slot, side)) return { ok: false, reason: "slot" };
  if (occupied(match, slot, side)) return { ok: false, reason: "occupied" };
  if (match.state.gold < definition.goldCost) return { ok: false, reason: "gold" };

  match.state.gold -= definition.goldCost;
  const id = match.state.nextId;
  match.state.nextId += 1;
  match.state.towers.push({ id, fighterId, slot, side, cooldownMs: 0 });
  return { ok: true, id };
}

function upgradeTower(match: Match, id: number, fighterId: string): CommandReport {
  const tower = match.state.towers.find((item) => item.id === id);
  if (!tower) return { ok: false, reason: "missing" };
  const next = match.rules.towerById.get(fighterId);
  const current = match.rules.towerById.get(tower.fighterId);
  if (!next || !current) return { ok: false, reason: "unknown" };
  if (!current.upgradesTo.includes(fighterId)) return { ok: false, reason: "path" };
  if (match.state.gold < next.goldCost) return { ok: false, reason: "gold" };

  match.state.gold -= next.goldCost;
  tower.fighterId = fighterId;
  tower.cooldownMs = 0;
  return { ok: true, id };
}

function sellTower(match: Match, id: number): CommandReport {
  const index = match.state.towers.findIndex((item) => item.id === id);
  if (index < 0) return { ok: false, reason: "missing" };
  const definition = match.rules.towerById.get(match.state.towers[index].fighterId);
  if (!definition) return { ok: false, reason: "unknown" };
  match.state.gold += definition.sellGold;
  match.state.towers.splice(index, 1);
  return { ok: true, id };
}

function validSlot(match: Match, slot: number, side: Side): boolean {
  return Number.isInteger(slot) && slot >= 0 && slot < match.rules.slots && (side === "north" || side === "south");
}

function occupied(match: Match, slot: number, side: Side): boolean {
  return match.state.towers.some((tower) => tower.slot === slot && tower.side === side);
}
