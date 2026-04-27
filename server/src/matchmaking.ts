import type { Player } from "../../shared/src/index.ts";

export interface MatchmakingEntry {
  playerId: string;
  name: string;
}

export interface MatchmakingPair {
  first: MatchmakingEntry;
  second: MatchmakingEntry;
}

export class MatchmakingQueue {
  private readonly entries = new Map<string, MatchmakingEntry>();

  join(playerId: string, name: string): MatchmakingPair | undefined {
    this.entries.delete(playerId);
    const opponent = this.entries.values().next().value as MatchmakingEntry | undefined;
    if (!opponent) {
      this.entries.set(playerId, { playerId, name });
      return undefined;
    }

    this.entries.delete(opponent.playerId);
    return {
      first: opponent,
      second: { playerId, name }
    };
  }

  cancel(playerId: string): boolean {
    return this.entries.delete(playerId);
  }

  remove(playerId: string): boolean {
    return this.cancel(playerId);
  }

  has(playerId: string): boolean {
    return this.entries.has(playerId);
  }

  size(): number {
    return this.entries.size;
  }
}

export function seatMatchedPlayers(first: Player, second: Player): void {
  first.seat = "A1";
  first.team = "A";
  first.connected = true;
  second.seat = "B1";
  second.team = "B";
  second.connected = true;
}
