# Robot Arena

A 2D top-down combat robot game where you choose from procedurally generated bots and fight AI opponents in a neon-lit arena.

## Run & Operate

- `pnpm --filter @workspace/robot-arena run dev` — run the game (port 23186)
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Game: React + HTML Canvas (requestAnimationFrame loop)
- Frontend: Vite + React
- No backend needed for core game

## Where things live

- `artifacts/robot-arena/src/game/types.ts` — all shared types
- `artifacts/robot-arena/src/game/robotGen.ts` — procedural robot generation
- `artifacts/robot-arena/src/game/engine.ts` — game loop, physics, AI, bullets
- `artifacts/robot-arena/src/game/renderer.ts` — canvas rendering
- `artifacts/robot-arena/src/pages/SelectionScreen.tsx` — robot picker
- `artifacts/robot-arena/src/pages/ArenaScreen.tsx` — combat arena

## Architecture decisions

- Pure canvas-based rendering (no game engine library) for maximum control
- Seeded PRNG for reproducible robot generation from numeric seeds
- Game state is a plain mutable ref — no React state in the game loop
- Enemy AI uses finite state machine: patrol → chase → attack → retreat
- Wave-based progression: each cleared wave spawns more and stronger enemies

## Product

- Selection screen: 6 procedurally generated robots with unique stats, shapes, colors, weapons, and lore
- "Regenerate Roster" button for fresh random robots
- Arena: top-down combat, WASD movement, mouse aim turret, left-click to fire
- Three weapon types: Cannon (high damage, medium fire rate), Shotgun (spread shot), Laser (rapid fire)
- Three body shapes: Square (Quad), Hexagon (Hex), Triangle (Tri)
- AI enemies with patrol/chase/attack/retreat behavior
- Particle effects, health bars, score tracking, wave counter
- Victory/defeat overlay with restart

## User preferences

- Game uses WASD for movement, mouse for aiming, left-click to shoot

## Gotchas

- Do not run `pnpm dev` at the workspace root — use workflow restart or filter flag
