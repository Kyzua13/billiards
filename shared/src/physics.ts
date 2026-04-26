import type { Ball, ShotFrame, SoundEvent, Table, Vec2 } from "./types.ts";

export const DEFAULT_TABLE: Table = {
  width: 960,
  height: 520,
  cushion: 34,
  ballRadius: 11,
  pocketRadius: 25,
  pockets: [
    { x: 34, y: 34 },
    { x: 480, y: 30 },
    { x: 926, y: 34 },
    { x: 34, y: 486 },
    { x: 480, y: 490 },
    { x: 926, y: 486 }
  ]
};

const RESTITUTION_BALL = 0.985;
const RESTITUTION_CUSHION = 0.86;
const FRICTION = 0.992;
const STOP_SPEED = 3;
const MAX_SPEED = 1420;
const DT = 1 / 120;
const MAX_STEPS = 2400;

export interface SimulationResult {
  balls: Ball[];
  pocketed: number[];
  scratch: boolean;
  frames: ShotFrame[];
}

export interface StepSimulationState {
  balls: Ball[];
  table: Table;
  pocketed: number[];
  scratch: boolean;
  steps: number;
  settled: boolean;
  pendingEvents: SoundEvent[];
}

export interface PreviewResult {
  cuePath: Vec2[];
  objectPath: Vec2[];
}

export function rackBalls(): Ball[] {
  const balls: Ball[] = [
    {
      id: 0,
      kind: "cue",
      position: { x: DEFAULT_TABLE.width * 0.25, y: DEFAULT_TABLE.height / 2 },
      velocity: { x: 0, y: 0 },
      pocketed: false
    }
  ];
  const order = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15];
  const startX = DEFAULT_TABLE.width * 0.68;
  const startY = DEFAULT_TABLE.height / 2;
  const gap = DEFAULT_TABLE.ballRadius * 2.08;
  let index = 0;

  for (let row = 0; row < 5; row += 1) {
    for (let col = 0; col <= row; col += 1) {
      const id = order[index];
      const kind = id === 8 ? "eight" : id <= 7 ? "solid" : "stripe";
      balls.push({
        id,
        kind,
        group: kind === "solid" ? "solids" : kind === "stripe" ? "stripes" : undefined,
        position: {
          x: startX + row * gap,
          y: startY + (col - row / 2) * gap
        },
        velocity: { x: 0, y: 0 },
        pocketed: false
      });
      index += 1;
    }
  }

  return balls;
}

export function cloneBalls(balls: Ball[]): Ball[] {
  return balls.map((ball) => ({
    ...ball,
    position: { ...ball.position },
    velocity: { ...ball.velocity }
  }));
}

export function simulateShot(balls: Ball[], table: Table, angle: number, power: number): SimulationResult {
  return runSimulation(createShotSimulation(balls, table, angle, power));
}

export function createShotSimulation(balls: Ball[], table: Table, angle: number, power: number): StepSimulationState {
  const next = cloneBalls(balls);
  const clampedPower = clamp(power, 0, 1);
  const cue = next.find((ball) => ball.id === 0);
  const pendingEvents: SoundEvent[] = [];

  if (cue && !cue.pocketed) {
    const speed = clampedPower * MAX_SPEED;
    cue.velocity = { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed };
    if (speed > 0) pendingEvents.push({ type: "cue", intensity: clampedPower });
  }

  return {
    balls: next,
    table,
    pocketed: [],
    scratch: false,
    steps: 0,
    settled: isSettled(next, table),
    pendingEvents
  };
}

export function stepSimulation(simulation: StepSimulationState, substeps = 2): ShotFrame {
  const events: SoundEvent[] = [...simulation.pendingEvents];
  simulation.pendingEvents = [];

  for (let count = 0; count < substeps; count += 1) {
    if (simulation.settled || simulation.steps >= MAX_STEPS) break;
    stepOnce(simulation, events);
  }

  simulation.settled =
    simulation.steps >= MAX_STEPS ||
    isSettled(simulation.balls, simulation.table);

  return { balls: cloneBalls(simulation.balls), events };
}

export function isSimulationSettled(simulation: StepSimulationState): boolean {
  return simulation.settled;
}

export function runSimulation(simulationOrBalls: StepSimulationState | Ball[], maybeTable?: Table): SimulationResult {
  const simulation = Array.isArray(simulationOrBalls)
    ? createSimulationFromMovingBalls(simulationOrBalls, maybeTable ?? DEFAULT_TABLE)
    : simulationOrBalls;
  const frames: ShotFrame[] = [];

  while (!isSimulationSettled(simulation)) {
    const frame = stepSimulation(simulation, 2);
    if (simulation.steps % 10 === 0) frames.push(frame);
  }

  frames.push({ balls: cloneBalls(simulation.balls), events: [] });
  return { balls: simulation.balls, pocketed: simulation.pocketed, scratch: simulation.scratch, frames };
}

function createSimulationFromMovingBalls(balls: Ball[], table: Table): StepSimulationState {
  const next = cloneBalls(balls);
  return {
    balls: next,
    table,
    pocketed: [],
    scratch: false,
    steps: 0,
    settled: isSettled(next, table),
    pendingEvents: []
  };
}

function isSettled(balls: Ball[], table: Table): boolean {
  return balls.every((ball) => ball.pocketed || (length(ball.velocity) === 0 && !isInPocket(ball.position, table)));
}

function stepOnce(simulation: StepSimulationState, events: SoundEvent[]): void {
  simulation.steps += 1;

  for (const ball of simulation.balls) {
    if (ball.pocketed) continue;
    ball.position.x += ball.velocity.x * DT;
    ball.position.y += ball.velocity.y * DT;
    const cushionIntensity = collideWithCushions(ball, simulation.table);
    if (cushionIntensity > 0.08) events.push({ type: "cushion", intensity: cushionIntensity });
    ball.velocity.x *= FRICTION;
    ball.velocity.y *= FRICTION;
    if (length(ball.velocity) < STOP_SPEED) {
      ball.velocity = { x: 0, y: 0 };
    }
  }

  for (let i = 0; i < simulation.balls.length; i += 1) {
    for (let j = i + 1; j < simulation.balls.length; j += 1) {
      const collisionIntensity = collideBalls(simulation.balls[i], simulation.balls[j], simulation.table.ballRadius);
      if (collisionIntensity > 0.08) events.push({ type: "collision", intensity: collisionIntensity });
    }
  }

  for (const ball of simulation.balls) {
    if (ball.pocketed) continue;
    if (isInPocket(ball.position, simulation.table)) {
      ball.pocketed = true;
      ball.velocity = { x: 0, y: 0 };
      simulation.pocketed.push(ball.id);
      events.push({ type: "pocket", intensity: ball.id === 0 ? 0.9 : 0.65 });
      if (ball.id === 0) simulation.scratch = true;
    }
  }
}

export function buildPreview(balls: Ball[], table: Table, angle: number, power: number): PreviewResult {
  const cue = balls.find((ball) => ball.id === 0 && !ball.pocketed);
  if (!cue) return { cuePath: [], objectPath: [] };

  const direction = { x: Math.cos(angle), y: Math.sin(angle) };
  const maxDistance = 240 + clamp(power, 0, 1) * 560;
  const start = cue.position;
  let nearestDistance = maxDistance;
  let hitBall: Ball | undefined;

  for (const ball of balls) {
    if (ball.id === 0 || ball.pocketed) continue;
    const toBall = sub(ball.position, start);
    const projection = dot(toBall, direction);
    if (projection <= 0 || projection > nearestDistance) continue;
    const closest = add(start, mul(direction, projection));
    const miss = distance(closest, ball.position);
    if (miss <= table.ballRadius * 2) {
      nearestDistance = projection - table.ballRadius * 2;
      hitBall = ball;
    }
  }

  const cushionDistance = rayCushionDistance(start, direction, table);
  nearestDistance = Math.min(nearestDistance, cushionDistance);
  const impact = add(start, mul(direction, Math.max(0, nearestDistance)));
  const cuePath = [start, impact];
  const objectPath: Vec2[] = [];

  if (hitBall) {
    const objectDirection = normalize(sub(hitBall.position, impact));
    objectPath.push(hitBall.position, add(hitBall.position, mul(objectDirection, 180)));
  }

  return { cuePath, objectPath };
}

export function resetCueBall(table: Table, balls: Ball[]): void {
  const cue = balls.find((ball) => ball.id === 0);
  if (!cue) return;
  cue.pocketed = false;
  cue.velocity = { x: 0, y: 0 };
  cue.position = { x: table.width * 0.25, y: table.height / 2 };
}

export function isInPocket(position: Vec2, table: Table): boolean {
  return table.pockets.some((pocket) => distance(position, pocket) <= table.pocketRadius);
}

function collideWithCushions(ball: Ball, table: Table): number {
  const minX = table.cushion + table.ballRadius;
  const maxX = table.width - table.cushion - table.ballRadius;
  const minY = table.cushion + table.ballRadius;
  const maxY = table.height - table.cushion - table.ballRadius;
  let impact = 0;

  if (ball.position.x < minX) {
    impact = Math.max(impact, Math.abs(ball.velocity.x) / MAX_SPEED);
    ball.position.x = minX;
    ball.velocity.x = Math.abs(ball.velocity.x) * RESTITUTION_CUSHION;
  } else if (ball.position.x > maxX) {
    impact = Math.max(impact, Math.abs(ball.velocity.x) / MAX_SPEED);
    ball.position.x = maxX;
    ball.velocity.x = -Math.abs(ball.velocity.x) * RESTITUTION_CUSHION;
  }

  if (ball.position.y < minY) {
    impact = Math.max(impact, Math.abs(ball.velocity.y) / MAX_SPEED);
    ball.position.y = minY;
    ball.velocity.y = Math.abs(ball.velocity.y) * RESTITUTION_CUSHION;
  } else if (ball.position.y > maxY) {
    impact = Math.max(impact, Math.abs(ball.velocity.y) / MAX_SPEED);
    ball.position.y = maxY;
    ball.velocity.y = -Math.abs(ball.velocity.y) * RESTITUTION_CUSHION;
  }

  return impact;
}

function collideBalls(a: Ball, b: Ball, radius: number): number {
  if (a.pocketed || b.pocketed) return 0;
  const delta = sub(b.position, a.position);
  const dist = length(delta);
  const minDist = radius * 2;
  if (dist <= 0 || dist >= minDist) return 0;

  const normal = mul(delta, 1 / dist);
  const overlap = minDist - dist;
  a.position = sub(a.position, mul(normal, overlap / 2));
  b.position = add(b.position, mul(normal, overlap / 2));

  const relative = sub(a.velocity, b.velocity);
  const speed = dot(relative, normal);
  if (speed <= 0) return 0;

  const impulse = speed * RESTITUTION_BALL;
  a.velocity = sub(a.velocity, mul(normal, impulse));
  b.velocity = add(b.velocity, mul(normal, impulse));
  return Math.min(1, Math.abs(speed) / MAX_SPEED);
}

function rayCushionDistance(start: Vec2, dir: Vec2, table: Table): number {
  const minX = table.cushion + table.ballRadius;
  const maxX = table.width - table.cushion - table.ballRadius;
  const minY = table.cushion + table.ballRadius;
  const maxY = table.height - table.cushion - table.ballRadius;
  const distances = [
    dir.x > 0 ? (maxX - start.x) / dir.x : Infinity,
    dir.x < 0 ? (minX - start.x) / dir.x : Infinity,
    dir.y > 0 ? (maxY - start.y) / dir.y : Infinity,
    dir.y < 0 ? (minY - start.y) / dir.y : Infinity
  ];
  return Math.min(...distances.filter((value) => value > 0));
}

function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

function mul(a: Vec2, scalar: number): Vec2 {
  return { x: a.x * scalar, y: a.y * scalar };
}

function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

function length(a: Vec2): number {
  return Math.hypot(a.x, a.y);
}

function normalize(a: Vec2): Vec2 {
  const len = length(a);
  return len === 0 ? { x: 0, y: 0 } : { x: a.x / len, y: a.y / len };
}

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
