import { Client, type Room } from "colyseus.js";

export interface MatchConnection {
  leave(): void;
  snapshot(): unknown;
}

/** Join the solo match. Dev talks to the game port; the deployed page uses its own origin. */
export async function joinMatch(initData: string): Promise<MatchConnection> {
  const endpoint = import.meta.env.DEV ? "http://127.0.0.1:2567" : window.location.origin;
  const client = new Client(endpoint);
  const room: Room = await client.joinOrCreate("match", { initData });
  let latest: unknown;
  room.onMessage("state", (state: unknown) => {
    latest = state;
  });
  return {
    snapshot: () => latest,
    leave() {
      void room.leave();
    },
  };
}
