export const CELL_SIZE = 64;
export const LANE_SLOTS = 12;

/** Start Game hardcodes the first wait. Later rounds use the wave table. */
export const OPENING_PREPARE_MS = 90_000;

/** Spawn Creeps sets move speed to 0, then restores it after 2 seconds. */
export const SPAWN_HOLD_MS = 2_000;

export type Side = "north" | "south";

export interface Vec {
  x: number;
  y: number;
}

export interface Rect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Spawn rect 1, the west corridor, the left no-bounty gate, and the left king. */
export const LEFT_LANE: readonly Vec[] = [
  { x: -5696, y: 6080 },
  { x: -5696, y: 2784 },
  { x: -3536, y: 2256 },
  { x: -3520, y: -3264 },
];

export const LEFT_NO_BOUNTY: Rect = { minX: -3968, minY: 1088, maxX: -3104, maxY: 3424 };

export function segmentLengths(path: readonly Vec[]): number[] {
  const lengths: number[] = [];
  for (let index = 1; index < path.length; index += 1) {
    lengths.push(Math.hypot(path[index].x - path[index - 1].x, path[index].y - path[index - 1].y));
  }
  return lengths;
}

export function pathLength(path: readonly Vec[]): number {
  return segmentLengths(path).reduce((sum, length) => sum + length, 0);
}

export function pointAt(path: readonly Vec[], distance: number): Vec {
  if (path.length === 0) return { x: 0, y: 0 };
  if (distance <= 0) return { x: path[0].x, y: path[0].y };
  let left = distance;
  for (let index = 1; index < path.length; index += 1) {
    const from = path[index - 1];
    const to = path[index];
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (left <= length || index === path.length - 1) {
      const span = length === 0 ? 0 : Math.min(left, length) / length;
      return { x: from.x + (to.x - from.x) * span, y: from.y + (to.y - from.y) * span };
    }
    left -= length;
  }
  const end = path[path.length - 1];
  return { x: end.x, y: end.y };
}

export function insideRect(point: Vec, rect: Rect): boolean {
  return point.x >= rect.minX && point.x <= rect.maxX && point.y >= rect.minY && point.y <= rect.maxY;
}

/** Distance along the path where a creep first enters the no-bounty rect. */
export function distanceEntering(path: readonly Vec[], rect: Rect): number {
  const total = pathLength(path);
  const step = 1;
  for (let distance = 0; distance <= total; distance += step) {
    if (insideRect(pointAt(path, distance), rect)) return distance;
  }
  return total;
}

/** Build cell beside the path. North is the left of the walking direction. */
export function towerPosition(
  path: readonly Vec[],
  slot: number,
  side: Side,
  cellSize = CELL_SIZE,
): Vec {
  const distance = slot * cellSize + cellSize / 2;
  const here = pointAt(path, distance);
  const ahead = pointAt(path, distance + 1);
  const dx = ahead.x - here.x;
  const dy = ahead.y - here.y;
  const length = Math.hypot(dx, dy) || 1;
  const sign = side === "north" ? 1 : -1;
  return {
    x: here.x + (-dy / length) * cellSize * sign,
    y: here.y + (dx / length) * cellSize * sign,
  };
}

/** Warcraft attacks connect at weapon range plus the target's collision size. */
export function canHit(
  fromX: number,
  fromY: number,
  weaponRange: number,
  toX: number,
  toY: number,
  targetCollision: number,
): boolean {
  const dx = fromX - toX;
  const dy = fromY - toY;
  const reach = weaponRange + targetCollision;
  return dx * dx + dy * dy <= reach * reach;
}
