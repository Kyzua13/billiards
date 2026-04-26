import {
  SEATS,
  buildPreview,
  canShoot,
  teamForSeat,
  type Ball,
  type GameMode,
  type RoomState,
  type ServerMessage,
  type ShotFrame,
  type Team,
  type Vec2
} from "../../shared/src/index.ts";
import "./styles.css";

const NAME_KEY = "lan-pool-name";
const CLIENT_ID_KEY = "lan-pool-client-id";
const MUSIC_ENABLED_KEY = "lan-pool-music-enabled";
const MUSIC_VOLUME_KEY = "lan-pool-music-volume";
const TABLE_WIDTH = 960;
const TABLE_HEIGHT = 520;
const SOUND_LIMIT = 2;

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
  aimLocked: boolean;
  power: number;
  dragging: boolean;
  gameMode: GameMode;
  musicEnabled: boolean;
  musicVolume: number;
  error: string;
}

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("App root not found");

const state: AppState = {
  connected: false,
  playerId: getOrCreateClientId(),
  aimAngle: 0,
  aimLocked: false,
  power: 0.45,
  dragging: false,
  gameMode: "1v1",
  musicEnabled: localStorage.getItem(MUSIC_ENABLED_KEY) === "true",
  musicVolume: Number(localStorage.getItem(MUSIC_VOLUME_KEY) ?? "0.28"),
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
          <div class="teamPocketed">
            <div class="teamPocketedHeader">Team A</div>
            <div id="pocketedA" class="pocketedBalls"></div>
            <div class="teamPocketedHeader">Team B</div>
            <div id="pocketedB" class="pocketedBalls"></div>
          </div>
        </div>
        <div id="seats" class="seats"></div>
        <div class="meter">
          <label for="powerInput">Power</label>
          <input id="powerInput" type="range" min="0" max="1" step="0.01" />
          <span id="powerText">45%</span>
        </div>
        <button id="shootBtn" class="shoot" disabled>Shoot</button>
        <div class="musicPanel">
          <button id="musicBtn" type="button">Music off</button>
          <input id="musicVolume" type="range" min="0" max="1" step="0.01" aria-label="Music volume" />
        </div>
        <p id="message" class="message"></p>
        <p id="error" class="error"></p>
      </aside>
      <section class="tableWrap">
        <canvas id="table"></canvas>
        <div id="winnerOverlay" class="winnerOverlay" hidden>
          <div class="winnerCard">
            <span>Game over</span>
            <strong id="winnerTitle">Team wins</strong>
            <p id="winnerNames"></p>
          </div>
        </div>
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
const musicBtn = document.querySelector<HTMLButtonElement>("#musicBtn")!;
const musicVolume = document.querySelector<HTMLInputElement>("#musicVolume")!;

let audioContext: AudioContext | undefined;
let musicGain: GainNode | undefined;
let musicTimer: number | undefined;
let renderedPixelRatio = 1;
let tableRenderPending = false;

nameInput.value = localStorage.getItem(NAME_KEY) ?? "";
powerInput.value = String(state.power);
musicVolume.value = String(clamp(state.musicVolume, 0, 1));

document.querySelector<HTMLButtonElement>("#createBtn")!.addEventListener("click", () => {
  localStorage.setItem(NAME_KEY, nameInput.value.trim());
  state.gameMode = modeInput.value === "2v2" ? "2v2" : "1v1";
  ensureAudio();
  if (state.musicEnabled) startMusic();
  ensureSocket().then(() =>
    send({ type: "create_room", name: nameInput.value, gameMode: state.gameMode, clientId: state.playerId })
  );
});

document.querySelector<HTMLButtonElement>("#joinBtn")!.addEventListener("click", () => {
  localStorage.setItem(NAME_KEY, nameInput.value.trim());
  ensureAudio();
  if (state.musicEnabled) startMusic();
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
  renderChrome();
  renderTable();
});

shootBtn.addEventListener("click", () => {
  if (!state.room || !state.aimLocked || state.power <= 0) return;
  ensureAudio();
  if (state.musicEnabled) startMusic();
  send({ type: "shoot", roomCode: state.room.code, shot: { angle: state.aimAngle, power: state.power } });
});

musicBtn.addEventListener("click", () => {
  ensureAudio();
  state.musicEnabled = !state.musicEnabled;
  localStorage.setItem(MUSIC_ENABLED_KEY, String(state.musicEnabled));
  if (state.musicEnabled) startMusic();
  else stopMusic();
  renderChrome();
});

musicVolume.addEventListener("input", () => {
  state.musicVolume = Number(musicVolume.value);
  localStorage.setItem(MUSIC_VOLUME_KEY, String(state.musicVolume));
  if (musicGain && audioContext) {
    musicGain.gain.setTargetAtTime(state.musicVolume * 0.16, audioContext.currentTime, 0.05);
  }
});

canvas.addEventListener("pointermove", (event) => {
  const room = state.room;
  if (!room || !state.dragging) return;
  const cue = room.gameState.balls.find((ball) => ball.id === 0 && !ball.pocketed);
  if (!cue) return;
  const point = eventToTable(event);
  state.aimAngle = Math.atan2(point.y - cue.position.y, point.x - cue.position.x);
  state.aimLocked = false;
  renderTable();
});

canvas.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  const room = state.room;
  if (!room || !canShoot(room.gameState, getMe()?.seat)) return;
  const cue = room.gameState.balls.find((ball) => ball.id === 0 && !ball.pocketed);
  if (!cue) return;
  ensureAudio();
  if (state.musicEnabled) startMusic();
  const point = eventToTable(event);
  state.aimAngle = Math.atan2(point.y - cue.position.y, point.x - cue.position.x);
  state.aimLocked = false;
  state.dragging = true;
  canvas.setPointerCapture(event.pointerId);
  render();
});

canvas.addEventListener("pointerup", (event) => {
  const wasDragging = state.dragging;
  state.dragging = false;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  if (wasDragging && state.room && canShoot(state.room.gameState, getMe()?.seat)) {
    state.aimLocked = true;
  }
  render();
});

canvas.addEventListener("pointercancel", () => {
  state.dragging = false;
  render();
});

window.addEventListener("resize", () => renderTable());

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
      applyRoom(message.room, true);
      state.playerId = message.playerId;
      localStorage.setItem(CLIENT_ID_KEY, message.playerId);
      roomInput.value = message.room.code;
      state.error = "";
      break;
    case "state_snapshot":
      applyRoom(message.room, true);
      if (message.playerId) state.playerId = message.playerId;
      break;
    case "player_update":
    case "shot_resolved":
    case "turn_changed":
      applyRoom(message.room, true);
      break;
    case "shot_started":
      applyRoom(message.room, true);
      renderChrome();
      renderTable();
      return;
    case "shot_frame":
      handleShotFrame(message.roomCode, message.frame);
      return;
    case "error":
      state.error = message.message;
      break;
  }
  render();
}

function applyRoom(room: RoomState, clearAim: boolean): void {
  state.room = room;
  if (clearAim) state.aimLocked = false;
  state.gameMode = room.gameMode;
  modeInput.value = room.gameMode;
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
    ? `${room.gameState.ruleState.message || "Playing"}${active ? ` · Turn: ${active.name}` : ""}${
        state.aimLocked ? " · Aim locked" : ""
      }`
    : "Create a room or join one on the same LAN";
  error.textContent = state.error;
  shootBtn.disabled = !room || !canShoot(room.gameState, getMe()?.seat) || !state.aimLocked || state.power <= 0;
  modeInput.disabled = Boolean(room);
  musicBtn.textContent = state.musicEnabled ? "Music on" : "Music off";
  renderWinner();
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
  renderTeamPocketed("A", document.querySelector<HTMLDivElement>("#pocketedA")!);
  renderTeamPocketed("B", document.querySelector<HTMLDivElement>("#pocketedB")!);
}

function renderTeamPocketed(team: Team, pocketedBalls: HTMLDivElement): void {
  const ids = state.room?.gameState.ruleState.pocketedByTeam?.[team] ?? [];
  const balls = ids
    .map((id) => state.room?.gameState.balls.find((ball) => ball.id === id))
    .filter((ball): ball is Ball => Boolean(ball));
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
    chip.title = `Team ${team} pocketed ball ${ball.id}`;
    chip.textContent = String(ball.id);
    pocketedBalls.append(chip);
  }
}

function renderTable(): void {
  resizeCanvasForDisplay();
  const room = state.room;
  const table = room?.gameState.table;
  ctx.setTransform(renderedPixelRatio, 0, 0, renderedPixelRatio, 0, 0);
  ctx.clearRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);

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

  if (canShoot(room.gameState, getMe()?.seat)) drawPreview(room);

  for (const ball of room.gameState.balls) {
    if (!ball.pocketed) drawBall(ball);
  }
}

function drawEmptyTable(): void {
  ctx.fillStyle = "#15211d";
  ctx.fillRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);
  ctx.fillStyle = "#f3efe7";
  ctx.font = "24px system-ui";
  ctx.textAlign = "center";
  ctx.fillText("Create or join a LAN room", TABLE_WIDTH / 2, TABLE_HEIGHT / 2);
}

function drawPreview(room: RoomState): void {
  const preview = buildPreview(room.gameState.balls, room.gameState.table, state.aimAngle, state.power);
  drawPath(preview.cuePath, state.aimLocked ? "rgba(120,220,255,0.9)" : "rgba(255,255,255,0.78)", 3);

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
    x: ((event.clientX - rect.left) / rect.width) * TABLE_WIDTH,
    y: ((event.clientY - rect.top) / rect.height) * TABLE_HEIGHT
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
  requestTableRender();
}

function ensureAudio(): void {
  audioContext ??= new AudioContext();
  if (audioContext.state === "suspended") void audioContext.resume();
}

function playFrameSounds(frame: ShotFrame): void {
  if (!audioContext || audioContext.state !== "running") return;
  for (const event of frame.events.slice(0, SOUND_LIMIT)) {
    if (event.type === "cue") playTone(210, 0.04, 0.12 * event.intensity, "square");
    if (event.type === "collision") playTone(520, 0.03, 0.06 * event.intensity, "triangle");
    if (event.type === "cushion") playTone(150, 0.04, 0.05 * event.intensity, "sawtooth");
    if (event.type === "pocket") playTone(86, 0.1, 0.14 * event.intensity, "sine");
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

function startMusic(): void {
  if (!audioContext || musicTimer !== undefined) return;
  musicGain ??= audioContext.createGain();
  musicGain.gain.setValueAtTime(state.musicVolume * 0.16, audioContext.currentTime);
  musicGain.connect(audioContext.destination);
  playLofiBar();
  musicTimer = window.setInterval(playLofiBar, 2400);
}

function stopMusic(): void {
  if (musicTimer !== undefined) {
    window.clearInterval(musicTimer);
    musicTimer = undefined;
  }
}

function playLofiBar(): void {
  if (!audioContext || !musicGain) return;
  const now = audioContext.currentTime;
  const chords = [
    [196, 246.94, 293.66],
    [174.61, 220, 261.63],
    [164.81, 196, 246.94],
    [185, 233.08, 277.18]
  ];
  const chord = chords[Math.floor((now / 2.4) % chords.length)];
  chord.forEach((frequency, index) => playMusicTone(frequency, now + index * 0.025, 1.8, 0.035, "sine"));
  playMusicTone(chord[0] / 2, now, 1.2, 0.045, "triangle");
  playNoise(now + 0.08, 0.7, 0.012);
}

function playMusicTone(
  frequency: number,
  start: number,
  duration: number,
  gainValue: number,
  type: OscillatorType
): void {
  if (!audioContext || !musicGain) return;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.001, start);
  gain.gain.exponentialRampToValueAtTime(gainValue, start + 0.08);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  oscillator.connect(gain);
  gain.connect(musicGain);
  oscillator.start(start);
  oscillator.stop(start + duration);
}

function playNoise(start: number, duration: number, gainValue: number): void {
  if (!audioContext || !musicGain) return;
  const buffer = audioContext.createBuffer(1, Math.floor(audioContext.sampleRate * duration), audioContext.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * 0.35;
  const source = audioContext.createBufferSource();
  const gain = audioContext.createGain();
  source.buffer = buffer;
  gain.gain.setValueAtTime(gainValue, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  source.connect(gain);
  gain.connect(musicGain);
  source.start(start);
}

function renderWinner(): void {
  const overlay = document.querySelector<HTMLDivElement>("#winnerOverlay")!;
  const title = document.querySelector<HTMLElement>("#winnerTitle")!;
  const names = document.querySelector<HTMLParagraphElement>("#winnerNames")!;
  const winner = state.room?.gameState.ruleState.winner;
  overlay.hidden = !winner;
  if (!winner || !state.room) return;
  title.textContent = `Team ${winner} wins`;
  const winnerNames = state.room.players
    .filter((player) => player.team === winner)
    .map((player) => player.name)
    .join(", ");
  names.textContent = winnerNames || `Team ${winner}`;
}

function resizeCanvasForDisplay(): void {
  const rect = canvas.getBoundingClientRect();
  const pixelRatio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const displayWidth = Math.max(1, Math.round(rect.width * pixelRatio));
  const displayHeight = Math.max(1, Math.round((rect.width * TABLE_HEIGHT / TABLE_WIDTH) * pixelRatio));
  if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
    canvas.width = displayWidth;
    canvas.height = displayHeight;
  }
  renderedPixelRatio = displayWidth / TABLE_WIDTH;
}

function requestTableRender(): void {
  if (tableRenderPending) return;
  tableRenderPending = true;
  requestAnimationFrame(() => {
    tableRenderPending = false;
    renderTable();
  });
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
