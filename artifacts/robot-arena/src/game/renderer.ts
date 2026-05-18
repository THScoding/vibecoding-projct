import type { RobotTemplate, RobotEntity, Bullet, Particle, Obstacle, GameState, BodyShape } from "./types";

function drawBodyShape(ctx: CanvasRenderingContext2D, shape: BodyShape, size: number) {
  if (shape === "square") {
    ctx.beginPath();
    ctx.rect(-size, -size, size * 2, size * 2);
  } else if (shape === "hexagon") {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      const px = Math.cos(a) * size * 1.1;
      const py = Math.sin(a) * size * 1.1;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  } else {
    ctx.beginPath();
    ctx.moveTo(0, -size * 1.3);
    ctx.lineTo(size * 1.15, size * 0.9);
    ctx.lineTo(-size * 1.15, size * 0.9);
    ctx.closePath();
  }
}

function drawTurret(ctx: CanvasRenderingContext2D, template: RobotTemplate) {
  const s = template.stats.size;
  const w = template.weapon;
  ctx.save();
  ctx.rotate(0);
  ctx.fillStyle = template.accentColor;
  ctx.shadowColor = template.glowColor;
  ctx.shadowBlur = 8;
  if (w === "cannon") {
    ctx.fillRect(-4, -s * 0.85, 8, -s * 1.0);
  } else if (w === "shotgun") {
    ctx.fillRect(-6, -s * 0.85, 5, -s * 0.8);
    ctx.fillRect(1, -s * 0.85, 5, -s * 0.8);
  } else {
    ctx.fillRect(-2, -s * 0.85, 4, -s * 1.3);
    ctx.shadowBlur = 20;
  }
  ctx.restore();
}

export function drawRobot(ctx: CanvasRenderingContext2D, entity: RobotEntity, isPlayer: boolean) {
  const { template, x, y, angle, turretAngle, health, invincibleUntil } = entity;
  const s = template.stats.size;
  const hp = health / template.stats.maxHealth;
  const now = performance.now();
  const flashing = invincibleUntil > now && Math.floor((invincibleUntil - now) / 80) % 2 === 0;

  ctx.save();
  ctx.translate(x, y);

  if (flashing) {
    ctx.globalAlpha = 0.4;
  }

  ctx.save();
  ctx.rotate(angle);

  ctx.shadowColor = template.glowColor;
  ctx.shadowBlur = isPlayer ? 18 : 10;

  drawBodyShape(ctx, template.bodyShape, s);
  ctx.fillStyle = template.primaryColor;
  ctx.fill();
  ctx.strokeStyle = template.accentColor;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.shadowBlur = 0;

  ctx.save();
  ctx.rotate(turretAngle - angle);
  drawTurret(ctx, template);
  ctx.restore();

  if (isPlayer) {
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, s + 8, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();

  const barW = s * 2.5;
  const barH = 5;
  const barX = -barW / 2;
  const barY = -s - 18;
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);

  const barColor = hp > 0.6 ? "#2ecc71" : hp > 0.3 ? "#f1c40f" : "#e74c3c";
  ctx.fillStyle = barColor;
  ctx.fillRect(barX, barY, barW * hp, barH);

  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = `bold ${isPlayer ? 11 : 9}px 'Courier New', monospace`;
  ctx.textAlign = "center";
  ctx.fillText(template.name, 0, -s - 22);

  ctx.restore();
}

export function drawBullet(ctx: CanvasRenderingContext2D, b: Bullet) {
  const age = 1 - b.ttl / b.maxTtl;
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.globalAlpha = Math.max(0.2, 1 - age * 0.4);

  const spd = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
  ctx.rotate(Math.atan2(b.vy, b.vx));

  if (b.weapon === "laser") {
    ctx.shadowColor = b.color;
    ctx.shadowBlur = 12;
    ctx.fillStyle = b.color;
    ctx.fillRect(-b.size * 3, -b.size * 0.5, b.size * 3, b.size);
  } else if (b.weapon === "shotgun") {
    ctx.shadowColor = b.color;
    ctx.shadowBlur = 6;
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.arc(0, 0, b.size, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.shadowColor = b.color;
    ctx.shadowBlur = 10;
    ctx.fillStyle = b.color;
    const len = Math.min(20, (spd / 400) * 18);
    ctx.fillRect(-len, -b.size * 0.6, len, b.size * 1.2);
    ctx.beginPath();
    ctx.arc(0, 0, b.size, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

export function drawParticle(ctx: CanvasRenderingContext2D, p: Particle) {
  const alpha = p.life / p.maxLife;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = p.color;
  ctx.shadowColor = p.color;
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawObstacle(ctx: CanvasRenderingContext2D, obs: Obstacle) {
  ctx.save();
  ctx.fillStyle = "#1a1a2e";
  ctx.strokeStyle = "#3a3a5c";
  ctx.lineWidth = 2;
  ctx.shadowColor = "#0f3460";
  ctx.shadowBlur = 8;
  ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
  ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);

  ctx.fillStyle = "rgba(255,255,255,0.03)";
  ctx.fillRect(obs.x + 4, obs.y + 4, obs.w - 8, 6);
  ctx.restore();
}

export function drawArena(ctx: CanvasRenderingContext2D, state: GameState) {
  const { arenaW, arenaH } = state;
  ctx.fillStyle = "#0a0a14";
  ctx.fillRect(0, 0, arenaW, arenaH);

  const gridSize = 60;
  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= arenaW; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, arenaH);
    ctx.stroke();
  }
  for (let y = 0; y <= arenaH; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(arenaW, y);
    ctx.stroke();
  }

  const wallThickness = 20;
  ctx.fillStyle = "#16213e";
  ctx.strokeStyle = "#0f3460";
  ctx.lineWidth = 3;
  ctx.fillRect(0, 0, arenaW, wallThickness);
  ctx.fillRect(0, arenaH - wallThickness, arenaW, wallThickness);
  ctx.fillRect(0, 0, wallThickness, arenaH);
  ctx.fillRect(arenaW - wallThickness, 0, wallThickness, arenaH);

  ctx.shadowColor = "#00b4d8";
  ctx.shadowBlur = 12;
  ctx.strokeRect(wallThickness / 2, wallThickness / 2, arenaW - wallThickness, arenaH - wallThickness);
  ctx.shadowBlur = 0;
}

export function drawHUD(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  canvasW: number,
  canvasH: number,
) {
  const p = state.player;
  const hp = p.health / p.template.stats.maxHealth;

  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(16, 16, 220, 60);
  ctx.strokeStyle = p.template.accentColor;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(16, 16, 220, 60);

  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = "10px 'Courier New', monospace";
  ctx.textAlign = "left";
  ctx.fillText("HEALTH", 28, 34);

  const barColor = hp > 0.6 ? "#2ecc71" : hp > 0.3 ? "#f1c40f" : "#e74c3c";
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  ctx.fillRect(28, 40, 194, 14);
  ctx.fillStyle = barColor;
  ctx.shadowColor = barColor;
  ctx.shadowBlur = 8;
  ctx.fillRect(28, 40, 194 * hp, 14);
  ctx.shadowBlur = 0;

  ctx.fillStyle = "#fff";
  ctx.font = "bold 10px 'Courier New', monospace";
  ctx.fillText(`${Math.ceil(p.health)} / ${p.template.stats.maxHealth}`, 28, 68);

  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(canvasW - 160, 16, 144, 60);
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.strokeRect(canvasW - 160, 16, 144, 60);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "right";
  ctx.font = "bold 14px 'Courier New', monospace";
  ctx.fillText(`WAVE ${state.wave}`, canvasW - 28, 38);
  ctx.font = "12px 'Courier New', monospace";
  ctx.fillStyle = "#f1c40f";
  ctx.fillText(`SCORE: ${state.score}`, canvasW - 28, 56);
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = "10px 'Courier New', monospace";
  ctx.fillText(`ENEMIES: ${state.enemies.length}`, canvasW - 28, 70);

  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(canvasW / 2 - 120, 16, 240, 30);
  ctx.fillStyle = p.template.glowColor;
  ctx.font = "bold 12px 'Courier New', monospace";
  ctx.textAlign = "center";
  ctx.shadowColor = p.template.glowColor;
  ctx.shadowBlur = 8;
  ctx.fillText(`[ ${p.template.name} ]`, canvasW / 2, 36);
  ctx.shadowBlur = 0;

  ctx.restore();
}

export function renderGame(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  canvasW: number,
  canvasH: number,
) {
  ctx.clearRect(0, 0, canvasW, canvasH);

  const camX = Math.max(0, Math.min(state.cameraX, state.arenaW - canvasW));
  const camY = Math.max(0, Math.min(state.cameraY, state.arenaH - canvasH));

  ctx.save();
  ctx.translate(-camX, -camY);

  drawArena(ctx, state);

  for (const obs of state.obstacles) {
    drawObstacle(ctx, obs);
  }

  for (const b of state.bullets) {
    drawBullet(ctx, b);
  }

  for (const p of state.particles) {
    drawParticle(ctx, p);
  }

  for (const enemy of state.enemies) {
    drawRobot(ctx, enemy, false);
  }

  drawRobot(ctx, state.player, true);

  ctx.restore();

  drawHUD(ctx, state, canvasW, canvasH);
}
