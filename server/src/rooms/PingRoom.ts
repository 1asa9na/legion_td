import { Room, type Client } from "colyseus";

export class PingRoom extends Room {
  override onCreate(): void {
    this.maxClients = 2;
  }

  override onJoin(client: Client): void {
    client.send("ready", { ok: true });
  }
}
