import { resetCueBall, simulateShot } from "./physics.ts";
import {
  SEATS_BY_MODE,
  teamForSeat,
  type BallGroup,
  type GameMode,
  type GameState,
  type Seat,
  type Shot,
  type Team
} from "./types.ts";

export interface ShotResolution {
  state: GameState;
  pocketed: number[];
  scratch: boolean;
  nextSeat: Seat;
  frames: ReturnType<typeof simulateShot>["frames"];
}

export function applyShot(state: GameState, activeSeat: Seat, shot: Shot, gameMode: GameMode = "2v2"): ShotResolution {
  const result = simulateShot(state.balls, state.table, shot.angle, shot.power);
  const activeTeam = teamForSeat(activeSeat);
  const next: GameState = {
    ...state,
    balls: result.balls,
    ruleState: {
      ...state.ruleState,
      pocketedByTeam: assignPocketedToTeam(state.ruleState.pocketedByTeam, activeTeam, result.pocketed),
      lastPocketed: result.pocketed,
      scratch: result.scratch,
      message: ""
    },
    shotInProgress: false
  };

  assignGroupsIfNeeded(next, activeTeam, result.pocketed);
  resolveEightBall(next, activeTeam, result.pocketed, result.scratch);

  if (result.scratch) {
    resetCueBall(next.table, next.balls);
  }

  const keepsTurn = shouldKeepTurn(next, activeTeam, result.pocketed, result.scratch);
  const nextSeat = next.ruleState.winner ? activeSeat : keepsTurn ? activeSeat : advanceSeat(activeSeat, gameMode);
  next.currentTurnSeat = nextSeat;
  next.phase = next.ruleState.winner ? "finished" : "playing";
  next.ruleState.message = buildMessage(next, activeTeam, result.pocketed, result.scratch, keepsTurn);

  return { state: next, pocketed: result.pocketed, scratch: result.scratch, nextSeat, frames: result.frames };
}

export function canShoot(state: GameState, playerSeat?: Seat): boolean {
  return state.phase === "playing" && !state.shotInProgress && playerSeat === state.currentTurnSeat;
}

export function advanceSeat(seat: Seat, gameMode: GameMode = "2v2"): Seat {
  const seats = SEATS_BY_MODE[gameMode];
  const index = seats.indexOf(seat);
  return seats[(index + 1) % seats.length] ?? seats[0];
}

function assignGroupsIfNeeded(state: GameState, team: Team, pocketed: number[]): void {
  if (state.ruleState.teamGroups.A || state.ruleState.teamGroups.B) return;
  const firstGroup = firstGroupPocketed(state, pocketed);
  if (!firstGroup) return;
  const otherTeam: Team = team === "A" ? "B" : "A";
  state.ruleState.teamGroups[team] = firstGroup;
  state.ruleState.teamGroups[otherTeam] = firstGroup === "solids" ? "stripes" : "solids";
}

function assignPocketedToTeam(
  current: GameState["ruleState"]["pocketedByTeam"] | undefined,
  team: Team,
  pocketed: number[]
): GameState["ruleState"]["pocketedByTeam"] {
  const next = {
    A: [...(current?.A ?? [])],
    B: [...(current?.B ?? [])]
  };
  for (const id of pocketed) {
    if (id === 0 || next.A.includes(id) || next.B.includes(id)) continue;
    next[team].push(id);
  }
  next.A.sort((a, b) => a - b);
  next.B.sort((a, b) => a - b);
  return next;
}

function resolveEightBall(state: GameState, team: Team, pocketed: number[], scratch: boolean): void {
  if (!pocketed.includes(8)) return;
  const otherTeam: Team = team === "A" ? "B" : "A";
  const assignedGroup = state.ruleState.teamGroups[team];
  const hasClearedGroup = assignedGroup ? state.balls.every((ball) => ball.group !== assignedGroup || ball.pocketed) : false;
  state.ruleState.winner = !scratch && hasClearedGroup ? team : otherTeam;
}

function shouldKeepTurn(state: GameState, team: Team, pocketed: number[], scratch: boolean): boolean {
  if (scratch || state.ruleState.winner) return false;
  const assignedGroup = state.ruleState.teamGroups[team];
  const firstGroup = firstGroupPocketed(state, pocketed);
  if (!assignedGroup) return Boolean(firstGroup);
  return pocketed.some((id) => {
    const ball = state.balls.find((candidate) => candidate.id === id);
    return ball?.group === assignedGroup;
  });
}

function firstGroupPocketed(state: GameState, pocketed: number[]): BallGroup | undefined {
  for (const id of pocketed) {
    const ball = state.balls.find((candidate) => candidate.id === id);
    if (ball?.group) return ball.group;
  }
  return undefined;
}

function buildMessage(state: GameState, team: Team, pocketed: number[], scratch: boolean, keepsTurn: boolean): string {
  if (state.ruleState.winner) return `Team ${state.ruleState.winner} wins`;
  if (scratch) return `Team ${team} scratched`;
  if (pocketed.length === 0) return `No ball pocketed`;
  if (keepsTurn) return `Team ${team} keeps the table`;
  return `Turn passes`;
}
