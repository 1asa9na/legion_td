import { Application, Graphics } from "pixi.js";

export async function mountLane(host: HTMLElement): Promise<() => void> {
  const app = new Application();
  await app.init({
    background: "#14160f",
    resizeTo: host,
    antialias: true,
  });
  host.replaceChildren(app.canvas);

  const lane = new Graphics();
  app.stage.addChild(lane);

  const draw = () => {
    const width = app.screen.width;
    const height = app.screen.height;
    const laneWidth = Math.min(280, width * 0.72);
    const x = (width - laneWidth) / 2;
    const top = 24;
    const bottom = height - 24;
    lane.clear();
    lane.roundRect(x, top, laneWidth, bottom - top, 18).fill({ color: 0x2c3826 });
    lane.roundRect(x + 16, bottom - 96, laneWidth - 32, 72, 12).fill({ color: 0x46583c });
  };

  draw();
  app.renderer.on("resize", draw);

  return () => {
    app.renderer.off("resize", draw);
    app.destroy(true);
  };
}
