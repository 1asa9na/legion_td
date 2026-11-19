import type { Command, CommandFailure } from "@legion/sim";

export type RoomFailure = CommandFailure | "invalid" | "race" | "unsupported";

export interface RoomReport {
  ok: boolean;
  reason?: RoomFailure;
  id?: number;
}

export type Intent =
  | { kind: "queue"; command: Command }
  | { kind: "now"; report: RoomReport };

const invalid: Intent = { kind: "now", report: { ok: false, reason: "invalid" } };

function integer(value: unknown): value is number {
  return Number.isInteger(value);
}

/** Turn a client message into a sim command, or an immediate answer. */
export function readIntent(message: unknown): Intent {
  if (!message || typeof message !== "object") return invalid;
  const body = message as Record<string, unknown>;
  switch (body.type) {
    case "build":
      if (typeof body.fighterId !== "string" || !integer(body.slot)) return invalid;
      if (body.side !== "north" && body.side !== "south") return invalid;
      return {
        kind: "queue",
        command: { type: "build", fighterId: body.fighterId, slot: body.slot, side: body.side },
      };
    case "upgrade":
      if (!integer(body.id) || typeof body.fighterId !== "string") return invalid;
      return { kind: "queue", command: { type: "upgrade", id: body.id, fighterId: body.fighterId } };
    case "sell":
      if (!integer(body.id)) return invalid;
      return { kind: "queue", command: { type: "sell", id: body.id } };
    case "race":
      if (typeof body.race !== "string") return invalid;
      if (body.race === "mech") return { kind: "now", report: { ok: true } };
      return { kind: "now", report: { ok: false, reason: "race" } };
    case "send":
      if (typeof body.creepId !== "string") return invalid;
      return { kind: "now", report: { ok: false, reason: "unsupported" } };
    default:
      return invalid;
  }
}
