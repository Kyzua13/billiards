import {
  SEATS,
  buildPreview,
  canShoot,
  teamForSeat,
  type Ball,
  type GameMode,
  type RoomState,
  type Seat,
  type ServerMessage,
  type ShotFrame,
  type Vec2
} from "../../shared/src/index.ts";
import "./styles.css";

const NAME_KEY = "lan-pool-name";
const CLIENT_ID_KEY = "lan-pool-client-id";
const SOUND_LIMIT = 3;
const BALL_PALETTE: Record<number, string> = {
  0: "#f7f2df",
  1: "#e7c74f",
  2: "#2f57a8",
  3: "#bd3032",
  4: "#60469b",
  5: "#e4762f",
  6: "#20865d",
  7: "#7d2b28",
  8: "#171717",
  9: "#e7c74f",
  10: "#2f57a8",
  11: "#bd3032",
  12: "#60469b",
  13: "#e4762f",
  14: "#20865d",
  15: "#7d2b28"
};

interface AppState {
  socket?: WebSocket;
  connected: boolean;
  playerId: string;
  room?: RoomState;
  aimAngle: number;
  power: number;
  dragging: boolean;
  gameMode: GameMode;
  error: string;
}

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("App root not found");

const state: AppState = {
  connected: false,
  playerId: getOrCreateClientId(),
  aimAngle: 0,
  power: 0.45,
  dragging: false,
  gameMode: "1v1",
  error: ""
};

app.innerHTML = `
  <main class="shell">
    <section class="topbar">
      <div>
        <h1>LAN 8-Ball Pool</h1>
        <p id="status">Disconnected</p>
      </div>
      <div class="connection">
        <input id="nameInput" maxlength="24" placeholder="Name" />
        <input id="roomInput" maxlength="5" placeholder="Room" />
        <select id="modeInput" aria-label="Game mode">
          <option value="1v1">1 vs 1</option>
          <option value="2v2">2 vs 2</option>
        </select>
        <button id="createBtn">Create</button>
        <button id="joinBtn">Join</button>
      </div>
    </section>

    <section class="layout">
      <aside class="panel">
        <div class="roomLine">
          <span>Room</span>
          <strong id="roomCode">-</strong>
        </div>
        <div class="pocketedPanel">
          <div class="panelTitle">Pocketed balls</div>
          <div id="pocketedBalls" class="pocketedBalls"></div>
        </div>
        <div id="seats" class="seats"></div>
        <div class="meter">
          <label for="powerInput">Power</label>
          <input id="powerInput" type="range" min="0" max="1" step="0.01" />
          <span id="powerText">45%</span>
        </div>
        <button id="shootBtn" class="shoot" disabled>Shoot</button>
        <p id="message" class="message"></p>
        <p id="error" class="error"></p>
      </aside>
      <section class="tableWrap">
        <canvas id="table" width="960" height="520"></canvas>
      </section>
    </section>
  </main>
`;

const canvas = document.querySelector<HTMLCanvasElement>("#table")!;
const ctx = canvas.getContext("2d")!;
const nameInput = document.querySelector<HTMLInputElement>("#nameInput")!;
const roomInput = document.querySelector<HTMLInputElement>("#roomInput")!;
const modeInput = document.querySelector<HTMLSelectElement>("#modeInput")!;
const powerInput = document.querySelector<HTMLInputElement>("#powerInput")!;
const powerText = document.querySelector<HTMLSpanElement>("#powerText")!;
const shootBtn = document.querySelector<HTMLButtonElement>("#shootBtn")!;
let audioContext: AudioContext | undefined;

nameInput.value = localStorage.getItem(NAME_KEY) ?? "";
powerInput.value = String(state.power);

document.querySelector<HTMLButtonElement>("#createBtn")!.addEventListener("click", () => {
  localStorage.setItem(NAME_KEY, nameInput.value.trim());
  state.gameMode = modeInput.value === "2v2" ? "2v2" : "1v1";
  ensureAudio();
  ensureSocket().then(() =>
    send({ type: "create_room", name: nameInput.value, gameMode: state.gameMode, clientId: state.playerId })
  );
});

document.querySelector<HTMLButtonElement>("#joinBtn")!.addEventListener("click", () => {
  localStorage.setItem(NAME_KEY, nameInput.value.trim());
  ensureAudio();
  ensureSocket().then(() =>
    send({ type: "join_room", roomCode: roomInput.value.toUpperCase(), name: nameInput.value, clientId: state.playerId })
  );
});

nameInput.addEventListener("change", () => {
  localStorage.setItem(NAME_KEY, nameInput.value.trim());
  if (state.room) send({ type: "set_name", roomCode: state.room.code, name: nameInput.value });
});

powerInput.addEventListener("input", () => {
  state.power = Number(powerInput.value);
  render();
});

shootBtn.addEventListener("click", () => {
  if (!state.room) return;
  if (state.power <= 0) return;
  ensureAudio();
  send({ type: "shoot", roomCode: state.room.code, shot: { angle: state.aimAngle, power: state.power } });
});

canvas.addEventListener("pointermove", (event) => {
  const room = state.room;
  if (!room) return;
  const cue = room.gameState.balls.find((ball) => ball.id === 0 && !ball.pocketed);
  if (!cue) return;
  const point = eventToTable(event);
  state.aimAngle = Math.atan2(point.y - cue.position.y, point.x - cue.position.x);
  if (state.dragging && canShoot(room.gameState, getMe()?.seat)) {
    state.power = Math.max(0, Math.min(1, distance(point, cue.position) / 520));
    powerInput.value = String(state.power);
  }
  render();
});

canvas.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  const room = state.room;
  if (!room) return;
  if (!canShoot(room.gameState, getMe()?.seat)) return;
  const cue = room.gameState.balls.find((ball) => ball.id === 0 && !ball.pocketed);
  if (!cue) return;
  ensureAudio();
  const point = eventToTable(event);
  state.aimAngle = Math.atan2(point.y - cue.position.y, point.x - cue.position.x);
  state.power = Math.max(0, Math.min(1, distance(point, cue.position) / 520));
  state.dragging = true;
  canvas.setPointerCapture(event.pointerId);
  powerInput.value = String(state.power);
  render();
});

canvas.addEventListener("pointerup", (event) => {
  const wasDragging = state.dragging;
  state.dragging = false;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  if (wasDragging && state.room && canShoot(state.room.gameState, getMe()?.seat) && state.power > 0) {
    send({ type: "shoot", roomCode: state.room.code, shot: { angle: state.aimAngle, power: state.power } });
  }
});

canvas.addEventListener("pointercancel", () => {
  state.dragging = false;
});

render();

async function ensureSocket(): Promise<void> {
  if (state.socket?.readyState === WebSocket.OPEN) return;

  const socket = new WebSocket(getWsUrl());
  state.socket = socket;

  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => {
      state.connected = true;
      state.error = "";
      render();
      resolve();
    });
    socket.addEventListener("error", () => {
      state.error = "Unable to connect to server";
      render();
      reject(new Error("WebSocket connection failed"));
    });
  });

  socket.addEventListener("message", (event) => handleServerMessage(JSON.parse(String(event.data)) as ServerMessage));
  socket.addEventListener("close", () => {
    state.connected = false;
    render();
  });
}

function handleServerMessage(message: ServerMessage): void {
  switch (message.type) {
    case "room_created":
    case "joined_room":
      state.room = message.room;
      state.gameMode = message.room.gameMode;
      modeInput.value = message.room.gameMode;
      state.playerId = message.playerId;
      localStorage.setItem(CLIENT_ID_KEY, message.playerId);
      roomInput.value = message.room.code;
      state.error = "";
      break;
    case "state_snapshot":
      state.room = message.room;
      state.gameMode = message.room.gameMode;
      modeInput.value = message.room.gameMode;
      if (message.playerId) state.playerId = message.playerId;
      break;
    case "player_update":
    case "shot_started":
    case "shot_resolved":
    case "turn_changed":
      state.room = message.room;
      state.gameMode = message.room.gameMode;
      modeInput.value = message.room.gameMode;
      break;
    case "shot_frame":
      handleShotFrame(message.roomCode, message.frame);
      break;
    case "error":
      state.error = message.message;
      break;
  }
  render();
}

function render(): void {
  renderChrome();
  renderPocketedBalls();
  renderSeats();
  renderTable();
}

function renderChrome(): void {
  const status = document.querySelector<HTMLParagraphElement>("#status")!;
  const roomCode = document.querySelector<HTMLElement>("#roomCode")!;
  const message = document.querySelector<HTMLParagraphElement>("#message")!;
  const error = document.querySelector<HTMLParagraphElement>("#error")!;
  const active = getCurrentPlayer();
  const room = state.room;

  status.textContent = state.connected ? "Connected" : "Disconnected";
  roomCode.textContent = room?.code ?? "-";
  powerText.textContent = `${Math.round(state.power * 100)}%`;
  message.textContent = room
    ? `${room.gameState.ruleState.message || "Playing"}${active ? ` · Turn: ${active.name}` : ""}`
    : "Create a room or join one on the same LAN";
  error.textContent = state.error;
  shootBtn.disabled = !room || !canShoot(room.gameState, getMe()?.seat);
  shootBtn.disabled = shootBtn.disabled || state.power <= 0;
  modeInput.disabled = Boolean(room);
}

function renderSeats(): void {
  const seats = document.querySelector<HTMLDivElement>("#seats")!;
  const room = state.room;
  seats.innerHTML = "";

  const visibleSeats = room ? SEATS.filter((seat) => room.gameMode === "2v2" || seat === "A1" || seat === "B1") : SEATS;

  for (const seat of visibleSeats) {
    const player = room?.players.find((candidate) => candidate.seat === seat);
    const button = document.createElement("button");
    button.className = `seat ${room?.gameState.currentTurnSeat === seat ? "active" : ""}`;
    button.disabled = !room || Boolean(player && player.id !== state.playerId);
    button.innerHTML = `<span>${seat} · Team ${teamForSeat(seat)}</span><strong>${player ? player.name : "Open"}</strong>`;
    button.addEventListener("click", () => {
      if (room) send({ type: "choose_seat", roomCode: room.code, seat });
    });
    seats.append(button);
  }
}

function renderPocketedBalls(): void {
  const pocketedBalls = document.querySelector<HTMLDivElement>("#pocketedBalls")!;
  const balls = state.room?.gameState.balls.filter((ball) => ball.pocketed).sort((a, b) => a.id - b.id) ?? [];
  pocketedBalls.innerHTML = "";

  if (balls.length === 0) {
    const empty = document.createElement("span");
    empty.className = "pocketedEmpty";
    empty.textContent = "None yet";
    pocketedBalls.append(empty);
    return;
  }

  for (const ball of balls) {
    const chip = document.createElement("span");
    chip.className = `pocketedBall ${ball.kind === "stripe" ? "stripe" : ""} ${ball.id === 8 ? "dark" : ""}`;
    chip.style.setProperty("--ball-color", BALL_PALETTE[ball.id] ?? "#ddd");
    chip.title = ball.id === 0 ? "Cue ball" : `Ball ${ball.id}`;
    chip.textContent = ball.id === 0 ? "C" : String(ball.id);
    pocketedBalls.append(chip);
  }
}

function renderTable(): void {
  const room = state.room;
  const table = room?.gameState.table;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!table) {
    drawEmptyTable();
    return;
  }

  ctx.fillStyle = "#203329";
  ctx.fillRect(0, 0, table.width, table.height);
  ctx.fillStyle = "#6c3f22";
  roundRect(8, 8, table.width - 16, table.height - 16, 18);
  ctx.fill();
  ctx.fillStyle = "#15734d";
  roundRect(table.cushion, table.cushion, table.width - table.cushion * 2, table.height - table.cushion * 2, 12);
  ctx.fill();

  for (const pocket of table.pockets) {
    ctx.fillStyle = "#07100c";
    circle(pocket.x, pocket.y, table.pocketRadius);
    ctx.fill();
  }

  if (canShoot(room.gameState, getMe()?.seat)) {
    drawPreview(room);
  }

  for (const ball of room.gameState.balls) {
    if (!ball.pocketed) drawBall(ball);
  }
}

function drawEmptyTable(): void {
  ctx.fillStyle = "#15211d";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#f3efe7";
  ctx.font = "24px system-ui";
  ctx.textAlign = "center";
  ctx.fillText("Create or join a LAN room", canvas.width / 2, canvas.height / 2);
}

function drawPreview(room: RoomState): void {
  const preview = buildPreview(room.gameState.balls, room.gameState.table, state.aimAngle, state.power);
  drawPath(preview.cuePath, "rgba(255,255,255,0.78)", 3);
  drawPath(preview.objectPath, "rgba(255,209,102,0.78)", 2);

  const cue = room.gameState.balls.find((ball) => ball.id === 0 && !ball.pocketed);
  if (!cue) return;
  const back = {
    x: cue.position.x - Math.cos(state.aimAngle) * (52 + state.power * 70),
    y: cue.position.y - Math.sin(state.aimAngle) * (52 + state.power * 70)
  };
  ctx.strokeStyle = "#d8bf8f";
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(back.x, back.y);
  ctx.lineTo(cue.position.x - Math.cos(state.aimAngle) * 18, cue.position.y - Math.sin(state.aimAngle) * 18);
  ctx.stroke();
}

function drawPath(points: Vec2[], color: string, width: number): void {
  if (points.length < 2) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawBall(ball: Ball): void {
  const radius = state.room?.gameState.table.ballRadius ?? 11;
  ctx.fillStyle = BALL_PALETTE[ball.id] ?? "#ddd";
  circle(ball.position.x, ball.position.y, radius);
  ctx.fill();

  if (ball.kind === "stripe") {
    ctx.save();
    circle(ball.position.x, ball.position.y, radius);
    ctx.clip();
    ctx.fillStyle = "#f7f2df";
    ctx.fillRect(ball.position.x - radius, ball.position.y - 4, radius * 2, 8);
    ctx.restore();
  }

  ctx.fillStyle = ball.id === 8 ? "#f7f2df" : "#151515";
  ctx.font = "10px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(ball.id || ""), ball.position.x, ball.position.y);
}

function circle(x: number, y: number, radius: number): void {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
}

function roundRect(x: number, y: number, width: number, height: number, radius: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function eventToTable(event: PointerEvent): Vec2 {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height
  };
}

function getCurrentPlayer() {
  const room = state.room;
  if (!room) return undefined;
  return room.players.find((player) => player.seat === room.gameState.currentTurnSeat);
}

function getMe() {
  return state.room?.players.find((player) => player.id === state.playerId);
}

function send(message: object): void {
  if (state.socket?.readyState === WebSocket.OPEN) {
    state.socket.send(JSON.stringify(message));
  }
}

function handleShotFrame(roomCode: string, frame: ShotFrame): void {
  if (!state.room || state.room.code !== roomCode) return;
  state.room = {
    ...state.room,
    gameState: {
      ...state.room.gameState,
      balls: frame.balls,
      shotInProgress: true
    }
  };
  playFrameSounds(frame);
  requestAnimationFrame(render);
}

function ensureAudio(): void {
  audioContext ??= new AudioContext();
  if (audioContext.state === "suspended") {
    void audioContext.resume();
  }
}

function playFrameSounds(frame: ShotFrame): void {
  if (!audioContext || audioContext.state !== "running") return;
  for (const event of frame.events.slice(0, SOUND_LIMIT)) {
    if (event.type === "cue") playTone(210, 0.045, 0.16 * event.intensity, "square");
    if (event.type === "collision") playTone(520, 0.035, 0.09 * event.intensity, "triangle");
    if (event.type === "cushion") playTone(150, 0.05, 0.08 * event.intensity, "sawtooth");
    if (event.type === "pocket") playTone(86, 0.12, 0.18 * event.intensity, "sine");
  }
}

function playTone(frequency: number, duration: number, gainValue: number, type: OscillatorType): void {
  if (!audioContext) return;
  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);
  gain.gain.setValueAtTime(Math.max(0.005, gainValue), now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + duration);
}

function getWsUrl(): string {
  const explicit = import.meta.env.VITE_WS_URL as string | undefined;
  if (explicit) return explicit;
  const host = window.location.hostname || "localhost";
  if (window.location.protocol === "https:") return `wss://${window.location.host}`;
  if (window.location.port && window.location.port !== "5173") return `ws://${window.location.host}`;
  return `ws://${host}:8787`;
}

function getOrCreateClientId(): string {
  const existing = localStorage.getItem(CLIENT_ID_KEY);
  if (existing) return existing;
  const next = crypto.randomUUID();
  localStorage.setItem(CLIENT_ID_KEY, next);
  return next;
}

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
