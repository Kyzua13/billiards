import { describe, expect, it } from "vitest";
import { advanceSeat, applyShot, canShoot, createInitialGame } from "../shared/src/index.ts";

describe("8-ball rules", () => {
  it("advances 2v2 seats in fixed order", () => {
    expect(advanceSeat("A1", "2v2")).toBe("B1");
    expect(advanceSeat("B1", "2v2")).toBe("A2");
    expect(advanceSeat("A2", "2v2")).toBe("B2");
    expect(advanceSeat("B2", "2v2")).toBe("A1");
  });

  it("advances 1v1 seats in fixed order", () => {
    expect(advanceSeat("A1", "1v1")).toBe("B1");
    expect(advanceSeat("B1", "1v1")).toBe("A1");
  });

  it("allows only the active seat to shoot", () => {
    const state = createInitialGame();
    state.phase = "playing";

    expect(canShoot(state, "A1")).toBe(true);
    expect(canShoot(state, "B1")).toBe(false);
  });

  it("assigns groups after a legal first pocket", () => {
    const state = createInitialGame();
    state.phase = "playing";
    const solid = state.balls.find((ball) => ball.id === 1)!;
    solid.position = { x: state.table.pockets[0].x, y: state.table.pockets[0].y };

    const resolution = applyShot(state, "A1", { angle: 0, power: 0 }, "1v1");

    expect(resolution.state.ruleState.teamGroups.A).toBe("solids");
    expect(resolution.state.ruleState.teamGroups.B).toBe("stripes");
    expect(resolution.state.ruleState.pocketedByTeam.A).toContain(1);
  });

  it("assigns pocketed balls to the team that owns their group", () => {
    const state = createInitialGame();
    state.phase = "playing";
    state.ruleState.teamGroups = { A: "solids", B: "stripes" };
    const stripe = state.balls.find((ball) => ball.id === 9)!;
    stripe.position = { x: state.table.pockets[0].x, y: state.table.pockets[0].y };

    const resolution = applyShot(state, "A1", { angle: 0, power: 0 }, "1v1");

    expect(resolution.state.ruleState.pocketedByTeam.A).not.toContain(9);
    expect(resolution.state.ruleState.pocketedByTeam.B).toContain(9);
  });

  it("does not add the eight ball to pocketed team lists", () => {
    const state = createInitialGame();
    state.phase = "playing";
    state.ruleState.teamGroups = { A: "solids", B: "stripes" };
    const eight = state.balls.find((ball) => ball.id === 8)!;
    eight.position = { x: state.table.pockets[0].x, y: state.table.pockets[0].y };

    const resolution = applyShot(state, "A1", { angle: 0, power: 0 }, "1v1");

    expect(resolution.state.ruleState.pocketedByTeam.A).not.toContain(8);
    expect(resolution.state.ruleState.pocketedByTeam.B).not.toContain(8);
  });

  it("resets the cue ball after a scratch", () => {
    const state = createInitialGame();
    state.phase = "playing";
    const cue = state.balls.find((ball) => ball.id === 0)!;
    cue.position = { x: state.table.pockets[0].x, y: state.table.pockets[0].y };

    const resolution = applyShot(state, "A1", { angle: 0, power: 0 }, "1v1");
    const resetCue = resolution.state.balls.find((ball) => ball.id === 0)!;

    expect(resolution.scratch).toBe(true);
    expect(resetCue.pocketed).toBe(false);
    expect(resetCue.position.x).toBeCloseTo(state.table.width * 0.25);
  });

  it("awards the other team when the eight is pocketed too early", () => {
    const state = createInitialGame();
    state.phase = "playing";
    const eight = state.balls.find((ball) => ball.id === 8)!;
    eight.position = { x: state.table.pockets[0].x, y: state.table.pockets[0].y };

    const resolution = applyShot(state, "A1", { angle: 0, power: 0 }, "1v1");

    expect(resolution.state.phase).toBe("finished");
    expect(resolution.state.ruleState.winner).toBe("B");
  });
});
