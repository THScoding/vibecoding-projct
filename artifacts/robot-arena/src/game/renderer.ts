import type { GameState, RobotEntity, Particle } from "./types";
import { componentStatus, QUALITY_LABEL } from "./types";

// ── Utility ────────────────────────────────────────────────────────────────────
function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

// ── Arena ─────────────────────────────────────────────────────────────────────
export function drawArena(ctx: CanvasRenderingContext2D, arenaW: number, arenaH: number) {
  const WALL = 24;

  // Base floor — dark concrete
  ctx.fillStyle = "#18191f";
  ctx.fillRect(0, 0, arenaW, arenaH);

  // Concrete plate seams — large tiles
  const tileSize = 86;
  ctx.strokeStyle = "rgba(255,255,255,0.045)";
  ctx.lineWidth = 1.5;
  for (let x = 0; x <= arenaW; x += tileSize) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, arenaH); ctx.stroke();
  }
  for (let y = 0; y <= arenaH; y += tileSize) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(arenaW, y); ctx.stroke();
  }

  // Subtle floor noise / plate variation
  ctx.strokeStyle = "rgba(255,255,255,0.015)";
  ctx.lineWidth = 1;
  for (let x = tileSize / 2; x < arenaW; x += tileSize) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, arenaH); ctx.stroke();
  }
  for (let y = tileSize / 2; y < arenaH; y += tileSize) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(arenaW, y); ctx.stroke();
  }

  // Worn hazard stripes near walls — diagonal
  ctx.save();
  ctx.strokeStyle = "rgba(255,200,0,0.055)";
  ctx.lineWidth = 18;
  for (let i = -arenaH; i < arenaW + arenaH; i += 52) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + arenaH, arenaH); ctx.stroke();
  }
  ctx.restore();

  // Center circle
  ctx.beginPath();
  ctx.arc(arenaW / 2, arenaH / 2, 110, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Center dot
  ctx.beginPath();
  ctx.arc(arenaW / 2, arenaH / 2, 5, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fill();

  // NHRL floor logo — very subtle
  ctx.save();
  ctx.globalAlpha = 0.055;
  ctx.fillStyle = "#fff";
  ctx.font = "bold 64px 'Arial Black', Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("NHRL", arenaW / 2, arenaH / 2 - 26);
  ctx.font = "bold 20px 'Arial Black', Arial, sans-serif";
  ctx.fillText("12 LB DIVISION", arenaW / 2, arenaH / 2 + 26);
  ctx.restore();

  // ── Walls ─────────────────────────────────────────────────────────────────
  // Outer solid wall block
  ctx.fillStyle = "#13141b";
  ctx.fillRect(0, 0, arenaW, WALL);
  ctx.fillRect(0, arenaH - WALL, arenaW, WALL);
  ctx.fillRect(0, 0, WALL, arenaH);
  ctx.fillRect(arenaW - WALL, 0, WALL, arenaH);

  // Lexan/polycarbonate inner face — bright edge
  ctx.strokeStyle = "rgba(200,220,255,0.55)";
  ctx.lineWidth = 2;
  ctx.strokeRect(WALL, WALL, arenaW - WALL * 2, arenaH - WALL * 2);

  // Outer wall bevel highlight (top of wall catches overhead light)
  const grad = ctx.createLinearGradient(0, 0, 0, WALL);
  grad.addColorStop(0, "rgba(255,255,255,0.18)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, arenaW, WALL);

  // ── Corner hazard blocks ──────────────────────────────────────────────────
  const cs = 20;
  const corners: [number, number, number][] = [
    [0, 0, 0],
    [arenaW, 0, Math.PI / 2],
    [arenaW, arenaH, Math.PI],
    [0, arenaH, -Math.PI / 2],
  ];
  for (const [cx, cy, ang] of corners) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    const stripeW = cs * 5;
    for (let k = 0; k < 5; k++) {
      ctx.fillStyle = k % 2 === 0 ? "#1c1e28" : "#f9a825";
      ctx.globalAlpha = k % 2 === 0 ? 1 : 0.85;
      ctx.fillRect(k * cs, 0, cs, cs * 5);
    }
    ctx.globalAlpha = 1;
    // Shadow inside corner
    const cg = ctx.createLinearGradient(0, 0, stripeW * 0.6, stripeW * 0.6);
    cg.addColorStop(0, "rgba(0,0,0,0.5)");
    cg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = cg;
    ctx.fillRect(0, 0, stripeW, stripeW);
    ctx.restore();
  }
}

// ── Robot Shadow ───────────────────────────────────────────────────────────────
function drawShadow(ctx: CanvasRenderingContext2D, entity: RobotEntity) {
  const { bodyWidth: w, bodyLength: l } = entity.spec;
  ctx.save();
  ctx.translate(entity.x + 6, entity.y + 8);
  ctx.rotate(entity.angle);
  ctx.globalAlpha = 0.38;
  ctx.filter = "blur(8px)";
  ctx.fillStyle = "#000";
  roundRect(ctx, -w / 2 - 4, -l / 2 - 4, w + 8, l + 8, 8);
  ctx.fill();
  ctx.filter = "none";
  ctx.restore();
}

// ── Track Rendering ────────────────────────────────────────────────────────────
function drawTracks(
  ctx: CanvasRenderingContext2D,
  w: number,
  l: number,
  color: string,
  entity: RobotEntity,
  time: number,
) {
  const tw = 8;
  const tl = l * 0.88;
  const speed = Math.sqrt(entity.vx ** 2 + entity.vy ** 2);
  const scrollOffset = (time * speed * 0.08) % 12;

  const sides: number[] = [-w / 2 - tw, w / 2];
  for (const sx of sides) {
    // Track base
    ctx.fillStyle = color;
    ctx.fillRect(sx, -tl / 2, tw, tl);

    // Track links (scrolling)
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.lineWidth = 1.5;
    const linkCount = Math.ceil(tl / 12) + 1;
    for (let i = 0; i <= linkCount; i++) {
      const ty = -tl / 2 + ((i * 12 + scrollOffset) % tl);
      ctx.beginPath();
      ctx.moveTo(sx, ty);
      ctx.lineTo(sx + tw, ty);
      ctx.stroke();
    }

    // Track edge highlight
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx, -tl / 2);
    ctx.lineTo(sx, tl / 2);
    ctx.stroke();
  }
}

// ── Damage Tint ────────────────────────────────────────────────────────────────
function getComponentTint(entity: RobotEntity): string | null {
  const armorPct = entity.armor.currentHP / entity.armor.maxHP;
  if (armorPct < 0.15) return "rgba(255,0,0,0.32)";
  if (armorPct < 0.4) return "rgba(255,100,0,0.18)";
  return null;
}

// ── Panel detail helper ────────────────────────────────────────────────────────
function drawPanelLines(ctx: CanvasRenderingContext2D, w: number, l: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.strokeRect(-w / 2 + 6, -l / 2 + 6, w - 12, l - 12);
  // Cross brace
  ctx.beginPath();
  ctx.moveTo(-w / 2 + 6, 0);
  ctx.lineTo(w / 2 - 6, 0);
  ctx.stroke();
}

function drawBolts(ctx: CanvasRenderingContext2D, w: number, l: number) {
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  const boltPositions: [number, number][] = [
    [-w / 2 + 10, -l / 2 + 10],
    [w / 2 - 10, -l / 2 + 10],
    [-w / 2 + 10, l / 2 - 10],
    [w / 2 - 10, l / 2 - 10],
  ];
  for (const [bx, by] of boltPositions) {
    ctx.beginPath();
    ctx.arc(bx, by, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── Weapon Renderers ───────────────────────────────────────────────────────────
function drawHorizontalSpinner(ctx: CanvasRenderingContext2D, entity: RobotEntity, time: number) {
  const { spec } = entity;
  const w = spec.bodyWidth;
  const l = spec.bodyLength;
  const rpmPct = spec.maxWeaponRPM > 0 ? entity.weaponRPM / spec.maxWeaponRPM : 0;
  const weaponOk = componentStatus(entity.weapon) !== "disabled";

  drawTracks(ctx, w, l, "#1e1e24", entity, time);

  // Body
  ctx.shadowColor = spec.accentColor;
  ctx.shadowBlur = 8;
  roundRect(ctx, -w / 2, -l / 2, w, l, 5);
  ctx.fillStyle = spec.primaryColor;
  ctx.fill();
  ctx.strokeStyle = spec.accentColor;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Interior panel shading — lighter center
  const bodyGrad = ctx.createRadialGradient(0, 0, 4, 0, 0, w * 0.6);
  bodyGrad.addColorStop(0, "rgba(255,255,255,0.10)");
  bodyGrad.addColorStop(1, "rgba(0,0,0,0.18)");
  roundRect(ctx, -w / 2, -l / 2, w, l, 5);
  ctx.fillStyle = bodyGrad;
  ctx.fill();

  drawPanelLines(ctx, w, l, `rgba(${hexToRgb(spec.accentColor)},0.25)`);
  drawBolts(ctx, w, l);

  // Weapon mount housing (center disc)
  ctx.beginPath();
  ctx.arc(0, 0, 14, 0, Math.PI * 2);
  ctx.fillStyle = "#2a2a30";
  ctx.fill();
  ctx.strokeStyle = spec.accentColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Spinning bar
  if (weaponOk) {
    const barAngle = time * rpmPct * 14;
    const barLen = w * 0.58 + 12;
    ctx.save();
    ctx.rotate(barAngle);

    // Blur disc at high RPM
    if (rpmPct > 0.5) {
      ctx.beginPath();
      ctx.arc(0, 0, barLen + 6, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${hexToRgb(spec.accentColor)},${rpmPct * 0.28})`;
      ctx.lineWidth = barLen * 0.25;
      ctx.stroke();
    }

    // Bar body with gradient
    const bgrad = ctx.createLinearGradient(-barLen, -5, barLen, 5);
    bgrad.addColorStop(0, rpmPct > 0.1 ? spec.accentColor : "#555");
    bgrad.addColorStop(0.5, "#fff");
    bgrad.addColorStop(1, rpmPct > 0.1 ? spec.accentColor : "#555");
    ctx.fillStyle = bgrad;
    ctx.shadowColor = spec.accentColor;
    ctx.shadowBlur = rpmPct > 0.3 ? 18 : 0;
    ctx.fillRect(-barLen, -5, barLen * 2, 10);
    ctx.shadowBlur = 0;

    // Hardened tips
    ctx.fillStyle = "#e0e0e0";
    ctx.fillRect(-barLen, -6, 14, 12);
    ctx.fillRect(barLen - 14, -6, 14, 12);
    ctx.restore();
  }
}

function drawDrum(ctx: CanvasRenderingContext2D, entity: RobotEntity, time: number) {
  const { spec } = entity;
  const w = spec.bodyWidth;
  const l = spec.bodyLength;
  const rpmPct = entity.weaponRPM / spec.maxWeaponRPM;
  const weaponOk = componentStatus(entity.weapon) !== "disabled";

  drawTracks(ctx, w, l, "#1a0000", entity, time);

  // Wedge body
  ctx.fillStyle = spec.primaryColor;
  ctx.shadowColor = spec.accentColor;
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.moveTo(-w / 2, -l / 2);
  ctx.lineTo(w / 2, -l / 2);
  ctx.lineTo(w * 0.62, l / 2);
  ctx.lineTo(-w * 0.62, l / 2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = spec.accentColor;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Wedge surface shading
  const wgrad = ctx.createLinearGradient(0, -l / 2, 0, l / 2);
  wgrad.addColorStop(0, "rgba(255,255,255,0.14)");
  wgrad.addColorStop(1, "rgba(0,0,0,0.22)");
  ctx.fillStyle = wgrad;
  ctx.beginPath();
  ctx.moveTo(-w / 2, -l / 2);
  ctx.lineTo(w / 2, -l / 2);
  ctx.lineTo(w * 0.62, l / 2);
  ctx.lineTo(-w * 0.62, l / 2);
  ctx.closePath();
  ctx.fill();

  drawBolts(ctx, w * 0.9, l);

  // Drum at front
  if (weaponOk) {
    const drumW = w * 0.88;
    const drumH = 20;
    ctx.save();
    ctx.translate(0, -l / 2 - drumH * 0.25);

    // Drum body
    ctx.fillStyle = "#2a2a2a";
    ctx.fillRect(-drumW / 2, -drumH / 2, drumW, drumH);
    ctx.strokeStyle = spec.accentColor;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-drumW / 2, -drumH / 2, drumW, drumH);

    // Teeth
    const teeth = 9;
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * Math.PI * 2 + time * rpmPct * 18;
      const tx = -drumW / 2 + (i + 0.5) * (drumW / teeth);
      const toothy = Math.sin(a) * 6;
      ctx.fillStyle = rpmPct > 0.1 ? spec.accentColor : "#444";
      ctx.shadowColor = spec.accentColor;
      ctx.shadowBlur = rpmPct > 0.4 ? 10 : 0;
      ctx.fillRect(tx - 3.5, toothy - 3.5, 7, 7);
    }
    ctx.shadowBlur = 0;

    // Drum blur glow at high RPM
    if (rpmPct > 0.5) {
      ctx.fillStyle = `rgba(${hexToRgb(spec.accentColor)},${rpmPct * 0.25})`;
      ctx.fillRect(-drumW / 2, -drumH / 2 - 4, drumW, drumH + 8);
    }
    ctx.restore();
  }
}

function drawVerticalSpinner(ctx: CanvasRenderingContext2D, entity: RobotEntity, time: number) {
  const { spec } = entity;
  const w = spec.bodyWidth;
  const l = spec.bodyLength;
  const rpmPct = spec.maxWeaponRPM > 0 ? entity.weaponRPM / spec.maxWeaponRPM : 0;
  const weaponOk = componentStatus(entity.weapon) !== "disabled";

  drawTracks(ctx, w, l, "#111", entity, time);

  // Wedge body
  ctx.fillStyle = spec.primaryColor;
  ctx.shadowColor = spec.accentColor;
  ctx.shadowBlur = 5;
  ctx.beginPath();
  ctx.moveTo(-w / 2, -l / 2);
  ctx.lineTo(w / 2, -l / 2);
  ctx.lineTo(w / 2 * 0.82, l / 2);
  ctx.lineTo(-w / 2 * 0.82, l / 2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = spec.accentColor;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Surface shading
  const vgrad = ctx.createLinearGradient(0, -l / 2, 0, l / 2);
  vgrad.addColorStop(0, "rgba(255,255,255,0.16)");
  vgrad.addColorStop(0.5, "rgba(255,255,255,0.04)");
  vgrad.addColorStop(1, "rgba(0,0,0,0.20)");
  ctx.fillStyle = vgrad;
  ctx.beginPath();
  ctx.moveTo(-w / 2, -l / 2);
  ctx.lineTo(w / 2, -l / 2);
  ctx.lineTo(w / 2 * 0.82, l / 2);
  ctx.lineTo(-w / 2 * 0.82, l / 2);
  ctx.closePath();
  ctx.fill();

  drawPanelLines(ctx, w * 0.85, l * 0.9, `rgba(${hexToRgb(spec.accentColor)},0.22)`);
  drawBolts(ctx, w, l);

  // Vertical disc at front
  if (weaponOk) {
    const discR = 20;
    ctx.save();
    ctx.translate(0, -l / 2 + discR * 0.15);

    // Glow halo
    if (rpmPct > 0.35) {
      const glow = ctx.createRadialGradient(0, 0, discR * 0.4, 0, 0, discR * 2.2);
      glow.addColorStop(0, `rgba(${hexToRgb(spec.accentColor)},${rpmPct * 0.45})`);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, discR * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Disc
    ctx.beginPath();
    ctx.arc(0, 0, discR, 0, Math.PI * 2);
    ctx.fillStyle = rpmPct > 0.1 ? spec.accentColor : "#333";
    ctx.shadowColor = spec.accentColor;
    ctx.shadowBlur = rpmPct > 0.4 ? 20 : 0;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Blade spokes
    const bladeAngle = time * rpmPct * 20;
    ctx.save();
    ctx.rotate(bladeAngle);
    ctx.strokeStyle = "rgba(0,0,0,0.65)";
    ctx.lineWidth = 3.5;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * discR * 0.25, Math.sin(a) * discR * 0.25);
      ctx.lineTo(Math.cos(a) * discR * 0.88, Math.sin(a) * discR * 0.88);
      ctx.stroke();
    }
    ctx.restore();

    // Hub
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#ddd";
    ctx.fill();
    ctx.restore();
  }
}

function drawLifter(ctx: CanvasRenderingContext2D, entity: RobotEntity, time: number) {
  const { spec } = entity;
  const w = spec.bodyWidth;
  const l = spec.bodyLength;

  drawTracks(ctx, w, l, "#1a0a2e", entity, time);

  // Wide armored body
  ctx.fillStyle = spec.primaryColor;
  ctx.shadowColor = spec.accentColor;
  ctx.shadowBlur = 7;
  roundRect(ctx, -w / 2, -l / 2, w, l, 7);
  ctx.fill();
  ctx.strokeStyle = spec.accentColor;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Armor plate highlights
  const lgrad = ctx.createLinearGradient(-w / 2, -l / 2, w / 2, l / 2);
  lgrad.addColorStop(0, "rgba(255,255,255,0.14)");
  lgrad.addColorStop(1, "rgba(0,0,0,0.22)");
  roundRect(ctx, -w / 2, -l / 2, w, l, 7);
  ctx.fillStyle = lgrad;
  ctx.fill();

  drawPanelLines(ctx, w, l, `rgba(${hexToRgb(spec.accentColor)},0.28)`);
  drawBolts(ctx, w, l);

  // Fork / lifter wedge at front
  const liftActive = entity.weaponThrottle > 0.3;
  const liftAngle = liftActive ? -0.3 : 0; // tilt up when active
  ctx.save();
  ctx.translate(0, -l / 2);
  ctx.rotate(liftAngle);

  const forkW = w * 0.68;
  const forkH = 18;

  ctx.fillStyle = liftActive ? spec.accentColor : "#4a4a5a";
  ctx.shadowColor = liftActive ? spec.accentColor : "transparent";
  ctx.shadowBlur = liftActive ? 14 : 0;

  // Left tine
  ctx.beginPath();
  ctx.roundRect(-forkW / 2, -forkH / 2, 9, forkH + 10, 3);
  ctx.fill();
  // Right tine
  ctx.beginPath();
  ctx.roundRect(forkW / 2 - 9, -forkH / 2, 9, forkH + 10, 3);
  ctx.fill();
  // Cross bar
  ctx.beginPath();
  ctx.roundRect(-forkW / 2, -forkH / 2 - 4, forkW, 8, 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();
}

function drawHammer(ctx: CanvasRenderingContext2D, entity: RobotEntity, time: number) {
  const { spec } = entity;
  const w = spec.bodyWidth;
  const l = spec.bodyLength;

  drawTracks(ctx, w, l, "#1a1a1a", entity, time);

  // Chunky armored body
  ctx.fillStyle = spec.primaryColor;
  ctx.shadowColor = spec.accentColor;
  ctx.shadowBlur = 5;
  roundRect(ctx, -w / 2, -l / 2, w, l, 5);
  ctx.fill();
  ctx.strokeStyle = spec.accentColor;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Surface gradient
  const hgrad = ctx.createLinearGradient(-w / 2, -l / 2, w / 2, l / 2);
  hgrad.addColorStop(0, "rgba(255,255,255,0.12)");
  hgrad.addColorStop(1, "rgba(0,0,0,0.20)");
  roundRect(ctx, -w / 2, -l / 2, w, l, 5);
  ctx.fillStyle = hgrad;
  ctx.fill();

  drawPanelLines(ctx, w, l, `rgba(${hexToRgb(spec.accentColor)},0.22)`);
  drawBolts(ctx, w, l);

  // Pivot point for hammer arm
  ctx.beginPath();
  ctx.arc(0, -l / 2 + 8, 7, 0, Math.PI * 2);
  ctx.fillStyle = "#333";
  ctx.fill();
  ctx.strokeStyle = "#666";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Hammer arm
  const hamReady = entity.hammerState === "ready";
  const hamStr = entity.hammerState === "striking";
  ctx.save();
  ctx.translate(0, -l / 2 + 8);
  ctx.rotate(entity.hammerAngle);

  // Arm shaft
  const armLen = l * 0.65;
  ctx.fillStyle = hamStr ? spec.accentColor : "#484850";
  ctx.shadowColor = hamStr ? spec.accentColor : "transparent";
  ctx.shadowBlur = hamStr ? 22 : 0;
  ctx.fillRect(-5, -armLen, 10, armLen);

  // Head
  const headW = spec.weaponQuality === "titanium" ? 28 : 24;
  ctx.fillStyle = hamStr ? "#fffde7" : "#666";
  ctx.fillRect(-headW / 2, -armLen - 12, headW, 14);

  // Titanium accent stripe
  if (spec.weaponQuality === "titanium") {
    ctx.fillStyle = "#ef5350";
    ctx.fillRect(-headW / 2, -armLen - 16, headW, 6);
  }

  // Ready indicator glow
  if (hamReady && entity.hammerCooldown < 0.2) {
    ctx.shadowColor = "#e91e63";
    ctx.shadowBlur = 16;
    ctx.fillStyle = "rgba(233,30,99,0.3)";
    ctx.fillRect(-headW / 2, -armLen - 16, headW, 30);
  }

  ctx.shadowBlur = 0;
  ctx.restore();

  void time;
}

// ── Draw Robot ─────────────────────────────────────────────────────────────────
export function drawRobot(
  ctx: CanvasRenderingContext2D,
  entity: RobotEntity,
  time: number,
  isPlayer: boolean,
) {
  if (!entity.isAlive) return;

  const now = performance.now();
  const flashCycle = Math.floor((entity.hitFlashUntil - now) / 60) % 2 === 0;
  const flashing = entity.hitFlashUntil > now && flashCycle;

  // Shadow first (drawn in world space)
  drawShadow(ctx, entity);

  ctx.save();
  ctx.translate(entity.x, entity.y);
  ctx.rotate(entity.angle);

  // White hit flash — overlay on top of robot
  if (flashing) {
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = "#ffffff";
    const { bodyWidth: fw, bodyLength: fl } = entity.spec;
    roundRect(ctx, -fw / 2 - 4, -fl / 2 - 4, fw + 8, fl + 8, 8);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  const { weaponType } = entity.spec;
  if (weaponType === "horizontal_spinner") drawHorizontalSpinner(ctx, entity, time);
  else if (weaponType === "drum") drawDrum(ctx, entity, time);
  else if (weaponType === "vertical_spinner") drawVerticalSpinner(ctx, entity, time);
  else if (weaponType === "lifter") drawLifter(ctx, entity, time);
  else if (weaponType === "hammer") drawHammer(ctx, entity, time);

  // Damage tint overlay
  const tint = getComponentTint(entity);
  if (tint) {
    const { bodyWidth: w, bodyLength: l } = entity.spec;
    roundRect(ctx, -w / 2, -l / 2, w, l, 5);
    ctx.fillStyle = tint;
    ctx.fill();
  }

  // Facing arrow (small, clean)
  const { bodyLength: l } = entity.spec;
  ctx.fillStyle = isPlayer ? "rgba(80,200,255,0.72)" : "rgba(255,80,80,0.72)";
  ctx.beginPath();
  ctx.moveTo(0, -l / 2 - 7);
  ctx.lineTo(-6, -l / 2 + 2);
  ctx.lineTo(6, -l / 2 + 2);
  ctx.closePath();
  ctx.fill();

  ctx.restore();

  // Player indicator ring (world space, outside robot)
  if (isPlayer) {
    const ringR = Math.max(entity.spec.bodyWidth, entity.spec.bodyLength) / 2 + 14;
    ctx.save();
    ctx.translate(entity.x, entity.y);
    ctx.beginPath();
    ctx.arc(0, 0, ringR, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(80,200,255,0.22)";
    ctx.lineWidth = 2.5;
    ctx.setLineDash([8, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // Name label (world space)
  ctx.save();
  ctx.font = `bold 10px 'Courier New', monospace`;
  ctx.textAlign = "center";
  ctx.fillStyle = isPlayer ? "#64b5f6" : "#ef9a9a";
  ctx.shadowColor = isPlayer ? "#0d47a1" : "#b71c1c";
  ctx.shadowBlur = 7;
  ctx.fillText(entity.spec.name, entity.x, entity.y - entity.spec.bodyLength / 2 - 20);
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
      const smokeGrad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * (1 + (1 - alpha) * 0.5));
      smokeGrad.addColorStop(0, p.color);
      smokeGrad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = smokeGrad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1 + (1 - alpha) * 0.5), 0, Math.PI * 2);
      ctx.fill();
    } else if (p.type === "spark") {
      // Draw as a streak/line in the direction of travel
      const spd = Math.sqrt(p.vx ** 2 + p.vy ** 2);
      const len = Math.min(18, spd * 0.028);
      const nx = spd > 0 ? p.vx / spd : 0;
      const ny = spd > 0 ? p.vy / spd : 0;
      ctx.strokeStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 6;
      ctx.lineWidth = p.size * alpha;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(p.x - nx * len, p.y - ny * len);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.shadowBlur = 0;
    } else {
      // Debris — solid chunky piece
      ctx.fillStyle = p.color;
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 3;
      ctx.fillRect(
        p.x - p.size * alpha * 0.5,
        p.y - p.size * alpha * 0.5,
        p.size * alpha,
        p.size * alpha,
      );
      ctx.shadowBlur = 0;
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

function drawRobotPanel(
  ctx: CanvasRenderingContext2D,
  entity: RobotEntity,
  x: number,
  y: number,
  panelW: number,
  _flip: boolean,
  label: string,
  labelColor: string,
) {
  const ph = 122;

  // Panel background with subtle gradient
  const bg = ctx.createLinearGradient(x, y, x, y + ph);
  bg.addColorStop(0, "rgba(10,10,18,0.88)");
  bg.addColorStop(1, "rgba(0,0,0,0.76)");
  ctx.fillStyle = bg;
  ctx.strokeStyle = labelColor + "44";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, panelW, ph, 4);
  ctx.fill();
  ctx.stroke();

  // Label stripe
  ctx.fillStyle = labelColor + "22";
  ctx.beginPath();
  ctx.roundRect(x, y, panelW, 20, [4, 4, 0, 0]);
  ctx.fill();

  ctx.fillStyle = labelColor;
  ctx.font = `bold 10px 'Courier New', monospace`;
  ctx.textAlign = "left";
  ctx.fillText(`${label}  ${entity.spec.name.toUpperCase()}`, x + 8, y + 14);

  // Overall armor HP bar
  const hpPct = entity.armor.currentHP / entity.armor.maxHP;
  const hpColor = compColor(hpPct);
  ctx.fillStyle = "rgba(255,255,255,0.07)";
  ctx.fillRect(x + 8, y + 24, panelW - 16, 11);
  ctx.fillStyle = hpColor;
  ctx.shadowColor = hpColor;
  ctx.shadowBlur = hpPct > 0.3 ? 6 : 0;
  ctx.fillRect(x + 8, y + 24, (panelW - 16) * hpPct, 11);
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = "bold 8px 'Courier New', monospace";
  ctx.fillText(
    `ARMOR  ${Math.ceil(entity.armor.currentHP)}/${entity.armor.maxHP}`,
    x + 8, y + 49,
  );

  // Drive + Weapon component bars
  const comps = [
    { key: "DRIVE", c: entity.drive },
    { key: "WEAPON", c: entity.weapon },
  ];
  for (let i = 0; i < 2; i++) {
    const c = comps[i].c;
    const pct = c.currentHP / c.maxHP;
    const col = compColor(pct);
    const by = y + 54 + i * 16;
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fillRect(x + 8, by, panelW - 16, 7);
    ctx.fillStyle = col;
    ctx.fillRect(x + 8, by, (panelW - 16) * pct, 7);
    const status = componentStatus(c);
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = "8px 'Courier New', monospace";
    ctx.fillText(
      `${comps[i].key}  ${QUALITY_LABEL[c.quality]}  ${status !== "functional" ? `[${status.toUpperCase()}]` : ""}`,
      x + 8, by + 15,
    );
  }

  // Weapon RPM / hammer cooldown bar
  const rpmY = y + 90;
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.fillRect(x + 8, rpmY, panelW - 16, 7);

  if (entity.spec.maxWeaponRPM > 0) {
    const rpmPct = entity.weaponRPM / entity.spec.maxWeaponRPM;
    const rColor = rpmPct > 0.7 ? "#ef5350" : rpmPct > 0.35 ? "#ffa726" : "#42a5f5";
    ctx.fillStyle = rColor;
    ctx.shadowColor = rColor;
    ctx.shadowBlur = rpmPct > 0.5 ? 8 : 0;
    ctx.fillRect(x + 8, rpmY, (panelW - 16) * rpmPct, 7);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = "8px 'Courier New', monospace";
    ctx.fillText(
      `WEAPON  ${Math.round(entity.weaponRPM).toLocaleString()} RPM`,
      x + 8, rpmY + 15,
    );
  } else {
    const maxCd = entity.spec.id === "beta" ? 2.2 : 1.6;
    const cdPct = 1 - Math.min(1, entity.hammerCooldown / maxCd);
    const rdy = cdPct >= 1;
    ctx.fillStyle = rdy ? "#e91e63" : "#546e7a";
    ctx.shadowColor = rdy ? "#e91e63" : "transparent";
    ctx.shadowBlur = rdy ? 8 : 0;
    ctx.fillRect(x + 8, rpmY, (panelW - 16) * cdPct, 7);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = "8px 'Courier New', monospace";
    ctx.fillText(rdy ? "HAMMER ▶ READY" : "HAMMER  CHARGING", x + 8, rpmY + 15);
  }
}

export function drawHUD(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  canvasW: number,
  canvasH: number,
  _arenaOffX: number,
  _arenaOffY: number,
) {
  const pw = 236;
  const py = canvasH - 128;

  drawRobotPanel(ctx, state.player, 8, py, pw, false, "YOU", "#64b5f6");
  drawRobotPanel(ctx, state.opponent, canvasW - pw - 8, py, pw, true, "OPP", "#ef9a9a");

  // ── Timer ──────────────────────────────────────────────────────────────────
  const { match } = state;
  const secs = Math.ceil(match.timeRemaining);
  const mins = Math.floor(secs / 60);
  const s = secs % 60;
  const timerStr = match.phase === "fighting"
    ? `${mins}:${s.toString().padStart(2, "0")}`
    : match.phase === "countdown" ? "READY" : "END";

  const danger = match.timeRemaining < 20 && match.phase === "fighting";
  ctx.save();
  const tw = 138;
  const tx = canvasW / 2 - tw / 2;
  const timerBg = ctx.createLinearGradient(tx, 8, tx, 56);
  timerBg.addColorStop(0, "rgba(12,12,22,0.92)");
  timerBg.addColorStop(1, "rgba(0,0,0,0.80)");
  ctx.fillStyle = timerBg;
  ctx.beginPath();
  ctx.roundRect(tx, 8, tw, 50, 5);
  ctx.fill();
  ctx.strokeStyle = danger ? "#f44336" : "rgba(255,255,255,0.14)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = danger ? "#f44336" : "#ffffff";
  ctx.shadowColor = danger ? "#f44336" : "rgba(255,255,255,0.3)";
  ctx.shadowBlur = danger ? 16 : 6;
  ctx.font = `bold 30px 'Courier New', monospace`;
  ctx.textAlign = "center";
  ctx.fillText(timerStr, canvasW / 2, 47);
  ctx.shadowBlur = 0;

  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.font = "8px 'Courier New', monospace";
  ctx.fillText("MATCH TIME", canvasW / 2, 18);
  ctx.restore();

  // ── Controls reminder ──────────────────────────────────────────────────────
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.font = "8px 'Courier New', monospace";
  ctx.textAlign = "center";
  ctx.fillText("W/S=DRIVE  ·  A/D=TURN  ·  SHIFT/CLICK=WEAPON  ·  R=REMATCH  ·  ESC=EXIT", canvasW / 2, canvasH - 6);
  ctx.restore();
}

// ── Countdown ─────────────────────────────────────────────────────────────────
export function drawCountdown(
  ctx: CanvasRenderingContext2D,
  timer: number,
  cW: number,
  cH: number,
) {
  const t = Math.ceil(timer);
  const pulse = (timer % 1);
  const scale = 1 + pulse * 0.35;
  const alpha = Math.min(1, pulse * 2.5);

  ctx.save();
  ctx.globalAlpha = alpha * 0.88;
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(0, 0, cW, cH);
  ctx.restore();

  ctx.save();
  ctx.translate(cW / 2, cH / 2 - 30);
  ctx.scale(scale, scale);
  ctx.fillStyle = t <= 1 ? "#ef5350" : "#ffffff";
  ctx.shadowColor = t <= 1 ? "#ef5350" : "#fff";
  ctx.shadowBlur = 30;
  ctx.font = `bold 120px 'Arial Black', Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(t > 0 ? String(t) : "FIGHT!", 0, 0);
  ctx.shadowBlur = 0;
  ctx.restore();
}

// ── Match End ─────────────────────────────────────────────────────────────────
export function drawMatchEnd(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  cW: number,
  cH: number,
) {
  const { match } = state;
  const win = match.winner === "player";
  const draw = match.winner === "draw";

  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.72)";
  ctx.fillRect(0, 0, cW, cH);

  const panelW = 520;
  const panelH = 300;
  const px = cW / 2 - panelW / 2;
  const py = cH / 2 - panelH / 2;

  const borderColor = draw ? "#ffd54f" : win ? "#4caf50" : "#ef5350";
  const panelBg = ctx.createLinearGradient(px, py, px, py + panelH);
  panelBg.addColorStop(0, "rgba(10,10,22,0.97)");
  panelBg.addColorStop(1, "rgba(0,0,0,0.92)");
  ctx.fillStyle = panelBg;
  ctx.beginPath();
  ctx.roundRect(px, py, panelW, panelH, 8);
  ctx.fill();
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Result text
  const resultText = draw ? "DRAW" : win ? "VICTORY!" : "DEFEATED";
  ctx.fillStyle = borderColor;
  ctx.shadowColor = borderColor;
  ctx.shadowBlur = 24;
  ctx.font = `bold 56px 'Arial Black', Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(resultText, cW / 2, py + 68);
  ctx.shadowBlur = 0;

  // Win reason
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = `14px 'Courier New', monospace`;
  ctx.fillText(match.winReason, cW / 2, py + 102);

  // Damage summary
  const p = state.player;
  const o = state.opponent;
  ctx.font = "bold 10px 'Courier New', monospace";
  ctx.fillStyle = "#64b5f6";
  ctx.textAlign = "left";
  ctx.fillText(`YOUR BOT: ${p.spec.name}`, px + 30, py + 140);

  const drawBar = (lx: number, ly: number, label: string, pct: number) => {
    const bw = 180;
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(lx, ly, bw, 6);
    const col = compColor(pct);
    ctx.fillStyle = col;
    ctx.fillRect(lx, ly, bw * pct, 6);
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = "8px 'Courier New', monospace";
    ctx.fillText(`${label}  ${Math.round(pct * 100)}%`, lx, ly + 16);
  };

  drawBar(px + 30, py + 150, "ARMOR ", p.armor.currentHP / p.armor.maxHP);
  drawBar(px + 30, py + 172, "DRIVE ", p.drive.currentHP / p.drive.maxHP);
  drawBar(px + 30, py + 194, "WEAPON", p.weapon.currentHP / p.weapon.maxHP);

  ctx.fillStyle = "#ef9a9a";
  ctx.font = "bold 10px 'Courier New', monospace";
  ctx.textAlign = "right";
  ctx.fillText(`OPP: ${o.spec.name}`, px + panelW - 30, py + 140);

  const drawBarR = (rx: number, ly: number, label: string, pct: number) => {
    const bw = 180;
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(rx - bw, ly, bw, 6);
    const col = compColor(pct);
    ctx.fillStyle = col;
    ctx.fillRect(rx - bw, ly, bw * pct, 6);
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = "8px 'Courier New', monospace";
    ctx.textAlign = "right";
    ctx.fillText(`${Math.round(pct * 100)}%  ${label}`, rx, ly + 16);
  };

  drawBarR(px + panelW - 30, py + 150, "ARMOR ", o.armor.currentHP / o.armor.maxHP);
  drawBarR(px + panelW - 30, py + 172, "DRIVE ", o.drive.currentHP / o.drive.maxHP);
  drawBarR(px + panelW - 30, py + 194, "WEAPON", o.weapon.currentHP / o.weapon.maxHP);

  // Rematch prompt
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = "11px 'Courier New', monospace";
  ctx.textAlign = "center";
  ctx.fillText("[ R ] REMATCH     [ ESC ] BACK TO SELECTION", cW / 2, py + panelH - 22);

  ctx.restore();
}
