export const CELL_SIZE = 64;
export const LANE_SLOTS = 12;
export const DEFAULT_CREEP_SPEED = 200;
export const SPAWN_INTERVAL_MS = 500;

export type Side = "north" | "south";

export function pathLength(slots: number, cellSize = CELL_SIZE): number {
  return slots * cellSize;
}

/** Tower center, one cell off the path. The path itself runs along y = 0. */
export function towerPosition(
  slot: number,
  side: Side,
  cellSize = CELL_SIZE,
): { x: number; y: number } {
  return {
    x: slot * cellSize + cellSize / 2,
    y: side === "north" ? cellSize : -cellSize,
  };
}

export function inRange(
  originX: number,
  originY: number,
  creepX: number,
  range: number,
): boolean {
  const dx = originX - creepX;
  const dy = originY;
  return dx * dx + dy * dy <= range * range;
}
