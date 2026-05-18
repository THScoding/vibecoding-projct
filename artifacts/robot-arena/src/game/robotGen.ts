import type { RobotTemplate, BodyShape, WeaponType } from "./types";

const BODY_SHAPES: BodyShape[] = ["square", "hexagon", "triangle"];
const WEAPONS: WeaponType[] = ["cannon", "shotgun", "laser"];

const NAME_PARTS_A = [
  "IRON", "STEEL", "TITAN", "VENOM", "NOVA", "APEX", "BLAZE", "DOOM",
  "FURY", "GHOST", "HAVOC", "INFERNO", "JADE", "KRAKEN", "LUNA",
];
const NAME_PARTS_B = [
  "CLAW", "FANG", "BOLT", "SPIKE", "EDGE", "CORE", "VOID", "STORM",
  "BANE", "PULSE", "WRAITH", "TALON", "SHROUD", "REAPER", "PRIME",
];

const LORE_TEMPLATES = [
  "Built in the scraps of the old wars. Unpredictable. Ruthless.",
  "Engineered for one purpose — total annihilation.",
  "A rogue prototype that escaped the lab. Still hungry.",
  "Decommissioned twice. Still fighting.",
  "The arena is the only home it's ever known.",
  "Upgraded after every battle. Never the same machine twice.",
  "Designed by a child. Perfected by war.",
  "No emotion. No hesitation. Pure machine.",
];

const COLOR_PALETTES = [
  { primary: "#c0392b", accent: "#e74c3c", glow: "#ff6b6b" },
  { primary: "#1a6b8a", accent: "#00b4d8", glow: "#48cae4" },
  { primary: "#1e8449", accent: "#27ae60", glow: "#2ecc71" },
  { primary: "#7d3c98", accent: "#9b59b6", glow: "#c39bd3" },
  { primary: "#b7950b", accent: "#f1c40f", glow: "#f9e04b" },
  { primary: "#884ea0", accent: "#e056fd", glow: "#f368e0" },
  { primary: "#1a5276", accent: "#2196f3", glow: "#64b5f6" },
  { primary: "#7b241c", accent: "#ff5722", glow: "#ff8a65" },
  { primary: "#0e6655", accent: "#1abc9c", glow: "#76d7c4" },
  { primary: "#6e2f1a", accent: "#e67e22", glow: "#f0a500" },
];

function seededRand(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

export function generateRobot(seed: number): RobotTemplate {
  const rand = seededRand(seed);

  const nameA = NAME_PARTS_A[Math.floor(rand() * NAME_PARTS_A.length)];
  const nameB = NAME_PARTS_B[Math.floor(rand() * NAME_PARTS_B.length)];
  const bodyShape = BODY_SHAPES[Math.floor(rand() * BODY_SHAPES.length)];
  const weapon = WEAPONS[Math.floor(rand() * WEAPONS.length)];
  const palette = COLOR_PALETTES[Math.floor(rand() * COLOR_PALETTES.length)];
  const lore = LORE_TEMPLATES[Math.floor(rand() * LORE_TEMPLATES.length)];

  const tier = rand();

  const maxHealth = Math.round(60 + rand() * 90);
  const speed = Math.round(110 + rand() * 100);
  const armor = parseFloat((rand() * 0.45).toFixed(2));
  const size = Math.round(20 + rand() * 12);

  let damage: number;
  let fireRate: number;
  let bulletSpeed: number;

  if (weapon === "cannon") {
    damage = Math.round(20 + rand() * 30);
    fireRate = parseFloat((0.6 + rand() * 0.8).toFixed(2));
    bulletSpeed = Math.round(380 + rand() * 120);
  } else if (weapon === "shotgun") {
    damage = Math.round(8 + rand() * 12);
    fireRate = parseFloat((0.4 + rand() * 0.4).toFixed(2));
    bulletSpeed = Math.round(280 + rand() * 80);
  } else {
    damage = Math.round(6 + rand() * 10);
    fireRate = parseFloat((2 + rand() * 2).toFixed(2));
    bulletSpeed = Math.round(500 + rand() * 200);
  }

  void tier;

  return {
    id: `robot-${seed}`,
    name: `${nameA} ${nameB}`,
    bodyShape,
    primaryColor: palette.primary,
    accentColor: palette.accent,
    glowColor: palette.glow,
    weapon,
    stats: { maxHealth, speed, damage, fireRate, bulletSpeed, armor, size },
    lore,
  };
}

export function generateRobotPool(count: number, baseSeed: number): RobotTemplate[] {
  const pool: RobotTemplate[] = [];
  for (let i = 0; i < count; i++) {
    pool.push(generateRobot(baseSeed + i * 7919));
  }
  return pool;
}

export function generateEnemyRobot(wave: number, index: number): RobotTemplate {
  const seed = wave * 3001 + index * 1009 + 42;
  const base = generateRobot(seed);
  const scale = 1 + (wave - 1) * 0.15;
  return {
    ...base,
    stats: {
      ...base.stats,
      maxHealth: Math.round(base.stats.maxHealth * scale),
      damage: Math.round(base.stats.damage * scale),
      speed: Math.round(base.stats.speed * (1 + (wave - 1) * 0.08)),
      fireRate: parseFloat((base.stats.fireRate * (1 + (wave - 1) * 0.1)).toFixed(2)),
      armor: Math.min(0.7, base.stats.armor + (wave - 1) * 0.05),
    },
  };
}
