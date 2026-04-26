import type { Ball, MotionState, ShotFrame, SoundEvent, Table, Vec2, Vec3 } from "./types.ts";

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

const RESTITUTION_BALL = 0.975;
const RESTITUTION_CUSHION = 0.88;
const CUSHION_TANGENT_DAMPING = 0.82;
const CUSHION_SPIN_INFLUENCE = 0.13;
const CUSHION_SPIN_RETENTION = 0.72;
const SLIDING_DAMPING = 0.996;
const ROLLING_DAMPING = 0.9982;
const SIDE_SPIN_DAMPING = 0.994;
const SLIDING_COUPLING = 0.055;
const ROLLING_COUPLING = 0.14;
const TANGENTIAL_TRANSFER = 0.18;
const SPIN_TRANSFER = 0.1;
const SLIP_SPEED = 16;
const STOP_SPEED = 3;
const STOP_SPIN_SURFACE_SPEED = 6;
const MAX_SPEED = 1420;
const MAX_SPIN_SURFACE_SPEED = 920;
const SIDE_SPIN_SPEED = 72;
const DT = 1 / 120;
const MAX_STEPS = 3600;

const ZERO_VEC3: Vec3 = { x: 0, y: 0, z: 0 };

export interface SimulationResult {
  balls: Ball[];
  pocketed: number[];
  scratch: boolean;
  firstContactBallId?: number;
  frames: ShotFrame[];
}

export interface StepSimulationState {
  balls: Ball[];
  table: Table;
  pocketed: number[];
  scratch: boolean;
  firstContactBallId?: number;
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
    createBall({
      id: 0,
      kind: "cue",
      position: { x: DEFAULT_TABLE.width * 0.25, y: DEFAULT_TABLE.height / 2 }
    })
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
      balls.push(
        createBall({
          id,
          kind,
          group: kind === "solid" ? "solids" : kind === "stripe" ? "stripes" : undefined,
          position: {
            x: startX + row * gap,
            y: startY + (col - row / 2) * gap
          }
        })
      );
      index += 1;
    }
  }

  return balls;
}

export function cloneBalls(balls: Ball[]): Ball[] {
  return balls.map(normalizeBall);
}

export function simulateShot(
  balls: Ball[],
  table: Table,
  angle: number,
  power: number,
  spin: Vec2 = { x: 0, y: 0 }
): SimulationResult {
  return runSimulation(createShotSimulation(balls, table, angle, power, spin));
}

export function createShotSimulation(
  balls: Ball[],
  table: Table,
  angle: number,
  power: number,
  spin: Vec2 = { x: 0, y: 0 }
): StepSimulationState {
  const next = cloneBalls(balls);
  const clampedPower = clamp(power, 0, 1);
  const shotSpin = normalizeSpin(spin);
  const cue = next.find((ball) => ball.id === 0);
  const pendingEvents: SoundEvent[] = [];

  if (cue && !cue.pocketed) {
    const direction = { x: Math.cos(angle), y: Math.sin(angle) };
    const tangent = perpendicular(direction);
    const speed = clampedPower * MAX_SPEED;
    const sideKick = shotSpin.x * speed * 0.018;
    cue.velocity = add(mul(direction, speed), mul(tangent, sideKick));
    cue.angularVelocity = add3(
      rollingAngularForVelocity(cue.velocity, table.ballRadius),
      {
        ...rollingAngularForVelocity(mul(direction, shotSpin.y * speed * 0.78), table.ballRadius),
        z: -shotSpin.x * SIDE_SPIN_SPEED * clampedPower
      }
    );
    cue.motionState = speed > 0 ? "sliding" : "settled";
    clampAngularVelocity(cue, table.ballRadius);
    if (speed > 0) pendingEvents.push({ type: "cue", intensity: clampedPower });
  }

  return {
    balls: next,
    table,
    pocketed: [],
    scratch: false,
    firstContactBallId: undefined,
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
  return {
    balls: simulation.balls,
    pocketed: simulation.pocketed,
    scratch: simulation.scratch,
    firstContactBallId: simulation.firstContactBallId,
    frames
  };
}

function createSimulationFromMovingBalls(balls: Ball[], table: Table): StepSimulationState {
  const next = cloneBalls(balls);
  for (const ball of next) updateMotionState(ball, table.ballRadius);
  return {
    balls: next,
    table,
    pocketed: [],
    scratch: false,
    firstContactBallId: undefined,
    steps: 0,
    settled: isSettled(next, table),
    pendingEvents: []
  };
}

function isSettled(balls: Ball[], table: Table): boolean {
  return balls.every((ball) => ball.pocketed || (ball.motionState === "settled" && !isInPocket(ball.position, table)));
}

function stepOnce(simulation: StepSimulationState, events: SoundEvent[]): void {
  simulation.steps += 1;

  for (const ball of simulation.balls) {
    if (ball.pocketed) continue;
    ball.position.x += ball.velocity.x * DT;
    ball.position.y += ball.velocity.y * DT;
    const cushionIntensity = collideWithCushions(ball, simulation.table);
    if (cushionIntensity > 0.08) events.push({ type: "cushion", intensity: cushionIntensity });
    applySurfaceFriction(ball, simulation.table.ballRadius);
  }

  for (let i = 0; i < simulation.balls.length; i += 1) {
    for (let j = i + 1; j < simulation.balls.length; j += 1) {
      const collisionIntensity = collideBalls(simulation, simulation.balls[i], simulation.balls[j], simulation.table.ballRadius);
      if (collisionIntensity > 0.08) events.push({ type: "collision", intensity: collisionIntensity });
    }
  }

  for (const ball of simulation.balls) {
    if (ball.pocketed) continue;
    if (isInPocket(ball.position, simulation.table)) {
      ball.pocketed = true;
      settleBall(ball);
      simulation.pocketed.push(ball.id);
      events.push({ type: "pocket", intensity: ball.id === 0 ? 0.9 : 0.65 });
      if (ball.id === 0) simulation.scratch = true;
    }
  }
}

export function buildPreview(
  balls: Ball[],
  table: Table,
  angle: number,
  power: number,
  spin: Vec2 = { x: 0, y: 0 }
): PreviewResult {
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
  const sidePreview = clamp(spin.x, -1, 1);
  const cuePath =
    Math.abs(sidePreview) > 0.04
      ? [
          start,
          add(add(start, mul(direction, Math.max(0, nearestDistance) * 0.55)), mul(perpendicular(direction), sidePreview * 28)),
          impact
        ]
      : [start, impact];
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
  cue.angularVelocity = { ...ZERO_VEC3 };
  cue.motionState = "settled";
  cue.position = { x: table.width * 0.25, y: table.height / 2 };
}

export function isInPocket(position: Vec2, table: Table): boolean {
  return table.pockets.some((pocket) => distance(position, pocket) <= table.pocketRadius);
}

function createBall(ball: Omit<Ball, "velocity" | "angularVelocity" | "motionState" | "pocketed">): Ball {
  return {
    ...ball,
    velocity: { x: 0, y: 0 },
    angularVelocity: { ...ZERO_VEC3 },
    motionState: "settled",
    pocketed: false
  };
}

function normalizeBall(ball: Ball): Ball {
  const velocity = ball.velocity ? { ...ball.velocity } : { x: 0, y: 0 };
  const angularVelocity = ball.angularVelocity ? { ...ball.angularVelocity } : { ...ZERO_VEC3 };
  const normalized: Ball = {
    ...ball,
    position: { ...ball.position },
    velocity,
    angularVelocity,
    motionState: ball.motionState ?? inferMotionState(velocity, angularVelocity, DEFAULT_TABLE.ballRadius)
  };
  clampAngularVelocity(normalized, DEFAULT_TABLE.ballRadius);
  return normalized;
}

function applySurfaceFriction(ball: Ball, radius: number): void {
  const spinVelocity = surfaceVelocityFromSpin(ball.angularVelocity, radius);
  const slip = sub(ball.velocity, spinVelocity);
  const slipSpeed = length(slip);

  if (canSleep(ball, radius)) {
    settleBall(ball);
    return;
  }

  if (slipSpeed > SLIP_SPEED) {
    ball.motionState = "sliding";
    ball.velocity = sub(ball.velocity, mul(slip, SLIDING_COUPLING));
    ball.velocity = mul(ball.velocity, SLIDING_DAMPING);
    const targetAngular = rollingAngularForVelocity(ball.velocity, radius);
    ball.angularVelocity.x += (targetAngular.x - ball.angularVelocity.x) * SLIDING_COUPLING;
    ball.angularVelocity.y += (targetAngular.y - ball.angularVelocity.y) * SLIDING_COUPLING;
    ball.angularVelocity.z *= SIDE_SPIN_DAMPING;
  } else {
    ball.motionState = "rolling";
    const targetAngular = rollingAngularForVelocity(ball.velocity, radius);
    ball.angularVelocity.x += (targetAngular.x - ball.angularVelocity.x) * ROLLING_COUPLING;
    ball.angularVelocity.y += (targetAngular.y - ball.angularVelocity.y) * ROLLING_COUPLING;
    ball.velocity = mul(ball.velocity, ROLLING_DAMPING);
    ball.angularVelocity.z *= SIDE_SPIN_DAMPING;
  }

  clampAngularVelocity(ball, radius);
  if (canSleep(ball, radius)) settleBall(ball);
}

function collideWithCushions(ball: Ball, table: Table): number {
  const minX = table.cushion + table.ballRadius;
  const maxX = table.width - table.cushion - table.ballRadius;
  const minY = table.cushion + table.ballRadius;
  const maxY = table.height - table.cushion - table.ballRadius;
  let impact = 0;

  if (ball.position.x < minX) {
    ball.position.x = minX;
    impact = Math.max(impact, resolveCushion(ball, "x", table.ballRadius));
  } else if (ball.position.x > maxX) {
    ball.position.x = maxX;
    impact = Math.max(impact, resolveCushion(ball, "x", table.ballRadius));
  }

  if (ball.position.y < minY) {
    ball.position.y = minY;
    impact = Math.max(impact, resolveCushion(ball, "y", table.ballRadius));
  } else if (ball.position.y > maxY) {
    ball.position.y = maxY;
    impact = Math.max(impact, resolveCushion(ball, "y", table.ballRadius));
  }

  return impact;
}

function resolveCushion(ball: Ball, axis: "x" | "y", radius: number): number {
  const normalSpeed = axis === "x" ? ball.velocity.x : ball.velocity.y;
  const tangentSpeed = axis === "x" ? ball.velocity.y : ball.velocity.x;
  const impact = Math.min(1, Math.abs(normalSpeed) / MAX_SPEED);
  const spinKick = ball.angularVelocity.z * radius * CUSHION_SPIN_INFLUENCE;
  const nextNormal = -normalSpeed * RESTITUTION_CUSHION;
  const nextTangent = tangentSpeed * CUSHION_TANGENT_DAMPING + spinKick;

  if (axis === "x") {
    ball.velocity.x = nextNormal;
    ball.velocity.y = nextTangent;
    ball.angularVelocity.y *= -0.84;
  } else {
    ball.velocity.y = nextNormal;
    ball.velocity.x = nextTangent;
    ball.angularVelocity.x *= -0.84;
  }
  ball.angularVelocity.z = (ball.angularVelocity.z - tangentSpeed / radius * 0.04) * CUSHION_SPIN_RETENTION;
  ball.motionState = "sliding";
  return impact;
}

function collideBalls(simulation: StepSimulationState, a: Ball, b: Ball, radius: number): number {
  if (a.pocketed || b.pocketed) return 0;
  const delta = sub(b.position, a.position);
  const dist = length(delta);
  const minDist = radius * 2;
  if (dist <= 0 || dist >= minDist) return 0;

  const normal = mul(delta, 1 / dist);
  const tangent = perpendicular(normal);
  const overlap = minDist - dist;
  a.position = sub(a.position, mul(normal, overlap * 0.51));
  b.position = add(b.position, mul(normal, overlap * 0.51));

  const relative = sub(a.velocity, b.velocity);
  const speed = dot(relative, normal);
  if (speed <= 0) return 0;

  const normalImpulse = speed * RESTITUTION_BALL;
  a.velocity = sub(a.velocity, mul(normal, normalImpulse));
  b.velocity = add(b.velocity, mul(normal, normalImpulse));

  const tangentSpeed = dot(relative, tangent) + (a.angularVelocity.z + b.angularVelocity.z) * radius;
  const tangentImpulse = clamp(tangentSpeed * TANGENTIAL_TRANSFER, -speed * 0.22, speed * 0.22);
  a.velocity = sub(a.velocity, mul(tangent, tangentImpulse));
  b.velocity = add(b.velocity, mul(tangent, tangentImpulse));
  a.angularVelocity.z = (a.angularVelocity.z - tangentImpulse / radius) * (1 - SPIN_TRANSFER);
  b.angularVelocity.z = (b.angularVelocity.z - tangentImpulse / radius) * (1 - SPIN_TRANSFER);
  transferRollingSpin(a, b);
  a.motionState = "sliding";
  b.motionState = "sliding";

  if (simulation.firstContactBallId === undefined) {
    if (a.id === 0 && b.id !== 0) simulation.firstContactBallId = b.id;
    else if (b.id === 0 && a.id !== 0) simulation.firstContactBallId = a.id;
  }
  return Math.min(1, Math.abs(speed) / MAX_SPEED);
}

function transferRollingSpin(a: Ball, b: Ball): void {
  const ax = a.angularVelocity.x;
  const ay = a.angularVelocity.y;
  a.angularVelocity.x += (b.angularVelocity.x - ax) * SPIN_TRANSFER;
  a.angularVelocity.y += (b.angularVelocity.y - ay) * SPIN_TRANSFER;
  b.angularVelocity.x += (ax - b.angularVelocity.x) * SPIN_TRANSFER;
  b.angularVelocity.y += (ay - b.angularVelocity.y) * SPIN_TRANSFER;
}

function updateMotionState(ball: Ball, radius: number): void {
  if (canSleep(ball, radius)) {
    settleBall(ball);
    return;
  }
  const slip = length(sub(ball.velocity, surfaceVelocityFromSpin(ball.angularVelocity, radius)));
  ball.motionState = slip > SLIP_SPEED ? "sliding" : "rolling";
}

function canSleep(ball: Ball, radius: number): boolean {
  return length(ball.velocity) < STOP_SPEED && angularSurfaceSpeed(ball.angularVelocity, radius) < STOP_SPIN_SURFACE_SPEED;
}

function settleBall(ball: Ball): void {
  ball.velocity = { x: 0, y: 0 };
  ball.angularVelocity = { ...ZERO_VEC3 };
  ball.motionState = "settled";
}

function inferMotionState(velocity: Vec2, angularVelocity: Vec3, radius: number): MotionState {
  if (length(velocity) < STOP_SPEED && angularSurfaceSpeed(angularVelocity, radius) < STOP_SPIN_SURFACE_SPEED) return "settled";
  const slip = length(sub(velocity, surfaceVelocityFromSpin(angularVelocity, radius)));
  return slip > SLIP_SPEED ? "sliding" : "rolling";
}

function normalizeSpin(spin: Vec2): Vec2 {
  return {
    x: Number.isFinite(spin.x) ? clamp(spin.x, -1, 1) : 0,
    y: Number.isFinite(spin.y) ? clamp(spin.y, -1, 1) : 0
  };
}

function clampAngularVelocity(ball: Ball, radius: number): void {
  const surface = angularSurfaceSpeed(ball.angularVelocity, radius);
  if (surface <= MAX_SPIN_SURFACE_SPEED) return;
  const scale = MAX_SPIN_SURFACE_SPEED / surface;
  ball.angularVelocity = mul3(ball.angularVelocity, scale);
}

function surfaceVelocityFromSpin(angularVelocity: Vec3, radius: number): Vec2 {
  return {
    x: -angularVelocity.y * radius,
    y: angularVelocity.x * radius
  };
}

function rollingAngularForVelocity(velocity: Vec2, radius: number): Vec3 {
  return {
    x: velocity.y / radius,
    y: -velocity.x / radius,
    z: 0
  };
}

function angularSurfaceSpeed(angularVelocity: Vec3, radius: number): number {
  return Math.hypot(angularVelocity.x * radius, angularVelocity.y * radius, angularVelocity.z * radius);
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

function add3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function mul3(a: Vec3, scalar: number): Vec3 {
  return { x: a.x * scalar, y: a.y * scalar, z: a.z * scalar };
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

function perpendicular(a: Vec2): Vec2 {
  return { x: -a.y, y: a.x };
}

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
