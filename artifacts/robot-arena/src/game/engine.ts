import type {
  GameState,
  RobotEntity,
  ComponentSpec,
  ComponentQuality,
} from "./types";
import {
  componentStatus,
  componentSpeedMult,
  QUALITY_REDUCTION,
  QUALITY_HP,
} from "./types";
import type { RobotSpec } from "./robots";

// ── Constants ─────────────────────────────────────────────────────────────────
const WALL = 24;
const FRICTION = 0.88;
const ANGULAR_FRICTION = 0.80;
const KNOCKBACK_DECAY = 0.88;
const MATCH_DURATION = 120;
const COUNTDOWN_DURATION = 3;
// Robot's "front" is local -y direction in canvas space.
// In world space that maps to (sin(angle), -cos(angle)).
// THRUST_SCALE converts spec.maxSpeed into realistic pixel/s terminal velocity.
const THRUST_SCALE = 16;
const ANGULAR_SCALE = 14;

// ── AI State ──────────────────────────────────────────────────────────────────
type AiPhase = "spinup" | "charge" | "retreat" | "circle" | "approach" | "fire";

interface AiState {
  phase: AiPhase;
  phaseTimer: number;
  circleDir: 1 | -1;
  retreatTimer: number;
  lastRetreat: number;
}

const AI_STATES = new WeakMap<RobotEntity, AiState>();

function getAi(entity: RobotEntity): AiState {
  if (!AI_STATES.has(entity)) {
    AI_STATES.set(entity, {
      phase: "spinup",
      phaseTimer: 0,
      circleDir: Math.random() > 0.5 ? 1 : -1,
      retreatTimer: 0,
      lastRetreat: 0,
    });
  }
  return AI_STATES.get(entity)!;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function robotRadius(e: RobotEntity): number {
  const { bodyWidth: w, bodyLength: l } = e.spec;
  return Math.sqrt((w * 0.5) ** 2 + (l * 0.5) ** 2) * 0.72;
}

function makeComp(quality: ComponentQuality): ComponentSpec {
  const hp = QUALITY_HP[quality];
  return { quality, maxHP: hp, currentHP: hp };
}

function normAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

// Robot front is local -y → world direction (sin(angle), -cos(angle)).
// Equivalent world-space atan2 angle = PI/2 - entity.angle (offset by -PI/2 from entity.angle).
// So to steer toward a world-space direction `target` (atan2 convention),
// the entity.angle that achieves that facing = PI/2 - target → diff = (PI/2 - target) - entity.angle.
// Equivalently diff = normAngle(-(target - PI/2) - entity.angle)... simpler: subtract PI/2 from target in the diff:
function steerTo(entity: RobotEntity, target: number, turn: number, dt: number) {
  // Convert world atan2 target to required entity.angle
  const requiredAngle = Math.PI / 2 - target;
  const diff = normAngle(requiredAngle - entity.angle);
  entity.angularVel += Math.sign(diff) * turn * dt * ANGULAR_SCALE;
}

// Drive forward: robot front is (sin(angle), -cos(angle)) in world space.
function thrust(entity: RobotEntity, spd: number, dt: number) {
  entity.vx += Math.sin(entity.angle) * spd * dt * THRUST_SCALE;
  entity.vy += -Math.cos(entity.angle) * spd * dt * THRUST_SCALE;
}

// ── Particles ──────────────────────────────────────────────────────────────────
function sparks(
  state: GameState,
  x: number,
  y: number,
  angle: number,
  count: number,
  intensity: number,
) {
  for (let i = 0; i < count; i++) {
    const a = angle + (Math.random() - 0.5) * Math.PI * 1.5;
    const spd = (120 + Math.random() * 380) * Math.max(0.3, intensity);
    state.particles.push({
      x, y,
      vx: Math.cos(a) * spd,
      vy: Math.sin(a) * spd,
      life: 0.12 + Math.random() * 0.38,
      maxLife: 0.12 + Math.random() * 0.38,
      color: Math.random() > 0.55 ? "#fff9c4" : Math.random() > 0.5 ? "#ffd54f" : "#ff7043",
      size: 1.5 + Math.random() * 3,
      type: "spark",
    });
  }
}

function debris(state: GameState, x: number, y: number, color: string, count: number) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const spd = 50 + Math.random() * 160;
    state.particles.push({
      x, y,
      vx: Math.cos(a) * spd,
      vy: Math.sin(a) * spd,
      life: 0.7 + Math.random() * 1.4,
      maxLife: 0.7 + Math.random() * 1.4,
      color,
      size: 2.5 + Math.random() * 5.5,
      type: "debris",
    });
  }
}

function smoke(state: GameState, x: number, y: number, count = 1) {
  for (let i = 0; i < count; i++) {
    state.particles.push({
      x: x + (Math.random() - 0.5) * 20,
      y: y + (Math.random() - 0.5) * 20,
      vx: (Math.random() - 0.5) * 18,
      vy: -15 - Math.random() * 20,
      life: 1.2 + Math.random() * 1.0,
      maxLife: 1.2 + Math.random() * 1.0,
      color: `rgba(${80 + Math.random() * 60 | 0},${80 + Math.random() * 60 | 0},${80 + Math.random() * 60 | 0},0.45)`,
      size: 11 + Math.random() * 16,
      type: "smoke",
    });
  }
}

// ── Weapon Update ──────────────────────────────────────────────────────────────
function updateWeapon(entity: RobotEntity, dt: number) {
  const { spec } = entity;
  entity.hammerCooldown = Math.max(0, entity.hammerCooldown - dt);

  if (spec.weaponType === "hammer") {
    if (entity.hammerState === "striking") {
      entity.hammerTimer -= dt;
      entity.hammerAngle = Math.min(Math.PI * 0.5, entity.hammerAngle + Math.PI * 3.8 * dt);
      if (entity.hammerTimer <= 0) { entity.hammerState = "retracting"; entity.hammerTimer = 0.5; }
    } else if (entity.hammerState === "retracting") {
      entity.hammerTimer -= dt;
      entity.hammerAngle = Math.max(-Math.PI * 0.6, entity.hammerAngle - Math.PI * 2.2 * dt);
      if (entity.hammerTimer <= 0) { entity.hammerState = "ready"; entity.hammerAngle = -Math.PI * 0.6; }
    }
    return;
  }

  if (spec.maxWeaponRPM > 0) {
    const disabled = componentStatus(entity.weapon) === "disabled";
    if (disabled) {
      entity.weaponRPM = Math.max(0, entity.weaponRPM - spec.weaponSpinupRate * 2.5 * dt);
    } else {
      const cap = spec.maxWeaponRPM * (entity.weapon.currentHP / entity.weapon.maxHP);
      const target = entity.weaponThrottle * cap;
      if (entity.weaponRPM < target) {
        entity.weaponRPM = Math.min(target, entity.weaponRPM + spec.weaponSpinupRate * dt);
      } else {
        entity.weaponRPM = Math.max(target, entity.weaponRPM - spec.weaponSpinupRate * 0.4 * dt);
      }
    }
  }
}

// ── Physics ────────────────────────────────────────────────────────────────────
function applyPhysics(entity: RobotEntity, arenaW: number, arenaH: number, dt: number) {
  const maxVel = entity.spec.maxSpeed * THRUST_SCALE * 1.8;

  // Integrate knockback impulse each frame
  entity.vx += entity.knockbackVx * dt * 60;
  entity.vy += entity.knockbackVy * dt * 60;
  entity.knockbackVx *= KNOCKBACK_DECAY;
  entity.knockbackVy *= KNOCKBACK_DECAY;

  // Clamp velocity
  const vel = Math.sqrt(entity.vx ** 2 + entity.vy ** 2);
  if (vel > maxVel) { entity.vx = (entity.vx / vel) * maxVel; entity.vy = (entity.vy / vel) * maxVel; }

  entity.x += entity.vx * dt;
  entity.y += entity.vy * dt;
  entity.angle += entity.angularVel * dt;

  entity.vx *= FRICTION;
  entity.vy *= FRICTION;
  entity.angularVel *= ANGULAR_FRICTION;

  // Wall bounce — hard stop + bounce
  const r = robotRadius(entity) + WALL;
  if (entity.x < r) { entity.x = r; entity.vx = Math.abs(entity.vx) * 0.4; }
  if (entity.x > arenaW - r) { entity.x = arenaW - r; entity.vx = -Math.abs(entity.vx) * 0.4; }
  if (entity.y < r) { entity.y = r; entity.vy = Math.abs(entity.vy) * 0.4; }
  if (entity.y > arenaH - r) { entity.y = arenaH - r; entity.vy = -Math.abs(entity.vy) * 0.4; }
}

// ── Hit Location ───────────────────────────────────────────────────────────────
type HitLoc = "front" | "left" | "right" | "rear";

function hitLocation(attacker: RobotEntity, defender: RobotEntity): HitLoc {
  const dx = attacker.x - defender.x;
  const dy = attacker.y - defender.y;
  // Defender's forward direction (local -y in world) = (sin(angle), -cos(angle))
  const fX = Math.sin(defender.angle);
  const fY = -Math.cos(defender.angle);
  // Defender's right direction = local +x in world = (cos(angle), sin(angle))
  const rX = Math.cos(defender.angle);
  const rY = Math.sin(defender.angle);
  const fwd = dx * fX + dy * fY;
  const side = dx * rX + dy * rY;
  const fa = Math.abs(fwd);
  const sa = Math.abs(side);
  if (sa > fa * 1.1) return side > 0 ? "right" : "left";
  return fwd > 0 ? "front" : "rear";
}

// ── Collision & Damage ─────────────────────────────────────────────────────────
function applySpinnerHit(
  state: GameState,
  attacker: RobotEntity,
  defender: RobotEntity,
  rpmPct: number,
  nx: number,
  ny: number,
  now: number,
  cx: number,
  cy: number,
) {
  if (now < defender.hitFlashUntil) return;

  const ke = attacker.spec.weaponKE * rpmPct;
  const armorRed = QUALITY_REDUCTION[defender.armor.quality];
  const loc = hitLocation(attacker, defender);

  let armorDmg = ke * 0.38 * (1 - armorRed);
  const compDmg = ke * 0.26 * (1 - armorRed);

  if (loc === "front") {
    defender.weapon.currentHP = Math.max(0, defender.weapon.currentHP - compDmg);
  } else if (loc === "left" || loc === "right") {
    defender.drive.currentHP = Math.max(0, defender.drive.currentHP - compDmg);
  } else {
    armorDmg *= 1.35;
    defender.drive.currentHP = Math.max(0, defender.drive.currentHP - compDmg * 0.5);
  }

  let kbMult = 1.0;
  if (attacker.spec.weaponType === "horizontal_spinner") { kbMult = 1.8; armorDmg *= 1.1; }
  else if (attacker.spec.weaponType === "vertical_spinner") { kbMult = 0.85; armorDmg *= 1.25; }
  else if (attacker.spec.weaponType === "drum") { kbMult = 0.75; }

  defender.armor.currentHP = Math.max(0, defender.armor.currentHP - armorDmg);
  defender.totalDamageTaken += armorDmg + compDmg;

  // Knockback — stored as per-frame impulse, scaled for dramatic effect
  const kbSpd = (ke * 5.0 * kbMult) / defender.spec.mass;
  defender.knockbackVx = nx * kbSpd;
  defender.knockbackVy = ny * kbSpd;
  // Angular knockback
  defender.angularVel += (Math.random() - 0.5) * ke * 0.8 / defender.spec.mass;
  defender.hitFlashUntil = now + 180;
  defender.lastHitAngle = Math.atan2(ny, nx);

  attacker.weaponRPM *= Math.max(0, 1 - (0.35 + (1 - armorRed) * 0.25));

  // Attacker recoil
  attacker.knockbackVx = -nx * kbSpd * 0.35;
  attacker.knockbackVy = -ny * kbSpd * 0.35;

  sparks(state, cx, cy, Math.atan2(ny, nx), 18 + Math.round(ke * 0.3), rpmPct);
  if (armorDmg > 6) debris(state, cx, cy, defender.spec.primaryColor, Math.round(armorDmg * 0.2 + 3));
  if (componentStatus(defender.armor) === "critical") smoke(state, defender.x, defender.y);

  if (defender.armor.currentHP <= 0) {
    defender.isAlive = false;
    sparks(state, defender.x, defender.y, 0, 60, 1);
    debris(state, defender.x, defender.y, defender.spec.primaryColor, 22);
    smoke(state, defender.x, defender.y, 5);
  }
}

function applyHammerHit(
  state: GameState,
  attacker: RobotEntity,
  defender: RobotEntity,
  now: number,
  cx: number,
  cy: number,
) {
  if (now < defender.hitFlashUntil) return;
  if (attacker.hammerAngle < Math.PI * 0.2) return;

  const ke = attacker.spec.weaponKE;
  const armorRed = QUALITY_REDUCTION[defender.armor.quality];
  const wepRed = QUALITY_REDUCTION[attacker.weapon.quality];

  let dmg = ke * 0.6 * (1 - armorRed) * (1 + wepRed * 0.6);
  if (attacker.weapon.quality === "titanium") {
    dmg *= 1.25;
    const r = Math.random();
    if (r < 0.35) defender.drive.currentHP = Math.max(0, defender.drive.currentHP - dmg * 0.35);
    else if (r < 0.65) defender.weapon.currentHP = Math.max(0, defender.weapon.currentHP - dmg * 0.35);
  }

  defender.armor.currentHP = Math.max(0, defender.armor.currentHP - dmg);
  defender.totalDamageTaken += dmg;
  defender.hitFlashUntil = now + 150;

  const angle = Math.atan2(defender.y - attacker.y, defender.x - attacker.x);
  const kbSpd = (ke * 3.0) / defender.spec.mass;
  defender.knockbackVx = Math.cos(angle) * kbSpd;
  defender.knockbackVy = Math.sin(angle) * kbSpd;

  sparks(state, cx, cy, angle, 14, 0.7);
  debris(state, cx, cy, "#607d8b", 5);

  if (defender.armor.currentHP <= 0) {
    defender.isAlive = false;
    sparks(state, defender.x, defender.y, 0, 45, 1);
    debris(state, defender.x, defender.y, defender.spec.primaryColor, 16);
    smoke(state, defender.x, defender.y, 3);
  }
}

function applyLifterHit(
  state: GameState,
  attacker: RobotEntity,
  defender: RobotEntity,
  nx: number,
  ny: number,
  now: number,
  _cx: number,
  _cy: number,
) {
  if (now < defender.hitFlashUntil) return;
  if (attacker.weaponThrottle < 0.4) return;

  const pushSpd = 280 / defender.spec.mass;
  defender.knockbackVx = nx * pushSpd;
  defender.knockbackVy = ny * pushSpd;
  defender.hitFlashUntil = now + 80;

  const dmg = attacker.spec.weaponKE * 0.12;
  defender.armor.currentHP = Math.max(0, defender.armor.currentHP - dmg);
  defender.totalDamageTaken += dmg;

  sparks(state, _cx, _cy, Math.atan2(ny, nx), 6, 0.3);
}

function checkCollision(state: GameState) {
  const { player: p, opponent: o } = state;
  const rp = robotRadius(p);
  const ro = robotRadius(o);
  const dx = o.x - p.x;
  const dy = o.y - p.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  const minD = rp + ro;
  if (d >= minD || d < 1) return;

  const nx = dx / d;
  const ny = dy / d;
  const overlap = minD - d;
  p.x -= nx * overlap * 0.5;
  p.y -= ny * overlap * 0.5;
  o.x += nx * overlap * 0.5;
  o.y += ny * overlap * 0.5;

  const now = performance.now();
  const cx = (p.x + o.x) * 0.5;
  const cy = (p.y + o.y) * 0.5;

  const pRpm = p.spec.maxWeaponRPM > 0 ? p.weaponRPM / p.spec.maxWeaponRPM : 0;
  const oRpm = o.spec.maxWeaponRPM > 0 ? o.weaponRPM / o.spec.maxWeaponRPM : 0;

  if (pRpm > 0.05) applySpinnerHit(state, p, o, pRpm, nx, ny, now, cx, cy);
  if (oRpm > 0.05) applySpinnerHit(state, o, p, oRpm, -nx, -ny, now, cx, cy);

  if (p.hammerState === "striking") applyHammerHit(state, p, o, now, cx, cy);
  if (o.hammerState === "striking") applyHammerHit(state, o, p, now, cx, cy);

  if (p.spec.weaponType === "lifter") applyLifterHit(state, p, o, nx, ny, now, cx, cy);
  if (o.spec.weaponType === "lifter") applyLifterHit(state, o, p, -nx, -ny, now, cx, cy);

  // Physical impulse (always)
  const rv = (p.vx - o.vx) * nx + (p.vy - o.vy) * ny;
  if (rv < 0) {
    const imp = rv * 0.55;
    p.vx -= imp * nx; p.vy -= imp * ny;
    o.vx += imp * nx; o.vy += imp * ny;
  }
}

// ── AI Driving ────────────────────────────────────────────────────────────────
function wallAvoidAngle(e: RobotEntity, W: number, H: number): number | null {
  const m = 120;
  let ax = 0, ay = 0;
  if (e.x < m) ax += 1;
  if (e.x > W - m) ax -= 1;
  if (e.y < m) ay += 1;
  if (e.y > H - m) ay -= 1;
  return ax !== 0 || ay !== 0 ? Math.atan2(ay, ax) : null;
}

function updateOpponentAI(
  state: GameState,
  entity: RobotEntity,
  target: RobotEntity,
  dt: number,
) {
  const ai = getAi(entity);
  ai.phaseTimer += dt;

  const { spec } = entity;
  const dx = target.x - entity.x;
  const dy = target.y - entity.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  const toTarget = Math.atan2(dy, dx);
  const dm = componentSpeedMult(entity.drive);
  const spd = spec.maxSpeed * dm;
  const trn = spec.turnRate * dm;
  const isSpinner = spec.maxWeaponRPM > 0 && spec.weaponType !== "lifter";
  const rpmPct = spec.maxWeaponRPM > 0 ? entity.weaponRPM / spec.maxWeaponRPM : 0;

  if (isSpinner) entity.weaponThrottle = 1;

  if (spec.drivingStyle === "aggressive" && isSpinner) {
    if (ai.phase === "retreat") {
      ai.retreatTimer -= dt;
      steerTo(entity, toTarget + Math.PI, trn, dt);
      thrust(entity, -spd * 0.65, dt);
      if (ai.retreatTimer <= 0) { ai.phase = "spinup"; ai.phaseTimer = 0; }
    } else if (ai.phase === "spinup") {
      if (d < 260) { steerTo(entity, toTarget + Math.PI, trn, dt); thrust(entity, -spd * 0.5, dt); }
      else steerTo(entity, toTarget + 0.4, trn, dt);
      if (rpmPct >= 0.72) { ai.phase = "charge"; ai.phaseTimer = 0; }
    } else if (ai.phase === "charge") {
      steerTo(entity, toTarget, trn, dt);
      thrust(entity, spd, dt);
      if (rpmPct < 0.25 && d > 120) { ai.phase = "retreat"; ai.retreatTimer = 1.2; }
    } else { ai.phase = "spinup"; }
  } else if (spec.drivingStyle === "aggressive" && spec.weaponType === "vertical_spinner") {
    if (ai.phase === "retreat") {
      ai.retreatTimer -= dt;
      steerTo(entity, toTarget + Math.PI, trn, dt);
      thrust(entity, -spd * 0.6, dt);
      if (ai.retreatTimer <= 0) { ai.phase = "spinup"; ai.phaseTimer = 0; }
    } else if (ai.phase === "spinup") {
      if (d < 240) thrust(entity, -spd * 0.3, dt);
      if (rpmPct >= 0.6) { ai.phase = "charge"; ai.phaseTimer = 0; }
    } else {
      steerTo(entity, toTarget, trn, dt);
      thrust(entity, spd * 0.9, dt);
      if (rpmPct < 0.2) { ai.phase = "retreat"; ai.retreatTimer = 1.5; }
    }
  } else if (spec.drivingStyle === "control" && spec.weaponType === "hammer") {
    entity.weaponThrottle = 1;
    if (ai.phase === "fire") {
      ai.phaseTimer += dt;
      if (ai.phaseTimer > 0.6) { ai.phase = "approach"; ai.phaseTimer = 0; }
    } else {
      steerTo(entity, toTarget, trn, dt);
      applyApproach(entity, spd, d, 100, dt);
      if (d < 90 && entity.hammerCooldown <= 0 && componentStatus(entity.weapon) !== "disabled") {
        entity.hammerState = "striking";
        entity.hammerTimer = 0.18;
        entity.hammerAngle = -Math.PI * 0.6;
        entity.hammerCooldown = spec.id === "beta" ? 2.2 : 1.6;
        ai.phase = "fire"; ai.phaseTimer = 0;
      }
    }
  } else if (spec.drivingStyle === "control" && spec.weaponType === "lifter") {
    steerTo(entity, toTarget, trn, dt);
    applyApproach(entity, spd, d, 80, dt);
    entity.weaponThrottle = d < 100 ? 1 : 0;
  } else if (spec.drivingStyle === "opportunistic") {
    entity.weaponThrottle = 1;
    if (ai.phase === "retreat") {
      ai.retreatTimer -= dt;
      steerTo(entity, toTarget + Math.PI * 0.9, trn, dt);
      thrust(entity, -spd * 0.75, dt);
      if (ai.retreatTimer <= 0) { ai.phase = "circle"; ai.phaseTimer = 0; ai.circleDir = (ai.circleDir * -1) as 1 | -1; }
    } else if (ai.phase === "circle") {
      const circ = toTarget + (Math.PI / 2) * ai.circleDir;
      steerTo(entity, circ, trn, dt);
      thrust(entity, spd * 0.78, dt);
      if (ai.phaseTimer > 1.8) { ai.phase = rpmPct > 0.55 ? "charge" : "spinup"; ai.phaseTimer = 0; }
    } else if (ai.phase === "spinup") {
      steerTo(entity, toTarget + 0.5 * ai.circleDir, trn, dt);
      if (rpmPct > 0.6) { ai.phase = "charge"; ai.phaseTimer = 0; }
    } else {
      steerTo(entity, toTarget, trn, dt);
      thrust(entity, spd, dt);
      if (d < 90 || rpmPct < 0.2) { ai.phase = "retreat"; ai.retreatTimer = 1.0; }
    }
  } else {
    steerTo(entity, toTarget, trn, dt);
    applyApproach(entity, spd, d, 120, dt);
  }

  const wa = wallAvoidAngle(entity, state.arenaW, state.arenaH);
  if (wa !== null) steerTo(entity, wa, trn * 0.7, dt);
}

function applyApproach(entity: RobotEntity, spd: number, d: number, closeRange: number, dt: number) {
  if (d > closeRange) thrust(entity, spd * 0.85, dt);
  else thrust(entity, spd * 0.3, dt);
}

// ── Player Input ───────────────────────────────────────────────────────────────
function updatePlayerInput(state: GameState, entity: RobotEntity, dt: number) {
  const { keys } = state;
  const dm = componentSpeedMult(entity.drive);
  const spd = entity.spec.maxSpeed * dm;
  const trn = entity.spec.turnRate * dm;

  const fwd = (keys.has("w") || keys.has("arrowup")) ? 1
    : (keys.has("s") || keys.has("arrowdown")) ? -1 : 0;
  const rot = (keys.has("d") || keys.has("arrowright")) ? 1
    : (keys.has("a") || keys.has("arrowleft")) ? -1 : 0;

  if (fwd) thrust(entity, spd * fwd, dt);
  // A turns counter-clockwise (left), D turns clockwise (right)
  if (rot) entity.angularVel += trn * rot * dt * ANGULAR_SCALE;

  const weaponInput = keys.has("shift") || state.mouseDown;
  if (weaponInput) entity.weaponThrottle = Math.min(1, entity.weaponThrottle + dt * 2.5);
  else entity.weaponThrottle = Math.max(0, entity.weaponThrottle - dt * 1.0);

  if (
    entity.spec.weaponType === "hammer" &&
    weaponInput &&
    entity.hammerState === "ready" &&
    entity.hammerCooldown <= 0 &&
    componentStatus(entity.weapon) !== "disabled"
  ) {
    entity.hammerState = "striking";
    entity.hammerTimer = 0.18;
    entity.hammerAngle = -Math.PI * 0.6;
    entity.hammerCooldown = entity.spec.id === "beta" ? 2.2 : 1.6;
  }
}

// ── Win / Match ────────────────────────────────────────────────────────────────
function robotScore(e: RobotEntity): number {
  return (
    (e.armor.currentHP / e.armor.maxHP) * 60 +
    (e.drive.currentHP / e.drive.maxHP) * 25 +
    (e.weapon.currentHP / e.weapon.maxHP) * 15
  );
}

function checkWinConditions(state: GameState) {
  const { match, player: p, opponent: o } = state;
  if (match.phase !== "fighting") return;

  const pDead = !p.isAlive || p.armor.currentHP <= 0;
  const oDead = !o.isAlive || o.armor.currentHP <= 0;
  if (pDead) { match.phase = "ended"; match.winner = "opponent"; match.winReason = "KO — your chassis was destroyed!"; return; }
  if (oDead) { match.phase = "ended"; match.winner = "player"; match.winReason = `KO — ${o.spec.name} destroyed!`; return; }

  const pImm = componentStatus(p.drive) === "disabled";
  const oImm = componentStatus(o.drive) === "disabled";
  if (pImm && !oImm) { match.phase = "ended"; match.winner = "opponent"; match.winReason = "Immobility — drive system destroyed!"; return; }
  if (oImm && !pImm) { match.phase = "ended"; match.winner = "player"; match.winReason = `Immobility — ${o.spec.name} can't move!`; return; }

  if (match.timeRemaining <= 0) {
    const ps = robotScore(p);
    const os = robotScore(o);
    match.phase = "ended";
    if (ps > os + 2) { match.winner = "player"; match.winReason = `Judge's decision — ${ps.toFixed(0)} vs ${os.toFixed(0)} pts`; }
    else if (os > ps + 2) { match.winner = "opponent"; match.winReason = `Judge's decision — ${os.toFixed(0)} vs ${ps.toFixed(0)} pts`; }
    else { match.winner = "draw"; match.winReason = "Draw — too close to call!"; }
  }
}

function updateDamageSmokeEffects(state: GameState, dt: number) {
  for (const e of [state.player, state.opponent]) {
    if (!e.isAlive) continue;
    const status = componentStatus(e.armor);
    if (status === "critical" && Math.random() < dt * 6) smoke(state, e.x, e.y);
    if (status === "disabled" && Math.random() < dt * 15) smoke(state, e.x, e.y, 2);
  }
}

// ── Build State ────────────────────────────────────────────────────────────────
export function buildInitialState(
  playerSpec: RobotSpec,
  opponentSpec: RobotSpec,
): GameState {
  const arenaW = 860;
  const arenaH = 860;

  const makeEntity = (spec: RobotSpec, x: number, y: number, angle: number): RobotEntity => ({
    spec,
    x, y, angle,
    vx: 0, vy: 0, angularVel: 0,
    armor: makeComp(spec.armorQuality),
    drive: makeComp(spec.driveQuality),
    weapon: makeComp(spec.weaponQuality),
    weaponRPM: 0,
    weaponThrottle: 0,
    hammerState: "ready",
    hammerAngle: -Math.PI * 0.6,
    hammerTimer: 0,
    hammerCooldown: 0,
    knockbackVx: 0, knockbackVy: 0,
    hitFlashUntil: 0,
    lastHitAngle: 0,
    isAlive: true,
    totalDamageTaken: 0,
  });

  // Player on left, facing right (angle=PI/2 → forward=(sin(PI/2),-cos(PI/2))=(1,0))
  // Opponent on right, facing left (angle=-PI/2 → forward=(sin(-PI/2),-cos(-PI/2))=(-1,0))
  return {
    player: makeEntity(playerSpec, arenaW * 0.22, arenaH * 0.5, Math.PI / 2),
    opponent: makeEntity(opponentSpec, arenaW * 0.78, arenaH * 0.5, -Math.PI / 2),
    particles: [],
    arenaW,
    arenaH,
    match: {
      phase: "countdown",
      timeRemaining: MATCH_DURATION,
      countdownTimer: COUNTDOWN_DURATION,
      winner: null,
      winReason: "",
    },
    keys: new Set(),
    mouseX: 0, mouseY: 0,
    mouseDown: false,
    cameraX: 0, cameraY: 0,
    time: 0,
  };
}

// ── Main Update ────────────────────────────────────────────────────────────────
export function updateGame(state: GameState, dt: number): GameState {
  const clampedDt = Math.min(dt, 0.04);
  state.time += clampedDt;

  const { match } = state;

  if (match.phase === "countdown") {
    match.countdownTimer -= clampedDt;
    if (match.countdownTimer <= 0) match.phase = "fighting";
    return state;
  }

  if (match.phase === "ended") return state;

  match.timeRemaining = Math.max(0, match.timeRemaining - clampedDt);

  updatePlayerInput(state, state.player, clampedDt);
  updateOpponentAI(state, state.opponent, state.player, clampedDt);

  updateWeapon(state.player, clampedDt);
  updateWeapon(state.opponent, clampedDt);

  applyPhysics(state.player, state.arenaW, state.arenaH, clampedDt);
  applyPhysics(state.opponent, state.arenaW, state.arenaH, clampedDt);

  checkCollision(state);

  updateDamageSmokeEffects(state, clampedDt);

  // Particle update
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.x += p.vx * clampedDt;
    p.y += p.vy * clampedDt;
    p.vx *= p.type === "smoke" ? 0.97 : 0.94;
    p.vy *= p.type === "smoke" ? 0.97 : 0.94;
    p.life -= clampedDt;
    if (p.life <= 0) state.particles.splice(i, 1);
  }

  checkWinConditions(state);
  return state;
}
