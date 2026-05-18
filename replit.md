# Robot Arena

A 2D top-down 12-lb combat robot game inspired by NHRL/NRL competition, with authentic weapon physics, component damage, and AI driving styles based on real combat robots.

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

- `artifacts/robot-arena/src/game/types.ts` — all shared types + component helpers
- `artifacts/robot-arena/src/game/robots.ts` — 8 real-inspired robot definitions
- `artifacts/robot-arena/src/game/engine.ts` — game loop, physics, AI, collision/damage
- `artifacts/robot-arena/src/game/renderer.ts` — canvas rendering
- `artifacts/robot-arena/src/pages/SelectionScreen.tsx` — robot picker with live previews
- `artifacts/robot-arena/src/pages/ArenaScreen.tsx` — combat arena

## Architecture decisions

- Pure canvas-based rendering (no game engine library) for maximum control
- Game state is a plain mutable ref — no React state in the game loop
- AI uses WeakMap-keyed state machines per robot entity (no class instantiation)
- Spinner KE modeled as proportional damage × RPM percentage at time of hit
- Component quality (budget/standard/premium/titanium) affects HP, damage reduction, and performance

## Product

**8 real-inspired robots (12 lb class):**
- Tombstone Jr. (horizontal spinner — titanium weapon, devastating hits)
- Riptide (horizontal spinner — premium drive, spins up fast)
- Minotaur (drum spinner — titanium drive, rapid multi-hit)
- Hydra (lifter/wedge — titanium armor + drive, control bot)
- Witch Doctor (vertical disc — reliable all-rounder)
- Beta (pneumatic hammer — titanium armor, attrition fighter)
- Whiplash (vertical disc — titanium drive, opportunistic)
- Shatter! (electric axe — titanium weapon, AP penetration)

**Weapon physics:**
- Spinners spin up over 1.5–4 seconds (weapon throttle controlled)
- Hit damage = weaponKE × RPM% × (1 − armorReduction)
- Spinner loses energy proportional to opponent armor on impact
- Knockback vector computed from impact angle × kinetic energy
- Horizontal spinners: more knockback; vertical: more component damage; drum: rapid lighter hits
- Hammer/axe: peak damage at apex of swing; titanium quality gets AP penetration into components

**Component damage system:**
- Each robot has Armor (chassis), Drive, and Weapon — independently tracked HP
- Hit location by impact angle: front → weapon damage, sides → drive damage, rear → chassis
- Functional/Damaged/Critical/Disabled status affects performance (0/15/35/65% reduction)
- Armor HP = 0 → KO; Drive disabled → immobility loss

**AI driving styles:**
- Aggressive spinners: spin up at distance, charge when ready, retreat to respin after hit
- Control (hammer/lifter): approach, get close, fire hammer, reposition
- Opportunistic (Whiplash): circle opponent to find best angle, disengage when RPM depleted

**Match format:**
- 1v1 in an NHRL-style box arena (860×860 px with hazard stripe corners)
- 2-minute countdown timer
- Win by KO, immobility, or judge's decision (armor HP + drive HP + weapon HP score)
- Post-match damage summary showing each component HP

## Controls

- W/S — drive forward/backward (tank drive)
- A/D — rotate left/right
- SHIFT or click — weapon throttle (spin up / charge hammer)
- R — rematch after fight ends
- ESC — return to selection

## User preferences

- Game uses WASD for movement, SHIFT/click for weapon throttle

## Gotchas

- Do not run `pnpm dev` at the workspace root — use workflow restart or filter flag
- robotGen.ts has been replaced by robots.ts (real robot definitions)
