import { useState, useEffect, useRef } from "react";
import type { RobotTemplate, BodyShape } from "../game/types";
import { generateRobotPool } from "../game/robotGen";

interface Props {
  onSelect: (template: RobotTemplate) => void;
}

function RobotCanvas({ template, size = 120 }: { template: RobotTemplate; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    let angle = 0;
    let turretAngle = 0;

    const draw = (t: number) => {
      angle = Math.sin(t * 0.001) * 0.3;
      turretAngle = t * 0.001;

      ctx.clearRect(0, 0, size, size);

      const cx = size / 2;
      const cy = size / 2;
      const s = template.stats.size * 1.6;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);

      ctx.shadowColor = template.glowColor;
      ctx.shadowBlur = 18;

      drawShape(ctx, template.bodyShape, s, template.primaryColor, template.accentColor);

      ctx.save();
      ctx.rotate(turretAngle - angle);
      ctx.shadowColor = template.glowColor;
      ctx.shadowBlur = 12;
      ctx.fillStyle = template.accentColor;
      const w = template.weapon;
      if (w === "cannon") {
        ctx.fillRect(-4, -s * 0.85, 8, -s * 1.0);
      } else if (w === "shotgun") {
        ctx.fillRect(-6, -s * 0.85, 5, -s * 0.8);
        ctx.fillRect(1, -s * 0.85, 5, -s * 0.8);
      } else {
        ctx.fillRect(-2, -s * 0.85, 4, -s * 1.3);
      }
      ctx.restore();

      ctx.restore();

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [template, size]);

  return <canvas ref={canvasRef} width={size} height={size} />;
}

function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: BodyShape,
  s: number,
  primary: string,
  accent: string,
) {
  if (shape === "square") {
    ctx.beginPath();
    ctx.rect(-s, -s, s * 2, s * 2);
  } else if (shape === "hexagon") {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      const px = Math.cos(a) * s * 1.1;
      const py = Math.sin(a) * s * 1.1;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  } else {
    ctx.beginPath();
    ctx.moveTo(0, -s * 1.3);
    ctx.lineTo(s * 1.15, s * 0.9);
    ctx.lineTo(-s * 1.15, s * 0.9);
    ctx.closePath();
  }
  ctx.fillStyle = primary;
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2.5;
  ctx.stroke();
}

function StatBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.min(1, value / max) * 100;
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 font-mono w-16 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
        />
      </div>
    </div>
  );
}

const WEAPON_LABELS: Record<string, string> = {
  cannon: "CANNON",
  shotgun: "SHOTGUN",
  laser: "LASER",
};
const SHAPE_LABELS: Record<string, string> = {
  square: "CHASSIS: QUAD",
  hexagon: "CHASSIS: HEX",
  triangle: "CHASSIS: TRI",
};

export default function SelectionScreen({ onSelect }: Props) {
  const [robots, setRobots] = useState<RobotTemplate[]>([]);
  const [selected, setSelected] = useState<number>(0);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 100000));

  useEffect(() => {
    setRobots(generateRobotPool(6, seed));
    setSelected(0);
  }, [seed]);

  const reroll = () => setSeed(Math.floor(Math.random() * 100000));

  const bot = robots[selected];

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{
        background: "radial-gradient(ellipse at center, #0d1117 0%, #060810 100%)",
        fontFamily: "'Courier New', monospace",
      }}
    >
      <div className="mb-8 text-center">
        <h1
          className="text-5xl font-bold tracking-widest mb-2"
          style={{ color: "#00e5ff", textShadow: "0 0 30px #00e5ff, 0 0 60px #00b4d8" }}
        >
          ROBOT ARENA
        </h1>
        <p className="text-gray-500 text-sm tracking-widest">SELECT YOUR COMBAT UNIT</p>
      </div>

      <div className="flex gap-8 w-full max-w-5xl">
        <div className="flex-1">
          <div className="grid grid-cols-3 gap-3">
            {robots.map((bot, i) => (
              <button
                key={bot.id}
                onClick={() => setSelected(i)}
                className="relative rounded-lg p-3 text-left transition-all duration-200 overflow-hidden"
                style={{
                  background: selected === i
                    ? `linear-gradient(135deg, ${bot.primaryColor}33, ${bot.accentColor}22)`
                    : "rgba(255,255,255,0.03)",
                  border: selected === i
                    ? `1.5px solid ${bot.accentColor}`
                    : "1.5px solid rgba(255,255,255,0.08)",
                  boxShadow: selected === i ? `0 0 20px ${bot.glowColor}44` : "none",
                }}
              >
                <div className="flex justify-center mb-1">
                  <RobotCanvas template={bot} size={72} />
                </div>
                <p
                  className="text-center text-xs font-bold truncate"
                  style={{ color: selected === i ? bot.accentColor : "#888" }}
                >
                  {bot.name}
                </p>
                <p className="text-center text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.3)", fontSize: "10px" }}>
                  {WEAPON_LABELS[bot.weapon]}
                </p>
              </button>
            ))}
          </div>

          <button
            onClick={reroll}
            className="mt-4 w-full py-2.5 rounded-lg text-sm font-bold tracking-widest transition-all duration-200"
            style={{
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "rgba(255,255,255,0.5)",
            }}
            onMouseEnter={(e) => {
              (e.target as HTMLElement).style.borderColor = "#00e5ff";
              (e.target as HTMLElement).style.color = "#00e5ff";
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLElement).style.borderColor = "rgba(255,255,255,0.12)";
              (e.target as HTMLElement).style.color = "rgba(255,255,255,0.5)";
            }}
          >
            [ REGENERATE ROSTER ]
          </button>
        </div>

        {bot && (
          <div className="w-72 shrink-0">
            <div
              className="rounded-xl p-5 h-full flex flex-col"
              style={{
                background: `linear-gradient(160deg, ${bot.primaryColor}22, rgba(0,0,0,0.6))`,
                border: `1.5px solid ${bot.accentColor}55`,
                boxShadow: `0 0 40px ${bot.glowColor}22`,
              }}
            >
              <div className="flex justify-center mb-4">
                <RobotCanvas template={bot} size={140} />
              </div>

              <h2
                className="text-xl font-bold text-center mb-1 tracking-wider"
                style={{ color: bot.accentColor, textShadow: `0 0 12px ${bot.glowColor}` }}
              >
                {bot.name}
              </h2>

              <p className="text-center text-xs mb-1" style={{ color: "rgba(255,255,255,0.35)" }}>
                {SHAPE_LABELS[bot.bodyShape]}
              </p>
              <p
                className="text-center text-xs font-bold mb-4 tracking-widest px-2 py-1 rounded"
                style={{ background: `${bot.accentColor}22`, color: bot.accentColor }}
              >
                {WEAPON_LABELS[bot.weapon]}
              </p>

              <div className="space-y-2 mb-4">
                <StatBar label="HEALTH" value={bot.stats.maxHealth} max={150} color="#2ecc71" />
                <StatBar label="SPEED" value={bot.stats.speed} max={210} color="#3498db" />
                <StatBar label="DAMAGE" value={bot.stats.damage} max={50} color="#e74c3c" />
                <StatBar label="FIRE RT" value={bot.stats.fireRate} max={4} color="#f39c12" />
                <StatBar label="ARMOR" value={bot.stats.armor} max={0.7} color="#9b59b6" />
              </div>

              <p className="text-xs italic text-center mb-5 px-2 leading-relaxed"
                style={{ color: "rgba(255,255,255,0.3)" }}>
                "{bot.lore}"
              </p>

              <button
                onClick={() => onSelect(bot)}
                className="w-full py-3 rounded-lg font-bold tracking-widest text-sm transition-all duration-200 mt-auto"
                style={{
                  background: `linear-gradient(135deg, ${bot.primaryColor}, ${bot.accentColor})`,
                  color: "#fff",
                  boxShadow: `0 4px 20px ${bot.glowColor}55`,
                  border: "none",
                }}
                onMouseEnter={(e) => {
                  (e.target as HTMLElement).style.boxShadow = `0 4px 32px ${bot.glowColor}88`;
                  (e.target as HTMLElement).style.transform = "translateY(-1px)";
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLElement).style.boxShadow = `0 4px 20px ${bot.glowColor}55`;
                  (e.target as HTMLElement).style.transform = "translateY(0)";
                }}
              >
                DEPLOY UNIT
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-8 flex gap-8 text-xs text-gray-600 tracking-widest">
        <span>WASD — MOVE</span>
        <span>MOUSE — AIM TURRET</span>
        <span>LEFT CLICK — FIRE</span>
        <span>ESC — RETURN</span>
      </div>
    </div>
  );
}
