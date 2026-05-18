import { useState, useEffect, useRef } from "react";
import type { RobotSpec } from "../game/robots";
import { ROBOT_ROSTER } from "../game/robots";
import { QUALITY_LABEL } from "../game/types";

interface Props {
  onFight: (player: RobotSpec, opponent: RobotSpec) => void;
}

const WEAPON_ICONS: Record<string, string> = {
  horizontal_spinner: "⟳ HORIZONTAL SPINNER",
  vertical_spinner: "⟳ VERTICAL DISC",
  drum: "⟳ DRUM SPINNER",
  hammer: "⚒ HAMMER / AXE",
  lifter: "↑ LIFTER / WEDGE",
};

const STYLE_LABELS: Record<string, string> = {
  aggressive: "AGGRESSIVE",
  control: "CONTROL BOT",
  cautious: "CAUTIOUS",
  opportunistic: "OPPORTUNISTIC",
};

const STYLE_COLORS: Record<string, string> = {
  aggressive: "#f44336",
  control: "#2196f3",
  cautious: "#9c27b0",
  opportunistic: "#ff9800",
};

function RobotPreview({ spec, size = 120 }: { spec: RobotSpec; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    let time = 0;
    let last = 0;

    const loop = (ts: number) => {
      const dt = Math.min((ts - last) / 1000, 0.05);
      last = ts;
      time += dt;
      ctx.clearRect(0, 0, size, size);

      const cx = size / 2;
      const cy = size / 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(Math.sin(time * 0.5) * 0.12);

      const scl = size / 160;
      ctx.scale(scl, scl);

      const rpmPct = Math.min(1, time * 0.4);
      const mockEntity = {
        spec,
        weaponRPM: rpmPct * spec.maxWeaponRPM,
        weaponThrottle: rpmPct,
        hammerState: "ready" as const,
        hammerAngle: -Math.PI * 0.6,
        hammerCooldown: 0,
        armor: { quality: spec.armorQuality, maxHP: 100, currentHP: 100 },
        drive: { quality: spec.driveQuality, maxHP: 100, currentHP: 100 },
        weapon: { quality: spec.weaponQuality, maxHP: 100, currentHP: 100 },
        x: 0, y: 0, angle: 0,
        hitFlashUntil: 0,
        isAlive: true,
        vx: 0, vy: 0, angularVel: 0,
        knockbackVx: 0, knockbackVy: 0,
        lastHitAngle: 0, totalDamageTaken: 0,
        hammerTimer: 0,
        patrolTargetX: 0, patrolTargetY: 0, patrolTimer: 0,
      };

      const { weaponType } = spec;
      drawPreviewBody(ctx, mockEntity as any, time);

      void weaponType;
      ctx.restore();
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [spec, size]);

  return <canvas ref={canvasRef} width={size} height={size} className="block" />;
}

function drawPreviewBody(ctx: CanvasRenderingContext2D, entity: any, time: number) {
  const { spec } = entity;
  const w = spec.bodyWidth * 1.2;
  const l = spec.bodyLength * 1.2;
  const rpmPct = spec.maxWeaponRPM > 0 ? entity.weaponRPM / spec.maxWeaponRPM : 0;

  // Tracks
  ctx.fillStyle = "#222";
  ctx.fillRect(-w / 2 - 8, -l / 2 + 4, 7, l - 8);
  ctx.fillRect(w / 2 + 1, -l / 2 + 4, 7, l - 8);

  // Body
  ctx.shadowColor = spec.accentColor;
  ctx.shadowBlur = 10;
  ctx.fillStyle = spec.primaryColor;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -l / 2, w, l, 5);
  ctx.fill();
  ctx.strokeStyle = spec.accentColor;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Weapon
  if (spec.weaponType === "horizontal_spinner") {
    const barLen = w * 0.65 + 8;
    const barAngle = time * rpmPct * 12;
    ctx.save();
    ctx.rotate(barAngle);
    ctx.fillStyle = rpmPct > 0.1 ? spec.accentColor : "#555";
    ctx.shadowColor = spec.accentColor;
    ctx.shadowBlur = 10;
    ctx.fillRect(-barLen, -5, barLen * 2, 10);
    ctx.fillStyle = "#ddd";
    ctx.fillRect(-barLen, -5, 8, 10);
    ctx.fillRect(barLen - 8, -5, 8, 10);
    ctx.restore();
    if (rpmPct > 0.5) {
      ctx.beginPath();
      ctx.arc(0, 0, barLen, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(200,200,255,${rpmPct * 0.2})`;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  } else if (spec.weaponType === "drum") {
    ctx.save();
    ctx.translate(0, -l / 2 - 8);
    ctx.fillStyle = "#333";
    ctx.fillRect(-w * 0.5, -9, w, 16);
    const teeth = 6;
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * Math.PI * 2 + time * rpmPct * 14;
      ctx.fillStyle = rpmPct > 0.1 ? spec.accentColor : "#444";
      ctx.shadowColor = spec.accentColor;
      ctx.shadowBlur = rpmPct > 0.4 ? 6 : 0;
      const ty = Math.sin(a) * 5;
      ctx.fillRect(-w * 0.45 + (i / teeth) * w - 3, ty - 3, 6, 6);
    }
    ctx.restore();
  } else if (spec.weaponType === "vertical_spinner") {
    const discR = 16;
    ctx.save();
    ctx.translate(0, -l / 2 + discR * 0.1);
    ctx.beginPath();
    ctx.arc(0, 0, discR, 0, Math.PI * 2);
    ctx.fillStyle = rpmPct > 0.1 ? spec.accentColor : "#444";
    ctx.shadowColor = spec.accentColor;
    ctx.shadowBlur = rpmPct > 0.4 ? 14 : 0;
    ctx.fill();
    ctx.rotate(time * rpmPct * 18);
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * discR, Math.sin(a) * discR);
      ctx.stroke();
    }
    ctx.restore();
  } else if (spec.weaponType === "lifter") {
    const forkW = w * 0.65;
    ctx.fillStyle = spec.accentColor;
    ctx.fillRect(-forkW / 2, -l / 2 - 18, 7, 18);
    ctx.fillRect(forkW / 2 - 7, -l / 2 - 18, 7, 18);
    ctx.fillRect(-forkW / 2, -l / 2 - 22, forkW, 7);
  } else if (spec.weaponType === "hammer") {
    ctx.save();
    ctx.rotate(-Math.PI * 0.5);
    ctx.fillStyle = "#888";
    ctx.fillRect(-5, -l / 2 - 20, 10, 28);
    ctx.fillStyle = "#aaa";
    ctx.fillRect(-13, -l / 2 - 22, 26, 10);
    if (spec.weaponQuality === "titanium") {
      ctx.fillStyle = "#ef5350";
      ctx.fillRect(-13, -l / 2 - 28, 26, 8);
    }
    ctx.restore();
  }

  // Trim
  ctx.strokeStyle = spec.trimColor;
  ctx.lineWidth = 1;
  ctx.strokeRect(-w / 2 + 5, -l / 2 + 5, w - 10, l - 10);
}

function QualityDot({ quality }: { quality: string }) {
  const colors: Record<string, string> = {
    budget: "#9e9e9e",
    standard: "#2196f3",
    premium: "#4caf50",
    titanium: "#ff9800",
  };
  const count: Record<string, number> = { budget: 1, standard: 2, premium: 3, titanium: 4 };
  const color = colors[quality] ?? "#555";
  const dots = count[quality] ?? 1;
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: 4 }, (_, i) => (
        <span
          key={i}
          style={{
            display: "inline-block",
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: i < dots ? color : "#333",
            boxShadow: i < dots ? `0 0 4px ${color}` : "none",
          }}
        />
      ))}
    </span>
  );
}

export default function SelectionScreen({ onFight }: Props) {
  const [selected, setSelected] = useState<RobotSpec>(ROBOT_ROSTER[0]);
  const [opponent, setOpponent] = useState<RobotSpec | null>(null);

  const others = ROBOT_ROSTER.filter((r) => r.id !== selected.id);

  const handleFight = () => {
    const opp = opponent ?? others[Math.floor(Math.random() * others.length)];
    onFight(selected, opp);
  };

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: "radial-gradient(ellipse at 50% 30%, #0d1117 0%, #04050a 100%)",
        fontFamily: "'Courier New', Courier, monospace",
        color: "#fff",
      }}
    >
      {/* Header */}
      <div className="text-center pt-8 pb-4 shrink-0">
        <h1
          className="text-4xl font-black tracking-widest"
          style={{ color: "#e0e0e0", textShadow: "0 0 30px rgba(255,255,255,0.15)" }}
        >
          NHRL · 12 LB DIVISION
        </h1>
        <p className="text-xs tracking-widest mt-1" style={{ color: "#444" }}>
          SELECT YOUR ROBOT — SELECT YOUR OPPONENT — FIGHT
        </p>
      </div>

      <div className="flex flex-1 gap-4 px-6 pb-6 overflow-hidden">
        {/* Robot Roster */}
        <div className="w-48 shrink-0 flex flex-col gap-1.5 overflow-y-auto">
          <p className="text-xs tracking-widest mb-1" style={{ color: "#555" }}>YOUR ROBOT</p>
          {ROBOT_ROSTER.map((spec) => (
            <button
              key={spec.id}
              onClick={() => { setSelected(spec); if (opponent?.id === spec.id) setOpponent(null); }}
              className="flex items-center gap-2 px-2.5 py-2 rounded text-left transition-all"
              style={{
                background: selected.id === spec.id
                  ? `linear-gradient(90deg, ${spec.primaryColor}55, transparent)`
                  : "rgba(255,255,255,0.03)",
                border: selected.id === spec.id
                  ? `1px solid ${spec.accentColor}88`
                  : "1px solid rgba(255,255,255,0.06)",
                boxShadow: selected.id === spec.id ? `0 0 12px ${spec.accentColor}33` : "none",
              }}
            >
              <div style={{ width: 36, height: 36, flexShrink: 0 }}>
                <RobotPreview spec={spec} size={36} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold truncate" style={{ color: selected.id === spec.id ? spec.accentColor : "#888" }}>
                  {spec.name}
                </p>
                <p className="text-xs" style={{ color: "#444", fontSize: 9 }}>
                  {WEAPON_ICONS[spec.weaponType]?.split(" ").slice(1).join(" ")}
                </p>
              </div>
            </button>
          ))}
        </div>

        {/* Selected Robot Detail */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div
            className="rounded-xl p-5 flex-1 flex gap-5"
            style={{
              background: `linear-gradient(135deg, ${selected.primaryColor}22, rgba(0,0,0,0.5))`,
              border: `1px solid ${selected.accentColor}44`,
            }}
          >
            <div className="flex flex-col items-center gap-3">
              <RobotPreview spec={selected} size={160} />
              <p className="text-xs text-center" style={{ color: "#555", maxWidth: 160 }}>
                Based on: {selected.realInspiration}
              </p>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-2xl font-black tracking-wider mb-1" style={{ color: selected.accentColor }}>
                {selected.name}
              </h2>
              <span
                className="inline-block text-xs px-2 py-0.5 rounded mb-3 font-bold tracking-wider"
                style={{ background: STYLE_COLORS[selected.drivingStyle] + "33", color: STYLE_COLORS[selected.drivingStyle] }}
              >
                {STYLE_LABELS[selected.drivingStyle]}
              </span>
              <p className="text-xs mb-4 leading-relaxed" style={{ color: "#888" }}>{selected.description}</p>
              <p className="text-xs mb-4 italic" style={{ color: "#555" }}>
                Weapon: {selected.weaponDescription}
              </p>

              <div className="space-y-2">
                {[
                  { label: "ARMOR", quality: selected.armorQuality, tooltip: "Chassis / structural integrity" },
                  { label: "DRIVE", quality: selected.driveQuality, tooltip: "Speed & agility" },
                  { label: "WEAPON", quality: selected.weaponQuality, tooltip: "Weapon power & durability" },
                ].map(({ label, quality }) => (
                  <div key={label} className="flex items-center gap-3">
                    <span className="text-xs w-16 shrink-0" style={{ color: "#555" }}>{label}</span>
                    <QualityDot quality={quality} />
                    <span className="text-xs" style={{ color: "#666" }}>{QUALITY_LABEL[quality as import("../game/types").ComponentQuality]}</span>
                  </div>
                ))}
              </div>

              {selected.maxWeaponRPM > 0 && (
                <p className="mt-3 text-xs" style={{ color: "#555" }}>
                  Max RPM: <span style={{ color: selected.accentColor }}>{selected.maxWeaponRPM.toLocaleString()}</span>
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Opponent Selection */}
        <div className="w-48 shrink-0 flex flex-col gap-1.5 overflow-y-auto">
          <p className="text-xs tracking-widest mb-1" style={{ color: "#555" }}>OPPONENT</p>
          <button
            onClick={() => setOpponent(null)}
            className="px-2.5 py-2 rounded text-xs text-left transition-all"
            style={{
              background: !opponent ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
              border: !opponent ? "1px solid rgba(255,255,255,0.25)" : "1px solid rgba(255,255,255,0.06)",
            }}
          >
            🎲 RANDOM OPPONENT
          </button>
          {others.map((spec) => (
            <button
              key={spec.id}
              onClick={() => setOpponent(spec)}
              className="flex items-center gap-2 px-2.5 py-2 rounded text-left transition-all"
              style={{
                background: opponent?.id === spec.id
                  ? `linear-gradient(90deg, ${spec.primaryColor}55, transparent)`
                  : "rgba(255,255,255,0.03)",
                border: opponent?.id === spec.id
                  ? `1px solid ${spec.accentColor}88`
                  : "1px solid rgba(255,255,255,0.06)",
                boxShadow: opponent?.id === spec.id ? `0 0 12px ${spec.accentColor}33` : "none",
              }}
            >
              <div style={{ width: 36, height: 36, flexShrink: 0 }}>
                <RobotPreview spec={spec} size={36} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold truncate" style={{ color: opponent?.id === spec.id ? spec.accentColor : "#888" }}>
                  {spec.name}
                </p>
                <p style={{ color: "#444", fontSize: 9 }}>
                  {WEAPON_ICONS[spec.weaponType]?.split(" ").slice(1).join(" ")}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Fight Button */}
      <div className="shrink-0 flex justify-center pb-8">
        <button
          onClick={handleFight}
          className="px-16 py-4 rounded-xl text-xl font-black tracking-widest transition-all"
          style={{
            background: `linear-gradient(135deg, ${selected.primaryColor}, ${selected.accentColor})`,
            color: "#fff",
            border: "none",
            boxShadow: `0 6px 30px ${selected.accentColor}55`,
            letterSpacing: "0.2em",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)"; }}
        >
          ENTER THE BOX
        </button>
      </div>

      <div className="shrink-0 text-center pb-3">
        <p className="text-xs tracking-widest" style={{ color: "#333" }}>
          W/S=DRIVE · A/D=TURN · SHIFT/CLICK=WEAPON THROTTLE · R=REMATCH · ESC=EXIT
        </p>
      </div>
    </div>
  );
}
