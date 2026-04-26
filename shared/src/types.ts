export type Team = "A" | "B";
export type BallGroup = "solids" | "stripes";
export type BallKind = "cue" | "solid" | "stripe" | "eight";
export type GamePhase = "lobby" | "playing" | "finished";
export type GameMode = "1v1" | "2v2";
export type SoundEventType = "cue" | "collision" | "cushion" | "pocket";

export type Seat = "A1" | "B1" | "A2" | "B2";

export interface Vec2 {
  x: number;
  y: number;
}

export interface Table {
  width: number;
  height: number;
  cushion: number;
  ballRadius: number;
  pocketRadius: number;
  pockets: Vec2[];
}

export interface Ball {
  id: number;
  kind: BallKind;
  group?: BallGroup;
  position: Vec2;
  velocity: Vec2;
  pocketed: boolean;
}

export interface Player {
  id: string;
  name: string;
  seat?: Seat;
  team?: Team;
  connected: boolean;
}

export interface RuleState {
  teamGroups: Partial<Record<Team, BallGroup>>;
  lastPocketed: number[];
  pocketedByTeam: Partial<Record<Team, number[]>>;
  scratch: boolean;
  winner?: Team;
  message: string;
}

export interface GameState {
  phase: GamePhase;
  table: Table;
  balls: Ball[];
  currentTurnSeat: Seat;
  ruleState: RuleState;
  shotInProgress: boolean;
}

export interface RoomState {
  code: string;
  gameMode: GameMode;
  players: Player[];
  gameState: GameState;
}

export interface Shot {
  angle: number;
  power: number;
}

export interface SoundEvent {
  type: SoundEventType;
  intensity: number;
}

export interface ShotFrame {
  balls: Ball[];
  events: SoundEvent[];
}

export type ClientMessage =
  | { type: "create_room"; name: string; gameMode: GameMode; clientId?: string }
  | { type: "join_room"; roomCode: string; name: string; clientId?: string }
  | { type: "choose_seat"; roomCode: string; seat: Seat }
  | { type: "set_name"; roomCode: string; name: string }
  | { type: "shoot"; roomCode: string; shot: Shot }
  | { type: "request_state"; roomCode: string };

export type ServerMessage =
  | { type: "room_created"; room: RoomState; playerId: string }
  | { type: "joined_room"; room: RoomState; playerId: string }
  | { type: "state_snapshot"; room: RoomState; playerId?: string }
  | { type: "player_update"; room: RoomState }
  | { type: "shot_started"; room: RoomState; shot: Shot; startBalls: Ball[]; activeSeat: Seat }
  | { type: "shot_frame"; roomCode: string; frame: ShotFrame }
  | { type: "shot_resolved"; room: RoomState }
  | { type: "turn_changed"; room: RoomState }
  | { type: "error"; message: string };

export const SEATS: Seat[] = ["A1", "B1", "A2", "B2"];
export const SEATS_BY_MODE: Record<GameMode, Seat[]> = {
  "1v1": ["A1", "B1"],
  "2v2": ["A1", "B1", "A2", "B2"]
};

export function teamForSeat(seat: Seat): Team {
  return seat.startsWith("A") ? "A" : "B";
}
