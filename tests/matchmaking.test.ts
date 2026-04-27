import { describe, expect, it } from "vitest";
import { MatchmakingQueue, seatMatchedPlayers } from "../server/src/matchmaking.ts";
import type { Player } from "../shared/src/index.ts";

function player(id: string, name: string): Player {
  return { id, name, connected: true };
}

describe("matchmaking", () => {
  it("pairs two queued players into a 1v1 match", () => {
    const queue = new MatchmakingQueue();

    expect(queue.join("a", "Ada")).toBeUndefined();
    const pair = queue.join("b", "Grace");

    expect(pair?.first.playerId).toBe("a");
    expect(pair?.second.playerId).toBe("b");
    expect(queue.size()).toBe(0);
  });

  it("cancels and removes queued players", () => {
    const queue = new MatchmakingQueue();
    queue.join("a", "Ada");

    expect(queue.cancel("a")).toBe(true);
    expect(queue.has("a")).toBe(false);
    expect(queue.size()).toBe(0);
  });

  it("assigns random match seats to A1 and B1", () => {
    const first = player("a", "Ada");
    const second = player("b", "Grace");

    seatMatchedPlayers(first, second);

    expect(first.seat).toBe("A1");
    expect(first.team).toBe("A");
    expect(second.seat).toBe("B1");
    expect(second.team).toBe("B");
  });
});
