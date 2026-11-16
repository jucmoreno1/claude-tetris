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

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, pendingPowerups, freezeLeft;
// Estado de habilidades
let energy, choosing, lookahead, previewLeft, slowLeft, held, holdCharges, canHold, undoSnapshot;

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
    level = Math.floor(lines / 10) + 1;
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
    score, lines, level, dropInterval, pendingPowerups, freezeLeft,
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
  ({ score, lines, level, dropInterval, pendingPowerups, freezeLeft } = s);
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

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  const icon = POWERUP_ICONS[colorIndex];
  if (icon) {
    context.fillStyle = '#000';
    context.font = `${Math.floor(size * 0.6)}px sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(icon, x * size + size / 2, y * size + size / 2 + 1);
  }
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--grid').trim();
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
  ctx.clearRect(0, 0, canvas.width, canvas.height);
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
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  drawPieceBox(nextCtx, next, 30, 0, 0);
  // Cola extendida (habilidad "Ver siguientes 5"): 4 piezas en rejilla 2x2
  const showQueue = previewLeft > 0;
  queueSection.classList.toggle('hidden', !showQueue);
  if (!showQueue) return;
  queueLeftEl.textContent = previewLeft;
  queueCtx.clearRect(0, 0, queueCanvas.width, queueCanvas.height);
  lookahead.forEach((p, i) => drawPieceBox(queueCtx, p, 15, (i % 2) * 60, Math.floor(i / 2) * 60));
}

function drawHold() {
  const show = held || holdCharges > 0;
  holdSection.classList.toggle('hidden', !show);
  if (!show) return;
  holdChargesEl.textContent = holdCharges;
  holdCtx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
  if (held) drawPieceBox(holdCtx, makePiece(held), 20, 0, 0);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
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
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
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
  lastTime = performance.now();
  next = randomPiece();
  lookahead = Array.from({ length: LOOKAHEAD }, randomPiece);
  spawn();
  drawHold();
  updateHUD();
  overlay.classList.add('hidden');
  abilityMenu.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (choosing) {
    // Menú de habilidades abierto: 1 a 5 eligen, E o Escape cierran sin gastar energía
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= ABILITIES.length) chooseAbility(n - 1);
    else if (e.code === 'Escape' || e.code === 'KeyE') closeAbilityMenu();
    e.preventDefault();
    return;
  }
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
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

init();
