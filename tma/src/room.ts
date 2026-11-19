import type { Command, MatchState } from "@legion/sim";
import { Client, type Room } from "colyseus.js";

export interface RoomReport {
  ok: boolean;
  reason?: string;
  id?: number;
}

export interface MatchConnection {
  leave(): void;
  snapshot(): MatchState | undefined;
  send(command: Command): void;
  onState(listener: (state: MatchState) => void): () => void;
  onReport(listener: (report: RoomReport) => void): () => void;
}

/** Join the solo match. Dev talks to the game port; the deployed page uses its own origin. */
export async function joinMatch(initData: string): Promise<MatchConnection> {
  const endpoint = import.meta.env.DEV ? "http://127.0.0.1:2567" : window.location.origin;
  const client = new Client(endpoint);
  const room: Room = await client.joinOrCreate("match", { initData });
  let latest: MatchState | undefined;
  const states = new Set<(state: MatchState) => void>();
  const reports = new Set<(report: RoomReport) => void>();
  room.onMessage("state", (state: MatchState) => {
    latest = state;
    for (const listener of states) listener(state);
  });
  room.onMessage("report", (report: RoomReport) => {
    for (const listener of reports) listener(report);
  });
  return {
    snapshot: () => latest,
    send(command) {
      room.send("command", command);
    },
    onState(listener) {
      states.add(listener);
      return () => states.delete(listener);
    },
    onReport(listener) {
      reports.add(listener);
      return () => reports.delete(listener);
    },
    leave() {
      void room.leave();
    },
  };
}
