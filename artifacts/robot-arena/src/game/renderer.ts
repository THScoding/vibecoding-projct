import type { GameState, RobotEntity, Particle } from "./types";
import { componentStatus, QUALITY_LABEL } from "./types";

// ── Arena ─────────────────────────────────────────────────────────────────────
export function drawArena(ctx: CanvasRenderingContext2D, arenaW: number, arenaH: number) {
  const WALL = 24;

  // Floor
  ctx.fillStyle = "#111118";
  ctx.fillRect(0, 0, arenaW, arenaH);

  // Floor grid
  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  ctx.lineWidth = 1;
  const gs = 55;
  for (let x = 0; x < arenaW; x += gs) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, arenaH); ctx.stroke(); }
  for (let y = 0; y < arenaH; y += gs) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(arenaW, y); ctx.stroke(); }

  // Centre circle
  ctx.beginPath();
  ctx.arc(arenaW / 2, arenaH / 2, 90, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(arenaW / 2, arenaH / 2, 4, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  ctx.fill();

  // Hazard stripes on floor near walls
  ctx.save();
  ctx.strokeStyle = "rgba(255,200,0,0.07)";
  ctx.lineWidth = 14;
  for (let i = -arenaH; i < arenaW + arenaH; i += 40) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + arenaH, arenaH); ctx.stroke();
  }
  ctx.restore();

  // Walls
  ctx.fillStyle = "#1e2030";
  ctx.fillRect(0, 0, arenaW, WALL);
  ctx.fillRect(0, arenaH - WALL, arenaW, WALL);
  ctx.fillRect(0, 0, WALL, arenaH);
  ctx.fillRect(arenaW - WALL, 0, WALL, arenaH);

  // Wall inner glow line
  ctx.strokeStyle = "#e0e0e0";
  ctx.lineWidth = 2;
  ctx.strokeRect(WALL, WALL, arenaW - WALL * 2, arenaH - WALL * 2);

  // Hazard stripe corners
  const cs = 18;
  for (const [cx, cy, ang] of [
    [0, 0, 0], [arenaW, 0, Math.PI / 2],
    [arenaW, arenaH, Math.PI], [0, arenaH, -Math.PI / 2],
  ] as [number, number, number][]) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    ctx.fillStyle = "#333";
    ctx.fillRect(0, 0, cs * 5, cs * 5);
    for (let k = 0; k < 5; k++) {
      ctx.fillStyle = k % 2 === 0 ? "#222" : "#f9a825";
      ctx.fillRect(k * cs, 0, cs, cs * 5);
    }
    ctx.restore();
  }

  // NHRL-style text on floor
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = "#fff";
  ctx.font = "bold 52px 'Arial Black', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("NHRL", arenaW / 2, arenaH / 2 - 20);
  ctx.font = "bold 18px 'Arial Black', sans-serif";
  ctx.fillText("12 LB DIVISION", arenaW / 2, arenaH / 2 + 30);
  ctx.restore();
}

// ── Robot Rendering ────────────────────────────────────────────────────────────
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawTracks(ctx: CanvasRenderingContext2D, w: number, l: number, color: string) {
  const tw = 7, tl = l * 0.85;
  ctx.fillStyle = color;
  ctx.fillRect(-w / 2 - tw, -tl / 2, tw, tl);
  ctx.fillRect(w / 2, -tl / 2, tw, tl);
  // track links
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = 1.5;
  const links = 6;
  for (let i = 0; i < links; i++) {
    const ty = -tl / 2 + (i / links) * tl;
    ctx.beginPath(); ctx.moveTo(-w / 2 - tw, ty); ctx.lineTo(-w / 2, ty); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w / 2, ty); ctx.lineTo(w / 2 + tw, ty); ctx.stroke();
  }
}

function getComponentTint(entity: RobotEntity): string {
  const armorPct = entity.armor.currentHP / entity.armor.maxHP;
  if (armorPct < 0.15) return "rgba(255,0,0,0.35)";
  if (armorPct < 0.4) return "rgba(255,120,0,0.2)";
  return "transparent";
}

function drawHorizontalSpinner(ctx: CanvasRenderingContext2D, entity: RobotEntity, time: number) {
  const { spec } = entity;
  const w = spec.bodyWidth;
  const l = spec.bodyLength;
  const rpmPct = spec.maxWeaponRPM > 0 ? entity.weaponRPM / spec.maxWeaponRPM : 0;
  const weaponOk = componentStatus(entity.weapon) !== "disabled";

  drawTracks(ctx, w, l, "#222");

  // Body
  ctx.shadowColor = spec.accentColor;
  ctx.shadowBlur = 6;
  roundRect(ctx, -w / 2, -l / 2, w, l, 4);
  ctx.fillStyle = spec.primaryColor;
  ctx.fill();
  ctx.strokeStyle = spec.accentColor;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Body detail lines
  ctx.strokeStyle = spec.trimColor;
  ctx.lineWidth = 1;
  ctx.strokeRect(-w / 2 + 5, -l / 2 + 5, w - 10, l - 10);

  // Spinning bar weapon
  if (weaponOk) {
    const barAngle = time * rpmPct * 12;
    const barLen = w * 0.62 + 10;
    ctx.save();
    ctx.rotate(barAngle);
    ctx.fillStyle = rpmPct > 0.1 ? spec.accentColor : "#555";
    ctx.shadowColor = spec.accentColor;
    ctx.shadowBlur = rpmPct > 0.3 ? 14 : 0;
    ctx.fillRect(-barLen, -5, barLen * 2, 10);
    ctx.shadowBlur = 0;

    // Bar tips
    ctx.fillStyle = "#ddd";
    ctx.fillRect(-barLen, -5, 10, 10);
    ctx.fillRect(barLen - 10, -5, 10, 10);
    ctx.restore();

    // RPM blur glow disc at high speed
    if (rpmPct > 0.6) {
      ctx.beginPath();
      ctx.arc(0, 0, barLen + 4, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${hexToRgb(spec.accentColor)},${rpmPct * 0.3})`;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }
}

function drawDrum(ctx: CanvasRenderingContext2D, entity: RobotEntity, time: number) {
  const { spec } = entity;
  const w = spec.bodyWidth;
  const l = spec.bodyLength;
  const rpmPct = entity.weaponRPM / spec.maxWeaponRPM;
  const weaponOk = componentStatus(entity.weapon) !== "disabled";

  drawTracks(ctx, w, l, "#1a0000");

  // Wedge body (tapers at front)
  ctx.fillStyle = spec.primaryColor;
  ctx.shadowColor = spec.accentColor;
  ctx.shadowBlur = 5;
  ctx.beginPath();
  ctx.moveTo(-w / 2, -l / 2);
  ctx.lineTo(w / 2, -l / 2);
  ctx.lineTo(w / 2 * 0.7, l / 2);
  ctx.lineTo(-w / 2 * 0.7, l / 2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = spec.accentColor;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Drum at front
  if (weaponOk) {
    const drumW = w * 0.85;
    const drumH = 18;
    ctx.save();
    ctx.translate(0, -l / 2 - drumH * 0.3);
    ctx.fillStyle = "#333";
    ctx.fillRect(-drumW / 2, -drumH / 2, drumW, drumH);
    // Drum teeth rotating
    const teeth = 8;
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * Math.PI * 2 + time * rpmPct * 15;
      const tx = Math.cos(a) * 6;
      const ty = Math.sin(a) * 6;
      ctx.fillStyle = rpmPct > 0.1 ? spec.accentColor : "#444";
      ctx.shadowColor = spec.accentColor;
      ctx.shadowBlur = rpmPct > 0.4 ? 8 : 0;
      ctx.fillRect(tx - 3 - drumW / 2 + (i / teeth) * drumW, ty - 3, 6, 6);
    }
    ctx.shadowBlur = 0;
    ctx.restore();
  }
}

function drawVerticalSpinner(ctx: CanvasRenderingContext2D, entity: RobotEntity, time: number) {
  const { spec } = entity;
  const w = spec.bodyWidth;
  const l = spec.bodyLength;
  const rpmPct = spec.maxWeaponRPM > 0 ? entity.weaponRPM / spec.maxWeaponRPM : 0;
  const weaponOk = componentStatus(entity.weapon) !== "disabled";

  drawTracks(ctx, w, l, "#111");

  // Wedge body
  ctx.fillStyle = spec.primaryColor;
  ctx.shadowColor = spec.accentColor;
  ctx.shadowBlur = 5;
  ctx.beginPath();
  ctx.moveTo(-w / 2, -l / 2);
  ctx.lineTo(w / 2, -l / 2);
  ctx.lineTo(w / 2 * 0.8, l / 2);
  ctx.lineTo(-w / 2 * 0.8, l / 2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = spec.accentColor;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Skull decoration for Witch Doctor
  if (spec.id === "witch_doctor") {
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
  }

  // Vertical disc at front
  if (weaponOk) {
    const discR = 18;
    ctx.save();
    ctx.translate(0, -l / 2 + discR * 0.1);
    ctx.beginPath();
    ctx.arc(0, 0, discR, 0, Math.PI * 2);
    ctx.fillStyle = rpmPct > 0.1 ? spec.accentColor : "#444";
    ctx.shadowColor = spec.accentColor;
    ctx.shadowBlur = rpmPct > 0.4 ? 16 : 0;
    ctx.fill();
    // Spin lines
    const bladeAngle = time * rpmPct * 18;
    ctx.rotate(bladeAngle);
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * discR * 0.2, Math.sin(a) * discR * 0.2);
      ctx.lineTo(Math.cos(a) * discR, Math.sin(a) * discR);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.restore();
  }
}

function drawLifter(ctx: CanvasRenderingContext2D, entity: RobotEntity) {
  const { spec } = entity;
  const w = spec.bodyWidth;
  const l = spec.bodyLength;

  drawTracks(ctx, w, l, "#1a0a2e");

  // Wide body
  ctx.fillStyle = spec.primaryColor;
  ctx.shadowColor = spec.accentColor;
  ctx.shadowBlur = 6;
  roundRect(ctx, -w / 2, -l / 2, w, l, 6);
  ctx.fill();
  ctx.strokeStyle = spec.accentColor;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Fork at front (U-shape)
  const liftActive = entity.weaponThrottle > 0.3;
  ctx.fillStyle = liftActive ? spec.accentColor : "#555";
  ctx.strokeStyle = liftActive ? spec.accentColor : "#444";
  ctx.lineWidth = 2;
  const forkY = -l / 2 - 14;
  const forkW = w * 0.65;
  const forkH = 14;
  // Left prong
  ctx.fillRect(-forkW / 2, forkY, 8, forkH + 8);
  // Right prong
  ctx.fillRect(forkW / 2 - 8, forkY, 8, forkH + 8);
  // Top bar
  ctx.fillRect(-forkW / 2, forkY - 5, forkW, 7);
  if (liftActive) {
    ctx.shadowColor = spec.accentColor;
    ctx.shadowBlur = 12;
    ctx.strokeRect(-forkW / 2, forkY - 5, forkW, forkH + 13);
    ctx.shadowBlur = 0;
  }
}

function drawHammer(ctx: CanvasRenderingContext2D, entity: RobotEntity) {
  const { spec } = entity;
  const w = spec.bodyWidth;
  const l = spec.bodyLength;

  drawTracks(ctx, w, l, "#1a1a1a");

  // Chunky body
  ctx.fillStyle = spec.primaryColor;
  ctx.shadowColor = spec.accentColor;
  ctx.shadowBlur = 5;
  roundRect(ctx, -w / 2, -l / 2, w, l, 5);
  ctx.fill();
  ctx.strokeStyle = spec.accentColor;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Diagonal armor lines
  ctx.strokeStyle = spec.trimColor;
  ctx.lineWidth = 1;
  ctx.strokeRect(-w / 2 + 6, -l / 2 + 6, w - 12, l - 12);

  // Hammer arm
  const hamReady = entity.hammerState === "ready";
  const hamStr = hamReady && entity.hammerCooldown < 0.3;
  ctx.save();
  ctx.translate(0, 0);
  ctx.rotate(entity.hammerAngle);
  // Arm
  ctx.fillStyle = hamStr ? spec.accentColor : "#555";
  ctx.shadowColor = spec.accentColor;
  ctx.shadowBlur = entity.hammerState === "striking" ? 20 : 0;
  ctx.fillRect(-5, -l / 2 - 22, 10, 32);
  // Head
  ctx.fillStyle = hamStr ? "#eee" : "#888";
  ctx.fillRect(-12, -l / 2 - 24, 24, 12);
  // Red highlight for titanium
  if (spec.weaponQuality === "titanium") {
    ctx.fillStyle = "#ef5350";
    ctx.fillRect(-12, -l / 2 - 28, 24, 8);
  }
  ctx.shadowBlur = 0;
  ctx.restore();
}

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}

export function drawRobot(
  ctx: CanvasRenderingContext2D,
  entity: RobotEntity,
  time: number,
  isPlayer: boolean,
) {
  const now = performance.now();
  const flashing = entity.hitFlashUntil > now && Math.floor((entity.hitFlashUntil - now) / 70) % 2 === 0;

  ctx.save();
  ctx.translate(entity.x, entity.y);
  ctx.rotate(entity.angle);
  if (flashing) ctx.globalAlpha = 0.3;

  const { weaponType } = entity.spec;
  if (weaponType === "horizontal_spinner") drawHorizontalSpinner(ctx, entity, time);
  else if (weaponType === "drum") drawDrum(ctx, entity, time);
  else if (weaponType === "vertical_spinner") drawVerticalSpinner(ctx, entity, time);
  else if (weaponType === "lifter") drawLifter(ctx, entity);
  else if (weaponType === "hammer") drawHammer(ctx, entity);

  ctx.globalAlpha = 1;

  // Damage tint
  const tint = getComponentTint(entity);
  if (tint !== "transparent") {
    const { bodyWidth: w, bodyLength: l } = entity.spec;
    roundRect(ctx, -w / 2, -l / 2, w, l, 5);
    ctx.fillStyle = tint;
    ctx.fill();
  }

  // Player indicator ring
  if (isPlayer) {
    ctx.beginPath();
    const r = Math.max(entity.spec.bodyWidth, entity.spec.bodyLength) / 2 + 12;
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(100,200,255,0.25)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Facing arrow
  const { bodyLength: l } = entity.spec;
  ctx.fillStyle = isPlayer ? "rgba(100,200,255,0.5)" : "rgba(255,80,80,0.5)";
  ctx.beginPath();
  ctx.moveTo(0, -l / 2 - 6);
  ctx.lineTo(-5, -l / 2 + 2);
  ctx.lineTo(5, -l / 2 + 2);
  ctx.closePath();
  ctx.fill();

  ctx.restore();

  // Name label (above robot, in world space)
  ctx.save();
  ctx.font = `bold 10px 'Courier New', monospace`;
  ctx.textAlign = "center";
  ctx.fillStyle = isPlayer ? "#64b5f6" : "#ef9a9a";
  ctx.shadowColor = isPlayer ? "#1565c0" : "#b71c1c";
  ctx.shadowBlur = 6;
  ctx.fillText(entity.spec.name, entity.x, entity.y - entity.spec.bodyLength / 2 - 18);
  ctx.shadowBlur = 0;
  ctx.restore();
}

// ── Particles ─────────────────────────────────────────────────────────────────
export function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[]) {
  for (const p of particles) {
    const alpha = Math.min(1, p.life / p.maxLife);
    ctx.save();
    ctx.globalAlpha = alpha;
    if (p.type === "smoke") {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1 - alpha * 0.3), 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.shadowColor = p.color;
      ctx.shadowBlur = p.type === "spark" ? 8 : 3;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

// ── HUD ───────────────────────────────────────────────────────────────────────
function compColor(pct: number): string {
  if (pct > 0.6) return "#4caf50";
  if (pct > 0.3) return "#ffc107";
  return "#f44336";
}

function drawComponentBars(
  ctx: CanvasRenderingContext2D,
  entity: RobotEntity,
  x: number,
  y: number,
  flip: boolean,
) {
  const barW = 140, barH = 7, gap = 12;
  const labels = ["ARMOR", "DRIVE", "WEAPON"];
  const comps = [entity.armor, entity.drive, entity.weapon];

  ctx.font = "9px 'Courier New', monospace";
  ctx.textAlign = flip ? "right" : "left";

  for (let i = 0; i < 3; i++) {
    const c = comps[i];
    const pct = c.currentHP / c.maxHP;
    const color = compColor(pct);
    const barX = flip ? x - barW : x;
    const barY = y + i * gap;

    // Background
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(barX, barY, barW, barH);

    // Fill
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 4;
    ctx.fillRect(barX, barY, barW * pct, barH);
    ctx.shadowBlur = 0;

    // Label
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    const labelX = flip ? x - barW - 4 : x + barW + 4;
    ctx.textAlign = flip ? "right" : "left";
    ctx.fillText(`${labels[i]} ${QUALITY_LABEL[c.quality]}`, labelX, barY + barH - 1);

    // Status text
    const status = componentStatus(c);
    if (status !== "functional") {
      ctx.fillStyle = status === "disabled" ? "#f44336" : status === "critical" ? "#ff7043" : "#ffc107";
      ctx.textAlign = flip ? "left" : "right";
      const sx = flip ? x - barW - 4 + (flip ? barW * 2 + 8 : 0) : x + barW - (flip ? 0 : 0);
      ctx.fillText(`[${status.toUpperCase()}]`, flip ? x : x + barW, barY + barH - 1);
      void sx;
    }
  }
}

function drawWeaponRPM(
  ctx: CanvasRenderingContext2D,
  entity: RobotEntity,
  x: number,
  y: number,
) {
  if (entity.spec.maxWeaponRPM === 0) {
    // Hammer cooldown
    const cd = entity.hammerCooldown;
    const maxCd = entity.spec.id === "beta" ? 2.2 : 1.6;
    const pct = 1 - Math.min(1, cd / maxCd);
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(x, y, 140, 7);
    ctx.fillStyle = pct >= 1 ? "#e91e63" : "#546e7a";
    ctx.shadowColor = pct >= 1 ? "#e91e63" : "transparent";
    ctx.shadowBlur = pct >= 1 ? 8 : 0;
    ctx.fillRect(x, y, 140 * pct, 7);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "9px 'Courier New', monospace";
    ctx.textAlign = "left";
    ctx.fillText(pct >= 1 ? "HAMMER READY" : "CHARGING...", x, y + 16);
    return;
  }
  const rpmPct = entity.weaponRPM / entity.spec.maxWeaponRPM;
  const rpm = Math.round(entity.weaponRPM);
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(x, y, 140, 7);
  const rColor = rpmPct > 0.7 ? "#ef5350" : rpmPct > 0.35 ? "#ffa726" : "#42a5f5";
  ctx.fillStyle = rColor;
  ctx.shadowColor = rColor;
  ctx.shadowBlur = rpmPct > 0.5 ? 10 : 0;
  ctx.fillRect(x, y, 140 * rpmPct, 7);
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.font = "9px 'Courier New', monospace";
  ctx.textAlign = "left";
  ctx.fillText(`WEAPON: ${rpm.toLocaleString()} RPM`, x, y + 16);
}

function drawRobotPanel(
  ctx: CanvasRenderingContext2D,
  entity: RobotEntity,
  x: number,
  y: number,
  panelW: number,
  flip: boolean,
  label: string,
  labelColor: string,
) {
  // Panel bg
  ctx.fillStyle = "rgba(0,0,0,0.72)";
  ctx.strokeStyle = labelColor + "55";
  ctx.lineWidth = 1;
  const ph = 118;
  ctx.fillRect(x, y, panelW, ph);
  ctx.strokeRect(x, y, panelW, ph);

  // Name
  ctx.fillStyle = labelColor;
  ctx.font = `bold 11px 'Courier New', monospace`;
  ctx.textAlign = "left";
  ctx.fillText(`${label}: ${entity.spec.name}`, x + 8, y + 16);

  // Overall health bar
  const hpPct = entity.armor.currentHP / entity.armor.maxHP;
  const hpColor = compColor(hpPct);
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  ctx.fillRect(x + 8, y + 22, panelW - 16, 10);
  ctx.fillStyle = hpColor;
  ctx.shadowColor = hpColor;
  ctx.shadowBlur = 6;
  ctx.fillRect(x + 8, y + 22, (panelW - 16) * hpPct, 10);
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#fff";
  ctx.font = "bold 9px 'Courier New', monospace";
  ctx.fillText(`${Math.ceil(entity.armor.currentHP)}/${entity.armor.maxHP} HP`, x + 8, y + 43);

  // Component bars
  const compX = x + 8;
  const compY = y + 48;
  const comps = [
    { label: "DRIVE", c: entity.drive },
    { label: "WEAPON", c: entity.weapon },
  ];
  for (let i = 0; i < 2; i++) {
    const c = comps[i].c;
    const pct = c.currentHP / c.maxHP;
    const col = compColor(pct);
    const bx = compX;
    const by = compY + i * 13;
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    ctx.fillRect(bx, by, panelW - 16, 7);
    ctx.fillStyle = col;
    ctx.fillRect(bx, by, (panelW - 16) * pct, 7);
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "8px 'Courier New', monospace";
    ctx.fillText(
      `${comps[i].label}  ${componentStatus(c).toUpperCase()}`,
      bx,
      by + 16,
    );
  }
  void flip; void drawComponentBars;

  // Weapon RPM/cooldown
  const rpmY = y + 84;
  if (entity.spec.maxWeaponRPM > 0) {
    const rpmPct = entity.weaponRPM / entity.spec.maxWeaponRPM;
    const rColor = rpmPct > 0.7 ? "#ef5350" : rpmPct > 0.35 ? "#ffa726" : "#42a5f5";
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    ctx.fillRect(x + 8, rpmY, panelW - 16, 7);
    ctx.fillStyle = rColor;
    ctx.shadowColor = rColor;
    ctx.shadowBlur = rpmPct > 0.6 ? 8 : 0;
    ctx.fillRect(x + 8, rpmY, (panelW - 16) * rpmPct, 7);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "8px 'Courier New', monospace";
    ctx.fillText(`WEAPON  ${Math.round(entity.weaponRPM).toLocaleString()} / ${entity.spec.maxWeaponRPM.toLocaleString()} RPM`, x + 8, rpmY + 14);
  } else {
    const maxCd = entity.spec.id === "beta" ? 2.2 : 1.6;
    const cdPct = 1 - Math.min(1, entity.hammerCooldown / maxCd);
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    ctx.fillRect(x + 8, rpmY, panelW - 16, 7);
    ctx.fillStyle = cdPct >= 1 ? "#e91e63" : "#546e7a";
    ctx.shadowColor = cdPct >= 1 ? "#e91e63" : "transparent";
    ctx.shadowBlur = cdPct >= 1 ? 8 : 0;
    ctx.fillRect(x + 8, rpmY, (panelW - 16) * cdPct, 7);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "8px 'Courier New', monospace";
    ctx.fillText(cdPct >= 1 ? "HAMMER ▶ READY" : "HAMMER  CHARGING", x + 8, rpmY + 14);
  }
}

export function drawHUD(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  canvasW: number,
  canvasH: number,
  arenaOffX: number,
  arenaOffY: number,
) {
  const pw = 230;
  const py = canvasH - 130;

  // Player panel
  drawRobotPanel(ctx, state.player, 8, py, pw, false, "YOU", "#64b5f6");
  // Opponent panel
  drawRobotPanel(ctx, state.opponent, canvasW - pw - 8, py, pw, true, "OPP", "#ef9a9a");

  // Timer
  const { match } = state;
  const secs = Math.ceil(match.timeRemaining);
  const mins = Math.floor(secs / 60);
  const s = secs % 60;
  const timerStr = match.phase === "fighting"
    ? `${mins}:${s.toString().padStart(2, "0")}`
    : match.phase === "countdown"
    ? `READY`
    : `END`;

  const danger = match.timeRemaining < 20 && match.phase === "fighting";
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(canvasW / 2 - 65, 10, 130, 42);
  ctx.strokeStyle = danger ? "#f44336" : "rgba(255,255,255,0.2)";
  ctx.lineWidth = 1;
  ctx.strokeRect(canvasW / 2 - 65, 10, 130, 42);
  ctx.fillStyle = danger ? "#f44336" : "#ffffff";
  ctx.shadowColor = danger ? "#f44336" : "transparent";
  ctx.shadowBlur = danger ? 12 : 0;
  ctx.font = `bold 28px 'Courier New', monospace`;
  ctx.textAlign = "center";
  ctx.fillText(timerStr, canvasW / 2, 44);
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.font = "9px 'Courier New', monospace";
  ctx.fillText("MATCH TIME", canvasW / 2, 20);
  ctx.restore();

  // Controls hint
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.2)";
  ctx.font = "9px 'Courier New', monospace";
  ctx.textAlign = "center";
  ctx.fillText("W/S=DRIVE   A/D=TURN   SHIFT/CLICK=WEAPON", canvasW / 2, canvasH - 8);
  ctx.restore();

  void arenaOffX; void arenaOffY; void drawWeaponRPM;
}

// ── Countdown Overlay ─────────────────────────────────────────────────────────
export function drawCountdown(
  ctx: CanvasRenderingContext2D,
  timer: number,
  canvasW: number,
  canvasH: number,
) {
  const count = Math.ceil(timer);
  const frac = count - timer; // 0→1 as digit animates
  const scale = 1.0 + frac * 0.5;
  const alpha = 1 - frac * 0.5;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `bold ${Math.round(120 * scale)}px 'Courier New', monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "#ff3d00";
  ctx.shadowBlur = 40;
  ctx.fillText(count > 0 ? String(count) : "FIGHT!", canvasW / 2, canvasH / 2);
  ctx.restore();
}

// ── End Overlay ───────────────────────────────────────────────────────────────
export function drawMatchEnd(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  canvasW: number,
  canvasH: number,
) {
  const { match } = state;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.75)";
  ctx.fillRect(0, 0, canvasW, canvasH);

  const isWin = match.winner === "player";
  const isDraw = match.winner === "draw";
  const title = isDraw ? "DRAW" : isWin ? "VICTORY!" : "DEFEATED";
  const titleColor = isDraw ? "#ffc107" : isWin ? "#76ff03" : "#f44336";

  ctx.fillStyle = titleColor;
  ctx.shadowColor = titleColor;
  ctx.shadowBlur = 40;
  ctx.font = "bold 72px 'Courier New', monospace";
  ctx.textAlign = "center";
  ctx.fillText(title, canvasW / 2, canvasH / 2 - 80);
  ctx.shadowBlur = 0;

  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = "16px 'Courier New', monospace";
  ctx.fillText(match.winReason, canvasW / 2, canvasH / 2 - 30);

  // Damage summary
  const p = state.player;
  const o = state.opponent;
  const px = canvasW / 2 - 160;
  const ox = canvasW / 2 + 20;
  const sy = canvasH / 2 + 10;

  const drawSummary = (entity: RobotEntity, startX: number, label: string, color: string) => {
    ctx.fillStyle = color;
    ctx.font = "bold 12px 'Courier New', monospace";
    ctx.textAlign = "left";
    ctx.fillText(label, startX, sy);
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = "11px 'Courier New', monospace";
    ctx.fillText(`Armor: ${Math.ceil(entity.armor.currentHP)}/${entity.armor.maxHP} HP`, startX, sy + 18);
    ctx.fillText(`Drive: ${Math.ceil(entity.drive.currentHP)}/${entity.drive.maxHP} HP`, startX, sy + 32);
    ctx.fillText(`Weapon: ${Math.ceil(entity.weapon.currentHP)}/${entity.weapon.maxHP} HP`, startX, sy + 46);
    ctx.fillText(`Dmg taken: ${Math.round(entity.totalDamageTaken)}`, startX, sy + 60);
  };

  drawSummary(p, px, "[ YOUR BOT ]", "#64b5f6");
  drawSummary(o, ox, `[ ${o.spec.name} ]`, "#ef9a9a");

  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.font = "12px 'Courier New', monospace";
  ctx.textAlign = "center";
  ctx.fillText("[R] REMATCH   [ESC] BACK TO SELECTION", canvasW / 2, canvasH / 2 + 100);
  ctx.restore();
}
