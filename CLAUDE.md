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
- **Celdas = índice de pieza.** `board[r][c]` y las matrices de `PIECES` guardan `0` o el tipo `1..12`, que es a la vez el índice en `COLORS` (1 a 7 estándar, 8 a 10 pentominós, 11 la 1x1 de recompensa y 12 el anillo hueco). Agregar una pieza implica tocar `PIECES`, `COLORS` y el sorteo de `randomPiece()` (franjas de `RING_CHANCE` y `PENTOMINO_CHANCE`; `STANDARD_COUNT` solo cubre las 7 estándar). La 1x1 no se sortea: `lockPiece()` la pone en `next` cuando `clearLines()` devuelve 4.
- **Ciclo de vida de una pieza:** `loop` (requestAnimationFrame + `dropAccum`) o los handlers de teclado bajan la pieza; al chocar llaman `lockPiece()` = `merge()` + `clearLines()` + `spawn()`. `spawn()` promueve `next` a `current` y llama `endGame()` si la nueva pieza ya colisiona.
- **`collide(shape, ox, oy)`** es la única validación de posición; movimiento, rotación (`tryRotate` con kicks `[0,-1,1,-2,2]`), ghost (`ghostY`) y drops dependen de ella. Permite `y < 0` (sobre el tablero).
- **Nivel y velocidad** se recalculan solo dentro de `clearLines()`: `level = floor(lines/10)+1`, `dropInterval = max(100, 1000 - (level-1)*90)`.
- **Dimensiones acopladas:** si cambias `COLS`, `ROWS` o `BLOCK`, ajusta `width`/`height` del canvas en `index.html`. La vista previa asume una rejilla de 4x4 a 30 px.

## Comportamientos a tener en cuenta (observados en el código, no corregidos)
- `togglePause()` al reanudar no vuelve a ocultar `#overlay`.
- El README dice que `X` también rota (cierto en el código), pero el panel de controles de `index.html` no lo muestra.

## Repositorio
`00__promts/` es el historial local de prompts que genera un hook del usuario: está en `.gitignore` y no se edita a mano.

Workflows de `.github/workflows/` (todos con `anthropics/claude-code-action@v1` y el secreto `CLAUDE_CODE_OAUTH_TOKEN`):
- `claude.yml`: responde cuando alguien menciona `@claude`.
- `claude-code-review.yml`: revisa cada PR.
- `claude-issue-triage.yml`: en `issues` opened o edited (título o cuerpo, sin bots ni `@claude`) asigna labels existentes, comenta un diagnóstico con marcador `<!-- claude-triage -->`, implementa en la rama `claude/issue-N` (la reusa al editar) y abre un PR en borrador.
