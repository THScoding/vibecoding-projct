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

  ctx.fillStyle = "#18191f";
  ctx.fillRect(0, 0, arenaW, arenaH);

  // Concrete tile seams
  const tileSize = 86;
  ctx.strokeStyle = "rgba(255,255,255,0.045)";
  ctx.lineWidth = 1.5;
  for (let x = 0; x <= arenaW; x += tileSize) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, arenaH); ctx.stroke();
  }
  for (let y = 0; y <= arenaH; y += tileSize) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(arenaW, y); ctx.stroke();
  }
  ctx.strokeStyle = "rgba(255,255,255,0.015)";
  ctx.lineWidth = 1;
  for (let x = tileSize / 2; x < arenaW; x += tileSize) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, arenaH); ctx.stroke();
  }
  for (let y = tileSize / 2; y < arenaH; y += tileSize) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(arenaW, y); ctx.stroke();
  }

  // Diagonal hazard stripes
  ctx.save();
  ctx.strokeStyle = "rgba(255,200,0,0.055)";
  ctx.lineWidth = 18;
  for (let i = -arenaH; i < arenaW + arenaH; i += 52) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + arenaH, arenaH); ctx.stroke();
  }
  ctx.restore();

  // Centre circle
  ctx.beginPath();
  ctx.arc(arenaW / 2, arenaH / 2, 110, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(arenaW / 2, arenaH / 2, 5, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fill();

  // NHRL floor logo
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

  // Walls
  ctx.fillStyle = "#13141b";
  ctx.fillRect(0, 0, arenaW, WALL);
  ctx.fillRect(0, arenaH - WALL, arenaW, WALL);
  ctx.fillRect(0, 0, WALL, arenaH);
  ctx.fillRect(arenaW - WALL, 0, WALL, arenaH);

  // Inner Lexan face
  ctx.strokeStyle = "rgba(200,220,255,0.55)";
  ctx.lineWidth = 2;
  ctx.strokeRect(WALL, WALL, arenaW - WALL * 2, arenaH - WALL * 2);

  // Wall top highlight
  const wallGrad = ctx.createLinearGradient(0, 0, 0, WALL);
  wallGrad.addColorStop(0, "rgba(255,255,255,0.18)");
  wallGrad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = wallGrad;
  ctx.fillRect(0, 0, arenaW, WALL);

  // Corner hazard blocks
  const cs = 20;
  const corners: [number, number, number][] = [
    [0, 0, 0], [arenaW, 0, Math.PI / 2],
    [arenaW, arenaH, Math.PI], [0, arenaH, -Math.PI / 2],
  ];
  for (const [cx, cy, ang] of corners) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    for (let k = 0; k < 5; k++) {
      ctx.fillStyle = k % 2 === 0 ? "#1c1e28" : "#f9a825";
      ctx.globalAlpha = k % 2 === 0 ? 1 : 0.85;
      ctx.fillRect(k * cs, 0, cs, cs * 5);
    }
    ctx.globalAlpha = 1;
    const cg = ctx.createLinearGradient(0, 0, cs * 3, cs * 3);
    cg.addColorStop(0, "rgba(0,0,0,0.5)");
    cg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = cg;
    ctx.fillRect(0, 0, cs * 5, cs * 5);
    ctx.restore();
  }
}

// ── Shadow ────────────────────────────────────────────────────────────────────
function drawShadow(ctx: CanvasRenderingContext2D, entity: RobotEntity) {
  const { bodyWidth: w, bodyLength: l } = entity.spec;
  ctx.save();
  ctx.translate(entity.x + 7, entity.y + 9);
  ctx.rotate(entity.angle);
  ctx.globalAlpha = 0.36;
  ctx.filter = "blur(8px)";
  ctx.fillStyle = "#000";
  roundRect(ctx, -w / 2 - 5, -l / 2 - 5, w + 10, l + 10, 8);
  ctx.fill();
  ctx.filter = "none";
  ctx.restore();
}

// ── Armor Breach Scorch Marks ─────────────────────────────────────────────────
function drawArmorBreaches(
  ctx: CanvasRenderingContext2D,
  entity: RobotEntity,
  time: number,
) {
  if (!entity.destroyedParts.armorBreached) return;
  const { bodyWidth: w, bodyLength: l } = entity.spec;

  // Multiple irregular scorch marks based on last hit side
  const marks: [number, number, number][] = [];
  if (entity.lastHitSide === "front" || entity.lastHitSide === "rear") {
    const yOff = entity.lastHitSide === "front" ? -l * 0.30 : l * 0.25;
    marks.push([0, yOff, 16], [-w * 0.22, yOff * 0.5, 10], [w * 0.18, yOff * 0.7, 12]);
  } else {
    const xOff = entity.lastHitSide === "left" ? -w * 0.32 : w * 0.32;
    marks.push([xOff, 0, 14], [xOff * 0.6, -l * 0.18, 10], [xOff * 0.7, l * 0.18, 10]);
  }

  for (const [mx, my, mr] of marks) {
    const grad = ctx.createRadialGradient(mx, my, 0, mx, my, mr);
    grad.addColorStop(0, "rgba(0,0,0,0.85)");
    grad.addColorStop(0.4, "rgba(30,10,0,0.60)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.fill();

    // Glowing embers inside breach
    const pulsate = 0.5 + 0.5 * Math.sin(time * 4 + mx);
    ctx.fillStyle = `rgba(255,80,0,${pulsate * 0.35})`;
    ctx.beginPath();
    ctx.arc(mx, my, mr * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── Track rendering (with destruction states) ─────────────────────────────────
function drawTracks(
  ctx: CanvasRenderingContext2D,
  w: number,
  l: number,
  baseColor: string,
  entity: RobotEntity,
  time: number,
) {
  const tw = 8;
  const tl = l * 0.88;
  const speed = Math.sqrt(entity.vx ** 2 + entity.vy ** 2);
  const scrollOffset = (time * speed * 0.08) % 12;
  const driveStatus = componentStatus(entity.drive);

  const sideInfo: { sx: number; destroyed: boolean }[] = [
    { sx: -w / 2 - tw, destroyed: entity.destroyedParts.leftTrack },
    { sx: w / 2, destroyed: entity.destroyedParts.rightTrack },
  ];

  for (const { sx, destroyed } of sideInfo) {
    if (destroyed) {
      // ── Destroyed track: jagged torn metal stub ──────────────────────────
      ctx.save();
      ctx.fillStyle = "#111";
      ctx.fillRect(sx, -tl / 2, tw, tl);

      // Torn jagged edges
      ctx.strokeStyle = "#444";
      ctx.lineWidth = 1.5;
      const jagCount = 6;
      for (let j = 0; j < jagCount; j++) {
        const ty = -tl / 2 + (j / jagCount) * tl;
        const jag = (Math.sin(j * 2.1 + entity.angle) * 0.5 + 0.5) * 4 + 1;
        ctx.beginPath();
        ctx.moveTo(sx, ty);
        ctx.lineTo(sx + jag, ty + tl / jagCount * 0.5);
        ctx.stroke();
      }

      // Burn / scorch on stub
      const sGrad = ctx.createLinearGradient(sx, -tl / 2, sx + tw, tl / 2);
      sGrad.addColorStop(0, "rgba(120,40,0,0.55)");
      sGrad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = sGrad;
      ctx.fillRect(sx, -tl / 2, tw, tl);
      ctx.restore();
    } else {
      // ── Normal / damaged track ───────────────────────────────────────────
      const trackDamaged = driveStatus === "damaged" || driveStatus === "critical";
      const trackColor = trackDamaged ? "#2a1a1a" : baseColor;

      ctx.fillStyle = trackColor;
      ctx.fillRect(sx, -tl / 2, tw, tl);

      // Scrolling links
      ctx.strokeStyle = trackDamaged
        ? "rgba(180,0,0,0.35)"
        : "rgba(0,0,0,0.55)";
      ctx.lineWidth = 1.5;
      const linkCount = Math.ceil(tl / 12) + 1;
      for (let i = 0; i <= linkCount; i++) {
        const ty = -tl / 2 + ((i * 12 + scrollOffset) % tl);
        ctx.beginPath();
        ctx.moveTo(sx, ty);
        ctx.lineTo(sx + tw, ty);
        ctx.stroke();
      }

      // Edge highlight
      ctx.strokeStyle = trackDamaged
        ? "rgba(200,60,0,0.25)"
        : "rgba(255,255,255,0.12)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx, -tl / 2);
      ctx.lineTo(sx, tl / 2);
      ctx.stroke();

      // Critical damage — sparking/damaged look on track
      if (driveStatus === "critical") {
        const cGrad = ctx.createLinearGradient(sx, -tl / 2, sx + tw, tl / 2);
        cGrad.addColorStop(0, "rgba(255,50,0,0.25)");
        cGrad.addColorStop(0.5, "rgba(255,120,0,0.15)");
        cGrad.addColorStop(1, "rgba(255,50,0,0.25)");
        ctx.fillStyle = cGrad;
        ctx.fillRect(sx, -tl / 2, tw, tl);
      }
    }
  }
}

// ── Panel / bolt helpers ──────────────────────────────────────────────────────
function drawPanelLines(ctx: CanvasRenderingContext2D, w: number, l: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.strokeRect(-w / 2 + 6, -l / 2 + 6, w - 12, l - 12);
  ctx.beginPath();
  ctx.moveTo(-w / 2 + 6, 0);
  ctx.lineTo(w / 2 - 6, 0);
  ctx.stroke();
}

function drawBolts(ctx: CanvasRenderingContext2D, w: number, l: number) {
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  for (const [bx, by] of [
    [-w / 2 + 10, -l / 2 + 10],
    [w / 2 - 10, -l / 2 + 10],
    [-w / 2 + 10, l / 2 - 10],
    [w / 2 - 10, l / 2 - 10],
  ] as [number, number][]) {
    ctx.beginPath();
    ctx.arc(bx, by, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── Destroyed weapon stubs ─────────────────────────────────────────────────────
function drawDestroyedWeaponStub(
  ctx: CanvasRenderingContext2D,
  entity: RobotEntity,
  time: number,
) {
  const { spec } = entity;
  const l = spec.bodyLength;

  // Bent/sheared stub at front
  ctx.save();
  ctx.translate(0, -l / 2);

  // Blackened stump
  ctx.fillStyle = "#1a1a1a";
  ctx.strokeStyle = "#444";
  ctx.lineWidth = 1.5;

  // Irregular stub shape
  ctx.beginPath();
  ctx.moveTo(-8, 0);
  ctx.lineTo(-5, -10);
  ctx.lineTo(2, -14);
  ctx.lineTo(7, -8);
  ctx.lineTo(4, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Glowing torn metal at break point
  const pulsate = 0.5 + 0.5 * Math.sin(time * 6);
  ctx.fillStyle = `rgba(255,80,0,${pulsate * 0.65})`;
  ctx.beginPath();
  ctx.arc(0, -8, 4, 0, Math.PI * 2);
  ctx.fill();

  // Smoke tendrils from destroyed weapon
  ctx.fillStyle = `rgba(50,50,50,${0.3 + pulsate * 0.15})`;
  ctx.beginPath();
  ctx.arc(-3, -14 + Math.sin(time * 3) * 2, 6, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// ── Weapon renderers ───────────────────────────────────────────────────────────
function drawHorizontalSpinner(ctx: CanvasRenderingContext2D, entity: RobotEntity, time: number) {
  const { spec } = entity;
  const w = spec.bodyWidth;
  const l = spec.bodyLength;
  const rpmPct = spec.maxWeaponRPM > 0 ? entity.weaponRPM / spec.maxWeaponRPM : 0;
  const weaponDestroyed = entity.destroyedParts.weapon;

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

  // Surface shading
  const bGrad = ctx.createRadialGradient(0, 0, 4, 0, 0, w * 0.6);
  bGrad.addColorStop(0, "rgba(255,255,255,0.10)");
  bGrad.addColorStop(1, "rgba(0,0,0,0.18)");
  roundRect(ctx, -w / 2, -l / 2, w, l, 5);
  ctx.fillStyle = bGrad;
  ctx.fill();

  drawPanelLines(ctx, w, l, `rgba(${hexToRgb(spec.accentColor)},0.25)`);
  drawBolts(ctx, w, l);

  // Weapon mount housing
  ctx.beginPath();
  ctx.arc(0, 0, 14, 0, Math.PI * 2);
  ctx.fillStyle = "#2a2a30";
  ctx.fill();
  ctx.strokeStyle = spec.accentColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  if (weaponDestroyed) {
    drawDestroyedWeaponStub(ctx, entity, time);
    // Sparking remnant on mount
    const pulsate = Math.sin(time * 8);
    if (pulsate > 0.3) {
      ctx.fillStyle = `rgba(255,200,0,${(pulsate - 0.3) * 0.7})`;
      ctx.beginPath();
      ctx.arc((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // Spinning bar
    const barAngle = entity.weaponBarAngle;
    const barLen = w * 0.58 + 12;

    ctx.save();
    ctx.rotate(barAngle);

    if (rpmPct > 0.5) {
      ctx.beginPath();
      ctx.arc(0, 0, barLen + 6, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${hexToRgb(spec.accentColor)},${rpmPct * 0.28})`;
      ctx.lineWidth = barLen * 0.25;
      ctx.stroke();
    }

    const bgrad = ctx.createLinearGradient(-barLen, -5, barLen, 5);
    bgrad.addColorStop(0, rpmPct > 0.1 ? spec.accentColor : "#555");
    bgrad.addColorStop(0.5, "#fff");
    bgrad.addColorStop(1, rpmPct > 0.1 ? spec.accentColor : "#555");
    ctx.fillStyle = bgrad;
    ctx.shadowColor = spec.accentColor;
    ctx.shadowBlur = rpmPct > 0.3 ? 18 : 0;
    ctx.fillRect(-barLen, -5, barLen * 2, 10);
    ctx.shadowBlur = 0;

    ctx.fillStyle = "#e0e0e0";
    ctx.fillRect(-barLen, -6, 14, 12);
    ctx.fillRect(barLen - 14, -6, 14, 12);
    ctx.restore();
  }

  drawArmorBreaches(ctx, entity, time);
}

function drawDrum(ctx: CanvasRenderingContext2D, entity: RobotEntity, time: number) {
  const { spec } = entity;
  const w = spec.bodyWidth;
  const l = spec.bodyLength;
  const rpmPct = entity.weaponRPM / spec.maxWeaponRPM;
  const weaponDestroyed = entity.destroyedParts.weapon;

  drawTracks(ctx, w, l, "#1a0000", entity, time);

  // Wedge body
  ctx.fillStyle = spec.primaryColor;
  ctx.shadowColor = spec.accentColor;
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.moveTo(-w / 2, -l / 2); ctx.lineTo(w / 2, -l / 2);
  ctx.lineTo(w * 0.62, l / 2); ctx.lineTo(-w * 0.62, l / 2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = spec.accentColor;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.shadowBlur = 0;

  const wGrad = ctx.createLinearGradient(0, -l / 2, 0, l / 2);
  wGrad.addColorStop(0, "rgba(255,255,255,0.14)");
  wGrad.addColorStop(1, "rgba(0,0,0,0.22)");
  ctx.fillStyle = wGrad;
  ctx.beginPath();
  ctx.moveTo(-w / 2, -l / 2); ctx.lineTo(w / 2, -l / 2);
  ctx.lineTo(w * 0.62, l / 2); ctx.lineTo(-w * 0.62, l / 2);
  ctx.closePath();
  ctx.fill();

  drawBolts(ctx, w * 0.9, l);

  if (weaponDestroyed) {
    ctx.save();
    ctx.translate(0, -l / 2 - 6);
    // Shattered drum remnant
    ctx.fillStyle = "#1a1a1a";
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;
    const drumW = w * 0.88;
    ctx.fillRect(-drumW / 2, -8, drumW, 10);
    // Sparking shards
    const pulsate = 0.5 + 0.5 * Math.sin(time * 7);
    ctx.fillStyle = `rgba(255,100,0,${pulsate * 0.5})`;
    for (let i = 0; i < 4; i++) {
      const sx = -drumW / 2 + (i / 3) * drumW;
      ctx.beginPath();
      ctx.arc(sx, -8 + Math.sin(time * 3 + i) * 3, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  } else {
    const drumW = w * 0.88;
    const drumH = 20;
    ctx.save();
    ctx.translate(0, -l / 2 - drumH * 0.25);
    ctx.fillStyle = "#2a2a2a";
    ctx.fillRect(-drumW / 2, -drumH / 2, drumW, drumH);
    ctx.strokeStyle = spec.accentColor;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-drumW / 2, -drumH / 2, drumW, drumH);

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
    if (rpmPct > 0.5) {
      ctx.fillStyle = `rgba(${hexToRgb(spec.accentColor)},${rpmPct * 0.25})`;
      ctx.fillRect(-drumW / 2, -drumH / 2 - 4, drumW, drumH + 8);
    }
    ctx.restore();
  }

  drawArmorBreaches(ctx, entity, time);
}

function drawVerticalSpinner(ctx: CanvasRenderingContext2D, entity: RobotEntity, time: number) {
  const { spec } = entity;
  const w = spec.bodyWidth;
  const l = spec.bodyLength;
  const rpmPct = spec.maxWeaponRPM > 0 ? entity.weaponRPM / spec.maxWeaponRPM : 0;
  const weaponDestroyed = entity.destroyedParts.weapon;

  drawTracks(ctx, w, l, "#111", entity, time);

  ctx.fillStyle = spec.primaryColor;
  ctx.shadowColor = spec.accentColor;
  ctx.shadowBlur = 5;
  ctx.beginPath();
  ctx.moveTo(-w / 2, -l / 2); ctx.lineTo(w / 2, -l / 2);
  ctx.lineTo(w / 2 * 0.82, l / 2); ctx.lineTo(-w / 2 * 0.82, l / 2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = spec.accentColor;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.shadowBlur = 0;

  const vGrad = ctx.createLinearGradient(0, -l / 2, 0, l / 2);
  vGrad.addColorStop(0, "rgba(255,255,255,0.16)");
  vGrad.addColorStop(0.5, "rgba(255,255,255,0.04)");
  vGrad.addColorStop(1, "rgba(0,0,0,0.20)");
  ctx.fillStyle = vGrad;
  ctx.beginPath();
  ctx.moveTo(-w / 2, -l / 2); ctx.lineTo(w / 2, -l / 2);
  ctx.lineTo(w / 2 * 0.82, l / 2); ctx.lineTo(-w / 2 * 0.82, l / 2);
  ctx.closePath();
  ctx.fill();

  drawPanelLines(ctx, w * 0.85, l * 0.9, `rgba(${hexToRgb(spec.accentColor)},0.22)`);
  drawBolts(ctx, w, l);

  if (weaponDestroyed) {
    ctx.save();
    ctx.translate(0, -l / 2 + 14);
    // Cracked disc mount
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, Math.PI * 2);
    ctx.stroke();
    // Crack lines
    ctx.strokeStyle = "#222";
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 5, Math.sin(a) * 5);
      ctx.lineTo(Math.cos(a) * 20, Math.sin(a) * 20);
      ctx.stroke();
    }
    // Glowing inner damage
    const p = 0.5 + 0.5 * Math.sin(time * 5);
    ctx.fillStyle = `rgba(255,60,0,${p * 0.45})`;
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else {
    const discR = 20;
    ctx.save();
    ctx.translate(0, -l / 2 + discR * 0.15);

    if (rpmPct > 0.35) {
      const glow = ctx.createRadialGradient(0, 0, discR * 0.4, 0, 0, discR * 2.2);
      glow.addColorStop(0, `rgba(${hexToRgb(spec.accentColor)},${rpmPct * 0.45})`);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, discR * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(0, 0, discR, 0, Math.PI * 2);
    ctx.fillStyle = rpmPct > 0.1 ? spec.accentColor : "#333";
    ctx.shadowColor = spec.accentColor;
    ctx.shadowBlur = rpmPct > 0.4 ? 20 : 0;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Use accumulated bar angle for disc spoke rendering
    ctx.save();
    ctx.rotate(entity.weaponBarAngle);
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

    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#ddd";
    ctx.fill();
    ctx.restore();
  }

  drawArmorBreaches(ctx, entity, time);
}

function drawLifter(ctx: CanvasRenderingContext2D, entity: RobotEntity, time: number) {
  const { spec } = entity;
  const w = spec.bodyWidth;
  const l = spec.bodyLength;

  drawTracks(ctx, w, l, "#1a0a2e", entity, time);

  ctx.fillStyle = spec.primaryColor;
  ctx.shadowColor = spec.accentColor;
  ctx.shadowBlur = 7;
  roundRect(ctx, -w / 2, -l / 2, w, l, 7);
  ctx.fill();
  ctx.strokeStyle = spec.accentColor;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.shadowBlur = 0;

  const lGrad = ctx.createLinearGradient(-w / 2, -l / 2, w / 2, l / 2);
  lGrad.addColorStop(0, "rgba(255,255,255,0.14)");
  lGrad.addColorStop(1, "rgba(0,0,0,0.22)");
  roundRect(ctx, -w / 2, -l / 2, w, l, 7);
  ctx.fillStyle = lGrad;
  ctx.fill();

  drawPanelLines(ctx, w, l, `rgba(${hexToRgb(spec.accentColor)},0.28)`);
  drawBolts(ctx, w, l);

  // Fork / lifter
  const liftActive = entity.weaponThrottle > 0.3;
  const liftAngle = liftActive ? -0.3 : 0;
  ctx.save();
  ctx.translate(0, -l / 2);
  ctx.rotate(liftAngle);
  const forkW = w * 0.68;
  const forkH = 18;
  ctx.fillStyle = liftActive ? spec.accentColor : "#4a4a5a";
  ctx.shadowColor = liftActive ? spec.accentColor : "transparent";
  ctx.shadowBlur = liftActive ? 14 : 0;
  ctx.beginPath(); ctx.roundRect(-forkW / 2, -forkH / 2, 9, forkH + 10, 3); ctx.fill();
  ctx.beginPath(); ctx.roundRect(forkW / 2 - 9, -forkH / 2, 9, forkH + 10, 3); ctx.fill();
  ctx.beginPath(); ctx.roundRect(-forkW / 2, -forkH / 2 - 4, forkW, 8, 2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();

  drawArmorBreaches(ctx, entity, time);
  void time;
}

function drawHammer(ctx: CanvasRenderingContext2D, entity: RobotEntity, time: number) {
  const { spec } = entity;
  const w = spec.bodyWidth;
  const l = spec.bodyLength;
  const weaponDestroyed = entity.destroyedParts.weapon;

  drawTracks(ctx, w, l, "#1a1a1a", entity, time);

  ctx.fillStyle = spec.primaryColor;
  ctx.shadowColor = spec.accentColor;
  ctx.shadowBlur = 5;
  roundRect(ctx, -w / 2, -l / 2, w, l, 5);
  ctx.fill();
  ctx.strokeStyle = spec.accentColor;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.shadowBlur = 0;

  const hGrad = ctx.createLinearGradient(-w / 2, -l / 2, w / 2, l / 2);
  hGrad.addColorStop(0, "rgba(255,255,255,0.12)");
  hGrad.addColorStop(1, "rgba(0,0,0,0.20)");
  roundRect(ctx, -w / 2, -l / 2, w, l, 5);
  ctx.fillStyle = hGrad;
  ctx.fill();

  drawPanelLines(ctx, w, l, `rgba(${hexToRgb(spec.accentColor)},0.22)`);
  drawBolts(ctx, w, l);

  // Pivot
  ctx.beginPath();
  ctx.arc(0, -l / 2 + 8, 7, 0, Math.PI * 2);
  ctx.fillStyle = "#333";
  ctx.fill();
  ctx.strokeStyle = "#666";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  if (weaponDestroyed) {
    // Broken stub hanging loose
    ctx.save();
    ctx.translate(0, -l / 2 + 8);
    ctx.rotate(entity.hammerAngle + 0.8); // hanging slightly off-center
    const armLen = l * 0.45;
    ctx.fillStyle = "#2a2a2a";
    ctx.fillRect(-4, -armLen, 8, armLen * 0.6); // only partial arm remains
    // Sparking/glowing break point
    const p = 0.5 + 0.5 * Math.sin(time * 6);
    ctx.fillStyle = `rgba(255,80,0,${p * 0.65})`;
    ctx.beginPath();
    ctx.arc(0, -armLen * 0.6, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else {
    ctx.save();
    ctx.translate(0, -l / 2 + 8);
    ctx.rotate(entity.hammerAngle);
    const armLen = l * 0.65;
    const hamStr = entity.hammerState === "striking";
    const hamReady = entity.hammerState === "ready";

    ctx.fillStyle = hamStr ? spec.accentColor : "#484850";
    ctx.shadowColor = hamStr ? spec.accentColor : "transparent";
    ctx.shadowBlur = hamStr ? 22 : 0;
    ctx.fillRect(-5, -armLen, 10, armLen);

    const headW = spec.weaponQuality === "titanium" ? 28 : 24;
    ctx.fillStyle = hamStr ? "#fffde7" : "#666";
    ctx.fillRect(-headW / 2, -armLen - 12, headW, 14);

    if (spec.weaponQuality === "titanium") {
      ctx.fillStyle = "#ef5350";
      ctx.fillRect(-headW / 2, -armLen - 16, headW, 6);
    }

    if (hamReady && entity.hammerCooldown < 0.2) {
      ctx.shadowColor = "#e91e63";
      ctx.shadowBlur = 16;
      ctx.fillStyle = "rgba(233,30,99,0.3)";
      ctx.fillRect(-headW / 2, -armLen - 16, headW, 30);
    }

    ctx.shadowBlur = 0;
    ctx.restore();
  }

  drawArmorBreaches(ctx, entity, time);
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

  drawShadow(ctx, entity);

  ctx.save();
  ctx.translate(entity.x, entity.y);
  ctx.rotate(entity.angle);

  // White hit flash overlay
  if (flashing) {
    ctx.globalAlpha = 0.60;
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

  // Armor HP tint
  const armorPct = entity.armor.currentHP / entity.armor.maxHP;
  if (armorPct < 0.4) {
    const { bodyWidth: w, bodyLength: l } = entity.spec;
    roundRect(ctx, -w / 2, -l / 2, w, l, 5);
    ctx.fillStyle = armorPct < 0.15
      ? "rgba(255,0,0,0.30)"
      : "rgba(255,100,0,0.16)";
    ctx.fill();
  }

  // Facing arrow
  const { bodyLength: l } = entity.spec;
  ctx.fillStyle = isPlayer ? "rgba(80,200,255,0.72)" : "rgba(255,80,80,0.72)";
  ctx.beginPath();
  ctx.moveTo(0, -l / 2 - 7);
  ctx.lineTo(-6, -l / 2 + 2);
  ctx.lineTo(6, -l / 2 + 2);
  ctx.closePath();
  ctx.fill();

  ctx.restore();

  // Dashed selection ring for player
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

  // Name label
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
      const smokeGrad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * (1 + (1 - alpha) * 0.6));
      smokeGrad.addColorStop(0, p.color);
      smokeGrad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = smokeGrad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1 + (1 - alpha) * 0.6), 0, Math.PI * 2);
      ctx.fill();
    } else if (p.type === "spark") {
      // Streak in direction of travel
      const spd = Math.sqrt(p.vx ** 2 + p.vy ** 2);
      const len = Math.min(20, spd * 0.03);
      const nx = spd > 0 ? p.vx / spd : 0;
      const ny = spd > 0 ? p.vy / spd : 0;
      ctx.strokeStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 7;
      ctx.lineWidth = p.size * alpha;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(p.x - nx * len, p.y - ny * len);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.shadowBlur = 0;
    } else {
      // Debris — solid chunk with slight spin implied by rect
      ctx.fillStyle = p.color;
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 3;
      const sz = p.size * alpha;
      ctx.fillRect(p.x - sz * 0.5, p.y - sz * 0.5, sz, sz);
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
  const ph = 128;

  const bg = ctx.createLinearGradient(x, y, x, y + ph);
  bg.addColorStop(0, "rgba(10,10,18,0.90)");
  bg.addColorStop(1, "rgba(0,0,0,0.78)");
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

  // Drive and Weapon component bars
  const comps = [
    { key: "DRIVE ", c: entity.drive, destroyed: entity.destroyedParts.leftTrack && entity.destroyedParts.rightTrack },
    { key: "WEAPON", c: entity.weapon, destroyed: entity.destroyedParts.weapon },
  ];
  for (let i = 0; i < 2; i++) {
    const { key, c, destroyed } = comps[i];
    const pct = c.currentHP / c.maxHP;
    const col = destroyed ? "#f44336" : compColor(pct);
    const by = y + 54 + i * 16;
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fillRect(x + 8, by, panelW - 16, 7);
    ctx.fillStyle = col;
    ctx.fillRect(x + 8, by, (panelW - 16) * pct, 7);
    const status = destroyed ? "DESTROYED" : componentStatus(c);
    ctx.fillStyle = destroyed ? "#f44336" : "rgba(255,255,255,0.45)";
    ctx.font = "8px 'Courier New', monospace";
    ctx.fillText(
      `${key}  ${QUALITY_LABEL[c.quality]}  ${status !== "functional" ? `[${typeof status === "string" ? status.toUpperCase() : status}]` : ""}`,
      x + 8, by + 15,
    );
  }

  // Weapon RPM / hammer bar
  const rpmY = y + 94;
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.fillRect(x + 8, rpmY, panelW - 16, 7);

  if (entity.destroyedParts.weapon) {
    // Destroyed — red flat line
    ctx.fillStyle = "#f44336";
    ctx.fillRect(x + 8, rpmY, (panelW - 16) * 0.05, 7);
    ctx.fillStyle = "rgba(255,80,80,0.55)";
    ctx.font = "8px 'Courier New', monospace";
    ctx.fillText("WEAPON ▶ DESTROYED", x + 8, rpmY + 15);
  } else if (entity.spec.maxWeaponRPM > 0) {
    const rpmPct = entity.weaponRPM / entity.spec.maxWeaponRPM;
    const rColor = rpmPct > 0.7 ? "#ef5350" : rpmPct > 0.35 ? "#ffa726" : "#42a5f5";
    ctx.fillStyle = rColor;
    ctx.shadowColor = rColor;
    ctx.shadowBlur = rpmPct > 0.5 ? 8 : 0;
    ctx.fillRect(x + 8, rpmY, (panelW - 16) * rpmPct, 7);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = "8px 'Courier New', monospace";
    ctx.fillText(`WEAPON  ${Math.round(entity.weaponRPM).toLocaleString()} RPM`, x + 8, rpmY + 15);
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
  const pw = 240;
  const py = canvasH - 134;

  drawRobotPanel(ctx, state.player, 8, py, pw, false, "YOU", "#64b5f6");
  drawRobotPanel(ctx, state.opponent, canvasW - pw - 8, py, pw, true, "OPP", "#ef9a9a");

  // Timer
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

  // Controls
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
  const pulse = timer % 1;
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
  const panelH = 320;
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

  const resultText = draw ? "DRAW" : win ? "VICTORY!" : "DEFEATED";
  ctx.fillStyle = borderColor;
  ctx.shadowColor = borderColor;
  ctx.shadowBlur = 24;
  ctx.font = `bold 56px 'Arial Black', Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(resultText, cW / 2, py + 68);
  ctx.shadowBlur = 0;

  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = `14px 'Courier New', monospace`;
  ctx.fillText(match.winReason, cW / 2, py + 102);

  // Damage summary
  const p = state.player;
  const o = state.opponent;

  const drawBar = (lx: number, ly: number, label: string, pct: number, destroyed: boolean) => {
    const bw = 180;
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(lx, ly, bw, 6);
    const col = destroyed ? "#f44336" : compColor(pct);
    ctx.fillStyle = col;
    ctx.fillRect(lx, ly, bw * pct, 6);
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = "8px 'Courier New', monospace";
    ctx.textAlign = "left";
    ctx.fillText(
      `${label}  ${destroyed ? "[DESTROYED]" : Math.round(pct * 100) + "%"}`,
      lx, ly + 16,
    );
  };

  const drawBarR = (rx: number, ly: number, label: string, pct: number, destroyed: boolean) => {
    const bw = 180;
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(rx - bw, ly, bw, 6);
    const col = destroyed ? "#f44336" : compColor(pct);
    ctx.fillStyle = col;
    ctx.fillRect(rx - bw, ly, bw * pct, 6);
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = "8px 'Courier New', monospace";
    ctx.textAlign = "right";
    ctx.fillText(
      `${destroyed ? "[DESTROYED]" : Math.round(pct * 100) + "%"}  ${label}`,
      rx, ly + 16,
    );
  };

  ctx.fillStyle = "#64b5f6";
  ctx.font = "bold 10px 'Courier New', monospace";
  ctx.textAlign = "left";
  ctx.fillText(`YOUR BOT: ${p.spec.name}`, px + 30, py + 145);
  drawBar(px + 30, py + 155, "ARMOR ", p.armor.currentHP / p.armor.maxHP, false);
  drawBar(px + 30, py + 177, "DRIVE ", p.drive.currentHP / p.drive.maxHP, p.destroyedParts.leftTrack && p.destroyedParts.rightTrack);
  drawBar(px + 30, py + 199, "WEAPON", p.weapon.currentHP / p.weapon.maxHP, p.destroyedParts.weapon);

  ctx.fillStyle = "#ef9a9a";
  ctx.font = "bold 10px 'Courier New', monospace";
  ctx.textAlign = "right";
  ctx.fillText(`OPP: ${o.spec.name}`, px + panelW - 30, py + 145);
  drawBarR(px + panelW - 30, py + 155, "ARMOR ", o.armor.currentHP / o.armor.maxHP, false);
  drawBarR(px + panelW - 30, py + 177, "DRIVE ", o.drive.currentHP / o.drive.maxHP, o.destroyedParts.leftTrack && o.destroyedParts.rightTrack);
  drawBarR(px + panelW - 30, py + 199, "WEAPON", o.weapon.currentHP / o.weapon.maxHP, o.destroyedParts.weapon);

  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = "11px 'Courier New', monospace";
  ctx.textAlign = "center";
  ctx.fillText("[ R ] REMATCH     [ ESC ] BACK TO SELECTION", cW / 2, py + panelH - 22);

  ctx.restore();
}
