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
  const teamGroups = assignGroupsIfNeeded({ ...state, balls: result.balls }, activeTeam, result.pocketed);
  const foul = isFoul(state, activeTeam, teamGroups, result);
  const nextSeat = foul ? advanceSeat(activeSeat, gameMode) : activeSeat;
  const next: GameState = {
    ...state,
    balls: result.balls,
    ruleState: {
      ...state.ruleState,
      teamGroups,
      pocketedByTeam: assignPocketedToTeam(state.ruleState.pocketedByTeam, teamGroups, result.balls, result.pocketed),
      lastPocketed: result.pocketed,
      scratch: result.scratch,
      foul,
      cuePlacementSeat: foul ? nextSeat : undefined,
      foulReason: foul ? getFoulReason(state, activeTeam, teamGroups, result) : undefined,
      message: ""
    },
    shotInProgress: false
  };

  resolveEightBall(next, activeTeam, result, foul);

  if (result.scratch) {
    resetCueBall(next.table, next.balls);
  }

  const keepsTurn = shouldKeepTurn(next, activeTeam, result, foul);
  const resolvedNextSeat = next.ruleState.winner
    ? activeSeat
    : keepsTurn
      ? activeSeat
      : advanceSeat(activeSeat, gameMode);
  next.currentTurnSeat = resolvedNextSeat;
  next.phase = next.ruleState.winner ? "finished" : "playing";
  next.ruleState.cuePlacementSeat = next.ruleState.winner || (!foul && !result.scratch && keepsTurn)
    ? undefined
    : foul || result.scratch
      ? resolvedNextSeat
      : undefined;
  next.ruleState.message = buildMessage(next, activeTeam, result, foul, keepsTurn);

  return { state: next, pocketed: result.pocketed, scratch: result.scratch, nextSeat: resolvedNextSeat, frames: result.frames };
}

export function canShoot(state: GameState, playerSeat?: Seat): boolean {
  return state.phase === "playing" && !state.shotInProgress && !state.ruleState.cuePlacementSeat && playerSeat === state.currentTurnSeat;
}

export function advanceSeat(seat: Seat, gameMode: GameMode = "2v2"): Seat {
  const seats = SEATS_BY_MODE[gameMode];
  const index = seats.indexOf(seat);
  return seats[(index + 1) % seats.length] ?? seats[0];
}

export function assignGroupsIfNeeded(
  state: GameState,
  team: Team,
  pocketed: number[]
): Partial<Record<Team, BallGroup>> {
  if (state.ruleState.teamGroups.A || state.ruleState.teamGroups.B) return { ...state.ruleState.teamGroups };
  const firstGroup = firstGroupPocketed(state, pocketed);
  if (!firstGroup) return { ...state.ruleState.teamGroups };
  const otherTeam: Team = team === "A" ? "B" : "A";
  return {
    ...state.ruleState.teamGroups,
    [team]: firstGroup,
    [otherTeam]: firstGroup === "solids" ? "stripes" : "solids"
  };
}

export function assignPocketedToTeam(
  current: GameState["ruleState"]["pocketedByTeam"] | undefined,
  teamGroups: Partial<Record<Team, BallGroup>>,
  balls: GameState["balls"],
  pocketed: number[]
): GameState["ruleState"]["pocketedByTeam"] {
  const next = {
    A: [...(current?.A ?? [])],
    B: [...(current?.B ?? [])]
  };
  for (const id of pocketed) {
    if (id === 0 || id === 8 || next.A.includes(id) || next.B.includes(id)) continue;
    const ball = balls.find((candidate) => candidate.id === id);
    const owner = ball?.group ? teamForGroup(teamGroups, ball.group) : undefined;
    if (!owner) continue;
    next[owner].push(id);
  }
  next.A.sort((a, b) => a - b);
  next.B.sort((a, b) => a - b);
  return next;
}

function teamForGroup(teamGroups: Partial<Record<Team, BallGroup>>, group: BallGroup): Team | undefined {
  if (teamGroups.A === group) return "A";
  if (teamGroups.B === group) return "B";
  return undefined;
}

function resolveEightBall(state: GameState, team: Team, result: ReturnType<typeof simulateShot>, foul: boolean): void {
  const otherTeam: Team = team === "A" ? "B" : "A";
  const assignedGroup = state.ruleState.teamGroups[team];
  const hasClearedGroup = assignedGroup ? state.balls.every((ball) => ball.group !== assignedGroup || ball.pocketed) : false;
  if (result.pocketed.includes(8)) {
    state.ruleState.winner = !foul && hasClearedGroup ? team : otherTeam;
    return;
  }
  if (result.firstContactBallId === 8 && assignedGroup && !hasClearedGroup) {
    state.ruleState.winner = otherTeam;
    state.ruleState.foul = true;
    state.ruleState.foulReason = "eight_early";
  }
}

function shouldKeepTurn(state: GameState, team: Team, result: ReturnType<typeof simulateShot>, foul: boolean): boolean {
  if (foul || result.scratch || state.ruleState.winner) return false;
  const assignedGroup = state.ruleState.teamGroups[team];
  const firstGroup = firstGroupPocketed(state, result.pocketed);
  if (!assignedGroup) return Boolean(firstGroup);
  return result.pocketed.some((id) => {
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

function isFoul(
  state: GameState,
  team: Team,
  teamGroups: Partial<Record<Team, BallGroup>>,
  result: ReturnType<typeof simulateShot>
): boolean {
  if (result.scratch) return true;
  if (result.firstContactBallId === undefined) return true;
  const assignedGroup = teamGroups[team];
  const contactBall = state.balls.find((ball) => ball.id === result.firstContactBallId);
  if (!assignedGroup) return false;
  if (contactBall?.kind === "eight") {
    return !state.balls.every((ball) => ball.group !== assignedGroup || ball.pocketed);
  }
  return contactBall?.group !== assignedGroup;
}

function getFoulReason(
  state: GameState,
  team: Team,
  teamGroups: Partial<Record<Team, BallGroup>>,
  result: ReturnType<typeof simulateShot>
): "scratch" | "no_contact" | "wrong_contact" | "eight_early" | undefined {
  if (result.scratch) return "scratch";
  if (result.firstContactBallId === undefined) return "no_contact";
  const assignedGroup = teamGroups[team];
  const contactBall = state.balls.find((ball) => ball.id === result.firstContactBallId);
  if (contactBall?.kind === "eight" && assignedGroup) return "eight_early";
  if (assignedGroup && contactBall?.group !== assignedGroup) return "wrong_contact";
  return undefined;
}

function buildMessage(
  state: GameState,
  team: Team,
  result: ReturnType<typeof simulateShot>,
  foul: boolean,
  keepsTurn: boolean
): string {
  if (state.ruleState.winner) return `Team ${state.ruleState.winner} wins`;
  if (foul) {
    if (state.ruleState.foulReason === "scratch") return `Team ${team} scratched - ball in hand`;
    if (state.ruleState.foulReason === "no_contact") return `No contact - ball in hand`;
    if (state.ruleState.foulReason === "wrong_contact") return `Wrong contact - ball in hand`;
    if (state.ruleState.foulReason === "eight_early") return `Illegal 8-ball`;
  }
  if (result.pocketed.length === 0) return `No ball pocketed`;
  if (keepsTurn) return `Team ${team} keeps the table`;
  return `Turn passes`;
}
