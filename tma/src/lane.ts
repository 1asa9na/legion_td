import { Application, Graphics } from "pixi.js";
import { LEFT_LANE, type MatchState } from "@legion/sim";
import {
  TOKEN_PX,
  cells,
  chainColor,
  fitLane,
  nearestCell,
  project,
  type Cell,
} from "./board";

const PATH = 0x2c3826;
const EMPTY = 0x46583c;
const INK = 0xe7e4d8;
const KING = 0xe2c14a;
const CREEP = 0xf4f1e6;
const BAR = 0xc8d4a4;
const BAR_BACK = 0x2a2c24;

export interface LanePicture {
  draw(snapshot: MatchState, selected: Cell | null): void;
  destroy(): void;
}

/** Draw the left lane from a snapshot. Taps pick the nearest build cell. */
export async function mountLane(host: HTMLElement, onPick: (cell: Cell) => void): Promise<LanePicture> {
  const app = new Application();
  await app.init({
    background: "#14160f",
    resizeTo: host,
    antialias: true,
  });
  host.replaceChildren(app.canvas);

  const layer = new Graphics();
  app.stage.addChild(layer);
  let snapshot: MatchState | null = null;
  let selected: Cell | null = null;

  const redraw = () => {
    layer.clear();
    const frame = fitLane(app.screen.width, app.screen.height);
    const path = LEFT_LANE.map((point) => project(frame, point));
    if (path.length > 0) {
      layer.moveTo(path[0].x, path[0].y);
      for (const point of path.slice(1)) layer.lineTo(point.x, point.y);
      layer.stroke({ width: 28, color: PATH, cap: "round", join: "round" });
    }

    if (!snapshot) return;
    for (const placed of cells()) {
      const screen = project(frame, placed.at);
      const tower = snapshot.towers.find(
        (item) => item.slot === placed.cell.slot && item.side === placed.cell.side,
      );
      const chosen = selected?.slot === placed.cell.slot && selected.side === placed.cell.side;
      if (!tower) {
        layer.circle(screen.x, screen.y, TOKEN_PX / 2).stroke({ width: chosen ? 3 : 1.5, color: chosen ? INK : EMPTY });
        continue;
      }
      layer
        .circle(screen.x, screen.y, TOKEN_PX / 2)
        .fill({ color: chainColor(tower.fighterId), alpha: tower.fighting ? 1 : 0.4 });
      if (chosen) layer.circle(screen.x, screen.y, TOKEN_PX / 2 + 3).stroke({ width: 2, color: INK });
      bar(layer, screen.x, screen.y, tower.hp / tower.maxHp);
    }

    for (const creep of snapshot.creeps) {
      const screen = project(frame, creep);
      layer.circle(screen.x, screen.y, 7).fill({ color: CREEP });
      bar(layer, screen.x, screen.y, creep.hp / creep.maxHp, 16);
    }

    const kingAt = project(frame, LEFT_LANE[LEFT_LANE.length - 1]);
    layer.circle(kingAt.x, kingAt.y, TOKEN_PX / 2).fill({ color: KING });
    bar(layer, kingAt.x, kingAt.y, snapshot.kingHp / snapshot.kingMaxHp);
  };

  const pick = (event: PointerEvent) => {
    const rect = app.canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * app.screen.width;
    const y = ((event.clientY - rect.top) / rect.height) * app.screen.height;
    onPick(nearestCell(x, y, fitLane(app.screen.width, app.screen.height)));
  };

  redraw();
  app.renderer.on("resize", redraw);
  app.canvas.addEventListener("pointerdown", pick);

  return {
    draw(next, cell) {
      snapshot = next;
      selected = cell;
      redraw();
    },
    destroy() {
      app.renderer.off("resize", redraw);
      app.canvas.removeEventListener("pointerdown", pick);
      app.destroy(true);
    },
  };
}

function bar(layer: Graphics, x: number, y: number, ratio: number, width = TOKEN_PX): void {
  const clamped = Math.max(0, Math.min(1, ratio));
  const top = y - TOKEN_PX / 2 - 8;
  layer.rect(x - width / 2, top, width, 4).fill({ color: BAR_BACK });
  layer.rect(x - width / 2, top, width * clamped, 4).fill({ color: BAR });
}
