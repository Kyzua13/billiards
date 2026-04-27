import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket, WebSocketServer } from "ws";
import { MatchmakingQueue, seatMatchedPlayers } from "./matchmaking.ts";
import {
  SEATS,
  SEATS_BY_MODE,
  applyShot,
  canShoot,
  cloneBalls,
  createInitialGame,
  isInPocket,
  teamForSeat,
  type ClientMessage,
  type GameMode,
  type Player,
  type RoomState,
  type Seat,
  type ServerMessage,
  type Shot
} from "../../shared/src/index.ts";

const PORT = Number(process.env.PORT ?? 8787);
const ROOT_DIR = normalize(join(dirname(fileURLToPath(import.meta.url)), "../.."));
const DIST_DIR = join(ROOT_DIR, "dist");

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

interface ClientContext {
  socket: WebSocket;
  playerId: string;
  roomCode?: string;
}

interface Room {
  state: RoomState;
  clients: Set<WebSocket>;
}

const rooms = new Map<string, Room>();
const contexts = new Map<WebSocket, ClientContext>();
const matchmaking = new MatchmakingQueue();

const httpServer = createServer((request, response) => {
  if (request.url === "/healthz") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true }));
    return;
  }

  serveStatic(request.url ?? "/", response);
});

const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (socket) => {
  const context: ClientContext = { socket, playerId: createId() };
  contexts.set(socket, context);

  socket.on("message", (data) => {
    try {
      handleMessage(context, JSON.parse(String(data)) as ClientMessage);
    } catch (error) {
      send(socket, { type: "error", message: error instanceof Error ? error.message : "Invalid message" });
    }
  });

  socket.on("close", () => {
    const current = contexts.get(socket);
    contexts.delete(socket);
    if (current) matchmaking.remove(current.playerId);
    if (!current?.roomCode) return;
    const room = rooms.get(current.roomCode);
    if (!room) return;
    room.clients.delete(socket);
    const player = room.state.players.find((candidate) => candidate.id === current.playerId);
    if (player) player.connected = false;
    broadcast(room, { type: "player_update", room: room.state });
  });
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Pool server listening on http://localhost:${PORT}`);
  console.log(`WebSocket available on the same HTTP server`);
  const addresses = getLanAddresses();
  const radmin = addresses.find((entry) => entry.name.toLowerCase().includes("radmin"));

  if (radmin) {
    console.log("");
    console.log("Radmin VPN detected");
    console.log(`Server-served client URL: http://${radmin.address}:${PORT}`);
    console.log(`Vite dev client URL, if npm run dev is active: http://${radmin.address}:5173`);
    console.log(`Radmin WebSocket: ws://${radmin.address}:${PORT}`);
    console.log("");
  }

  for (const entry of addresses) {
    const label = entry.name.toLowerCase().includes("radmin") ? "Radmin" : "LAN";
    console.log(`${label} WebSocket: ws://${entry.address}:${PORT}`);
    console.log(`Server-served client: http://${entry.address}:${PORT}`);
    console.log(`Vite dev client, if active: http://${entry.address}:5173`);
  }
});

function serveStatic(url: string, response: import("node:http").ServerResponse): void {
  if (!existsSync(DIST_DIR)) {
    response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    response.end("LAN 8-Ball Pool server is running. Run `npm run build` to serve the web client here.\n");
    return;
  }

  const pathname = decodeURIComponent(new URL(url, "http://localhost").pathname);
  const requestedPath = pathname === "/" ? "index.html" : pathname.replace(/^[/\\]+/, "");
  const safePath = normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  let filePath = join(DIST_DIR, safePath);

  if (!filePath.startsWith(DIST_DIR)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  if (!existsSync(filePath)) {
    filePath = join(DIST_DIR, "index.html");
  }

  const extension = extname(filePath);
  response.writeHead(200, {
    "content-type": CONTENT_TYPES[extension] ?? "application/octet-stream",
    "cache-control": extension === ".html" ? "no-cache" : "public, max-age=31536000, immutable"
  });
  createReadStream(filePath).pipe(response);
}

function handleMessage(context: ClientContext, message: ClientMessage): void {
  switch (message.type) {
    case "create_room":
      createRoom(context, message.name, message.gameMode, message.clientId);
      break;
    case "join_room":
      joinRoom(context, message.roomCode, message.name, message.clientId);
      break;
    case "choose_seat":
      chooseSeat(context, message.roomCode, message.seat);
      break;
    case "set_name":
      setName(context, message.roomCode, message.name);
      break;
    case "place_cue":
      placeCue(context, message.roomCode, message.position);
      break;
    case "find_match":
      findMatch(context, message.name, message.clientId);
      break;
    case "cancel_match":
      cancelMatch(context);
      break;
    case "shoot":
      shoot(context, message.roomCode, message.shot);
      break;
    case "request_rematch":
      requestRematch(context, message.roomCode);
      break;
    case "request_state":
      requestState(context, message.roomCode);
      break;
    default:
      send(context.socket, { type: "error", message: "Unknown message type" });
  }
}

function createRoom(context: ClientContext, name: string, gameMode: GameMode, clientId?: string): void {
  const code = createRoomCode();
  const player = createPlayer(clientId ?? context.playerId, name);
  context.playerId = player.id;
  context.roomCode = code;
  matchmaking.remove(player.id);

  const room: Room = {
    clients: new Set([context.socket]),
    state: {
      code,
      gameMode: gameMode === "1v1" ? "1v1" : "2v2",
      players: [player],
      gameState: createInitialGame()
    }
  };

  rooms.set(code, room);
  send(context.socket, { type: "room_created", room: room.state, playerId: context.playerId });
}

function joinRoom(context: ClientContext, roomCode: string, name: string, clientId?: string): void {
  const code = roomCode.trim().toUpperCase();
  const room = rooms.get(code);
  if (!room) {
    send(context.socket, { type: "error", message: "Room not found" });
    return;
  }

  const requestedId = clientId ?? context.playerId;
  matchmaking.remove(requestedId);
  let player = room.state.players.find((candidate) => candidate.id === requestedId);
  if (player) {
    player.name = cleanName(name);
    player.connected = true;
  } else {
    player = createPlayer(requestedId, name);
    room.state.players.push(player);
  }

  context.playerId = player.id;
  context.roomCode = code;
  room.clients.add(context.socket);
  send(context.socket, { type: "joined_room", room: room.state, playerId: context.playerId });
  broadcast(room, { type: "player_update", room: room.state });
}

function findMatch(context: ClientContext, name: string, clientId?: string): void {
  const requestedId = clientId ?? context.playerId;
  const playerId = matchmaking.has(requestedId) && contextForPlayer(requestedId) !== context ? context.playerId : requestedId;
  context.playerId = playerId;
  context.roomCode = undefined;

  const pair = matchmaking.join(playerId, cleanName(name));
  if (!pair) {
    send(context.socket, { type: "matchmaking_update", status: "searching" });
    return;
  }

  const firstContext = contextForPlayer(pair.first.playerId);
  const secondContext = contextForPlayer(pair.second.playerId);
  if (!firstContext || !secondContext) {
    if (firstContext) matchmaking.join(pair.first.playerId, pair.first.name);
    if (secondContext) matchmaking.join(pair.second.playerId, pair.second.name);
    return;
  }

  const code = createRoomCode();
  const firstPlayer = createPlayer(pair.first.playerId, pair.first.name);
  const secondPlayer = createPlayer(pair.second.playerId, pair.second.name);
  seatMatchedPlayers(firstPlayer, secondPlayer);
  const gameState = createInitialGame();
  gameState.phase = "playing";
  gameState.ruleState.message = "Random match started";
  const room: Room = {
    clients: new Set([firstContext.socket, secondContext.socket]),
    state: {
      code,
      gameMode: "1v1",
      players: [firstPlayer, secondPlayer],
      gameState
    }
  };
  rooms.set(code, room);
  firstContext.roomCode = code;
  secondContext.roomCode = code;
  send(firstContext.socket, { type: "match_found", room: room.state, playerId: firstContext.playerId });
  send(secondContext.socket, { type: "match_found", room: room.state, playerId: secondContext.playerId });
  broadcast(room, { type: "turn_changed", room: room.state });
}

function cancelMatch(context: ClientContext): void {
  matchmaking.cancel(context.playerId);
  send(context.socket, { type: "matchmaking_update", status: "cancelled" });
}

function chooseSeat(context: ClientContext, roomCode: string, seat: Seat): void {
  const room = requireRoom(roomCode);
  const player = requirePlayer(room, context.playerId);
  if (!SEATS.includes(seat)) throw new Error("Invalid seat");
  if (!SEATS_BY_MODE[room.state.gameMode].includes(seat)) throw new Error("Seat is not available in this mode");
  const occupant = room.state.players.find((candidate) => candidate.seat === seat && candidate.id !== player.id);
  if (occupant) throw new Error("Seat already taken");

  player.seat = seat;
  player.team = teamForSeat(seat);

  const activeSeatCount = room.state.players.filter((candidate) => candidate.seat).length;
  if (
    activeSeatCount === SEATS_BY_MODE[room.state.gameMode].length &&
    room.state.gameState.phase === "lobby"
  ) {
    room.state.gameState.phase = "playing";
    room.state.gameState.ruleState.message = `Break: ${room.state.gameMode}`;
  }

  broadcast(room, { type: "player_update", room: room.state });
  broadcast(room, { type: "turn_changed", room: room.state });
}

function setName(context: ClientContext, roomCode: string, name: string): void {
  const room = requireRoom(roomCode);
  const player = requirePlayer(room, context.playerId);
  player.name = cleanName(name);
  broadcast(room, { type: "player_update", room: room.state });
}

function shoot(context: ClientContext, roomCode: string, shot: Shot): void {
  const room = requireRoom(roomCode);
  const player = requirePlayer(room, context.playerId);
  const seat = player.seat;
  if (!seat || !canShoot(room.state.gameState, seat)) {
    throw new Error("It is not your turn");
  }

  const power = Math.max(0, Math.min(1, Number.isFinite(shot.power) ? shot.power : 0));
  if (power <= 0) {
    throw new Error("Shot power must be greater than zero");
  }

  room.state.gameState.shotInProgress = true;
  const authoritativeShot = {
    angle: Number.isFinite(shot.angle) ? shot.angle : 0,
    power,
    spin: normalizeSpin(shot.spin)
  };
  const startBalls = cloneBalls(room.state.gameState.balls);
  broadcast(room, { type: "shot_started", room: room.state, shot: authoritativeShot, startBalls, activeSeat: seat });

  const resolution = applyShot(room.state.gameState, seat, authoritativeShot, room.state.gameMode);
  room.state.gameState = resolution.state;
  setTimeout(() => {
    broadcast(room, { type: "shot_resolved", room: room.state });
    broadcast(room, { type: "turn_changed", room: room.state });
  }, 120);
}

function placeCue(context: ClientContext, roomCode: string, position: { x: number; y: number }): void {
  const room = requireRoom(roomCode);
  const player = requirePlayer(room, context.playerId);
  if (!player.seat || room.state.gameState.ruleState.cuePlacementSeat !== player.seat) {
    throw new Error("You cannot place the cue ball right now");
  }

  const cue = room.state.gameState.balls.find((ball) => ball.id === 0);
  if (!cue) throw new Error("Cue ball missing");

  if (!isValidCuePlacement(room.state.gameState, position)) {
    throw new Error("Invalid cue placement");
  }

  cue.position = clampPoint(position, room.state.gameState.table);
  cue.velocity = { x: 0, y: 0 };
  cue.angularVelocity = { x: 0, y: 0, z: 0 };
  cue.motionState = "settled";
  cue.pocketed = false;
  room.state.gameState.ruleState.cuePlacementSeat = undefined;
  room.state.gameState.ruleState.message = "Cue ball placed";
  broadcast(room, { type: "player_update", room: room.state });
  broadcast(room, { type: "turn_changed", room: room.state });
}

function requestRematch(context: ClientContext, roomCode: string): void {
  const room = requireRoom(roomCode);
  const player = requirePlayer(room, context.playerId);
  if (!player.seat) throw new Error("You must be seated to request a rematch");
  room.state.gameState = {
    ...createInitialGame(),
    phase: "playing",
    currentTurnSeat: "A1"
  };
  room.state.gameState.ruleState.message = "New game started";
  broadcast(room, { type: "player_update", room: room.state });
  broadcast(room, { type: "turn_changed", room: room.state });
}

function requestState(context: ClientContext, roomCode: string): void {
  const room = requireRoom(roomCode);
  send(context.socket, { type: "state_snapshot", room: room.state, playerId: context.playerId });
}

function requireRoom(roomCode: string): Room {
  const room = rooms.get(roomCode.trim().toUpperCase());
  if (!room) throw new Error("Room not found");
  return room;
}

function requirePlayer(room: Room, playerId: string): Player {
  const player = room.state.players.find((candidate) => candidate.id === playerId);
  if (!player) throw new Error("Player not in room");
  return player;
}

function contextForPlayer(playerId: string): ClientContext | undefined {
  for (const context of contexts.values()) {
    if (context.playerId === playerId && context.socket.readyState === WebSocket.OPEN) return context;
  }
  return undefined;
}

function broadcast(room: Room, message: ServerMessage): void {
  const payload = JSON.stringify(message);
  for (const client of room.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  }
}

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function createPlayer(id: string, name: string): Player {
  return {
    id,
    name: cleanName(name),
    connected: true
  };
}

function cleanName(name: string): string {
  const trimmed = name.trim().slice(0, 24);
  return trimmed || "Player";
}

function createId(): string {
  return randomUUID();
}

function createRoomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  do {
    code = Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  } while (rooms.has(code));
  return code;
}

function getLanAddresses(): Array<{ name: string; address: string }> {
  const addresses: Array<{ name: string; address: string }> = [];
  for (const [name, entries] of Object.entries(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) addresses.push({ name, address: entry.address });
    }
  }
  return addresses;
}

function clampPoint(position: { x: number; y: number }, table: RoomState["gameState"]["table"]): { x: number; y: number } {
  const minX = table.cushion + table.ballRadius;
  const maxX = table.width - table.cushion - table.ballRadius;
  const minY = table.cushion + table.ballRadius;
  const maxY = table.height - table.cushion - table.ballRadius;
  return {
    x: Math.min(maxX, Math.max(minX, position.x)),
    y: Math.min(maxY, Math.max(minY, position.y))
  };
}

function normalizeSpin(spin: Shot["spin"]): { x: number; y: number } {
  return {
    x: clampUnit(spin?.x),
    y: clampUnit(spin?.y)
  };
}

function clampUnit(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
}

function isValidCuePlacement(state: RoomState["gameState"], position: { x: number; y: number }): boolean {
  const cueRadius = state.table.ballRadius;
  const clamped = clampPoint(position, state.table);
  if (isInPocket(clamped, state.table)) return false;
  return state.balls.every((ball) => {
    if (ball.id === 0 || ball.pocketed) return true;
    const dx = ball.position.x - clamped.x;
    const dy = ball.position.y - clamped.y;
    return Math.hypot(dx, dy) >= cueRadius * 2;
  });
}
