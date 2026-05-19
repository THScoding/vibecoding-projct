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
const THRUST_SCALE = 16;
const ANGULAR_SCALE = 14;

// ── Rotational KE & Impact Physics ────────────────────────────────────────────
//
// A spinning weapon bar rotating about its center stores kinetic energy:
//   KE = ½Iω²
//   where I = (1/12) × m_weapon × L²   (moment of inertia, uniform bar)
//   and   ω = 2π × RPM / 60             (angular velocity, rad/s)
//
// At impact the weapon tip has tangential velocity:
//   v_tip = ω × (L/2)
//
// The "effective mass" at the tip — how much of the weapon mass participates
// in the collision impulse — comes from Lagrangian mechanics:
//   m_eff = I / r²  where r = L/2  →  m_eff = m_weapon / 3
//
// Impulse delivered to defender (with steel-on-steel restitution e ≈ 0.55):
//   J = m_eff × v_tip × (1 + e) × rpmPct
//     = (m_weapon/3) × (ω × L/2) × 1.55 × rpmPct
//
// Knockback of defender: Δv = J / m_defender
//
// ── Direction Decomposition ───────────────────────────────────────────────────
// The force direction is NOT purely along the collision normal. The weapon tip's
// velocity vector determines the impulse direction:
//   worldBarAngle = weaponBarAngle + entity.angle   (bar orientation in world)
//   tipDir = (−sin(worldBarAngle), cos(worldBarAngle))  (CCW tip velocity)
//   dotN   = tipDir · normal    → normal (pushback) component fraction
//   dotT   = tipDir · tangent   → tangential (throw) component fraction
//
// Weapon-type mixing ratios:
//   horizontal_spinner: 40% normal, 60% tangential  — signature sideways throw
//   vertical_spinner:   65% normal, 35% tangential
//   drum:               80% normal, 20% tangential  — rapid, forward hits
//
// Damage scales with |dotN|^0.5: glancing hits do ~30% damage with full throw,
// direct hits do 100% damage with mostly pushback.
// ─────────────────────────────────────────────────────────────────────────────

// Weapon mass fraction and bar half-length (game units, approximate)
const WEAPON_MASS_FRAC = 0.18; // weapon ≈ 18% of total robot mass
// Restitution for steel-on-steel impact
const RESTITUTION = 0.55;

function weaponImpulse(attacker: RobotEntity, rpmPct: number): number {
  const { spec } = attacker;
  const mWeapon = spec.mass * WEAPON_MASS_FRAC;
  // Approximate bar half-length from body geometry
  const L2 = spec.weaponType === "horizontal_spinner"
    ? spec.bodyWidth * 0.6 + 12  // bar extends past body width
    : spec.weaponType === "drum"
    ? spec.bodyWidth * 0.44
    : spec.bodyWidth * 0.45;     // vertical disc radius
  const omega = (spec.maxWeaponRPM * 2 * Math.PI / 60) * rpmPct;
  const mEff = mWeapon / 3;
  const vTip = omega * L2;
  return mEff * vTip * (1 + RESTITUTION) * rpmPct;
}

function impactKnockbackDir(
  attacker: RobotEntity,
  nx: number,
  ny: number,
): [number, number] {
  const { spec } = attacker;
  const worldBarAngle = attacker.weaponBarAngle + attacker.angle;
  // Tip velocity direction (CCW rotation)
  const txDir = -Math.sin(worldBarAngle);
  const tyDir = Math.cos(worldBarAngle);

  const dotN = txDir * nx + tyDir * ny;
  const dotT = txDir * (-ny) + tyDir * nx;

  // Mixing ratios by weapon type
  let normalMix: number, tangentMix: number;
  if (spec.weaponType === "horizontal_spinner") {
    normalMix = 0.40; tangentMix = 0.60;
  } else if (spec.weaponType === "drum") {
    normalMix = 0.80; tangentMix = 0.20;
  } else {
    // vertical_spinner
    normalMix = 0.65; tangentMix = 0.35;
  }

  const kbX = nx * normalMix * dotN + (-ny) * tangentMix * dotT;
  const kbY = ny * normalMix * dotN + nx * tangentMix * dotT;
  const mag = Math.sqrt(kbX * kbX + kbY * kbY);
  // Ensure direction always pushes defender away (fallback to pure normal)
  if (mag < 0.05) return [nx, ny];
  return [kbX / mag, kbY / mag];
}

// Global knockback scale — tune here to feel right
const KNOCKBACK_SCALE = 0.72;

// Glancing vs direct hit: scales damage 0.3–1.0 based on how square the hit is
function impactDamageScale(attacker: RobotEntity, nx: number, ny: number): number {
  const worldBarAngle = attacker.weaponBarAngle + attacker.angle;
  const txDir = -Math.sin(worldBarAngle);
  const tyDir = Math.cos(worldBarAngle);
  const dotN = Math.abs(txDir * nx + tyDir * ny);
  // Glancing blow (dotN≈0) → 0.3x damage, full throw
  // Direct hit    (dotN≈1) → 1.0x damage, pushback
  return 0.30 + dotN * 0.70;
}

// ── AI State ──────────────────────────────────────────────────────────────────
type AiPhase = "spinup" | "charge" | "retreat" | "circle" | "approach" | "fire" | "reposition";

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

// Robot front is local -y → world (sin(angle), -cos(angle)).
// steerTo adjusts entity.angle toward the world-space atan2 direction `target`.
function steerTo(entity: RobotEntity, target: number, turn: number, dt: number) {
  const requiredAngle = Math.PI / 2 - target;
  const diff = normAngle(requiredAngle - entity.angle);
  entity.angularVel += Math.sign(diff) * turn * dt * ANGULAR_SCALE;
}

function thrust(entity: RobotEntity, spd: number, dt: number) {
  entity.vx += Math.sin(entity.angle) * spd * dt * THRUST_SCALE;
  entity.vy += -Math.cos(entity.angle) * spd * dt * THRUST_SCALE;
}

// ── Particles ──────────────────────────────────────────────────────────────────
function sparks(
  state: GameState,
  x: number, y: number,
  angle: number,
  count: number,
  intensity: number,
) {
  for (let i = 0; i < count; i++) {
    const a = angle + (Math.random() - 0.5) * Math.PI * 1.6;
    const spd = (140 + Math.random() * 420) * Math.max(0.3, intensity);
    state.particles.push({
      x, y,
      vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
      life: 0.10 + Math.random() * 0.35,
      maxLife: 0.10 + Math.random() * 0.35,
      color: Math.random() > 0.55 ? "#fff9c4" : Math.random() > 0.5 ? "#ffd54f" : "#ff7043",
      size: 1.5 + Math.random() * 3,
      type: "spark",
    });
  }
}

function debris(state: GameState, x: number, y: number, color: string, count: number) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const spd = 60 + Math.random() * 180;
    state.particles.push({
      x, y,
      vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
      life: 0.8 + Math.random() * 1.5,
      maxLife: 0.8 + Math.random() * 1.5,
      color,
      size: 3 + Math.random() * 6,
      type: "debris",
    });
  }
}

function smoke(state: GameState, x: number, y: number, count = 1) {
  for (let i = 0; i < count; i++) {
    state.particles.push({
      x: x + (Math.random() - 0.5) * 22,
      y: y + (Math.random() - 0.5) * 22,
      vx: (Math.random() - 0.5) * 16,
      vy: -14 - Math.random() * 22,
      life: 1.2 + Math.random() * 1.1,
      maxLife: 1.2 + Math.random() * 1.1,
      color: `rgba(${80 + Math.random() * 60 | 0},${80 + Math.random() * 60 | 0},${80 + Math.random() * 60 | 0},0.45)`,
      size: 12 + Math.random() * 18,
      type: "smoke",
    });
  }
}

// ── Part Destruction Events ────────────────────────────────────────────────────
// Called once when a component first drops to zero.
function triggerWeaponDestruction(state: GameState, entity: RobotEntity) {
  if (entity.destroyedParts.weapon) return;
  entity.destroyedParts.weapon = true;
  entity.weaponRPM = 0;
  // Big explosion of sparks from the weapon position
  const frontX = entity.x + Math.sin(entity.angle) * entity.spec.bodyLength * 0.55;
  const frontY = entity.y - Math.cos(entity.angle) * entity.spec.bodyLength * 0.55;
  sparks(state, frontX, frontY, Math.atan2(frontY - entity.y, frontX - entity.x), 30, 1);
  debris(state, frontX, frontY, entity.spec.accentColor, 10);
  smoke(state, frontX, frontY, 3);
}

function triggerTrackDestruction(
  state: GameState,
  entity: RobotEntity,
  side: "left" | "right" | "both",
) {
  const w = entity.spec.bodyWidth;
  // Track positions in local space → world
  const localSides: [number, number][] = side === "both"
    ? [[-w / 2 - 8, 0], [w / 2 + 8, 0]]
    : side === "left"
    ? [[-w / 2 - 8, 0]]
    : [[w / 2 + 8, 0]];

  for (const [lx, ly] of localSides) {
    const wx = entity.x + lx * Math.cos(entity.angle) - ly * Math.sin(entity.angle);
    const wy = entity.y + lx * Math.sin(entity.angle) + ly * Math.cos(entity.angle);
    sparks(state, wx, wy, Math.random() * Math.PI * 2, 14, 0.8);
    debris(state, wx, wy, "#222", 6);
    smoke(state, wx, wy, 2);
  }

  if (side === "left" || side === "both") entity.destroyedParts.leftTrack = true;
  if (side === "right" || side === "both") entity.destroyedParts.rightTrack = true;
}

function triggerArmorBreach(state: GameState, entity: RobotEntity) {
  if (entity.destroyedParts.armorBreached) return;
  entity.destroyedParts.armorBreached = true;
  sparks(state, entity.x, entity.y, 0, 20, 0.9);
  smoke(state, entity.x, entity.y, 2);
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
    // Heavier weapons (higher KE) spin up slightly slower — proportional penalty.
    // KE=55 → ~92% rate, KE=105 → ~80% rate. Keeps it subtle.
    const keSpinScale = Math.max(0.75, 1 - spec.weaponKE * 0.0019);
    const effectiveSpinupRate = spec.weaponSpinupRate * keSpinScale;
    if (disabled) {
      entity.weaponRPM = Math.max(0, entity.weaponRPM - effectiveSpinupRate * 2.5 * dt);
    } else {
      const cap = spec.maxWeaponRPM * (entity.weapon.currentHP / entity.weapon.maxHP);
      const target = entity.weaponThrottle * cap;
      if (entity.weaponRPM < target) {
        entity.weaponRPM = Math.min(target, entity.weaponRPM + effectiveSpinupRate * dt);
      } else {
        entity.weaponRPM = Math.max(target, entity.weaponRPM - effectiveSpinupRate * 0.4 * dt);
      }
    }
    // Track bar rotation for directional knockback calculations
    entity.weaponBarAngle += Math.PI * 2 * (entity.weaponRPM / 60) * dt;
  }
}

// Wall slam: robots flung into walls at high speed take bonus damage
const WALL_SLAM_THRESHOLD = 260; // px/s entry speed that causes damage
const WALL_SLAM_DMG = 0.022;     // damage per px/s above threshold

// ── Physics ────────────────────────────────────────────────────────────────────
function applyPhysics(state: GameState, entity: RobotEntity, arenaW: number, arenaH: number, dt: number) {
  const maxVel = entity.spec.maxSpeed * THRUST_SCALE * 1.8;

  entity.vx += entity.knockbackVx * dt * 60;
  entity.vy += entity.knockbackVy * dt * 60;
  entity.knockbackVx *= KNOCKBACK_DECAY;
  entity.knockbackVy *= KNOCKBACK_DECAY;

  const vel = Math.sqrt(entity.vx ** 2 + entity.vy ** 2);
  if (vel > maxVel) { entity.vx = (entity.vx / vel) * maxVel; entity.vy = (entity.vy / vel) * maxVel; }

  entity.x += entity.vx * dt;
  entity.y += entity.vy * dt;
  entity.angle += entity.angularVel * dt;

  entity.vx *= FRICTION;
  entity.vy *= FRICTION;
  entity.angularVel *= ANGULAR_FRICTION;

  const r = robotRadius(entity) + WALL;

  // Wall collision — check for high-speed slams before bouncing
  function wallSlam(impactVel: number, wallAngle: number) {
    if (impactVel > WALL_SLAM_THRESHOLD) {
      const excess = impactVel - WALL_SLAM_THRESHOLD;
      const slamDmg = excess * WALL_SLAM_DMG;
      entity.armor.currentHP = Math.max(0, entity.armor.currentHP - slamDmg);
      entity.totalDamageTaken += slamDmg;
      sparks(state, entity.x, entity.y, wallAngle, 14 + Math.round(excess * 0.05), 0.9);
      if (excess > 180) debris(state, entity.x, entity.y, entity.spec.primaryColor, 5);
    }
  }

  if (entity.x < r)          { wallSlam(-entity.vx, Math.PI);      entity.x = r;          entity.vx =  Math.abs(entity.vx) * 0.35; }
  if (entity.x > arenaW - r) { wallSlam( entity.vx, 0);            entity.x = arenaW - r; entity.vx = -Math.abs(entity.vx) * 0.35; }
  if (entity.y < r)          { wallSlam(-entity.vy, Math.PI * 1.5); entity.y = r;          entity.vy =  Math.abs(entity.vy) * 0.35; }
  if (entity.y > arenaH - r) { wallSlam( entity.vy, Math.PI * 0.5); entity.y = arenaH - r; entity.vy = -Math.abs(entity.vy) * 0.35; }
}

// ── Hit Location ───────────────────────────────────────────────────────────────
type HitLoc = "front" | "left" | "right" | "rear";

function hitLocation(attacker: RobotEntity, defender: RobotEntity): HitLoc {
  const dx = attacker.x - defender.x;
  const dy = attacker.y - defender.y;
  const fX = Math.sin(defender.angle);
  const fY = -Math.cos(defender.angle);
  const rX = Math.cos(defender.angle);
  const rY = Math.sin(defender.angle);
  const fwd = dx * fX + dy * fY;
  const side = dx * rX + dy * rY;
  const fa = Math.abs(fwd);
  const sa = Math.abs(side);
  if (sa > fa * 1.1) return side > 0 ? "right" : "left";
  return fwd > 0 ? "front" : "rear";
}

// ── Spinner Hit ────────────────────────────────────────────────────────────────
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

  // ── Kinetic energy (already in game units) ────────────────────────────────
  const ke = attacker.spec.weaponKE * rpmPct;
  const armorRed = QUALITY_REDUCTION[defender.armor.quality];
  const loc = hitLocation(attacker, defender);

  // ── Impact angle scales damage: glancing = 30%, square = 100% ─────────────
  const dmgScale = impactDamageScale(attacker, nx, ny);

  // ── Armor damage ──────────────────────────────────────────────────────────
  let armorDmg = ke * 0.40 * dmgScale * (1 - armorRed);
  // ── Component (internal) damage ───────────────────────────────────────────
  const compDmg = ke * 0.28 * dmgScale * (1 - armorRed);

  const prevWeaponHP = defender.weapon.currentHP;
  const prevDriveHP = defender.drive.currentHP;
  const prevArmorHP = defender.armor.currentHP;

  if (loc === "front") {
    // Direct weapon-to-weapon: takes heavy weapon damage
    defender.weapon.currentHP = Math.max(0, defender.weapon.currentHP - compDmg * 1.4);
    armorDmg *= 0.8;
  } else if (loc === "left" || loc === "right") {
    // Side hit: shreds drive system on that side
    defender.drive.currentHP = Math.max(0, defender.drive.currentHP - compDmg * 1.3);
    armorDmg *= 0.9;
  } else {
    // Rear hit: chassis takes extra, internals exposed
    armorDmg *= 1.45;
    defender.weapon.currentHP = Math.max(0, defender.weapon.currentHP - compDmg * 0.35);
    defender.drive.currentHP = Math.max(0, defender.drive.currentHP - compDmg * 0.35);
  }

  // Weapon-type modifiers
  if (attacker.spec.weaponType === "horizontal_spinner") armorDmg *= 1.15;
  else if (attacker.spec.weaponType === "vertical_spinner") armorDmg *= 1.30;
  // drum does less armor damage per hit but ignores some reduction (rapid multi-hit)
  else if (attacker.spec.weaponType === "drum") armorDmg *= 0.75;

  defender.armor.currentHP = Math.max(0, defender.armor.currentHP - armorDmg);
  defender.totalDamageTaken += armorDmg + compDmg;

  // ── Physics-based directional knockback ───────────────────────────────────
  const J = weaponImpulse(attacker, rpmPct);
  const [kbNx, kbNy] = impactKnockbackDir(attacker, nx, ny);
  const kbSpd = (J / defender.spec.mass) * KNOCKBACK_SCALE;

  defender.knockbackVx = kbNx * kbSpd;
  defender.knockbackVy = kbNy * kbSpd;
  // Angular spin from off-center impact
  defender.angularVel += (Math.random() - 0.5) * ke * 1.0 / defender.spec.mass;

  // Attacker recoil (Newton's 3rd law — weapon slows, robot kicks back)
  attacker.knockbackVx = -nx * kbSpd * 0.30;
  attacker.knockbackVy = -ny * kbSpd * 0.30;
  // RPM loss proportional to defender's armor quality
  attacker.weaponRPM *= Math.max(0, 1 - (0.30 + (1 - armorRed) * 0.28));

  defender.hitFlashUntil = now + 180;
  defender.lastHitAngle = Math.atan2(ny, nx);
  defender.lastHitSide = loc;

  // ── Part destruction checks ───────────────────────────────────────────────
  // Weapon destroyed
  if (prevWeaponHP > 0 && defender.weapon.currentHP <= 0) {
    triggerWeaponDestruction(state, defender);
  }
  // Track destruction — individual side if drive critical from side hit
  if (prevDriveHP > 0 && defender.drive.currentHP <= 0) {
    triggerTrackDestruction(state, defender, "both");
  } else if (defender.drive.currentHP / defender.drive.maxHP < 0.30) {
    if (loc === "left" && !defender.destroyedParts.leftTrack) {
      triggerTrackDestruction(state, defender, "left");
    } else if (loc === "right" && !defender.destroyedParts.rightTrack) {
      triggerTrackDestruction(state, defender, "right");
    }
  }
  // Armor breach when first dropping below 20%
  if (prevArmorHP / defender.armor.maxHP >= 0.20 &&
    defender.armor.currentHP / defender.armor.maxHP < 0.20) {
    triggerArmorBreach(state, defender);
  }

  // ── Visual effects ────────────────────────────────────────────────────────
  const sparkCount = 16 + Math.round(ke * 0.35 * dmgScale);
  sparks(state, cx, cy, Math.atan2(kbNy, kbNx), sparkCount, rpmPct * dmgScale);
  if (armorDmg > 5) {
    debris(state, cx, cy, defender.spec.primaryColor, Math.round(armorDmg * 0.22 + 2));
  }
  if (componentStatus(defender.armor) === "critical") smoke(state, defender.x, defender.y);

  // ── KO ────────────────────────────────────────────────────────────────────
  if (defender.armor.currentHP <= 0) {
    defender.isAlive = false;
    sparks(state, defender.x, defender.y, 0, 70, 1);
    debris(state, defender.x, defender.y, defender.spec.primaryColor, 24);
    smoke(state, defender.x, defender.y, 6);
  }
}

// ── Hammer Hit ─────────────────────────────────────────────────────────────────
function applyHammerHit(
  state: GameState,
  attacker: RobotEntity,
  defender: RobotEntity,
  now: number,
  cx: number,
  cy: number,
) {
  if (now < defender.hitFlashUntil) return;
  // Fire from the moment the arm starts swinging (lower threshold = easier to land)
  if (attacker.hammerAngle < Math.PI * 0.12) return;

  const ke = attacker.spec.weaponKE;
  const armorRed = QUALITY_REDUCTION[defender.armor.quality];
  const wepQRed = QUALITY_REDUCTION[attacker.weapon.quality];

  // Hammer damage: pneumatic strike — high single-hit damage scaled by weapon quality
  // Base: ke × 0.85, reduced by armor, boosted by weapon quality
  let dmg = ke * 0.85 * (1 - armorRed * 0.7) * (1 + wepQRed * 0.8);
  const prevDriveHP = defender.drive.currentHP;
  const prevWeaponHP = defender.weapon.currentHP;
  const prevArmorHP = defender.armor.currentHP;

  if (attacker.weapon.quality === "titanium") {
    dmg *= 1.35;
    // Titanium AP: ignores a portion of armor reduction and hits internals directly
    const r = Math.random();
    if (r < 0.40) defender.drive.currentHP = Math.max(0, defender.drive.currentHP - dmg * 0.50);
    else if (r < 0.72) defender.weapon.currentHP = Math.max(0, defender.weapon.currentHP - dmg * 0.50);
  } else if (attacker.weapon.quality === "premium") {
    // Premium: occasional internal hit
    if (Math.random() < 0.25) {
      defender.drive.currentHP = Math.max(0, defender.drive.currentHP - dmg * 0.30);
    }
  }

  defender.armor.currentHP = Math.max(0, defender.armor.currentHP - dmg);
  defender.totalDamageTaken += dmg;
  defender.hitFlashUntil = now + 200;

  // Knockback: hammer drives down, so push is mostly in attacker's forward direction
  const hammerFwdX = Math.sin(attacker.angle);
  const hammerFwdY = -Math.cos(attacker.angle);
  const kbSpd = (ke * 4.5) / defender.spec.mass;
  defender.knockbackVx = hammerFwdX * kbSpd * 0.7 + (Math.random() - 0.5) * kbSpd * 0.3;
  defender.knockbackVy = hammerFwdY * kbSpd * 0.7 + (Math.random() - 0.5) * kbSpd * 0.3;
  defender.angularVel += (Math.random() - 0.5) * ke * 0.9 / defender.spec.mass;
  defender.lastHitSide = hitLocation(attacker, defender);

  // Part destruction
  if (prevWeaponHP > 0 && defender.weapon.currentHP <= 0) triggerWeaponDestruction(state, defender);
  if (prevDriveHP > 0 && defender.drive.currentHP <= 0) triggerTrackDestruction(state, defender, "both");
  if (prevArmorHP / defender.armor.maxHP >= 0.20 &&
    defender.armor.currentHP / defender.armor.maxHP < 0.20) {
    triggerArmorBreach(state, defender);
  }

  const impactAngle = Math.atan2(hammerFwdY, hammerFwdX);
  sparks(state, cx, cy, impactAngle, 22, 0.85);
  debris(state, cx, cy, "#607d8b", 8);
  if (dmg > 20) smoke(state, cx, cy);

  if (defender.armor.currentHP <= 0) {
    defender.isAlive = false;
    sparks(state, defender.x, defender.y, 0, 55, 1);
    debris(state, defender.x, defender.y, defender.spec.primaryColor, 20);
    smoke(state, defender.x, defender.y, 5);
  }
}

// ── Flipper / Lifter Hit ───────────────────────────────────────────────────────
// A real flipper works like this:
//  1. Bot drives its wedge/fork UNDER the opponent (approaching from front or side)
//  2. Hydraulic arm fires — opponent is hurled into the air (massive velocity impulse)
//  3. Opponent slams into the wall or arena floor for bonus damage
//  4. Hydraulics must repressurize before next flip (~2s cooldown)
//
// In 2D we simulate this as:
//  - Active flip (throttle held): launch defender in attacker's forward direction
//    at ~1000 px/s — they slide across the arena and slam the wall
//  - Passive contact (no throttle): gentle wedge push, no damage
function applyLifterHit(
  state: GameState,
  attacker: RobotEntity,
  defender: RobotEntity,
  nx: number,
  ny: number,
  now: number,
  cx: number,
  cy: number,
) {
  const flipReady = attacker.hammerCooldown <= 0;
  const active = attacker.weaponThrottle > 0.45 && flipReady;

  if (active) {
    // ── Full hydraulic launch ─────────────────────────────────────────────────
    // Direction: attacker's facing forward + collision normal blend (wedge geometry)
    const fwdX = Math.sin(attacker.angle);
    const fwdY = -Math.cos(attacker.angle);
    // Blend facing with normal so glancing approaches still launch outward
    const blendX = fwdX * 0.65 + nx * 0.35;
    const blendY = fwdY * 0.65 + ny * 0.35;
    const blendMag = Math.sqrt(blendX * blendX + blendY * blendY);
    const launchX = blendMag > 0.01 ? blendX / blendMag : nx;
    const launchY = blendMag > 0.01 ? blendY / blendMag : ny;

    // Launch velocity: scales with weaponKE, divided by mass
    const launchSpd = (attacker.spec.weaponKE * 18) / defender.spec.mass;
    defender.knockbackVx = launchX * launchSpd;
    defender.knockbackVy = launchY * launchSpd;
    // Tumble through the air
    defender.angularVel += (Math.random() - 0.5) * 5.5;
    defender.hitFlashUntil = now + 250;
    defender.lastHitSide = hitLocation(attacker, defender);

    // Damage on the launch itself (wedge getting under and lifting is traumatic)
    const ke = attacker.spec.weaponKE;
    const armorRed = QUALITY_REDUCTION[defender.armor.quality];
    const dmg = ke * 0.42 * (1 - armorRed * 0.5);
    const prevArmorHP = defender.armor.currentHP;
    defender.armor.currentHP = Math.max(0, defender.armor.currentHP - dmg);
    defender.totalDamageTaken += dmg;

    if (prevArmorHP / defender.armor.maxHP >= 0.20 &&
      defender.armor.currentHP / defender.armor.maxHP < 0.20) {
      triggerArmorBreach(state, defender);
    }

    // Attacker recoil (hydraulics push back on the chassis)
    attacker.knockbackVx = -launchX * launchSpd * 0.18;
    attacker.knockbackVy = -launchY * launchSpd * 0.18;

    // Hydraulic repressurize cooldown (~2s)
    attacker.hammerCooldown = 2.0;

    // Big launch effects
    sparks(state, cx, cy, Math.atan2(launchY, launchX), 24, 1.0);
    debris(state, cx, cy, defender.spec.primaryColor, 10);

    if (defender.armor.currentHP <= 0) {
      defender.isAlive = false;
      sparks(state, defender.x, defender.y, 0, 60, 1);
      debris(state, defender.x, defender.y, defender.spec.primaryColor, 22);
      smoke(state, defender.x, defender.y, 5);
    }

  } else if (!active) {
    // ── Passive wedge contact — gentle shove, no damage ──────────────────────
    if (now < defender.hitFlashUntil) return;
    const pushSpd = 80 / defender.spec.mass;
    defender.knockbackVx = nx * pushSpd;
    defender.knockbackVy = ny * pushSpd;
    defender.hitFlashUntil = now + 60;
    sparks(state, cx, cy, Math.atan2(ny, nx), 4, 0.18);
  }

  void ny; // used above via nx/ny blend
}

// ── Collision ─────────────────────────────────────────────────────────────────
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

  // Rigid body physical impulse (always, regardless of weapons)
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

function applyApproach(entity: RobotEntity, spd: number, d: number, closeRange: number, dt: number) {
  if (d > closeRange) thrust(entity, spd * 0.85, dt);
  else thrust(entity, spd * 0.3, dt);
}

function updateOpponentAI(state: GameState, entity: RobotEntity, target: RobotEntity, dt: number) {
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
    // ── Hammer AI: dash in → strike → escape → reset ─────────────────────────
    // Real hammer drivers charge fast, fire at close range, and immediately
    // back away so they can line up another run.
    entity.weaponThrottle = 1;

    if (ai.phase === "retreat") {
      // Back away after a strike to reset for the next charge
      ai.retreatTimer -= dt;
      steerTo(entity, toTarget + Math.PI, trn, dt);
      thrust(entity, -spd * 0.9, dt);
      if (ai.retreatTimer <= 0) { ai.phase = "approach"; ai.phaseTimer = 0; }

    } else if (ai.phase === "fire") {
      // Keep driving into opponent while hammer swings
      steerTo(entity, toTarget, trn * 1.3, dt);
      thrust(entity, spd * 0.4, dt);
      ai.phaseTimer += dt;
      // After arm completes retract, escape
      if (entity.hammerState === "ready" && ai.phaseTimer > 0.3) {
        ai.phase = "retreat";
        ai.retreatTimer = 0.7 + Math.random() * 0.4;
        ai.phaseTimer = 0;
      }

    } else {
      // Approach: aim and close distance
      steerTo(entity, toTarget, trn, dt);
      // Close range: dash in at full speed
      const dashRange = 180;
      if (d > dashRange) {
        thrust(entity, spd * 0.82, dt);
      } else {
        // Dash at full speed to close gap
        thrust(entity, spd, dt);
      }
      // Fire when close enough and hammer ready
      if (d < 110 && entity.hammerCooldown <= 0 && componentStatus(entity.weapon) !== "disabled") {
        entity.hammerState = "striking";
        entity.hammerTimer = 0.16;
        entity.hammerAngle = -Math.PI * 0.6;
        entity.hammerCooldown = spec.id === "beta" ? 1.8 : 1.2;
        ai.phase = "fire"; ai.phaseTimer = 0;
      }
    }

  } else if (spec.drivingStyle === "control" && spec.weaponType === "lifter") {
    // ── Flipper AI: get under → launch → reposition → repeat ─────────────────
    // Real flipper drivers (like Hydra) try to get their fork UNDER the opponent,
    // then fire the hydraulic arm to send them into the wall.

    if (ai.phase === "reposition") {
      // Back off after a flip so we can set up the next run
      entity.weaponThrottle = 0;
      ai.retreatTimer -= dt;
      steerTo(entity, toTarget + Math.PI, trn, dt);
      thrust(entity, -spd * 0.85, dt);
      if (ai.retreatTimer <= 0 || d > 260) { ai.phase = "approach"; ai.phaseTimer = 0; }

    } else if (ai.phase === "fire" || (d < 110 && entity.hammerCooldown <= 0)) {
      // In contact range: drive in hard with flipper active
      steerTo(entity, toTarget, trn * 1.4, dt);
      thrust(entity, spd * 1.1, dt);
      entity.weaponThrottle = 1;
      ai.phaseTimer += dt;
      // After a moment, reposition for another run
      if (ai.phaseTimer > 0.55 || entity.hammerCooldown > 0.1) {
        ai.phase = "reposition";
        ai.retreatTimer = 1.0 + Math.random() * 0.5;
        ai.phaseTimer = 0;
      }

    } else {
      // Approach: close in from a slight angle to get the fork under the opponent
      entity.weaponThrottle = 0;
      ai.phaseTimer = 0;
      // Slightly off-center approach so fork catches the opponent's side
      const sideOffset = (Math.PI * 0.18) * ai.circleDir;
      const approachAngle = d > 200 ? toTarget : toTarget + sideOffset;
      steerTo(entity, approachAngle, trn, dt);
      thrust(entity, spd * (d > 150 ? 1.0 : 0.8), dt);
      if (d < 110 && entity.hammerCooldown <= 0) { ai.phase = "fire"; ai.phaseTimer = 0; }
    }

  } else if (spec.drivingStyle === "opportunistic") {
    entity.weaponThrottle = 1;
    if (ai.phase === "retreat") {
      ai.retreatTimer -= dt;
      steerTo(entity, toTarget + Math.PI * 0.9, trn, dt);
      thrust(entity, -spd * 0.75, dt);
      if (ai.retreatTimer <= 0) {
        ai.phase = "circle"; ai.phaseTimer = 0;
        ai.circleDir = (ai.circleDir * -1) as 1 | -1;
      }
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
    entity.hammerCooldown = entity.spec.id === "beta" ? 1.8 : 1.2;
  }
}

// ── Win Conditions ─────────────────────────────────────────────────────────────
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
    const armorStatus = componentStatus(e.armor);
    if (armorStatus === "critical" && Math.random() < dt * 7) smoke(state, e.x, e.y);
    if (armorStatus === "disabled" && Math.random() < dt * 18) smoke(state, e.x, e.y, 2);
    // Destroyed tracks emit occasional sparks
    if (e.destroyedParts.leftTrack && Math.random() < dt * 3) {
      const wx = e.x - Math.cos(e.angle) * e.spec.bodyWidth * 0.55;
      const wy = e.y - Math.sin(e.angle) * e.spec.bodyWidth * 0.55;
      sparks(state, wx, wy, Math.random() * Math.PI * 2, 3, 0.4);
    }
    if (e.destroyedParts.rightTrack && Math.random() < dt * 3) {
      const wx = e.x + Math.cos(e.angle) * e.spec.bodyWidth * 0.55;
      const wy = e.y + Math.sin(e.angle) * e.spec.bodyWidth * 0.55;
      sparks(state, wx, wy, Math.random() * Math.PI * 2, 3, 0.4);
    }
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
    weaponBarAngle: 0,
    hammerState: "ready",
    hammerAngle: -Math.PI * 0.6,
    hammerTimer: 0,
    hammerCooldown: 0,
    knockbackVx: 0, knockbackVy: 0,
    hitFlashUntil: 0,
    lastHitAngle: 0,
    lastHitSide: "front",
    isAlive: true,
    totalDamageTaken: 0,
    destroyedParts: {
      weapon: false,
      leftTrack: false,
      rightTrack: false,
      armorBreached: false,
    },
  });

  return {
    player: makeEntity(playerSpec, arenaW * 0.22, arenaH * 0.5, Math.PI / 2),
    opponent: makeEntity(opponentSpec, arenaW * 0.78, arenaH * 0.5, -Math.PI / 2),
    particles: [],
    arenaW, arenaH,
    match: {
      phase: "countdown",
      timeRemaining: MATCH_DURATION,
      countdownTimer: COUNTDOWN_DURATION,
      winner: null,
      winReason: "",
    },
    keys: new Set(),
    mouseX: 0, mouseY: 0, mouseDown: false,
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

  applyPhysics(state, state.player, state.arenaW, state.arenaH, clampedDt);
  applyPhysics(state, state.opponent, state.arenaW, state.arenaH, clampedDt);

  checkCollision(state);
  updateDamageSmokeEffects(state, clampedDt);

  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.x += p.vx * clampedDt;
    p.y += p.vy * clampedDt;
    p.vx *= p.type === "smoke" ? 0.97 : 0.93;
    p.vy *= p.type === "smoke" ? 0.97 : 0.93;
    p.life -= clampedDt;
    if (p.life <= 0) state.particles.splice(i, 1);
  }

  checkWinConditions(state);
  return state;
}
