import { createServer } from "node:http";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Server } from "colyseus";
import express from "express";
import { PingRoom } from "./rooms/PingRoom.js";
import { registerMenuButton } from "./telegram.js";

const port = Number(process.env.PORT ?? 2567);

const app = express();
app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

const httpServer = createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define("ping", PingRoom);

httpServer.listen(port, () => {
  console.log(`server listening on ${port}`);
});

await registerMenuButton();
