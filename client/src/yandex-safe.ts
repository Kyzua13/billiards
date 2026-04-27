import {
  applyShot,
  buildPreview,
  canShoot,
  createInitialGame,
  isInPocket,
  teamForSeat,
  type Ball,
  type GameState,
  type Seat,
  type Shot,
  type Team,
  type Vec2
} from "../../shared/src/index.ts";
import "./styles.css";

const TABLE_WIDTH = 960;
const TABLE_HEIGHT = 520;

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

interface SafeState {
  game: GameState;
  playerA: string;
  playerB: string;
  aimAngle: number;
  aimLocked: boolean;
  dragging: boolean;
  power: number;
  spin: Vec2;
  spinDragging: boolean;
  placingCuePoint?: Vec2;
}

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("App root not found");

const state: SafeState = {
  game: createSafeGame(),
  playerA: "Player A",
  playerB: "Player B",
  aimAngle: 0,
  aimLocked: false,
  dragging: false,
  power: 0.45,
  spin: { x: 0, y: 0 },
  spinDragging: false
};

app.innerHTML = `
  <main class="shell">
    <section class="topbar">
      <div>
        <h1>8 Ball Pool Online</h1>
        <p id="status">Local 1v1</p>
      </div>
      <div class="connection">
        <input id="playerAInput" maxlength="24" placeholder="Player A" />
        <input id="playerBInput" maxlength="24" placeholder="Player B" />
        <button id="newGameBtn" type="button">New game</button>
      </div>
    </section>

    <section class="layout">
      <aside class="panel">
        <div class="roomLine">
          <span>Mode</span>
          <strong>Local 1v1</strong>
        </div>
        <div id="seats" class="seats"></div>
        <div class="pocketedPanel">
          <div class="panelTitle">Pocketed balls</div>
          <div class="teamPocketed">
            <div>
              <div class="teamPocketedHeader"><span>Team A</span><small id="teamAGroup">Open table</small></div>
              <div id="pocketedA" class="pocketedBalls"></div>
            </div>
            <div>
              <div class="teamPocketedHeader"><span>Team B</span><small id="teamBGroup">Open table</small></div>
              <div id="pocketedB" class="pocketedBalls"></div>
            </div>
          </div>
        </div>
        <div class="meter">
          <label for="powerInput">Power</label>
          <input id="powerInput" type="range" min="0" max="1" step="0.01" />
          <span id="powerText">45%</span>
        </div>
        <div class="spinPanel">
          <div class="panelTitle">Spin</div>
          <div id="spinPad" class="spinPad">
            <div id="spinMarker" class="spinMarker"></div>
          </div>
          <button id="spinReset" type="button">Reset</button>
        </div>
        <button id="shootBtn" class="shoot" type="button">Shoot</button>
        <div id="message" class="message"></div>
      </aside>

      <section class="tableWrap">
        <canvas id="table" width="960" height="520"></canvas>
        <div id="winnerOverlay" class="winnerOverlay" hidden>
          <div class="winnerCard">
            <span id="winnerKicker">Game over</span>
            <strong id="winnerTitle"></strong>
            <p id="winnerNames"></p>
            <button id="rematchBtn" type="button">New game</button>
          </div>
        </div>
      </section>
    </section>
  </main>
`;

const canvas = document.querySelector<HTMLCanvasElement>("#table")!;
const ctx = canvas.getContext("2d")!;
const playerAInput = document.querySelector<HTMLInputElement>("#playerAInput")!;
const playerBInput = document.querySelector<HTMLInputElement>("#playerBInput")!;
const powerInput = document.querySelector<HTMLInputElement>("#powerInput")!;
const powerText = document.querySelector<HTMLSpanElement>("#powerText")!;
const spinPad = document.querySelector<HTMLDivElement>("#spinPad")!;
const spinMarker = document.querySelector<HTMLDivElement>("#spinMarker")!;
const shootBtn = document.querySelector<HTMLButtonElement>("#shootBtn")!;
const message = document.querySelector<HTMLDivElement>("#message")!;
const rematchBtn = document.querySelector<HTMLButtonElement>("#rematchBtn")!;

let renderedPixelRatio = 1;

playerAInput.value = state.playerA;
playerBInput.value = state.playerB;
powerInput.value = String(state.power);

document.querySelector<HTMLButtonElement>("#newGameBtn")!.addEventListener("click", newGame);
rematchBtn.addEventListener("click", newGame);

playerAInput.addEventListener("input", () => {
  state.playerA = cleanName(playerAInput.value, "Player A");
  render();
});

playerBInput.addEventListener("input", () => {
  state.playerB = cleanName(playerBInput.value, "Player B");
  render();
});

powerInput.addEventListener("input", () => {
  state.power = Number(powerInput.value);
  render();
});

shootBtn.addEventListener("click", () => {
  if (!state.aimLocked || state.power <= 0 || !canShoot(state.game, currentSeat())) return;
  const shot: Shot = { angle: state.aimAngle, power: state.power, spin: state.spin };
  const resolution = applyShot(state.game, state.game.currentTurnSeat, shot, "1v1");
  state.game = resolution.state;
  state.aimLocked = false;
  state.placingCuePoint = undefined;
  render();
});

spinPad.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  state.spinDragging = true;
  spinPad.setPointerCapture(event.pointerId);
  updateSpin(event);
});

spinPad.addEventListener("pointermove", (event) => {
  if (state.spinDragging) updateSpin(event);
});

spinPad.addEventListener("pointerup", (event) => {
  state.spinDragging = false;
  if (spinPad.hasPointerCapture(event.pointerId)) spinPad.releasePointerCapture(event.pointerId);
  updateSpin(event);
});

document.querySelector<HTMLButtonElement>("#spinReset")!.addEventListener("click", () => {
  state.spin = { x: 0, y: 0 };
  render();
});

canvas.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  const point = eventToTable(event);
  if (state.game.ruleState.cuePlacementSeat === currentSeat()) {
    state.placingCuePoint = point;
    canvas.setPointerCapture(event.pointerId);
    render();
    return;
  }
  if (!canShoot(state.game, currentSeat())) return;
  const cue = cueBall();
  if (!cue) return;
  state.dragging = true;
  state.aimLocked = false;
  state.aimAngle = Math.atan2(point.y - cue.position.y, point.x - cue.position.x);
  canvas.setPointerCapture(event.pointerId);
  render();
});

canvas.addEventListener("pointermove", (event) => {
  const point = eventToTable(event);
  if (state.game.ruleState.cuePlacementSeat === currentSeat() && state.placingCuePoint) {
    state.placingCuePoint = point;
    renderTable();
    return;
  }
  if (!state.dragging) return;
  const cue = cueBall();
  if (!cue) return;
  state.aimAngle = Math.atan2(point.y - cue.position.y, point.x - cue.position.x);
  renderTable();
});

canvas.addEventListener("pointerup", (event) => {
  if (state.game.ruleState.cuePlacementSeat === currentSeat() && state.placingCuePoint) {
    placeCue(state.placingCuePoint);
    state.placingCuePoint = undefined;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    render();
    return;
  }
  const wasDragging = state.dragging;
  state.dragging = false;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  if (wasDragging && canShoot(state.game, currentSeat())) state.aimLocked = true;
  render();
});

window.addEventListener("resize", () => renderTable());

render();

function createSafeGame(): GameState {
  const game = createInitialGame();
  game.phase = "playing";
  game.currentTurnSeat = "A1";
  game.ruleState.message = "New game started";
  return game;
}

function newGame(): void {
  state.game = createSafeGame();
  state.aimLocked = false;
  state.power = 0.45;
  state.spin = { x: 0, y: 0 };
  state.placingCuePoint = undefined;
  powerInput.value = String(state.power);
  render();
}

function render(): void {
  renderChrome();
  renderSeats();
  renderPocketedBalls();
  renderTable();
  renderWinner();
}

function renderChrome(): void {
  const active = activeName();
  const cuePlacement = state.game.ruleState.cuePlacementSeat === currentSeat();
  powerText.textContent = `${Math.round(state.power * 100)}%`;
  spinMarker.style.transform = `translate(${state.spin.x * 28}px, ${-state.spin.y * 28}px)`;
  shootBtn.disabled = !canShoot(state.game, currentSeat()) || !state.aimLocked || state.power <= 0 || cuePlacement;
  message.textContent = `${translateRuleMessage(state.game.ruleState.message)} · Turn: ${active}${
    state.aimLocked ? " · Aim locked" : ""
  }${cuePlacement ? " · Place cue ball" : ""}`;
  document.querySelector<HTMLElement>("#teamAGroup")!.textContent = groupLabel(state.game.ruleState.teamGroups.A);
  document.querySelector<HTMLElement>("#teamBGroup")!.textContent = groupLabel(state.game.ruleState.teamGroups.B);
}

function renderSeats(): void {
  const seats = document.querySelector<HTMLDivElement>("#seats")!;
  seats.innerHTML = "";
  for (const seat of ["A1", "B1"] as Seat[]) {
    const button = document.createElement("button");
    button.className = `seat ${state.game.currentTurnSeat === seat ? "active" : ""}`;
    button.disabled = true;
    button.innerHTML = `<span>${seat} · Team ${teamForSeat(seat)}</span><strong>${seat === "A1" ? state.playerA : state.playerB}</strong>`;
    seats.append(button);
  }
}

function renderPocketedBalls(): void {
  renderTeamPocketed("A", document.querySelector<HTMLDivElement>("#pocketedA")!);
  renderTeamPocketed("B", document.querySelector<HTMLDivElement>("#pocketedB")!);
}

function renderTeamPocketed(team: Team, element: HTMLDivElement): void {
  element.innerHTML = "";
  const ids = state.game.ruleState.pocketedByTeam?.[team] ?? [];
  if (ids.length === 0) {
    const empty = document.createElement("span");
    empty.className = "pocketedEmpty";
    empty.textContent = "None yet";
    element.append(empty);
    return;
  }
  for (const id of ids) {
    const ball = state.game.balls.find((candidate) => candidate.id === id);
    if (!ball) continue;
    const chip = document.createElement("span");
    chip.className = `pocketedBall ${ball.kind === "stripe" ? "stripe" : ""}`;
    chip.style.setProperty("--ball-color", BALL_PALETTE[id] ?? "#ddd");
    chip.textContent = String(id);
    element.append(chip);
  }
}

function renderTable(): void {
  resizeCanvas();
  const table = state.game.table;
  ctx.setTransform(renderedPixelRatio, 0, 0, renderedPixelRatio, 0, 0);
  ctx.clearRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);

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

  if (canShoot(state.game, currentSeat())) drawPreview();

  for (const ball of state.game.balls) {
    if (ball.pocketed) continue;
    const display = ball.id === 0 && state.placingCuePoint ? { ...ball, position: state.placingCuePoint } : ball;
    drawBall(display);
  }
}

function drawPreview(): void {
  const preview = buildPreview(state.game.balls, state.game.table, state.aimAngle, state.power, state.spin);
  drawPath(preview.cuePath, state.aimLocked ? "rgba(120,220,255,0.9)" : "rgba(255,255,255,0.78)", 3);
  const cue = cueBall();
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
  const radius = state.game.table.ballRadius;
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

function renderWinner(): void {
  const overlay = document.querySelector<HTMLDivElement>("#winnerOverlay")!;
  const winner = state.game.ruleState.winner;
  overlay.hidden = !winner;
  if (!winner) return;
  document.querySelector<HTMLElement>("#winnerTitle")!.textContent = `Team ${winner} wins`;
  document.querySelector<HTMLElement>("#winnerNames")!.textContent = winner === "A" ? state.playerA : state.playerB;
}

function placeCue(position: Vec2): void {
  const cue = cueBall();
  if (!cue) return;
  const table = state.game.table;
  const clamped = {
    x: clamp(position.x, table.cushion + table.ballRadius, table.width - table.cushion - table.ballRadius),
    y: clamp(position.y, table.cushion + table.ballRadius, table.height - table.cushion - table.ballRadius)
  };
  const overlaps = state.game.balls.some((ball) => {
    if (ball.id === 0 || ball.pocketed) return false;
    return Math.hypot(ball.position.x - clamped.x, ball.position.y - clamped.y) < table.ballRadius * 2.05;
  });
  if (isInPocket(clamped, table) || overlaps) return;
  cue.position = clamped;
  cue.velocity = { x: 0, y: 0 };
  cue.angularVelocity = { x: 0, y: 0, z: 0 };
  cue.motionState = "settled";
  cue.pocketed = false;
  state.game.ruleState.cuePlacementSeat = undefined;
  state.game.ruleState.message = "Cue ball placed";
}

function currentSeat(): Seat {
  return state.game.currentTurnSeat;
}

function activeName(): string {
  return currentSeat() === "A1" ? state.playerA : state.playerB;
}

function cueBall(): Ball | undefined {
  return state.game.balls.find((ball) => ball.id === 0 && !ball.pocketed);
}

function cleanName(value: string, fallback: string): string {
  return value.trim() || fallback;
}

function groupLabel(group?: string): string {
  if (!group) return "Open table";
  return group === "solids" ? "Solids" : "Stripes";
}

function translateRuleMessage(text?: string): string {
  if (!text) return "Playing";
  return text;
}

function eventToTable(event: PointerEvent): Vec2 {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * TABLE_WIDTH,
    y: ((event.clientY - rect.top) / rect.height) * TABLE_HEIGHT
  };
}

function updateSpin(event: PointerEvent): void {
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
  render();
}

function resizeCanvas(): void {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const width = Math.max(1, Math.round(rect.width * ratio));
  const height = Math.max(1, Math.round(((rect.width * TABLE_HEIGHT) / TABLE_WIDTH) * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  renderedPixelRatio = width / TABLE_WIDTH;
}

function circle(x: number, y: number, radius: number): void {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
}

function roundRect(x: number, y: number, width: number, height: number, radius: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
