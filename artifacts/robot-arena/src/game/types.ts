export type WeaponType = "horizontal_spinner" | "vertical_spinner" | "drum" | "hammer" | "lifter";
export type ComponentQuality = "budget" | "standard" | "premium" | "titanium";
export type DrivingStyle = "aggressive" | "control" | "cautious" | "opportunistic";
export type HammerState = "ready" | "striking" | "retracting";

export interface ComponentSpec {
  quality: ComponentQuality;
  maxHP: number;
  currentHP: number;
}

export function componentStatus(c: ComponentSpec): "functional" | "damaged" | "critical" | "disabled" {
  const pct = c.currentHP / c.maxHP;
  if (pct <= 0) return "disabled";
  if (pct < 0.25) return "critical";
  if (pct < 0.6) return "damaged";
  return "functional";
}

export function componentSpeedMult(c: ComponentSpec): number {
  const s = componentStatus(c);
  if (s === "disabled") return 0;
  if (s === "critical") return 0.35;
  if (s === "damaged") return 0.65;
  return 1.0;
}

export const QUALITY_HP: Record<ComponentQuality, number> = {
  budget: 60,
  standard: 80,
  premium: 100,
  titanium: 130,
};

export const QUALITY_REDUCTION: Record<ComponentQuality, number> = {
  budget: 0,
  standard: 0.10,
  premium: 0.22,
  titanium: 0.35,
};

export const QUALITY_LABEL: Record<ComponentQuality, string> = {
  budget: "BUDGET",
  standard: "STANDARD",
  premium: "PREMIUM",
  titanium: "TITANIUM",
};

// ── Destroyed Parts ────────────────────────────────────────────────────────────
// Tracks *visually* which parts have been physically wrecked.
// weapon: spinner/hammer physically gone or dangling
// leftTrack / rightTrack: individual track pods torn off
// armorBreached: hull holed, internals exposed
export interface DestroyedParts {
  weapon: boolean;
  leftTrack: boolean;
  rightTrack: boolean;
  armorBreached: boolean;
}

export interface RobotSpec {
  id: string;
  name: string;
  realInspiration: string;
  description: string;
  drivingStyle: DrivingStyle;
  weaponType: WeaponType;
  weaponDescription: string;
  armorQuality: ComponentQuality;
  driveQuality: ComponentQuality;
  weaponQuality: ComponentQuality;
  maxSpeed: number;
  turnRate: number;
  maxWeaponRPM: number;
  weaponSpinupRate: number;
  weaponKE: number;
  mass: number;
  bodyWidth: number;
  bodyLength: number;
  primaryColor: string;
  accentColor: string;
  trimColor: string;
}

export interface RobotEntity {
  spec: RobotSpec;
  x: number;
  y: number;
  angle: number;
  vx: number;
  vy: number;
  angularVel: number;
  armor: ComponentSpec;
  drive: ComponentSpec;
  weapon: ComponentSpec;
  weaponRPM: number;
  weaponThrottle: number;
  // Weapon bar rotation angle accumulated in local space (for directional knockback)
  weaponBarAngle: number;
  hammerState: HammerState;
  hammerAngle: number;
  hammerTimer: number;
  hammerCooldown: number;
  knockbackVx: number;
  knockbackVy: number;
  hitFlashUntil: number;
  lastHitAngle: number;
  // Which side last took a major hit (used for asymmetric track damage rendering)
  lastHitSide: "left" | "right" | "front" | "rear";
  isAlive: boolean;
  totalDamageTaken: number;
  destroyedParts: DestroyedParts;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  type: "spark" | "debris" | "smoke";
}

export interface MatchState {
  phase: "countdown" | "fighting" | "ended";
  timeRemaining: number;
  countdownTimer: number;
  winner: "player" | "opponent" | "draw" | null;
  winReason: string;
}

export interface GameState {
  player: RobotEntity;
  opponent: RobotEntity;
  particles: Particle[];
  arenaW: number;
  arenaH: number;
  match: MatchState;
  keys: Set<string>;
  mouseX: number;
  mouseY: number;
  mouseDown: boolean;
  cameraX: number;
  cameraY: number;
  time: number;
}
