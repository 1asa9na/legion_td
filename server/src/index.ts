import { createGameServer } from "./game.js";
import { registerMenuButton } from "./telegram.js";

const port = Number(process.env.PORT ?? 2567);
const { gameServer } = createGameServer();

if (!process.env.BOT_TOKEN) {
  console.log("match auth closed: BOT_TOKEN is empty");
}

await gameServer.listen(port);
console.log(`server listening on ${port}`);

await registerMenuButton();
