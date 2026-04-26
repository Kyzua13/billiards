import { describe, expect, it } from "vitest";
import {
  DEFAULT_TABLE,
  createShotSimulation,
  isInPocket,
  isSimulationSettled,
  runSimulation,
  simulateShot,
  stepSimulation
} from "../shared/src/index.ts";
import type { Ball } from "../shared/src/index.ts";

function ball(id: number, x: number, y: number, vx = 0, vy = 0): Ball {
  return {
    id,
    kind: id === 0 ? "cue" : "solid",
    group: id === 0 ? undefined : "solids",
    position: { x, y },
    velocity: { x: vx, y: vy },
    pocketed: false
  };
}

describe("physics", () => {
  it("transfers velocity in a head-on ball collision", () => {
    const balls = [
      ball(0, 200, 260, 600, 0),
      ball(1, 221, 260, 0, 0)
    ];

    const result = runSimulation(balls, DEFAULT_TABLE);
    const cue = result.balls.find((candidate) => candidate.id === 0)!;
    const object = result.balls.find((candidate) => candidate.id === 1)!;

    expect(object.position.x).toBeGreaterThan(221);
    expect(Math.abs(cue.position.y - object.position.y)).toBeLessThan(1);
    expect(result.frames.length).toBeGreaterThan(0);
    expect(result.firstContactBallId).toBe(1);
  });

  it("rebounds from cushions", () => {
    const balls = [ball(0, DEFAULT_TABLE.cushion + DEFAULT_TABLE.ballRadius + 2, 260, -500, 0)];
    const result = runSimulation(balls, DEFAULT_TABLE);
    const cue = result.balls[0];

    expect(cue.position.x).toBeGreaterThan(DEFAULT_TABLE.cushion + DEFAULT_TABLE.ballRadius);
  });

  it("stops rolling balls below the threshold", () => {
    const balls = [ball(0, 300, 260, 80, 0)];
    const result = runSimulation(balls, DEFAULT_TABLE);

    expect(result.balls[0].velocity.x).toBe(0);
    expect(result.balls[0].velocity.y).toBe(0);
  });

  it("detects pocketed balls inside pocket radius", () => {
    expect(isInPocket({ x: DEFAULT_TABLE.pockets[0].x, y: DEFAULT_TABLE.pockets[0].y }, DEFAULT_TABLE)).toBe(true);
    expect(isInPocket({ x: DEFAULT_TABLE.width / 2, y: DEFAULT_TABLE.height / 2 }, DEFAULT_TABLE)).toBe(false);
  });

  it("matches final shot state between stepped and full simulation", () => {
    const balls = [
      ball(0, 220, 260),
      ball(1, 360, 260),
      ball(2, 390, 280)
    ];
    const full = simulateShot(balls, DEFAULT_TABLE, 0, 0.55);
    const stepped = createShotSimulation(balls, DEFAULT_TABLE, 0, 0.55);

    while (!isSimulationSettled(stepped)) {
      stepSimulation(stepped, 2);
    }

    for (const fullBall of full.balls) {
      const steppedBall = stepped.balls.find((candidate) => candidate.id === fullBall.id)!;
      expect(steppedBall.position.x).toBeCloseTo(fullBall.position.x, 3);
      expect(steppedBall.position.y).toBeCloseTo(fullBall.position.y, 3);
      expect(steppedBall.pocketed).toBe(fullBall.pocketed);
    }
  });
});
