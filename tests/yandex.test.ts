import { describe, expect, it } from "vitest";
import { loadLeaderboard } from "../client/src/yandex.ts";

describe("yandex adapter", () => {
  it("skips leaderboard loading when SDK is unavailable", async () => {
    await expect(loadLeaderboard()).resolves.toEqual({ available: false, entries: [] });
  });
});
