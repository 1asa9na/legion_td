import {
  createMatch,
  step,
  type Command,
  type CommandReport,
  type Match,
  type MatchOptions,
  type MatchState,
} from "@legion/sim";

/** One solo match. Commands wait for the next 100 ms tick, then `step` applies them. */
export class MatchSession {
  readonly match: Match;
  private queued: Command[] = [];

  constructor(options?: MatchOptions) {
    this.match = createMatch(options);
  }

  push(command: Command): void {
    this.queued.push(command);
  }

  tick(): CommandReport[] {
    const commands = this.queued;
    this.queued = [];
    return step(this.match, commands);
  }

  snapshot(): MatchState {
    return structuredClone(this.match.state);
  }
}
