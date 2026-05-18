export type BodyShape = "square" | "hexagon" | "triangle";
export type WeaponType = "cannon" | "shotgun" | "laser";
export type AiState = "patrol" | "chase" | "attack" | "retreat";

export interface RobotTemplate {
  id: string;
  name: string;
  bodyShape: BodyShape;
  primaryColor: string;
  accentColor: string;
  glowColor: string;
  weapon: WeaponType;
  stats: {
    maxHealth: number;
    speed: number;
    damage: number;
    fireRate: number;
    bulletSpeed: number;
    armor: number;
    size: number;
  };
  lore: string;
}

export interface RobotEntity {
  template: RobotTemplate;
  x: number;
  y: number;
  angle: number;
  turretAngle: number;
  health: number;
  lastShot: number;
  invincibleUntil: number;
  aiState: AiState;
  patrolTargetX: number;
  patrolTargetY: number;
  patrolTimer: number;
}

export interface Bullet {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  owner: "player" | "enemy";
  ttl: number;
  maxTtl: number;
  weapon: WeaponType;
  size: number;
  color: string;
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
}

export interface Obstacle {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GameState {
  player: RobotEntity;
  enemies: RobotEntity[];
  bullets: Bullet[];
  particles: Particle[];
  obstacles: Obstacle[];
  cameraX: number;
  cameraY: number;
  arenaW: number;
  arenaH: number;
  wave: number;
  score: number;
  keys: Set<string>;
  mouseX: number;
  mouseY: number;
  mouseDown: boolean;
  phase: "playing" | "victory" | "defeat";
  time: number;
}
