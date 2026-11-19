import { ClientState, ErrorCode, Room, ServerError, type AuthContext, type Client } from "colyseus";
import { TICK_MS, type CommandReport } from "@legion/sim";
import { verifyInitData, type TelegramPlayer } from "../initData.js";
import { readIntent } from "../intent.js";
import { MatchSession } from "../session.js";

interface JoinOptions {
  initData?: unknown;
}

/**
 * One player, one match. The browser has no initData, so it cannot reserve a seat.
 * Build, upgrade, and sell run on the next tick. Race is Mech only. Sends are not simulated yet.
 */
export class MatchRoom extends Room {
  private session = new MatchSession();
  private waiters: Client[] = [];

  static override async onAuth(
    _token: string,
    options: JoinOptions,
    _context: AuthContext,
  ): Promise<TelegramPlayer> {
    const botToken = process.env.BOT_TOKEN;
    if (!botToken || typeof options?.initData !== "string") {
      throw new ServerError(ErrorCode.AUTH_FAILED, "auth");
    }
    const player = verifyInitData(options.initData, botToken, Date.now());
    if (!player) throw new ServerError(ErrorCode.AUTH_FAILED, "auth");
    return player;
  }

  override onCreate(): void {
    this.maxClients = 1;
    this.onMessage("command", (client, message: unknown) => {
      const intent = readIntent(message);
      if (intent.kind === "now") {
        client.send("report", intent.report);
        return;
      }
      this.waiters.push(client);
      this.session.push(intent.command);
    });
    this.setSimulationInterval(() => this.tick(), TICK_MS);
  }

  override onJoin(client: Client): void {
    client.send("state", this.session.snapshot());
  }

  private tick(): void {
    const waiters = this.waiters;
    this.waiters = [];
    const reports = this.session.tick();
    for (let index = 0; index < waiters.length; index += 1) {
      sendReport(waiters[index], reports[index]);
    }
    this.broadcast("state", this.session.snapshot());
  }
}

function sendReport(client: Client | undefined, report: CommandReport | undefined): void {
  if (!client || !report || client.state !== ClientState.JOINED) return;
  client.send("report", report);
}
