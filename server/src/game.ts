import { createServer } from "node:http";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Server } from "colyseus";
import express from "express";
import { MatchRoom } from "./rooms/MatchRoom.js";

export function createGameServer(gracefullyShutdown = true) {
  const app = express();
  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  const httpServer = createServer(app);
  const gameServer = new Server({
    greet: false,
    gracefullyShutdown,
    transport: new WebSocketTransport({ server: httpServer }),
  });
  gameServer.define("match", MatchRoom);
  return { httpServer, gameServer };
}
