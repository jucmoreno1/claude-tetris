'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
  '#4db6ac', // + (pentominó) - teal
  '#f06292', // U (pentominó) - pink
  '#dce775', // Y (pentominó) - lime
  '#b0bec5', // 1x1 (recompensa) - blue grey
  '#a1887f', // anillo 3x3 hueco (reto) - brown
  '#ff7043', // bomba
  '#fff176', // rayo
  '#ce93d8', // tinte
  '#80deea', // gravedad
  '#e1f5fe', // congelar
  '#ffffff', // comodín (bloque teñido)
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[0,8,0],[8,8,8],[0,8,0]],                  // +
  [[9,0,9],[9,9,9],[0,0,0]],                  // U
  [[0,0,0,0],[10,10,10,10],[0,10,0,0],[0,0,0,0]], // Y
  [[11]],                                      // 1x1
  [[12,12,12],[12,0,12],[12,12,12]],          // anillo 3x3 hueco
  [[13]], [[14]], [[15]], [[16]], [[17]],      // power-ups (1x1)
];

// Tipos especiales y su probabilidad de aparición
const STANDARD_COUNT = 7;
const PENTOMINOES = [8, 9, 10];
const SINGLE = 11;
const RING = 12;
const PENTOMINO_CHANCE = 0.10; // ~1 de cada 10 piezas
const RING_CHANCE = 0.03;      // 3%, solo desde RING_MIN_LEVEL
const RING_MIN_LEVEL = 2;

// Power-ups: piezas 1x1 que se sortean cada POWERUP_EVERY_LINES líneas.
// Al aterrizar no se fusionan: aplican su efecto en su celda y desaparecen.
const BOMB = 13, LIGHTNING = 14, DYE = 15, GRAVITY = 16, FREEZE = 17;
const WILD = 18; // comodín: cuenta como celda llena para completar líneas
const POWERUPS = [BOMB, LIGHTNING, DYE, GRAVITY, FREEZE];
const POWERUP_ICONS = { 13: '💣', 14: '⚡', 15: '🎨', 16: '⬇', 17: '❄' };
const POWERUP_EVERY_LINES = 5;
const POWERUP_SCORE = 50;
const FREEZE_MS = 5000;

const LINE_SCORES = [0, 100, 300, 500, 800];

// Habilidades cargables: la barra de energía se llena limpiando líneas y,
// al estar llena, la tecla E abre el menú para elegir una habilidad.
const ENERGY_MAX = 100;
const ENERGY_PER_LINE = 25;     // 4 líneas llenan la barra
const PREVIEW_PIECES = 15;      // piezas durante las que se ven las siguientes 5
const LOOKAHEAD = 4;            // piezas extra después de "next" (next + 4 = 5)
const SLOW_MS = 10000;          // duración de la ralentización
const SLOW_FACTOR = 2.5;        // la caída automática va 2.5 veces más lenta
const HOLD_CHARGES = 3;         // usos de reserva (el primero se gasta al activarla)
const ABILITIES = [
  { id: 'preview', icon: '👁', name: 'Ver siguientes 5', desc: `durante ${PREVIEW_PIECES} piezas` },
  { id: 'swap',    icon: '🔄', name: 'Intercambiar pieza', desc: 'cambia la actual por otra' },
  { id: 'slow',    icon: '🐢', name: 'Ralentizar tiempo', desc: `${SLOW_MS / 1000} s de caída lenta` },
  { id: 'undo',    icon: '↶',  name: 'Deshacer', desc: 'revierte la última colocación' },
  { id: 'hold',    icon: '📦', name: 'Reservar pieza', desc: `${HOLD_CHARGES} usos con la tecla C` },
];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const energyFill = document.getElementById('energy-fill');
const energyHint = document.getElementById('energy-hint');
const queueSection = document.getElementById('queue-section');
const queueCanvas = document.getElementById('queue-canvas');
const queueCtx = queueCanvas.getContext('2d');
const queueLeftEl = document.getElementById('queue-left');
const holdSection = document.getElementById('hold-section');
const holdCanvas = document.getElementById('hold-canvas');
const holdCtx = holdCanvas.getContext('2d');
const holdChargesEl = document.getElementById('hold-charges');
const abilityMenu = document.getElementById('ability-menu');
const abilityList = document.getElementById('ability-list');
const pauseMenu = document.getElementById('pause-menu');
const resumeBtn = document.getElementById('resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const controlsBtn = document.getElementById('controls-btn');
const pauseControls = document.getElementById('pause-controls');
const startLevelSel = document.getElementById('start-level');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, pendingPowerups, freezeLeft;
// Estado de habilidades
let energy, choosing, lookahead, previewLeft, slowLeft, held, holdCharges, canHold, undoSnapshot;
// Combo: bloqueos consecutivos que limpian al menos una línea (records locales)
let combo, maxCombo;

// Menú de pausa: startLevel es la preferencia guardada; gameStartLevel, el nivel con el que empezó la partida actual
const START_LEVEL_KEY = 'tetris.startLevel';
const RESUME_GUARD_MS = 150; // tras cerrar el menú se ignoran teclas de juego este tiempo
let startLevel = loadStartLevel();
let gameStartLevel = startLevel;
let inputGuardUntil = 0;   // performance.now() hasta el que se ignoran teclas de juego
let ignoreRepeats = false; // ignora autorrepetición de teclas que venían pulsadas al reanudar

function parseStartLevel(v) {
  const n = parseInt(v, 10);
  return n >= 1 && n <= 10 ? n : 1;
}

function loadStartLevel() {
  try { return parseStartLevel(localStorage.getItem(START_LEVEL_KEY)); } catch (e) { return 1; }
}

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function makePiece(type) {
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function randomPiece() {
  // Franjas: [0, ringBand) anillo, [ringBand, ringBand + PENTOMINO_CHANCE) pentominó, resto estándar
  const ringBand = level >= RING_MIN_LEVEL ? RING_CHANCE : 0;
  const roll = Math.random();
  let type;
  if (roll < ringBand) {
    type = RING;
  } else if (roll < ringBand + PENTOMINO_CHANCE) {
    type = PENTOMINOES[Math.floor(Math.random() * PENTOMINOES.length)];
  } else {
    type = Math.floor(Math.random() * STANDARD_COUNT) + 1;
  }
  return makePiece(type);
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    pendingPowerups += Math.floor((lines + cleared) / POWERUP_EVERY_LINES) - Math.floor(lines / POWERUP_EVERY_LINES);
    energy = Math.min(ENERGY_MAX, energy + cleared * ENERGY_PER_LINE);
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = gameStartLevel + Math.floor(lines / 10);
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
  return cleared;
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  const scoreBefore = score;
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
  if (undoSnapshot) undoSnapshot.score = scoreBefore; // Deshacer también quita los puntos de la caída
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function isPowerup(type) {
  return type >= BOMB && type <= FREEZE;
}

function applyPowerup(type, x, y) {
  switch (type) {
    case BOMB: // área 3x3 centrada en la celda
      for (let r = y - 1; r <= y + 1; r++)
        for (let c = x - 1; c <= x + 1; c++)
          if (r >= 0 && r < ROWS && c >= 0 && c < COLS) board[r][c] = 0;
      break;
    case LIGHTNING: // fila y columna completas
      board[y].fill(0);
      for (let r = 0; r < ROWS; r++) board[r][x] = 0;
      break;
    case DYE: { // todos los bloques del color de la celda inferior pasan a comodín
      const target = y + 1 < ROWS ? board[y + 1][x] : 0;
      if (target && target !== WILD)
        for (let r = 0; r < ROWS; r++)
          for (let c = 0; c < COLS; c++)
            if (board[r][c] === target) board[r][c] = WILD;
      break;
    }
    case GRAVITY: // compacta huecos: cada columna cae hasta el fondo
      for (let c = 0; c < COLS; c++) {
        let w = ROWS - 1;
        for (let r = ROWS - 1; r >= 0; r--) {
          if (board[r][c]) {
            const v = board[r][c];
            board[r][c] = 0;
            board[w--][c] = v;
          }
        }
      }
      break;
    case FREEZE:
      freezeLeft = FREEZE_MS;
      break;
  }
  score += POWERUP_SCORE * level;
}

function takeSnapshot() {
  // Estado previo a fijar la pieza, para la habilidad Deshacer
  undoSnapshot = {
    board: board.map(row => [...row]),
    score, lines, level, dropInterval, pendingPowerups, freezeLeft, combo, maxCombo,
    current: current.type,
    next: next.type,
    lookahead: lookahead.map(p => p.type),
  };
}

function lockPiece() {
  takeSnapshot();
  if (isPowerup(current.type)) applyPowerup(current.type, current.x, current.y);
  else merge();
  const cleared = clearLines();
  combo = cleared > 0 ? combo + 1 : 0;
  maxCombo = Math.max(maxCombo, combo);
  spawn();
  if (gameOver) return;
  // Recompensa: tras un Tetris (4 líneas), la siguiente pieza es una 1x1.
  // La "next" desplazada vuelve al frente de la cola para no alterar lo ya mostrado.
  if (cleared === 4) {
    pushFront(makePiece(SINGLE));
  } else if (pendingPowerups > 0) {
    pendingPowerups--;
    pushFront(makePiece(POWERUPS[Math.floor(Math.random() * POWERUPS.length)]));
  }
  updateHUD();
}

function pushFront(piece) {
  lookahead.unshift(next);
  lookahead.pop();
  next = piece;
  drawNext();
}

function spawn() {
  current = next;
  next = lookahead.shift();
  lookahead.push(randomPiece());
  canHold = true;
  if (previewLeft > 0) previewLeft--;
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
  energyFill.style.width = `${(energy / ENERGY_MAX) * 100}%`;
  const full = energy >= ENERGY_MAX;
  energyFill.classList.toggle('full', full);
  energyHint.textContent = full ? 'Pulsa E' : `${energy}%`;
}

// ---- Habilidades ----
function abilityAvailable(id) {
  if (id === 'undo') return !!undoSnapshot;
  if (id === 'hold') return canHold;
  return true;
}

function openAbilityMenu() {
  if (energy < ENERGY_MAX || choosing || paused || gameOver) return;
  choosing = true;
  cancelAnimationFrame(animId);
  abilityList.innerHTML = '';
  ABILITIES.forEach((a, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ability';
    btn.disabled = !abilityAvailable(a.id);
    btn.innerHTML = `<kbd>${i + 1}</kbd><span class="ability-icon">${a.icon}</span>` +
      `<span class="ability-text"><strong>${a.name}</strong><small>${a.desc}</small></span>`;
    btn.addEventListener('click', () => chooseAbility(i));
    abilityList.appendChild(btn);
  });
  abilityMenu.classList.remove('hidden');
}

function closeAbilityMenu() {
  choosing = false;
  abilityMenu.classList.add('hidden');
  lastTime = performance.now();
  animId = requestAnimationFrame(loop);
}

function chooseAbility(i) {
  const a = ABILITIES[i];
  if (!a || !abilityAvailable(a.id)) return;
  energy = 0;
  switch (a.id) {
    case 'preview': previewLeft = PREVIEW_PIECES; break;
    case 'swap': swapCurrent(); break;
    case 'slow': slowLeft = SLOW_MS; break;
    case 'undo': undoLast(); break;
    case 'hold': holdCharges = HOLD_CHARGES; holdPiece(); break;
  }
  drawNext();
  drawHold();
  updateHUD();
  closeAbilityMenu();
}

function swapCurrent() {
  // Otra pieza del pool (estándar o pentominó) distinta de la actual
  const pool = [...Array(STANDARD_COUNT).keys()].map(i => i + 1).concat(PENTOMINOES)
    .filter(t => t !== current.type);
  const piece = makePiece(pool[Math.floor(Math.random() * pool.length)]);
  // Conserva la posición si cabe; si no, prueba desde la posición de aparición
  piece.x = current.x;
  piece.y = current.y;
  if (collide(piece.shape, piece.x, piece.y)) {
    const fresh = makePiece(piece.type);
    if (collide(fresh.shape, fresh.x, fresh.y)) return; // no cabe: se queda la actual
    current = fresh;
  } else {
    current = piece;
  }
}

function undoLast() {
  const s = undoSnapshot;
  undoSnapshot = null;
  board = s.board;
  ({ score, lines, level, dropInterval, pendingPowerups, freezeLeft, combo, maxCombo } = s);
  current = makePiece(s.current);
  next = makePiece(s.next);
  lookahead = s.lookahead.map(makePiece);
  canHold = true;
  dropAccum = 0;
}

function holdPiece() {
  if (!canHold || holdCharges <= 0) return;
  if (held) {
    const piece = makePiece(held);
    if (collide(piece.shape, piece.x, piece.y)) return; // no cabe: no se intercambia
    held = current.type;
    current = piece;
  } else {
    held = current.type;
    spawn();
  }
  holdCharges--;
  canHold = false;
  undoSnapshot = null; // deshacer tras reservar duplicaría o perdería piezas
  dropAccum = 0;
  drawHold();
  drawNext();
}

// ---- Skins (temas visuales del tablero) ----
// Cada skin define: paleta con el mismo índice que COLORS (0 null, 1 a 7 estándar,
// 8 a 10 pentominós, 11 la 1x1, 12 anillo, 13 a 17 power-ups, 18 comodín), fondo
// del tablero (null = el de CSS, que sigue el tema claro/oscuro), color de rejilla
// (null = variable CSS --grid) y la función que dibuja un bloque en (px, py).

// Trazo de rectángulo con esquinas redondeadas (arcTo; no depende de roundRect).
function roundedRectPath(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

function drawRetroBlock(context, px, py, size, color) {
  context.fillStyle = color;
  context.fillRect(px + 1, py + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(px + 1, py + 1, size - 2, 4);
}

function drawNeonBlock(context, px, py, size, color) {
  const inset = Math.max(2, Math.round(size * 0.1));
  context.shadowColor = color;
  context.shadowBlur = size * 0.5;
  context.fillStyle = color;
  context.fillRect(px + inset, py + inset, size - inset * 2, size - inset * 2);
  context.shadowBlur = 0; // no contaminar rejilla ni texto
  // núcleo oscuro para que parezca tubo de neón
  const core = inset + Math.max(2, Math.round(size * 0.12));
  context.fillStyle = 'rgba(0,0,0,0.45)';
  context.fillRect(px + core, py + core, size - core * 2, size - core * 2);
}

function drawPastelBlock(context, px, py, size, color) {
  const r = Math.max(2, size * 0.25);
  roundedRectPath(context, px + 1.5, py + 1.5, size - 3, size - 3, r);
  context.fillStyle = color;
  context.fill();
  context.lineWidth = 1;
  context.strokeStyle = 'rgba(0,0,0,0.12)';
  context.stroke();
  // brillo suave en la parte superior
  roundedRectPath(context, px + size * 0.2, py + size * 0.14, size * 0.6, size * 0.2, size * 0.1);
  context.fillStyle = 'rgba(255,255,255,0.45)';
  context.fill();
}

function drawPixelBlock(context, px, py, size, color) {
  const p = Math.max(1, Math.floor(size / 6)); // tamaño de "pixel"
  context.fillStyle = color;
  context.fillRect(px, py, size, size);
  // bordes con luz (arriba e izquierda) y sombra (abajo y derecha)
  context.fillStyle = 'rgba(255,255,255,0.45)';
  context.fillRect(px, py, size - p, p);
  context.fillRect(px, py, p, size - p);
  context.fillStyle = 'rgba(0,0,0,0.45)';
  context.fillRect(px + p, py + size - p, size - p, p);
  context.fillRect(px + size - p, py + p, p, size - p);
  // textura de tablero de ajedrez en el interior
  context.fillStyle = 'rgba(0,0,0,0.15)';
  for (let yy = py + p; yy < py + size - p; yy += p)
    for (let xx = px + p; xx < px + size - p; xx += p)
      if (((xx - px) / p + (yy - py) / p) % 2 === 0)
        context.fillRect(xx, yy, Math.min(p, px + size - p - xx), Math.min(p, py + size - p - yy));
  // brillo de esquina
  context.fillStyle = 'rgba(255,255,255,0.7)';
  context.fillRect(px + p, py + p, p, p);
}

const SKINS = {
  retro: { name: 'Retro', colors: COLORS, bg: null, grid: null, block: drawRetroBlock },
  neon: {
    name: 'Neon',
    colors: [null, '#00f0ff', '#fff200', '#d400ff', '#39ff14', '#ff073a', '#2979ff', '#ff9100',
      '#00ffc8', '#ff2fd6', '#c6ff00', '#b0bec5', '#ff6e40', '#ff3d00', '#ffff00', '#ea80fc',
      '#18ffff', '#e1f5fe', '#ffffff'],
    bg: '#000000', grid: '#141420', block: drawNeonBlock,
  },
  pastel: {
    name: 'Pastel',
    colors: [null, '#a8e6ef', '#fff1a8', '#d7b8f0', '#b8e6b8', '#f7b2b7', '#b5d3f7', '#fdd0a2',
      '#a8ddd3', '#f9c0d9', '#e6f0a8', '#d3dbe0', '#d9c2b5', '#ffb59e', '#fff5b8', '#e8c8f0',
      '#bdeff5', '#eef8ff', '#ffffff'],
    bg: '#fbf5ef', grid: '#efe4da', block: drawPastelBlock,
  },
  pixel: {
    name: 'Pixel art',
    colors: [null, '#3cbcfc', '#f8b800', '#9878f8', '#58d854', '#f83800', '#0058f8', '#fc7460',
      '#00a8a8', '#f878f8', '#b8f818', '#a4a4a4', '#ac7c00', '#e45c10', '#fce0a8', '#d800cc',
      '#00e8d8', '#bcbcbc', '#fcfcfc'],
    bg: '#101020', grid: '#1e1e38', block: drawPixelBlock,
  },
};
const DEFAULT_SKIN = 'retro';
let skin = SKINS[DEFAULT_SKIN];

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const px = x * size;
  const py = y * size;
  context.globalAlpha = alpha ?? 1;
  skin.block(context, px, py, size, skin.colors[colorIndex]);
  const icon = POWERUP_ICONS[colorIndex];
  if (icon) {
    context.fillStyle = '#000';
    context.font = `${Math.floor(size * 0.6)}px sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(icon, px + size / 2, py + size / 2 + 1);
  }
  context.globalAlpha = 1;
}

// Limpia un canvas y pinta el fondo de la skin (si no tiene, queda el de CSS).
function clearCanvas(context, w, h) {
  context.clearRect(0, 0, w, h);
  if (skin.bg) {
    context.fillStyle = skin.bg;
    context.fillRect(0, 0, w, h);
  }
}

function drawGrid() {
  ctx.strokeStyle = skin.grid || getComputedStyle(document.documentElement).getPropertyValue('--grid').trim();
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  clearCanvas(ctx, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);

  // Indicadores de efectos temporales
  const timers = [];
  if (freezeLeft > 0) timers.push({ text: `❄ ${Math.ceil(freezeLeft / 1000)}s`, color: '#e1f5fe' });
  if (slowLeft > 0) timers.push({ text: `🐢 ${Math.ceil(slowLeft / 1000)}s`, color: '#a5d6a7' });
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  timers.forEach((t, i) => {
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, 6, 6 + i * 20);
  });
}

// Dibuja una pieza centrada en una rejilla de 4x4 celdas de tamaño `size`,
// desplazada (ox, oy) píxeles dentro del canvas.
function drawPieceBox(context, piece, size, ox, oy) {
  const shape = piece.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  context.save();
  context.translate(ox, oy);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(context, offX + c, offY + r, shape[r][c], size);
  context.restore();
}

function drawNext() {
  clearCanvas(nextCtx, nextCanvas.width, nextCanvas.height);
  drawPieceBox(nextCtx, next, 30, 0, 0);
  // Cola extendida (habilidad "Ver siguientes 5"): 4 piezas en rejilla 2x2
  const showQueue = previewLeft > 0;
  queueSection.classList.toggle('hidden', !showQueue);
  if (!showQueue) return;
  queueLeftEl.textContent = previewLeft;
  clearCanvas(queueCtx, queueCanvas.width, queueCanvas.height);
  lookahead.forEach((p, i) => drawPieceBox(queueCtx, p, 15, (i % 2) * 60, Math.floor(i / 2) * 60));
}

function drawHold() {
  const show = held || holdCharges > 0;
  holdSection.classList.toggle('hidden', !show);
  if (!show) return;
  holdChargesEl.textContent = holdCharges;
  clearCanvas(holdCtx, holdCanvas.width, holdCanvas.height);
  if (held) drawPieceBox(holdCtx, makePiece(held), 20, 0, 0);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
  showGameOverRecords();
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    closePauseMenu();
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    showControls(false);
    startLevelSel.value = String(startLevel);
    pauseMenu.classList.remove('hidden');
    resumeBtn.focus();
  }
}

// Oculta el menú de pausa y bloquea brevemente las teclas de juego para evitar movimientos accidentales
function closePauseMenu() {
  pauseMenu.classList.add('hidden');
  if (pauseMenu.contains(document.activeElement)) document.activeElement.blur();
  inputGuardUntil = performance.now() + RESUME_GUARD_MS;
  ignoreRepeats = true;
}

function showControls(show) {
  pauseControls.classList.toggle('hidden', !show);
  controlsBtn.setAttribute('aria-expanded', String(show));
  controlsBtn.textContent = show ? 'Ocultar controles' : 'Ver controles';
}

// Navegación del menú de pausa con flechas (sin mover la pieza)
function handlePauseMenuKey(e) {
  if (e.code === 'KeyP' || e.code === 'Escape') {
    e.preventDefault();
    togglePause();
    return;
  }
  const onSelect = e.target === startLevelSel;
  if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
    if (onSelect) return; // el selector usa las flechas para cambiar de nivel
    e.preventDefault();
    const items = [resumeBtn, pauseRestartBtn, controlsBtn, startLevelSel];
    const i = items.indexOf(document.activeElement);
    const step = e.code === 'ArrowDown' ? 1 : -1;
    items[(i + step + items.length) % items.length].focus();
    return;
  }
  // Space (caída dura) nunca actúa en el menú, para no reanudar por accidente;
  // Enter activa el botón enfocado y nunca llega al juego
  if (e.code === 'Space' || (e.code === 'Enter' && !(e.target instanceof HTMLButtonElement) && !onSelect)) {
    e.preventDefault();
  }
}

function loop(ts) {
  if (gameOver || paused || choosing) return;
  const dt = ts - lastTime;
  lastTime = ts;
  if (slowLeft > 0) slowLeft = Math.max(0, slowLeft - dt);
  if (freezeLeft > 0) {
    freezeLeft = Math.max(0, freezeLeft - dt); // caída automática congelada
  } else {
    dropAccum += slowLeft > 0 ? dt / SLOW_FACTOR : dt;
  }
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
      if (gameOver) { draw(); return; } // no reprogramar el bucle tras endGame()
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  gameStartLevel = startLevel;
  level = gameStartLevel;
  paused = false;
  gameOver = false;
  dropInterval = Math.max(100, 1000 - (level - 1) * 90);
  dropAccum = 0;
  pendingPowerups = 0;
  freezeLeft = 0;
  energy = 0;
  choosing = false;
  previewLeft = 0;
  slowLeft = 0;
  held = 0;
  holdCharges = 0;
  canHold = true;
  undoSnapshot = null;
  combo = 0;
  maxCombo = 0;
  hideGameOverRecords();
  lastTime = performance.now();
  next = randomPiece();
  lookahead = Array.from({ length: LOOKAHEAD }, randomPiece);
  spawn();
  drawHold();
  updateHUD();
  overlay.classList.add('hidden');
  abilityMenu.classList.add('hidden');
  if (!pauseMenu.classList.contains('hidden')) closePauseMenu();
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  // Al escribir el nombre del récord, las teclas no controlan el juego
  if (e.target instanceof HTMLInputElement) return;
  if (choosing) {
    // Menú de habilidades abierto: 1 a 5 eligen, E o Escape cierran sin gastar energía
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= ABILITIES.length) chooseAbility(n - 1);
    else if (e.code === 'Escape' || e.code === 'KeyE') closeAbilityMenu();
    e.preventDefault();
    return;
  }
  if (paused) { handlePauseMenuKey(e); return; } // menú de pausa abierto: el juego no recibe teclas
  if (gameOver) return;
  if (e.code === 'KeyP' || e.code === 'Escape') { e.preventDefault(); togglePause(); return; }
  // Al reanudar: ignora teclas un instante y la autorrepetición de teclas que seguían pulsadas
  if (performance.now() < inputGuardUntil) return;
  if (e.repeat && ignoreRepeats) return;
  ignoreRepeats = false;
  switch (e.code) {
    case 'KeyE':
      openAbilityMenu();
      return;
    case 'KeyC':
      holdPiece();
      break;
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);
resumeBtn.addEventListener('click', () => { if (paused) togglePause(); });
pauseRestartBtn.addEventListener('click', init);
controlsBtn.addEventListener('click', () => showControls(pauseControls.classList.contains('hidden')));
startLevelSel.addEventListener('change', () => {
  startLevel = parseStartLevel(startLevelSel.value);
  try { localStorage.setItem(START_LEVEL_KEY, String(startLevel)); } catch (e) {}
});

// ---- Tema claro/oscuro (oscuro por defecto) ----
const themeBtn = document.getElementById('theme-toggle');
function applyTheme(theme) {
  const light = theme === 'light';
  if (light) document.documentElement.dataset.theme = 'light';
  else delete document.documentElement.dataset.theme;
  themeBtn.textContent = light ? '🌙 Oscuro' : '☀️ Claro';
}
themeBtn.addEventListener('click', () => {
  const newTheme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  applyTheme(newTheme);
  try { localStorage.setItem('theme', newTheme); } catch (e) {}
  themeBtn.blur(); // evita que Space/Enter reactiven el botón durante el juego
  draw(); // refresca la rejilla si el bucle está detenido (pausa o game over)
});
applyTheme(document.documentElement.dataset.theme);

// ---- Selector de skin (se guarda en localStorage, clave tetris.skin) ----
const skinSelect = document.getElementById('skin-select');
function applySkin(id) {
  if (!Object.prototype.hasOwnProperty.call(SKINS, id)) id = DEFAULT_SKIN; // valor inválido: retro
  skin = SKINS[id];
  skinSelect.value = id;
  return id;
}
skinSelect.addEventListener('change', () => {
  const id = applySkin(skinSelect.value);
  try { localStorage.setItem('tetris.skin', id); } catch (e) {}
  skinSelect.blur(); // con foco, las flechas cambiarían la skin en vez de mover la pieza
  // redibuja todo aunque el bucle esté detenido (pausa, menú o game over)
  draw();
  drawNext();
  drawHold();
});
{
  let saved = null;
  try { saved = localStorage.getItem('tetris.skin'); } catch (e) {}
  applySkin(saved);
}

// ---- Records locales (localStorage) ----
const RECORDS_KEY = 'tetris.records';
const PLAYER_NAME_KEY = 'tetris.playerName';
const TOP_SIZE = 5;
const NAME_MAX = 12;
const recordsListEl = document.getElementById('records-list');
const bestComboEl = document.getElementById('best-combo');
const maxLinesEl = document.getElementById('max-lines');
const recordsResetBtn = document.getElementById('records-reset');
const recordsOver = document.getElementById('records-over');
const recordsOverList = document.getElementById('records-over-list');
const newRecordEl = document.getElementById('new-record');
const recordForm = document.getElementById('record-form');
const recordNameInput = document.getElementById('record-name');
let pendingRecord = null; // partida que entra al Top 5 y aún no se guarda
let savedIndex = -1;      // fila guardada en esta partida (se resalta)

function emptyRecords() {
  return { top: [], bestCombo: 0, maxLines: 0 };
}

// Lectura defensiva: cualquier dato inválido se descarta
function loadRecords() {
  try {
    const data = JSON.parse(localStorage.getItem(RECORDS_KEY));
    if (!data || typeof data !== 'object') return emptyRecords();
    const top = Array.isArray(data.top) ? data.top
      .filter(e => e && typeof e.score === 'number' && isFinite(e.score) && e.score > 0)
      .map(e => ({
        name: String(e.name || '').slice(0, NAME_MAX),
        score: e.score,
        lines: Number(e.lines) || 0,
        level: Number(e.level) || 1,
        date: String(e.date || ''),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_SIZE) : [];
    return {
      top,
      bestCombo: Number(data.bestCombo) || 0,
      maxLines: Number(data.maxLines) || 0,
    };
  } catch (e) {
    return emptyRecords();
  }
}

function saveRecords(rec) {
  try { localStorage.setItem(RECORDS_KEY, JSON.stringify(rec)); } catch (e) {}
}

// Posición en la que entraría la puntuación, o -1 si no entra al Top 5.
// Los empates quedan después de las puntuaciones ya guardadas.
function topPosition(top, value) {
  if (value <= 0) return -1;
  const i = top.findIndex(e => value > e.score);
  if (i !== -1) return i;
  return top.length < TOP_SIZE ? top.length : -1;
}

// Pinta una lista del Top 5; los nombres van siempre con textContent
function renderTop(listEl, top, highlight) {
  listEl.replaceChildren();
  if (!top.length) {
    const li = document.createElement('li');
    li.className = 'records-empty';
    li.textContent = 'Sin records';
    listEl.appendChild(li);
    return;
  }
  top.forEach((e, i) => {
    const li = document.createElement('li');
    if (i === highlight) li.classList.add('highlight');
    const name = document.createElement('span');
    name.className = 'rec-name';
    name.textContent = `${i + 1}. ${e.name || 'Anónimo'}`;
    const pts = document.createElement('span');
    pts.className = 'rec-score';
    pts.textContent = e.score.toLocaleString();
    li.append(name, pts);
    listEl.appendChild(li);
  });
}

function renderRecordsPanel() {
  const rec = loadRecords();
  renderTop(recordsListEl, rec.top, savedIndex);
  bestComboEl.textContent = rec.bestCombo;
  maxLinesEl.textContent = rec.maxLines;
}

// Vista previa con la fila provisional resaltada antes de guardar
function renderPendingPreview(top) {
  const pos = topPosition(top, pendingRecord.score);
  const preview = top.slice();
  preview.splice(pos, 0, { name: '???', score: pendingRecord.score });
  renderTop(recordsOverList, preview.slice(0, TOP_SIZE), pos);
}

function showGameOverRecords() {
  const rec = loadRecords();
  const messages = [];
  if (maxCombo > rec.bestCombo) { rec.bestCombo = maxCombo; messages.push(`Mejor combo: ${maxCombo}`); }
  if (lines > rec.maxLines) { rec.maxLines = lines; messages.push(`Líneas máximas: ${lines}`); }
  saveRecords(rec);
  savedIndex = -1;
  const pos = topPosition(rec.top, score);
  pendingRecord = pos === -1 ? null : { score, lines, level };
  if (pos === 0) messages.unshift('¡Nuevo récord!');
  else if (pos > 0) messages.unshift('¡Entraste al Top 5!');
  newRecordEl.textContent = messages.join('\n');
  newRecordEl.classList.toggle('hidden', messages.length === 0);
  recordsOver.classList.remove('hidden');
  if (pendingRecord) {
    renderPendingPreview(rec.top);
    let lastName = '';
    try { lastName = localStorage.getItem(PLAYER_NAME_KEY) || ''; } catch (e) {}
    recordNameInput.value = lastName.slice(0, NAME_MAX);
    recordForm.classList.remove('hidden');
    recordNameInput.focus();
    recordNameInput.select();
  } else {
    recordForm.classList.add('hidden');
    renderTop(recordsOverList, rec.top, -1);
  }
  renderRecordsPanel();
}

function hideGameOverRecords() {
  pendingRecord = null;
  savedIndex = -1;
  recordForm.classList.add('hidden');
  recordsOver.classList.add('hidden');
  if (document.activeElement === recordNameInput) recordNameInput.blur();
  renderRecordsPanel();
}

recordForm.addEventListener('submit', e => {
  e.preventDefault();
  if (!pendingRecord) return;
  const name = recordNameInput.value.trim().slice(0, NAME_MAX) || 'Anónimo';
  try { localStorage.setItem(PLAYER_NAME_KEY, name); } catch (err) {}
  const rec = loadRecords();
  const pos = topPosition(rec.top, pendingRecord.score);
  if (pos !== -1) {
    rec.top.splice(pos, 0, { name, ...pendingRecord, date: new Date().toISOString().slice(0, 10) });
    rec.top = rec.top.slice(0, TOP_SIZE);
    saveRecords(rec);
  }
  pendingRecord = null;
  savedIndex = pos;
  recordForm.classList.add('hidden');
  recordNameInput.blur();
  renderTop(recordsOverList, rec.top, savedIndex);
  renderRecordsPanel();
});

recordsResetBtn.addEventListener('click', () => {
  recordsResetBtn.blur(); // evita que Space/Enter reactiven el botón durante el juego
  if (!confirm('¿Borrar todos los records?')) return;
  try { localStorage.removeItem(RECORDS_KEY); } catch (e) {}
  savedIndex = -1;
  // Si el game over sigue en pantalla, su lista también queda vacía
  if (!recordsOver.classList.contains('hidden')) {
    if (pendingRecord) renderPendingPreview([]);
    else renderTop(recordsOverList, [], -1);
  }
  renderRecordsPanel();
});

init();
