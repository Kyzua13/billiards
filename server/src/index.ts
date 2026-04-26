import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket, WebSocketServer } from "ws";
import {
  SEATS,
  SEATS_BY_MODE,
  applyShot,
  canShoot,
  createInitialGame,
  teamForSeat,
  type ClientMessage,
  type GameMode,
  type Player,
  type RoomState,
  type Seat,
  type ServerMessage
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
    case "shoot":
      shoot(context, message.roomCode, message.shot);
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

function shoot(context: ClientContext, roomCode: string, shot: { angle: number; power: number }): void {
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
  broadcast(room, { type: "shot_started", room: room.state });

  const resolution = applyShot(room.state.gameState, seat, {
    angle: Number.isFinite(shot.angle) ? shot.angle : 0,
    power
  }, room.state.gameMode);

  playShotFrames(room, resolution);
}

function playShotFrames(room: Room, resolution: ReturnType<typeof applyShot>): void {
  const frames = resolution.frames.length > 0 ? resolution.frames : [{ balls: resolution.state.balls, events: [] }];
  let index = 0;

  const sendNextFrame = () => {
    const frame = frames[index];
    if (!frame) {
      room.state.gameState = resolution.state;
      broadcast(room, { type: "shot_resolved", room: room.state });
      broadcast(room, { type: "turn_changed", room: room.state });
      return;
    }

    room.state.gameState.balls = frame.balls;
    room.state.gameState.shotInProgress = true;
    broadcast(room, { type: "shot_frame", roomCode: room.state.code, frame });
    index += 1;
    setTimeout(sendNextFrame, 40);
  };

  setTimeout(sendNextFrame, 40);
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
