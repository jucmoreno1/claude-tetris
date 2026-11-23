# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proyecto
Juego de bloques que caen en JavaScript vanilla con HTML5 Canvas. Sin dependencias, sin `package.json`, sin build, sin tests ni linter. El README (en español) documenta controles, puntuación y parámetros ajustables.

## Ejecutar
```bash
open index.html                 # directo en el navegador
python3 -m http.server 8000     # o servidor estático; abrir http://localhost:8000
```
No hay suite de pruebas: la verificación es jugar en el navegador (o con la skill `run` / Playwright).

## Arquitectura
Tres archivos: `index.html` (DOM: `<canvas id="board">` 300x600, panel lateral con `#score`, `#lines`, `#level`, `#next-canvas` de 120x120 y `#overlay` para pausa y game over), `style.css` (tema oscuro) y `game.js` (toda la lógica, script clásico con `'use strict'`, sin módulos).

Claves de `game.js` que requieren leer varias funciones juntas:
- **Estado global mutable** en variables `let` de módulo (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, `animId`...). `init()` las reinicia todas; también es el handler del botón Reiniciar.
- **Celdas = índice de pieza.** `board[r][c]` y las matrices de `PIECES` guardan `0` o el tipo `1..18`, que es a la vez el índice en la paleta de cada skin (`COLORS` es la de Retro; `SKINS.<id>.colors` repite el mismo orden) (1 a 7 estándar, 8 a 10 pentominós, 11 la 1x1 de recompensa, 12 el anillo hueco, 13 a 17 power-ups 1x1 y 18 el comodín). Agregar una pieza implica tocar `PIECES`, `COLORS`, la paleta de cada skin en `SKINS` y el sorteo de `randomPiece()` (franjas de `RING_CHANCE` y `PENTOMINO_CHANCE`; `STANDARD_COUNT` solo cubre las 7 estándar). La 1x1 no se sortea: `lockPiece()` la pone en `next` cuando `clearLines()` devuelve 4.
- **Power-ups:** `clearLines()` acumula `pendingPowerups` cada `POWERUP_EVERY_LINES`; `lockPiece()` los pone en `next` (el Tetris→1x1 tiene prioridad) y al aterrizar `applyPowerup()` reemplaza a `merge()`. Congelar usa `freezeLeft` (ms), descontado en `loop`, así que no corre en pausa.
- **Habilidades cargables:** `clearLines()` suma `energy`; con la barra llena `E` abre `#ability-menu` (`choosing` detiene `loop` como la pausa) y `chooseAbility()` gasta toda la energía. La cola es `next` + `lookahead` (4 piezas): `spawn()` la avanza y `pushFront()` mete la 1x1 o el power-up sin descartar piezas ya mostradas. `lockPiece()` guarda `undoSnapshot` (`hardDrop()` le corrige el puntaje); reservar lo invalida. Ralentizar divide `dt` entre `SLOW_FACTOR` con `slowLeft` (ms).
- **Records locales:** bloque al final de `game.js` (antes del `init()` final, porque usa `const` del DOM). `localStorage['tetris.records']` = `{ top (máx 5), bestCombo, maxLines }`, leído con `loadRecords()` defensivo. `lockPiece()` lleva `combo`/`maxCombo` (también en `undoSnapshot`); `endGame()` llama `showGameOverRecords()` (form `#record-form` dentro de `#overlay`) e `init()` llama `hideGameOverRecords()`. El `keydown` global ignora eventos cuyo target es un `input`. Nombres solo con `textContent`.
- **Ciclo de vida de una pieza:** `loop` (requestAnimationFrame + `dropAccum`) o los handlers de teclado bajan la pieza; al chocar llaman `lockPiece()` = `merge()` + `clearLines()` + `spawn()`. `spawn()` promueve `next` a `current` y llama `endGame()` si la nueva pieza ya colisiona.
- **`collide(shape, ox, oy)`** es la única validación de posición; movimiento, rotación (`tryRotate` con kicks `[0,-1,1,-2,2]`), ghost (`ghostY`) y drops dependen de ella. Permite `y < 0` (sobre el tablero).
- **Nivel y velocidad** se calculan en `init()` y `clearLines()`: `level = gameStartLevel + floor(lines/10)`, `dropInterval = max(100, 1000 - (level-1)*90)`. `startLevel` es la preferencia del menú de pausa (`localStorage` `tetris.startLevel`); `init()` la copia a `gameStartLevel`, así que cambiarla a mitad de partida aplica en la siguiente.
- **Pausa:** `togglePause()` muestra `#pause-menu` (`#overlay` queda solo para game over). Con `paused` el `keydown` delega en `handlePauseMenuKey()` y no llega al juego; `closePauseMenu()` fija `inputGuardUntil` (150 ms) e `ignoreRepeats`. Orden en `keydown`: `choosing` (consume Escape) antes que la pausa.
- **Skins:** `SKINS` (`retro`, `neon`, `pastel`, `pixel`) define paleta, fondo (`bg`, `null` = CSS `--board-bg`), rejilla (`grid`, `null` = `--grid`) y `block(context, px, py, size, color)`. `drawBlock()` delega en la skin activa `skin` y añade el ícono de power-up; `clearCanvas()` pinta el fondo en tablero, next, queue y hold. El `<select id="skin-select">` guarda en `localStorage` `tetris.skin` y redibuja aunque el juego esté detenido.
- **Dimensiones acopladas:** si cambias `COLS`, `ROWS` o `BLOCK`, ajusta `width`/`height` del canvas en `index.html`. La vista previa asume una rejilla de 4x4 a 30 px.

## Repositorio
`00__promts/` es el historial local de prompts que genera un hook del usuario: está en `.gitignore` y no se edita a mano.

Workflows de `.github/workflows/` (todos con `anthropics/claude-code-action@v1` y el secreto `CLAUDE_CODE_OAUTH_TOKEN`):
- `claude.yml`: responde cuando alguien menciona `@claude`.
- `claude-code-review.yml`: revisa cada PR.
- `claude-issue-triage.yml`: en `issues` opened o edited (título o cuerpo, sin bots ni `@claude`) asigna labels existentes, comenta un diagnóstico con marcador `<!-- claude-triage -->`, implementa en la rama `claude/issue-N` (la reusa al editar) y abre un PR en borrador.
