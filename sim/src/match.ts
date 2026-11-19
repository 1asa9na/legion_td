import {
  creeps as catalogCreeps,
  king as catalogKing,
  mech,
  waves as catalogWaves,
  type CombatStats,
  type Creep,
  type King,
  type Tower,
  type Wave,
} from "@legion/content";
import { averageDamage, shotDamage } from "./combat.js";
import { TICK_MS } from "./clock.js";
import {
  CELL_SIZE,
  LANE_SLOTS,
  LEFT_LANE,
  LEFT_NO_BOUNTY,
  OPENING_PREPARE_MS,
  SPAWN_HOLD_MS,
  canHit,
  distanceEntering,
  pathLength,
  pointAt,
  towerPosition,
  type Side,
  type Vec,
} from "./lane.js";

export const DEFAULT_STARTING_GOLD = 100;
export const DEFAULT_KING_HP = catalogKing.stats.hp;
export { OPENING_PREPARE_MS, SPAWN_HOLD_MS };

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
  | "slot"
  | "round";

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
  hp: number;
  maxHp: number;
  /** Built since the last round ended. Sells for the full list value. */
  fresh: boolean;
  /** A fighter was spawned for this building at the start of the round. */
  fighting: boolean;
}

export interface CreepState {
  id: number;
  creepId: string;
  hp: number;
  maxHp: number;
  armor: number;
  armorType: CombatStats["armorType"];
  attackType: CombatStats["attackType"];
  damage: number;
  cooldownMs: number;
  attackMs: number;
  range: number;
  acquire: number;
  collision: number;
  moveSpeed: number;
  bounty: number;
  distance: number;
  x: number;
  y: number;
  leaked: boolean;
}

export interface MatchState {
  tick: number;
  phase: Phase;
  outcome: Outcome;
  waveIndex: number;
  waveLevel: number;
  prepareMs: number;
  holdMs: number;
  gold: number;
  /** Persistent income. Sends and king upgrades raise it. Building a tower does not. */
  income: number;
  roundGold: number;
  kingHp: number;
  kingMaxHp: number;
  kingCooldownMs: number;
  towers: TowerState[];
  creeps: CreepState[];
  nextId: number;
}

export interface MatchOptions {
  towers?: readonly Tower[];
  creeps?: Readonly<Record<string, Creep>>;
  waves?: readonly Wave[];
  king?: King;
  startingGold?: number;
  openingPrepareMs?: number;
  slots?: number;
  cellSize?: number;
  path?: readonly Vec[];
}

interface MatchRules {
  towers: readonly Tower[];
  towerById: Map<string, Tower>;
  roots: Set<string>;
  creeps: Readonly<Record<string, Creep>>;
  waves: readonly Wave[];
  king: King;
  openingPrepareMs: number;
  slots: number;
  cellSize: number;
  path: readonly Vec[];
  length: number;
  noBountyAt: number;
  firstPrepare: boolean;
}

export interface Match {
  readonly rules: MatchRules;
  state: MatchState;
}

interface Fighter {
  id: number;
  x: number;
  y: number;
  hp: number;
  collision: number;
  acquire: number;
  range: number;
  attackType: CombatStats["attackType"];
  damage: number;
  armor: number;
  armorType: CombatStats["armorType"];
  attackMs: number;
  cooldownMs: number;
  kind: "tower" | "king";
}

export function createMatch(options: MatchOptions = {}): Match {
  const towers = options.towers ?? mech.towers;
  const creeps = options.creeps ?? catalogCreeps;
  const waves = options.waves ?? catalogWaves;
  const king = options.king ?? catalogKing;
  const path = options.path ?? LEFT_LANE;
  const towerById = new Map(towers.map((tower) => [tower.fighterId, tower]));
  const upgraded = new Set(towers.flatMap((tower) => tower.upgradesTo));
  for (const wave of waves) {
    if (!creeps[wave.creepId]) {
      throw new Error(`wave ${wave.level} references unknown creep ${wave.creepId}`);
    }
  }

  const match: Match = {
    rules: {
      towers,
      towerById,
      roots: new Set(towers.map((tower) => tower.fighterId).filter((id) => !upgraded.has(id))),
      creeps,
      waves,
      king,
      openingPrepareMs: options.openingPrepareMs ?? OPENING_PREPARE_MS,
      slots: options.slots ?? LANE_SLOTS,
      cellSize: options.cellSize ?? CELL_SIZE,
      path,
      length: pathLength(path),
      noBountyAt: distanceEntering(path, LEFT_NO_BOUNTY),
      firstPrepare: true,
    },
    state: {
      tick: 0,
      phase: "prepare",
      outcome: waves.length === 0 ? "cleared" : "playing",
      waveIndex: 0,
      waveLevel: waves[0]?.level ?? 0,
      prepareMs: 0,
      holdMs: 0,
      gold: options.startingGold ?? DEFAULT_STARTING_GOLD,
      income: 0,
      roundGold: waves[0]?.endRoundGold ?? 0,
      kingHp: king.stats.hp,
      kingMaxHp: king.stats.hp,
      kingCooldownMs: 0,
      towers: [],
      creeps: [],
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
  match.state.roundGold = wave.endRoundGold;
  match.state.prepareMs = match.rules.firstPrepare
    ? match.rules.openingPrepareMs
    : Math.round(wave.prepareSeconds * 1000);
  match.rules.firstPrepare = false;
  match.state.holdMs = 0;
  match.state.creeps = [];
  for (const tower of match.state.towers) {
    const definition = match.rules.towerById.get(tower.fighterId);
    tower.fighting = false;
    tower.hp = definition?.stats.hp ?? tower.maxHp;
    tower.cooldownMs = 0;
  }
}

function tickPrepare(match: Match): void {
  match.state.prepareMs -= TICK_MS;
  if (match.state.prepareMs > 0) return;
  match.state.prepareMs = 0;
  match.state.phase = "combat";
  match.state.holdMs = SPAWN_HOLD_MS;
  for (const tower of match.state.towers) {
    const definition = match.rules.towerById.get(tower.fighterId);
    if (!definition) continue;
    tower.fighting = true;
    tower.hp = definition.stats.hp;
    tower.maxHp = definition.stats.hp;
    tower.cooldownMs = 0;
  }
  spawnWave(match);
  tickCombat(match);
}

function tickCombat(match: Match): void {
  const { state } = match;
  const holding = state.holdMs > 0;
  if (holding) state.holdMs -= TICK_MS;

  resolveAttacks(match);

  const dead: CreepState[] = [];
  const living: CreepState[] = [];
  for (const creep of state.creeps) {
    if (creep.hp <= 0) dead.push(creep);
    else living.push(creep);
  }
  for (const creep of dead) {
    if (!creep.leaked) state.gold += creep.bounty;
  }
  state.creeps = living;
  if (state.outcome !== "playing") {
    state.creeps = [];
    return;
  }

  if (!holding) {
    for (const creep of state.creeps) {
      if (creepTargetInRange(match, creep)) continue;
      creep.distance = Math.min(match.rules.length, creep.distance + (creep.moveSpeed * TICK_MS) / 1000);
      placeCreep(match, creep);
    }
    separate(state.creeps);
    for (const creep of state.creeps) {
      placeCreep(match, creep);
      if (creep.distance >= match.rules.noBountyAt && match.rules.waves[state.waveIndex].count !== 1) {
        creep.leaked = true;
      }
    }
  }

  if (state.kingHp <= 0) {
    state.kingHp = 0;
    state.outcome = "defeated";
    state.creeps = [];
    return;
  }
  if (state.creeps.length > 0) return;

  state.gold += state.roundGold + state.income;
  for (const tower of state.towers) tower.fresh = false;
  const next = state.waveIndex + 1;
  if (next >= match.rules.waves.length) {
    state.outcome = "cleared";
    state.phase = "prepare";
    return;
  }
  state.waveIndex = next;
  beginPrepare(match);
}

function spawnWave(match: Match): void {
  const wave = match.rules.waves[match.state.waveIndex];
  const definition = match.rules.creeps[wave.creepId];
  for (let index = 0; index < wave.count; index += 1) {
    const creep: CreepState = {
      id: match.state.nextId,
      creepId: definition.id,
      hp: definition.stats.hp,
      maxHp: definition.stats.hp,
      armor: definition.stats.armor,
      armorType: definition.stats.armorType,
      attackType: definition.stats.attackType,
      damage: averageDamage(definition.stats.damageMin, definition.stats.damageMax),
      cooldownMs: 0,
      attackMs: Math.round(definition.stats.cooldown * 1000),
      range: definition.stats.range,
      acquire: definition.stats.acquire,
      collision: definition.stats.collision,
      moveSpeed: definition.stats.moveSpeed,
      bounty: wave.bounty,
      distance: 0,
      x: 0,
      y: 0,
      leaked: false,
    };
    match.state.nextId += 1;
    placeCreep(match, creep);
    match.state.creeps.push(creep);
  }
}

function placeCreep(match: Match, creep: CreepState): void {
  const point = pointAt(match.rules.path, creep.distance);
  creep.x = point.x;
  creep.y = point.y;
}

function separate(creeps: CreepState[]): void {
  const ordered = [...creeps].sort((a, b) => b.distance - a.distance || a.id - b.id);
  for (let index = 1; index < ordered.length; index += 1) {
    const front = ordered[index - 1];
    const back = ordered[index];
    const gap = front.distance - back.distance;
    const need = front.collision + back.collision;
    if (gap < need) back.distance -= need - gap;
    if (back.distance < 0) back.distance = 0;
  }
}

function resolveAttacks(match: Match): void {
  const fighters = livingFighters(match);
  for (const fighter of fighters) {
    fighter.cooldownMs -= TICK_MS;
    if (fighter.cooldownMs > 0) {
      storeCooldown(match, fighter);
      continue;
    }
    const target = nearestCreep(match, fighter);
    if (!target || !canHit(fighter.x, fighter.y, fighter.range, target.x, target.y, target.collision)) {
      fighter.cooldownMs = 0;
      storeCooldown(match, fighter);
      continue;
    }
    target.hp -= shotDamage(fighter.attackType, fighter.damage, target.armor, target.armorType);
    fighter.cooldownMs += fighter.attackMs;
    storeCooldown(match, fighter);
  }

  for (const creep of [...match.state.creeps].sort((a, b) => a.id - b.id)) {
    if (creep.hp <= 0) continue;
    creep.cooldownMs -= TICK_MS;
    if (creep.cooldownMs > 0) continue;
    const target = creepTarget(match, creep);
    if (!target || !canHit(creep.x, creep.y, creep.range, target.x, target.y, target.collision)) {
      if (creep.cooldownMs < 0) creep.cooldownMs = 0;
      continue;
    }
    const damage = shotDamage(creep.attackType, creep.damage, target.armor, target.armorType);
    if (target.kind === "king") {
      match.state.kingHp -= damage;
      if (match.state.kingHp <= 0) {
        match.state.kingHp = 0;
        match.state.outcome = "defeated";
      }
    } else {
      target.hp -= damage;
      const tower = match.state.towers.find((item) => item.id === target.id);
      if (tower) {
        tower.hp = target.hp;
        if (tower.hp <= 0) {
          tower.hp = 0;
          tower.fighting = false;
        }
      }
    }
    creep.cooldownMs += creep.attackMs;
    if (match.state.outcome !== "playing") return;
  }
}

function storeCooldown(match: Match, fighter: Fighter): void {
  if (fighter.kind === "king") {
    match.state.kingCooldownMs = fighter.cooldownMs;
    return;
  }
  const tower = match.state.towers.find((item) => item.id === fighter.id);
  if (tower) tower.cooldownMs = fighter.cooldownMs;
}

function livingFighters(match: Match): Fighter[] {
  const fighters: Fighter[] = [];
  for (const tower of match.state.towers) {
    if (!tower.fighting || tower.hp <= 0) continue;
    const definition = match.rules.towerById.get(tower.fighterId);
    if (!definition) continue;
    const at = towerPosition(match.rules.path, tower.slot, tower.side, match.rules.cellSize);
    fighters.push({
      id: tower.id,
      x: at.x,
      y: at.y,
      hp: tower.hp,
      collision: definition.stats.collision,
      acquire: definition.stats.acquire,
      range: definition.stats.range,
      attackType: definition.stats.attackType,
      damage: averageDamage(definition.stats.damageMin, definition.stats.damageMax),
      armor: definition.stats.armor,
      armorType: definition.stats.armorType,
      attackMs: Math.round(definition.stats.cooldown * 1000),
      cooldownMs: tower.cooldownMs,
      kind: "tower",
    });
  }
  fighters.sort((a, b) => a.id - b.id);
  const kingAt = pointAt(match.rules.path, match.rules.length);
  const king = match.rules.king.stats;
  fighters.push({
    id: 0,
    x: kingAt.x,
    y: kingAt.y,
    hp: match.state.kingHp,
    collision: king.collision,
    acquire: king.acquire,
    range: king.range,
    attackType: king.attackType,
    damage: averageDamage(king.damageMin, king.damageMax),
    armor: king.armor,
    armorType: king.armorType,
    attackMs: Math.round(king.cooldown * 1000),
    cooldownMs: match.state.kingCooldownMs,
    kind: "king",
  });
  return fighters;
}

function nearestCreep(match: Match, fighter: Fighter): CreepState | undefined {
  let best: CreepState | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const creep of match.state.creeps) {
    if (creep.hp <= 0) continue;
    if (!canHit(fighter.x, fighter.y, fighter.acquire, creep.x, creep.y, creep.collision)) continue;
    const dx = fighter.x - creep.x;
    const dy = fighter.y - creep.y;
    const distance = dx * dx + dy * dy;
    if (best === undefined || distance < bestDistance || (distance === bestDistance && creep.id < best.id)) {
      best = creep;
      bestDistance = distance;
    }
  }
  return best;
}

function creepTarget(match: Match, creep: CreepState): Fighter | undefined {
  let best: Fighter | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const fighter of livingFighters(match)) {
    if (!canHit(creep.x, creep.y, creep.acquire, fighter.x, fighter.y, fighter.collision)) continue;
    const dx = creep.x - fighter.x;
    const dy = creep.y - fighter.y;
    const distance = dx * dx + dy * dy;
    if (best === undefined || distance < bestDistance || (distance === bestDistance && fighter.id < best.id)) {
      best = fighter;
      bestDistance = distance;
    }
  }
  return best;
}

function creepTargetInRange(match: Match, creep: CreepState): boolean {
  const target = creepTarget(match, creep);
  return target !== undefined && canHit(creep.x, creep.y, creep.range, target.x, target.y, target.collision);
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
  match.state.towers.push({
    id,
    fighterId,
    slot,
    side,
    cooldownMs: 0,
    hp: definition.stats.hp,
    maxHp: definition.stats.hp,
    fresh: true,
    fighting: false,
  });
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
  tower.hp = next.stats.hp;
  tower.maxHp = next.stats.hp;
  tower.cooldownMs = 0;
  return { ok: true, id };
}

function sellTower(match: Match, id: number): CommandReport {
  if (match.state.phase === "combat") return { ok: false, reason: "round" };
  const index = match.state.towers.findIndex((item) => item.id === id);
  if (index < 0) return { ok: false, reason: "missing" };
  const tower = match.state.towers[index];
  const definition = match.rules.towerById.get(tower.fighterId);
  if (!definition) return { ok: false, reason: "unknown" };
  match.state.gold += tower.fresh ? definition.value : definition.sellGold;
  match.state.towers.splice(index, 1);
  return { ok: true, id };
}

function validSlot(match: Match, slot: number, side: Side): boolean {
  return Number.isInteger(slot) && slot >= 0 && slot < match.rules.slots && (side === "north" || side === "south");
}

function occupied(match: Match, slot: number, side: Side): boolean {
  return match.state.towers.some((tower) => tower.slot === slot && tower.side === side);
}
