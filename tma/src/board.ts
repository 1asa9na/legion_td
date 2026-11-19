import { mech, type Tower } from "@legion/content";
import { CELL_SIZE, LANE_SLOTS, LEFT_LANE, towerPosition, type Side } from "@legion/sim";

export interface Point {
  x: number;
  y: number;
}

export const TOKEN_PX = 44;
export const VIEW_PAD = 16;

export interface Cell {
  slot: number;
  side: Side;
}

export interface Frame {
  scale: number;
  minX: number;
  maxY: number;
  pad: number;
}

export interface SendLock {
  key: string;
  tick: number;
}

/** Fit the lane, plus one cell of margin, into the canvas. World y grows upward. */
export function fitLane(
  width: number,
  height: number,
  path: readonly Point[] = LEFT_LANE,
  cellSize = CELL_SIZE,
  pad = VIEW_PAD,
): Frame {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of path) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  minX -= cellSize;
  minY -= cellSize;
  maxX += cellSize;
  maxY += cellSize;
  const worldW = Math.max(maxX - minX, 1);
  const worldH = Math.max(maxY - minY, 1);
  const scale = Math.min((width - pad * 2) / worldW, (height - pad * 2) / worldH);
  return { scale, minX, maxY, pad };
}

export function project(frame: Frame, point: Point): Point {
  return {
    x: frame.pad + (point.x - frame.minX) * frame.scale,
    y: frame.pad + (frame.maxY - point.y) * frame.scale,
  };
}

export function rootTowers(towers: readonly Tower[] = mech.towers): Tower[] {
  const upgraded = new Set(towers.flatMap((tower) => tower.upgradesTo));
  return towers.filter((tower) => !upgraded.has(tower.fighterId));
}

export function towerByFighter(fighterId: string, towers: readonly Tower[] = mech.towers): Tower | undefined {
  return towers.find((tower) => tower.fighterId === fighterId);
}

export function chainRoot(fighterId: string, towers: readonly Tower[] = mech.towers): Tower | undefined {
  const parent = new Map<string, Tower>();
  for (const tower of towers) {
    for (const next of tower.upgradesTo) parent.set(next, tower);
  }
  let current = towerByFighter(fighterId, towers);
  const seen = new Set<string>();
  while (current && parent.has(current.fighterId) && !seen.has(current.fighterId)) {
    seen.add(current.fighterId);
    current = parent.get(current.fighterId);
  }
  return current;
}

const CHAIN_COLOR: Record<string, number> = {
  Peewee: 0xd8c39a,
  Infantry: 0x8aa0b4,
  Captain: 0x6ea86a,
  Tempest: 0xe08a3c,
  Cyborg: 0x8a6bb5,
  Neotank: 0xb5523a,
};

export function chainColor(fighterId: string, towers: readonly Tower[] = mech.towers): number {
  const root = chainRoot(fighterId, towers);
  return CHAIN_COLOR[root?.name ?? ""] ?? 0xe7e4d8;
}

/** Full list value while the tower is fresh, half after a round. Nothing during combat. */
export function sellPayout(value: number, sellGold: number, fresh: boolean, phase: "prepare" | "combat"): number | null {
  if (phase === "combat") return null;
  return fresh ? value : sellGold;
}

export function buildCommand(fighterId: string, slot: number, side: Side) {
  return { type: "build" as const, fighterId, slot, side };
}

export function prepareSeconds(prepareMs: number): number {
  return Math.ceil(prepareMs / 1000);
}

export function refusalText(reason: string | undefined): string {
  switch (reason) {
    case "gold":
      return "не хватает золота";
    case "occupied":
      return "клетка занята";
    case "root":
      return "сначала базовая башня";
    case "path":
      return "нет такого апгрейда";
    case "round":
      return "продажа после волны";
    case "ended":
      return "матч закончен";
    default:
      return "не вышло";
  }
}

export function cells(path: readonly Point[] = LEFT_LANE, slots = LANE_SLOTS, cellSize = CELL_SIZE): { cell: Cell; at: Point }[] {
  const placed: { cell: Cell; at: Point }[] = [];
  for (let slot = 0; slot < slots; slot += 1) {
    for (const side of ["north", "south"] as const) {
      placed.push({ cell: { slot, side }, at: towerPosition(path, slot, side, cellSize) });
    }
  }
  return placed;
}

export function nearestCell(x: number, y: number, frame: Frame, path: readonly Point[] = LEFT_LANE): Cell {
  const placed = cells(path);
  let best = placed[0];
  let bestDistance = Infinity;
  for (const item of placed) {
    const screen = project(frame, item.at);
    const dx = screen.x - x;
    const dy = screen.y - y;
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      best = item;
      bestDistance = distance;
    }
  }
  return best.cell;
}

/** Same button stays quiet until the report or a later snapshot. A different button may go out. */
export function lockSend(lock: SendLock | null, key: string, tick: number): SendLock | null {
  if (lock?.key === key) return null;
  return { key, tick };
}

export function unlockSend(lock: SendLock | null, stateTick: number | null, report: boolean): SendLock | null {
  if (!lock) return null;
  if (report || (stateTick !== null && stateTick > lock.tick)) return null;
  return lock;
}
