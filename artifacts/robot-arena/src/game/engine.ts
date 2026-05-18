import type { GameState, RobotEntity, Bullet, Particle, Obstacle } from "./types";
import { generateEnemyRobot } from "./robotGen";

const WALL = 20;
const BULLET_COLORS: Record<string, Record<string, string>> = {
  player: { cannon: "#00e5ff", shotgun: "#76ff03", laser: "#ea00ff" },
  enemy: { cannon: "#ff3d00", shotgun: "#ffab00", laser: "#ff4081" },
};

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function dist(ax: number, ay: number, bx: number, by: number) {
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
}

function circleRect(cx: number, cy: number, r: number, obs: Obstacle) {
  const nearX = Math.max(obs.x, Math.min(cx, obs.x + obs.w));
  const nearY = Math.max(obs.y, Math.min(cy, obs.y + obs.h));
  return (cx - nearX) ** 2 + (cy - nearY) ** 2 < r * r;
}

function spawnParticles(state: GameState, x: number, y: number, color: string, count = 10) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 60 + Math.random() * 160;
    state.particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.4 + Math.random() * 0.4,
      maxLife: 0.4 + Math.random() * 0.4,
      color,
      size: 2 + Math.random() * 4,
    });
  }
}

function fireBullet(state: GameState, entity: RobotEntity, owner: "player" | "enemy") {
  const { template, x, y, turretAngle } = entity;
  const now = performance.now() / 1000;
  if (now - entity.lastShot < 1 / template.stats.fireRate) return;
  entity.lastShot = now;

  const w = template.weapon;
  const bs = template.stats.bulletSpeed;
  const color = BULLET_COLORS[owner][w];
  const baseAngle = turretAngle;

  const createBullet = (angle: number, dmgMult = 1): Bullet => ({
    id: uid(),
    x, y,
    vx: Math.cos(angle) * bs,
    vy: Math.sin(angle) * bs,
    damage: template.stats.damage * dmgMult,
    owner,
    ttl: w === "laser" ? 0.25 : w === "shotgun" ? 0.35 : 0.6,
    maxTtl: w === "laser" ? 0.25 : w === "shotgun" ? 0.35 : 0.6,
    weapon: w,
    size: w === "laser" ? 3 : w === "shotgun" ? 4 : 5,
    color,
  });

  if (w === "shotgun") {
    for (let i = -2; i <= 2; i++) {
      const spread = (i * 0.12) + (Math.random() - 0.5) * 0.08;
      state.bullets.push(createBullet(baseAngle + spread, 0.75));
    }
  } else if (w === "laser") {
    state.bullets.push(createBullet(baseAngle + (Math.random() - 0.5) * 0.03));
  } else {
    state.bullets.push(createBullet(baseAngle + (Math.random() - 0.5) * 0.04));
  }

  spawnParticles(state, x, y, color, 4);
}

function updatePlayerAI(state: GameState, dt: number, canvasW: number, canvasH: number) {
  const p = state.player;
  const spd = p.template.stats.speed;
  const { keys, mouseX, mouseY, cameraX, cameraY } = state;

  const camX = Math.max(0, Math.min(cameraX, state.arenaW - canvasW));
  const camY = Math.max(0, Math.min(cameraY, state.arenaH - canvasH));

  const worldMouseX = mouseX + camX;
  const worldMouseY = mouseY + camY;

  let vx = 0, vy = 0;
  if (keys.has("w") || keys.has("arrowup")) vy -= spd;
  if (keys.has("s") || keys.has("arrowdown")) vy += spd;
  if (keys.has("a") || keys.has("arrowleft")) vx -= spd;
  if (keys.has("d") || keys.has("arrowright")) vx += spd;

  if (vx !== 0 && vy !== 0) {
    vx *= 0.707;
    vy *= 0.707;
  }

  p.turretAngle = Math.atan2(worldMouseY - p.y, worldMouseX - p.x);

  if (vx !== 0 || vy !== 0) {
    p.angle = Math.atan2(vy, vx);
  }

  const nx = p.x + vx * dt;
  const ny = p.y + vy * dt;
  const r = p.template.stats.size;

  const inWall = (x: number, y: number) =>
    x < WALL + r || x > state.arenaW - WALL - r || y < WALL + r || y > state.arenaH - WALL - r;

  const hitObs = (x: number, y: number) =>
    state.obstacles.some((o) => circleRect(x, y, r + 2, o));

  if (!inWall(nx, p.y) && !hitObs(nx, p.y)) p.x = nx;
  if (!inWall(p.x, ny) && !hitObs(p.x, ny)) p.y = ny;

  if (state.mouseDown) {
    fireBullet(state, p, "player");
  }

  state.cameraX = p.x - canvasW / 2;
  state.cameraY = p.y - canvasH / 2;
}

function updateEnemyAI(state: GameState, enemy: RobotEntity, dt: number) {
  const { player } = state;
  const d = dist(enemy.x, enemy.y, player.x, player.y);
  const spd = enemy.template.stats.speed;
  const r = enemy.template.stats.size;

  const sightRange = 480;
  const attackRange = 280;
  const retreatRange = 80;

  if (d < retreatRange) {
    enemy.aiState = "retreat";
  } else if (d < sightRange) {
    enemy.aiState = d < attackRange ? "attack" : "chase";
  } else {
    enemy.aiState = "patrol";
  }

  let vx = 0, vy = 0;

  if (enemy.aiState === "patrol") {
    enemy.patrolTimer -= dt;
    if (enemy.patrolTimer <= 0 || dist(enemy.x, enemy.y, enemy.patrolTargetX, enemy.patrolTargetY) < 20) {
      enemy.patrolTargetX = WALL + 60 + Math.random() * (state.arenaW - WALL * 2 - 120);
      enemy.patrolTargetY = WALL + 60 + Math.random() * (state.arenaH - WALL * 2 - 120);
      enemy.patrolTimer = 2 + Math.random() * 3;
    }
    const dx = enemy.patrolTargetX - enemy.x;
    const dy = enemy.patrolTargetY - enemy.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 5) {
      vx = (dx / len) * spd * 0.6;
      vy = (dy / len) * spd * 0.6;
    }
    enemy.turretAngle = enemy.angle;
  } else if (enemy.aiState === "chase") {
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    vx = (dx / len) * spd;
    vy = (dy / len) * spd;
    enemy.turretAngle = Math.atan2(dy, dx);
  } else if (enemy.aiState === "attack") {
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    enemy.turretAngle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.08;

    const perpX = -dy / len;
    const perpY = dx / len;
    const strafe = Math.sin(state.time * 1.8) > 0 ? 1 : -1;
    vx = perpX * spd * 0.55 * strafe;
    vy = perpY * spd * 0.55 * strafe;

    fireBullet(state, enemy, "enemy");
  } else if (enemy.aiState === "retreat") {
    const dx = enemy.x - player.x;
    const dy = enemy.y - player.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    vx = (dx / len) * spd * 0.8;
    vy = (dy / len) * spd * 0.8;
    enemy.turretAngle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    fireBullet(state, enemy, "enemy");
  }

  if (vx !== 0 || vy !== 0) {
    if (vx !== 0 && vy !== 0) { vx *= 0.707; vy *= 0.707; }
    enemy.angle = Math.atan2(vy, vx);
  }

  const nx = enemy.x + vx * dt;
  const ny = enemy.y + vy * dt;

  const inWall = (x: number, y: number) =>
    x < WALL + r || x > state.arenaW - WALL - r || y < WALL + r || y > state.arenaH - WALL - r;
  const hitObs = (x: number, y: number) =>
    state.obstacles.some((o) => circleRect(x, y, r + 2, o));

  if (!inWall(nx, enemy.y) && !hitObs(nx, enemy.y)) enemy.x = nx;
  if (!inWall(enemy.x, ny) && !hitObs(enemy.x, ny)) enemy.y = ny;
}

function updateBullets(state: GameState, dt: number) {
  const toRemove = new Set<string>();

  for (const b of state.bullets) {
    b.ttl -= dt;
    if (b.ttl <= 0) { toRemove.add(b.id); continue; }

    b.x += b.vx * dt;
    b.y += b.vy * dt;

    if (b.x < WALL || b.x > state.arenaW - WALL || b.y < WALL || b.y > state.arenaH - WALL) {
      spawnParticles(state, b.x, b.y, b.color, 4);
      toRemove.add(b.id);
      continue;
    }

    if (state.obstacles.some((o) => circleRect(b.x, b.y, b.size, o))) {
      spawnParticles(state, b.x, b.y, b.color, 5);
      toRemove.add(b.id);
      continue;
    }

    const now = performance.now();

    if (b.owner === "player") {
      for (const enemy of state.enemies) {
        if (dist(b.x, b.y, enemy.x, enemy.y) < enemy.template.stats.size + b.size) {
          const dmg = b.damage * (1 - enemy.template.stats.armor);
          enemy.health = Math.max(0, enemy.health - dmg);
          enemy.invincibleUntil = now + 80;
          spawnParticles(state, b.x, b.y, b.color, 8);
          toRemove.add(b.id);
          if (enemy.health <= 0) {
            state.score += Math.round(50 * (1 + state.wave * 0.2));
            spawnParticles(state, enemy.x, enemy.y, enemy.template.glowColor, 30);
          }
          break;
        }
      }
    } else {
      const p = state.player;
      if (now > p.invincibleUntil && dist(b.x, b.y, p.x, p.y) < p.template.stats.size + b.size) {
        const dmg = b.damage * (1 - p.template.stats.armor);
        p.health = Math.max(0, p.health - dmg);
        p.invincibleUntil = now + 200;
        spawnParticles(state, b.x, b.y, b.color, 8);
        toRemove.add(b.id);
      }
    }
  }

  state.bullets = state.bullets.filter((b) => !toRemove.has(b.id));
}

function updateParticles(state: GameState, dt: number) {
  for (const p of state.particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.92;
    p.vy *= 0.92;
    p.life -= dt;
  }
  state.particles = state.particles.filter((p) => p.life > 0);
}

function spawnWave(state: GameState, wave: number) {
  const count = 2 + wave;
  const padding = 120;
  const positions = [
    { x: state.arenaW * 0.8, y: state.arenaH * 0.2 },
    { x: state.arenaW * 0.2, y: state.arenaH * 0.8 },
    { x: state.arenaW * 0.8, y: state.arenaH * 0.8 },
    { x: state.arenaW * 0.2, y: state.arenaH * 0.2 },
    { x: state.arenaW * 0.5, y: state.arenaH * 0.1 },
    { x: state.arenaW * 0.5, y: state.arenaH * 0.9 },
  ];

  for (let i = 0; i < count; i++) {
    const template = generateEnemyRobot(wave, i);
    const pos = positions[i % positions.length];
    const jitter = () => (Math.random() - 0.5) * padding;
    state.enemies.push({
      template,
      x: Math.max(WALL + 40, Math.min(state.arenaW - WALL - 40, pos.x + jitter())),
      y: Math.max(WALL + 40, Math.min(state.arenaH - WALL - 40, pos.y + jitter())),
      angle: Math.random() * Math.PI * 2,
      turretAngle: 0,
      health: template.stats.maxHealth,
      lastShot: 0,
      invincibleUntil: 0,
      aiState: "patrol",
      patrolTargetX: state.arenaW / 2,
      patrolTargetY: state.arenaH / 2,
      patrolTimer: 0,
    });
  }
}

export function buildInitialState(
  playerTemplate: import("./types").RobotTemplate,
  canvasW: number,
  canvasH: number,
): GameState {
  const arenaW = 1800;
  const arenaH = 1400;

  const obstacles: Obstacle[] = [
    { x: 300, y: 300, w: 120, h: 80 },
    { x: arenaW - 420, y: 300, w: 120, h: 80 },
    { x: 300, y: arenaH - 380, w: 120, h: 80 },
    { x: arenaW - 420, y: arenaH - 380, w: 120, h: 80 },
    { x: arenaW / 2 - 80, y: 220, w: 160, h: 70 },
    { x: arenaW / 2 - 80, y: arenaH - 290, w: 160, h: 70 },
    { x: 220, y: arenaH / 2 - 50, w: 70, h: 100 },
    { x: arenaW - 290, y: arenaH / 2 - 50, w: 70, h: 100 },
    { x: arenaW / 2 - 200, y: arenaH / 2 - 60, w: 100, h: 120 },
    { x: arenaW / 2 + 100, y: arenaH / 2 - 60, w: 100, h: 120 },
    { x: arenaW / 2 - 50, y: arenaH / 2 + 80, w: 100, h: 60 },
  ];

  const state: GameState = {
    player: {
      template: playerTemplate,
      x: arenaW / 2,
      y: arenaH / 2,
      angle: -Math.PI / 2,
      turretAngle: -Math.PI / 2,
      health: playerTemplate.stats.maxHealth,
      lastShot: 0,
      invincibleUntil: 0,
      aiState: "patrol",
      patrolTargetX: 0,
      patrolTargetY: 0,
      patrolTimer: 0,
    },
    enemies: [],
    bullets: [],
    particles: [],
    obstacles,
    cameraX: arenaW / 2 - canvasW / 2,
    cameraY: arenaH / 2 - canvasH / 2,
    arenaW,
    arenaH,
    wave: 1,
    score: 0,
    keys: new Set(),
    mouseX: canvasW / 2,
    mouseY: canvasH / 2,
    mouseDown: false,
    phase: "playing",
    time: 0,
  };

  spawnWave(state, 1);
  return state;
}

export function updateGame(
  state: GameState,
  dt: number,
  canvasW: number,
  canvasH: number,
): GameState {
  if (state.phase !== "playing") return state;

  state.time += dt;

  updatePlayerAI(state, dt, canvasW, canvasH);

  for (const enemy of state.enemies) {
    updateEnemyAI(state, enemy, dt);
  }

  updateBullets(state, dt);
  updateParticles(state, dt);

  state.enemies = state.enemies.filter((e) => e.health > 0);

  if (state.player.health <= 0) {
    state.phase = "defeat";
  } else if (state.enemies.length === 0) {
    state.wave += 1;
    state.player.health = Math.min(
      state.player.template.stats.maxHealth,
      state.player.health + state.player.template.stats.maxHealth * 0.3,
    );
    spawnWave(state, state.wave);
  }

  return state;
}
