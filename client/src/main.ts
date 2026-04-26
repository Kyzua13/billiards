import {
  SEATS,
  buildPreview,
  canShoot,
  cloneBalls,
  createShotSimulation,
  isSimulationSettled,
  stepSimulation,
  teamForSeat,
  type Ball,
  type BallGroup,
  type GameMode,
  type RoomState,
  type Shot,
  type ServerMessage,
  type ShotFrame,
  type StepSimulationState,
  type Team,
  type Vec2
} from "../../shared/src/index.ts";
import "./styles.css";

const NAME_KEY = "lan-pool-name";
const CLIENT_ID_KEY = "lan-pool-client-id";
const LANGUAGE_KEY = "lan-pool-language";
const COMPACT_KEY = "lan-pool-compact";
const MUSIC_VOLUME_KEY = "lan-pool-music-volume";
const LOFI_STREAM_URL = "https://ice5.somafm.com/beatblender-128-mp3";
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

type Language = "ru" | "uk" | "en";

interface Locale {
  nativeName: string;
  namePlaceholder: string;
  roomPlaceholder: string;
  gameModeLabel: string;
  create: string;
  join: string;
  connected: string;
  disconnected: string;
  room: string;
  pocketedBalls: string;
  team: string;
  teamA: string;
  teamB: string;
  power: string;
  spin: string;
  resetSpin: string;
  shoot: string;
  createOrJoin: string;
  playing: string;
  turn: string;
  aimLocked: string;
  ballInHand: string;
  placeCue: string;
  open: string;
  noneYet: string;
  createOrJoinTable: string;
  gameOver: string;
  rematch: string;
  compact: string;
  reconnecting: string;
  music: string;
  groupOpen: string;
  groupSolids: string;
  groupStripes: string;
  teamWins: (team: Team) => string;
  teamFallback: (team: Team) => string;
  pocketedTitle: (team: Team, ball: number) => string;
  unableToConnect: string;
  foulNoContact: string;
  foulWrongContact: string;
  foulScratch: string;
  foulEightEarly: string;
  rule: Record<string, string>;
}

const LOCALES: Record<Language, Locale> = {
  ru: {
    nativeName: "Русский",
    namePlaceholder: "Имя",
    roomPlaceholder: "Комната",
    gameModeLabel: "Режим игры",
    create: "Создать",
    join: "Войти",
    connected: "Подключено",
    disconnected: "Отключено",
    room: "Комната",
    pocketedBalls: "Забитые шары",
    team: "Команда",
    teamA: "Команда A",
    teamB: "Команда B",
    power: "Сила",
    spin: "Вращение",
    resetSpin: "Сбросить вращение",
    shoot: "Удар",
    createOrJoin: "Создай комнату или войди в существующую",
    playing: "Игра идёт",
    turn: "Ход",
    aimLocked: "Прицел зафиксирован",
    ballInHand: "Шар в руки",
    placeCue: "Поставь биток",
    open: "Свободно",
    noneYet: "Пока нет",
    createOrJoinTable: "Создай комнату или войди",
    gameOver: "Игра окончена",
    rematch: "Новая партия",
    compact: "Компактно",
    reconnecting: "Переподключение...",
    music: "Музыка",
    groupOpen: "Открытый стол",
    groupSolids: "Шары solids",
    groupStripes: "Шары stripes",
    teamWins: (team) => `Победила команда ${team}`,
    teamFallback: (team) => `Команда ${team}`,
    pocketedTitle: (team, ball) => `Команда ${team} забила шар ${ball}`,
    unableToConnect: "Не удалось подключиться к серверу",
    foulNoContact: "Нет касания - шар в руки",
    foulWrongContact: "Неправильное касание - шар в руки",
    foulScratch: "Фол: биток в лузе - шар в руки",
    foulEightEarly: "Запрещённый 8-ball",
    rule: {
      Playing: "Игра идёт",
      "No ball pocketed": "Шары не забиты",
      "Turn passes": "Ход переходит",
      "Team A keeps the table": "Команда A продолжает ход",
      "Team B keeps the table": "Команда B продолжает ход",
      "Team A scratched": "Фол: команда A забила биток",
      "Team B scratched": "Фол: команда B забила биток",
      "Team A wins": "Победила команда A",
      "Team B wins": "Победила команда B",
      "Ball in hand": "Шар в руки",
      "Cue ball placed": "Биток установлен",
      "New game started": "Новая партия началась",
      "Illegal 8-ball": "Нарушение на 8-ball"
    }
  },
  uk: {
    nativeName: "Українська",
    namePlaceholder: "Ім'я",
    roomPlaceholder: "Кімната",
    gameModeLabel: "Режим гри",
    create: "Створити",
    join: "Увійти",
    connected: "Підключено",
    disconnected: "Відключено",
    room: "Кімната",
    pocketedBalls: "Забиті кулі",
    team: "Команда",
    teamA: "Команда A",
    teamB: "Команда B",
    power: "Сила",
    spin: "Обертання",
    resetSpin: "Скинути обертання",
    shoot: "Удар",
    createOrJoin: "Створи кімнату або увійди в існуючу",
    playing: "Гра триває",
    turn: "Хід",
    aimLocked: "Приціл зафіксовано",
    ballInHand: "Куля в руки",
    placeCue: "Постав биток",
    open: "Вільно",
    noneYet: "Поки немає",
    createOrJoinTable: "Створи кімнату або увійди",
    gameOver: "Гру завершено",
    rematch: "Нова партія",
    compact: "Компактно",
    reconnecting: "Перепідключення...",
    music: "Музика",
    groupOpen: "Відкритий стіл",
    groupSolids: "Кулі solids",
    groupStripes: "Кулі stripes",
    teamWins: (team) => `Перемогла команда ${team}`,
    teamFallback: (team) => `Команда ${team}`,
    pocketedTitle: (team, ball) => `Команда ${team} забила кулю ${ball}`,
    unableToConnect: "Не вдалося підключитися до сервера",
    foulNoContact: "Немає дотику - куля в руки",
    foulWrongContact: "Неправильний дотик - куля в руки",
    foulScratch: "Фол: биток у лузі - куля в руки",
    foulEightEarly: "Заборонений 8-ball",
    rule: {
      Playing: "Гра триває",
      "No ball pocketed": "Кулі не забито",
      "Turn passes": "Хід переходить",
      "Team A keeps the table": "Команда A продовжує хід",
      "Team B keeps the table": "Команда B продовжує хід",
      "Team A scratched": "Фол: команда A забила биток",
      "Team B scratched": "Фол: команда B забила биток",
      "Team A wins": "Перемогла команда A",
      "Team B wins": "Перемогла команда B",
      "Ball in hand": "Куля в руки",
      "Cue ball placed": "Биток встановлено",
      "New game started": "Нова партія почалася",
      "Illegal 8-ball": "Порушення на 8-ball"
    }
  },
  en: {
    nativeName: "English",
    namePlaceholder: "Name",
    roomPlaceholder: "Room",
    gameModeLabel: "Game mode",
    create: "Create",
    join: "Join",
    connected: "Connected",
    disconnected: "Disconnected",
    room: "Room",
    pocketedBalls: "Pocketed balls",
    team: "Team",
    teamA: "Team A",
    teamB: "Team B",
    power: "Power",
    spin: "Spin",
    resetSpin: "Reset spin",
    shoot: "Shoot",
    createOrJoin: "Create a room or join one on the same LAN",
    playing: "Playing",
    turn: "Turn",
    aimLocked: "Aim locked",
    ballInHand: "Ball in hand",
    placeCue: "Place cue ball",
    open: "Open",
    noneYet: "None yet",
    createOrJoinTable: "Create or join a LAN room",
    gameOver: "Game over",
    rematch: "Rematch",
    compact: "Compact",
    reconnecting: "Reconnecting...",
    music: "Music",
    groupOpen: "Open table",
    groupSolids: "Solids",
    groupStripes: "Stripes",
    teamWins: (team) => `Team ${team} wins`,
    teamFallback: (team) => `Team ${team}`,
    pocketedTitle: (team, ball) => `Team ${team} pocketed ball ${ball}`,
    unableToConnect: "Unable to connect to server",
    foulNoContact: "No contact - ball in hand",
    foulWrongContact: "Wrong contact - ball in hand",
    foulScratch: "Scratch - ball in hand",
    foulEightEarly: "Illegal 8-ball",
    rule: {
      Playing: "Playing",
      "No ball pocketed": "No ball pocketed",
      "Turn passes": "Turn passes",
      "Team A keeps the table": "Team A keeps the table",
      "Team B keeps the table": "Team B keeps the table",
      "Team A scratched": "Team A scratched",
      "Team B scratched": "Team B scratched",
      "Team A wins": "Team A wins",
      "Team B wins": "Team B wins",
      "Ball in hand": "Ball in hand",
      "Cue ball placed": "Cue ball placed",
      "New game started": "New game started",
      "Illegal 8-ball": "Illegal 8-ball"
    }
  }
};

interface AppState {
  socket?: WebSocket;
  connected: boolean;
  playerId: string;
  room?: RoomState;
  aimAngle: number;
  aimLocked: boolean;
  power: number;
  spin: Vec2;
  spinDragging: boolean;
  dragging: boolean;
  gameMode: GameMode;
  language: Language;
  languageMenuOpen: boolean;
  compactMode: boolean;
  musicVolume: number;
  placingCue: boolean;
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
  spin: { x: 0, y: 0 },
  spinDragging: false,
  dragging: false,
  gameMode: "1v1",
  language: getInitialLanguage(),
  languageMenuOpen: false,
  compactMode: localStorage.getItem(COMPACT_KEY) === "true",
  musicVolume: Number(localStorage.getItem(MUSIC_VOLUME_KEY) ?? "0.28"),
  placingCue: false,
  error: ""
};

app.innerHTML = `
  <main class="shell">
    <section class="topbar">
      <div>
        <h1>LAN 8-Ball Pool</h1>
        <p id="status">Disconnected</p>
      </div>
      <div class="topActions">
        <div class="connection">
          <input id="nameInput" maxlength="24" />
          <input id="roomInput" maxlength="5" />
          <select id="modeInput">
            <option value="1v1">1 vs 1</option>
            <option value="2v2">2 vs 2</option>
          </select>
          <button id="createBtn"></button>
          <button id="joinBtn"></button>
        </div>
        <div class="cornerControls">
          <button id="compactBtn" class="compactButton" type="button" title="Compact mode">◫</button>
          <div class="languagePicker">
            <button id="languageBtn" class="languageButton" type="button" aria-haspopup="true" aria-expanded="false"></button>
            <div id="languageMenu" class="languageMenu" hidden>
              <button type="button" data-language="ru"></button>
              <button type="button" data-language="uk"></button>
              <button type="button" data-language="en"></button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <div id="reconnectBanner" class="reconnectBanner" hidden></div>

    <section class="layout">
      <aside class="panel">
        <div class="roomLine">
          <span id="roomLabel">Room</span>
          <strong id="roomCode">-</strong>
        </div>
        <div class="pocketedPanel">
          <div id="pocketedTitle" class="panelTitle">Pocketed balls</div>
          <div class="teamPocketed">
            <div class="teamPocketedHeader"><span id="teamAHeader">Team A</span><small id="teamAGroup"></small></div>
            <div id="pocketedA" class="pocketedBalls"></div>
            <div class="teamPocketedHeader"><span id="teamBHeader">Team B</span><small id="teamBGroup"></small></div>
            <div id="pocketedB" class="pocketedBalls"></div>
          </div>
        </div>
        <div id="seats" class="seats"></div>
        <div class="meter">
          <label id="powerLabel" for="powerInput">Power</label>
          <input id="powerInput" type="range" min="0" max="1" step="0.01" />
          <span id="powerText">45%</span>
        </div>
        <div class="spinPanel">
          <div class="spinHeader">
            <span id="spinTitle" class="panelTitle">Spin</span>
            <button id="spinReset" class="spinReset" type="button" aria-label="Reset spin">×</button>
          </div>
          <button id="spinPad" class="spinPad" type="button" aria-label="Spin control">
            <span id="spinMarker" class="spinMarker"></span>
          </button>
        </div>
        <button id="shootBtn" class="shoot" disabled></button>
        <div class="musicPanel">
          <div id="musicTitle" class="panelTitle">Lofi</div>
          <input id="musicVolume" type="range" min="0" max="1" step="0.01" aria-label="Music volume" />
        </div>
        <p id="message" class="message"></p>
        <p id="error" class="error"></p>
      </aside>
      <section class="tableWrap">
        <canvas id="table"></canvas>
        <div id="winnerOverlay" class="winnerOverlay" hidden>
          <div class="winnerCard">
            <span id="winnerKicker">Game over</span>
            <strong id="winnerTitle">Team wins</strong>
            <p id="winnerNames"></p>
            <button id="rematchBtn" class="rematchBtn" type="button">Rematch</button>
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
const spinPad = document.querySelector<HTMLButtonElement>("#spinPad")!;
const spinMarker = document.querySelector<HTMLSpanElement>("#spinMarker")!;
const spinReset = document.querySelector<HTMLButtonElement>("#spinReset")!;
const spinTitle = document.querySelector<HTMLElement>("#spinTitle")!;
const shootBtn = document.querySelector<HTMLButtonElement>("#shootBtn")!;
const compactBtn = document.querySelector<HTMLButtonElement>("#compactBtn")!;
const languageBtn = document.querySelector<HTMLButtonElement>("#languageBtn")!;
const languageMenu = document.querySelector<HTMLDivElement>("#languageMenu")!;
const musicVolume = document.querySelector<HTMLInputElement>("#musicVolume")!;
const rematchBtn = document.querySelector<HTMLButtonElement>("#rematchBtn")!;
const teamAGroup = document.querySelector<HTMLElement>("#teamAGroup")!;
const teamBGroup = document.querySelector<HTMLElement>("#teamBGroup")!;
const musicTitle = document.querySelector<HTMLElement>("#musicTitle")!;

let audioContext: AudioContext | undefined;
let musicPlayer: HTMLAudioElement | undefined;
let renderedPixelRatio = 1;
let tableRenderPending = false;
let localSimulation: StepSimulationState | undefined;
let localAnimationId: number | undefined;
let pendingResolvedRoom: RoomState | undefined;
let lastSoundAt = 0;
let placingCuePoint: Vec2 | undefined;

nameInput.value = localStorage.getItem(NAME_KEY) ?? "";
powerInput.value = String(state.power);
musicVolume.value = String(state.musicVolume);

document.querySelector<HTMLButtonElement>("#createBtn")!.addEventListener("click", () => {
  localStorage.setItem(NAME_KEY, nameInput.value.trim());
  state.gameMode = modeInput.value === "2v2" ? "2v2" : "1v1";
  ensureAudio();
  startMusic();
  ensureSocket().then(() =>
    send({ type: "create_room", name: nameInput.value, gameMode: state.gameMode, clientId: state.playerId })
  );
});

document.querySelector<HTMLButtonElement>("#joinBtn")!.addEventListener("click", () => {
  localStorage.setItem(NAME_KEY, nameInput.value.trim());
  ensureAudio();
  startMusic();
  ensureSocket().then(() =>
    send({ type: "join_room", roomCode: roomInput.value.toUpperCase(), name: nameInput.value, clientId: state.playerId })
  );
});

compactBtn.addEventListener("click", () => {
  state.compactMode = !state.compactMode;
  localStorage.setItem(COMPACT_KEY, String(state.compactMode));
  renderChrome();
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
  send({ type: "shoot", roomCode: state.room.code, shot: { angle: state.aimAngle, power: state.power, spin: state.spin } });
});

spinPad.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  state.spinDragging = true;
  spinPad.setPointerCapture(event.pointerId);
  updateSpinFromPointer(event);
});

spinPad.addEventListener("pointermove", (event) => {
  if (!state.spinDragging) return;
  updateSpinFromPointer(event);
});

spinPad.addEventListener("pointerup", (event) => {
  state.spinDragging = false;
  if (spinPad.hasPointerCapture(event.pointerId)) spinPad.releasePointerCapture(event.pointerId);
  updateSpinFromPointer(event);
});

spinPad.addEventListener("pointercancel", () => {
  state.spinDragging = false;
});

spinReset.addEventListener("click", () => {
  state.spin = { x: 0, y: 0 };
  renderChrome();
  renderTable();
});

musicVolume.addEventListener("input", () => {
  state.musicVolume = Number(musicVolume.value);
  localStorage.setItem(MUSIC_VOLUME_KEY, String(state.musicVolume));
  applyMusicVolume();
});

languageBtn.addEventListener("click", () => {
  state.languageMenuOpen = !state.languageMenuOpen;
  renderChrome();
});

languageMenu.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-language]");
  const language = button?.dataset.language as Language | undefined;
  if (!language || !(language in LOCALES)) return;
  state.language = language;
  state.languageMenuOpen = false;
  localStorage.setItem(LANGUAGE_KEY, language);
  render();
});

document.addEventListener("click", (event) => {
  if (!state.languageMenuOpen) return;
  const target = event.target as Node;
  if (!languageBtn.contains(target) && !languageMenu.contains(target)) {
    state.languageMenuOpen = false;
    renderChrome();
  }
});

rematchBtn.addEventListener("click", () => {
  if (!state.room) return;
  send({ type: "request_rematch", roomCode: state.room.code });
});

canvas.addEventListener("pointermove", (event) => {
  const room = state.room;
  if (!room) return;
  const me = getMe();
  if (room.gameState.ruleState.cuePlacementSeat === me?.seat && !room.gameState.shotInProgress) {
    placingCuePoint = eventToTable(event);
    renderTable();
    return;
  }
  if (!state.dragging) return;
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
  const me = getMe();
  if (!room) return;
  if (room.gameState.ruleState.cuePlacementSeat === me?.seat && !room.gameState.shotInProgress) {
    placingCuePoint = eventToTable(event);
    canvas.setPointerCapture(event.pointerId);
    renderTable();
    return;
  }
  if (!canShoot(room.gameState, me?.seat)) return;
  const cue = room.gameState.balls.find((ball) => ball.id === 0 && !ball.pocketed);
  if (!cue) return;
  ensureAudio();
  startMusic();
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
  const room = state.room;
  const me = getMe();
  if (room && room.gameState.ruleState.cuePlacementSeat === me?.seat && placingCuePoint) {
    send({ type: "place_cue", roomCode: room.code, position: placingCuePoint });
    placingCuePoint = undefined;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    renderTable();
    return;
  }
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  if (wasDragging && state.room && canShoot(state.room.gameState, getMe()?.seat)) {
    state.aimLocked = true;
  }
  render();
});

canvas.addEventListener("pointercancel", () => {
  state.dragging = false;
  placingCuePoint = undefined;
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
      state.error = "unableToConnect";
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
      applyRoom(message.room, true);
      break;
    case "turn_changed":
      if (localSimulation) {
        pendingResolvedRoom = message.room;
        return;
      }
      applyRoom(message.room, true);
      break;
    case "shot_resolved":
      if (localSimulation) {
        pendingResolvedRoom = message.room;
        return;
      }
      applyRoom(message.room, true);
      break;
    case "shot_started":
      startLocalShot(message.room, message.startBalls, message.shot);
      return;
    case "shot_frame":
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
  if (room.gameState.ruleState.cuePlacementSeat !== getMe()?.seat) {
    placingCuePoint = undefined;
  }
}

function startLocalShot(room: RoomState, startBalls: Ball[], shot: Shot): void {
  pendingResolvedRoom = undefined;
  placingCuePoint = undefined;
  stopLocalShotAnimation();
  state.room = {
    ...room,
    gameState: {
      ...room.gameState,
      balls: cloneBalls(startBalls),
      shotInProgress: true
    }
  };
  state.aimLocked = false;
  localSimulation = createShotSimulation(startBalls, room.gameState.table, shot.angle, shot.power, shot.spin);
  renderChrome();
  renderTable();
  runLocalShotFrame();
}

function render(): void {
  renderChrome();
  renderPocketedBalls();
  renderSeats();
  renderTable();
}

function renderChrome(): void {
  const t = locale();
  const status = document.querySelector<HTMLParagraphElement>("#status")!;
  const roomCode = document.querySelector<HTMLElement>("#roomCode")!;
  const message = document.querySelector<HTMLParagraphElement>("#message")!;
  const error = document.querySelector<HTMLParagraphElement>("#error")!;
  const reconnectBanner = document.querySelector<HTMLDivElement>("#reconnectBanner")!;
  const active = getCurrentPlayer();
  const room = state.room;

  status.textContent = state.connected ? t.connected : t.disconnected;
  reconnectBanner.hidden = state.connected;
  reconnectBanner.textContent = state.connected ? "" : room ? t.reconnecting : t.disconnected;
  nameInput.placeholder = t.namePlaceholder;
  roomInput.placeholder = t.roomPlaceholder;
  modeInput.ariaLabel = t.gameModeLabel;
  document.querySelector<HTMLButtonElement>("#createBtn")!.textContent = t.create;
  document.querySelector<HTMLButtonElement>("#joinBtn")!.textContent = t.join;
  document.querySelector<HTMLElement>("#roomLabel")!.textContent = t.room;
  document.querySelector<HTMLElement>("#pocketedTitle")!.textContent = t.pocketedBalls;
  document.querySelector<HTMLElement>("#teamAHeader")!.textContent = t.teamA;
  document.querySelector<HTMLElement>("#teamBHeader")!.textContent = t.teamB;
  teamAGroup.textContent = groupLabel(room?.gameState.ruleState.teamGroups.A);
  teamBGroup.textContent = groupLabel(room?.gameState.ruleState.teamGroups.B);
  document.querySelector<HTMLLabelElement>("#powerLabel")!.textContent = t.power;
  spinTitle.textContent = t.spin;
  spinReset.ariaLabel = t.resetSpin;
  spinMarker.style.transform = `translate(${state.spin.x * 28}px, ${-state.spin.y * 28}px)`;
  musicTitle.textContent = t.music;
  roomCode.textContent = room?.code ?? "-";
  powerText.textContent = `${Math.round(state.power * 100)}%`;
  message.textContent = room
    ? `${translateRuleMessage(room.gameState.ruleState.message)}${active ? ` · ${t.turn}: ${active.name}` : ""}${
        state.aimLocked ? ` · ${t.aimLocked}` : ""
      }`
    : t.createOrJoin;
  error.textContent = translateClientError(state.error);
  if (room?.gameState.ruleState.cuePlacementSeat) {
    message.textContent = `${message.textContent} · ${t.ballInHand}`;
    if (room.gameState.ruleState.cuePlacementSeat === getMe()?.seat) {
      message.textContent = `${message.textContent} · ${t.placeCue}`;
    }
  }
  shootBtn.disabled =
    !room ||
    !canShoot(room.gameState, getMe()?.seat) ||
    !state.aimLocked ||
    state.power <= 0 ||
    room.gameState.ruleState.cuePlacementSeat === getMe()?.seat;
  shootBtn.textContent = t.shoot;
  modeInput.disabled = Boolean(room);
  languageBtn.dataset.language = state.language;
  languageBtn.ariaLabel = `${t.nativeName}`;
  languageBtn.setAttribute("aria-expanded", String(state.languageMenuOpen));
  languageMenu.hidden = !state.languageMenuOpen;
  for (const option of languageMenu.querySelectorAll<HTMLButtonElement>("[data-language]")) {
    const optionLanguage = option.dataset.language as Language;
    option.classList.toggle("active", optionLanguage === state.language);
    option.ariaLabel = LOCALES[optionLanguage]?.nativeName ?? optionLanguage;
  }
  compactBtn.textContent = "◫";
  compactBtn.title = t.compact;
  document.querySelector<HTMLElement>(".shell")?.classList.toggle("compact", state.compactMode);
  rematchBtn.textContent = t.rematch;
  rematchBtn.textContent = t.rematch;
  rematchBtn.hidden = room?.gameState.phase !== "finished";
  musicVolume.value = String(state.musicVolume);
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
    button.innerHTML = `<span>${seat} · ${locale().team} ${teamForSeat(seat)}</span><strong>${
      player ? player.name : locale().open
    }</strong>`;
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
    empty.textContent = locale().noneYet;
    pocketedBalls.append(empty);
    return;
  }

  for (const ball of balls) {
    const chip = document.createElement("span");
    chip.className = `pocketedBall ${ball.kind === "stripe" ? "stripe" : ""} ${ball.id === 8 ? "dark" : ""}`;
    chip.style.setProperty("--ball-color", BALL_PALETTE[ball.id] ?? "#ddd");
    chip.title = locale().pocketedTitle(team, ball.id);
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

  if (canShoot(room.gameState, getMe()?.seat)) {
    drawPreview(room);
  }

  for (const ball of room.gameState.balls) {
    if (ball.pocketed) continue;
    const placementActive = room.gameState.ruleState.cuePlacementSeat === getMe()?.seat;
    const displayBall = ball.id === 0 && placementActive && placingCuePoint ? { ...ball, position: placingCuePoint } : ball;
    drawBall(displayBall);
  }
}

function drawEmptyTable(): void {
  ctx.fillStyle = "#15211d";
  ctx.fillRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);
  ctx.fillStyle = "#f3efe7";
  ctx.font = "24px system-ui";
  ctx.textAlign = "center";
  ctx.fillText(locale().createOrJoinTable, TABLE_WIDTH / 2, TABLE_HEIGHT / 2);
}

function drawPreview(room: RoomState): void {
  const preview = buildPreview(room.gameState.balls, room.gameState.table, state.aimAngle, state.power, state.spin);
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

function updateSpinFromPointer(event: PointerEvent): void {
  const rect = spinPad.getBoundingClientRect();
  const radius = Math.min(rect.width, rect.height) / 2;
  const dx = event.clientX - (rect.left + rect.width / 2);
  const dy = event.clientY - (rect.top + rect.height / 2);
  const distance = Math.hypot(dx, dy);
  const scale = distance > radius ? radius / distance : 1;
  state.spin = {
    x: clamp((dx * scale) / radius, -1, 1),
    y: clamp((-dy * scale) / radius, -1, 1)
  };
  renderChrome();
  renderTable();
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

function handleShotFrame(frame: ShotFrame): void {
  state.room = {
    ...state.room!,
    gameState: {
      ...state.room!.gameState,
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
  const nowMs = performance.now();
  if (nowMs - lastSoundAt < 45) return;
  for (const event of frame.events.slice(0, SOUND_LIMIT)) {
    if (event.type === "cue") playFilteredClick(260, 0.045, 0.11 * event.intensity, "lowpass");
    if (event.type === "collision") playFilteredClick(720, 0.03, 0.05 * event.intensity, "bandpass");
    if (event.type === "cushion") playFilteredClick(170, 0.05, 0.045 * event.intensity, "lowpass");
    if (event.type === "pocket") playFilteredClick(95, 0.12, 0.12 * event.intensity, "lowpass");
    lastSoundAt = nowMs;
  }
}

function playFilteredClick(
  frequency: number,
  duration: number,
  gainValue: number,
  filterType: BiquadFilterType
): void {
  if (!audioContext) return;
  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const filter = audioContext.createBiquadFilter();
  const gain = audioContext.createGain();
  oscillator.type = "triangle";
  oscillator.frequency.setValueAtTime(frequency, now);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, frequency * 0.72), now + duration);
  filter.type = filterType;
  filter.frequency.setValueAtTime(frequency * 1.35, now);
  filter.Q.setValueAtTime(0.7, now);
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.004, gainValue), now + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  oscillator.connect(filter);
  filter.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + duration);
}

function renderWinner(): void {
  const overlay = document.querySelector<HTMLDivElement>("#winnerOverlay")!;
  const kicker = document.querySelector<HTMLElement>("#winnerKicker")!;
  const title = document.querySelector<HTMLElement>("#winnerTitle")!;
  const names = document.querySelector<HTMLParagraphElement>("#winnerNames")!;
  const winner = state.room?.gameState.ruleState.winner;
  overlay.hidden = !winner;
  if (!winner || !state.room) return;
  kicker.textContent = locale().gameOver;
  title.textContent = locale().teamWins(winner);
  const winnerNames = state.room.players
    .filter((player) => player.team === winner)
    .map((player) => player.name)
    .join(", ");
  names.textContent = winnerNames || locale().teamFallback(winner);
}

function resizeCanvasForDisplay(): void {
  const rect = canvas.getBoundingClientRect();
  const pixelRatio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const displayWidth = Math.max(1, Math.round(rect.width * pixelRatio));
  const displayHeight = Math.max(1, Math.round(((rect.width * TABLE_HEIGHT) / TABLE_WIDTH) * pixelRatio));
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

function runLocalShotFrame(): void {
  if (!localSimulation || !state.room) return;
  const frame = stepSimulation(localSimulation, 2);
  handleShotFrame(frame);

  if (isSimulationSettled(localSimulation)) {
    localSimulation = undefined;
    localAnimationId = undefined;
    if (pendingResolvedRoom) {
      const next = pendingResolvedRoom;
      pendingResolvedRoom = undefined;
      applyRoom(next, true);
      render();
    }
    return;
  }

  localAnimationId = requestAnimationFrame(runLocalShotFrame);
}

function stopLocalShotAnimation(): void {
  if (localAnimationId !== undefined) cancelAnimationFrame(localAnimationId);
  localAnimationId = undefined;
  localSimulation = undefined;
  placingCuePoint = undefined;
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

function getInitialLanguage(): Language {
  const saved = localStorage.getItem(LANGUAGE_KEY);
  if (saved === "ru" || saved === "uk" || saved === "en") return saved;
  const browserLanguage = navigator.language.toLowerCase();
  if (browserLanguage.startsWith("ru")) return "ru";
  if (browserLanguage.startsWith("uk")) return "uk";
  return "en";
}

function locale(): Locale {
  return LOCALES[state.language] ?? LOCALES.en;
}

function translateRuleMessage(message?: string): string {
  const t = locale();
  if (!message) return t.playing;
  return t.rule[message] ?? message;
}

function translateClientError(message: string): string {
  if (!message) return "";
  if (message === "unableToConnect") return locale().unableToConnect;
  return message;
}

function groupLabel(group?: BallGroup): string {
  const t = locale();
  if (!group) return t.groupOpen;
  return group === "solids" ? t.groupSolids : t.groupStripes;
}

function startMusic(): void {
  musicPlayer ??= createMusicPlayer();
  applyMusicVolume();
  if (musicPlayer.paused) void musicPlayer.play().catch(() => undefined);
}

function createMusicPlayer(): HTMLAudioElement {
  const player = new Audio(LOFI_STREAM_URL);
  player.preload = "none";
  player.loop = false;
  player.hidden = true;
  player.setAttribute("aria-hidden", "true");
  document.body.append(player);
  return player;
}

function applyMusicVolume(): void {
  if (!musicPlayer) return;
  musicPlayer.volume = clamp(state.musicVolume, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
