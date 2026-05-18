import { useEffect, useRef, useCallback } from "react";
import type { RobotSpec } from "../game/robots";
import type { GameState } from "../game/types";
import { buildInitialState, updateGame } from "../game/engine";
import {
  drawArena,
  drawRobot,
  drawParticles,
  drawHUD,
  drawCountdown,
  drawMatchEnd,
} from "../game/renderer";

interface Props {
  playerSpec: RobotSpec;
  opponentSpec: RobotSpec;
  onExit: () => void;
}

export default function ArenaScreen({ playerSpec, opponentSpec, onExit }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState | null>(null);
  const rafRef = useRef<number>(0);
  const lastRef = useRef<number>(0);

  const init = useCallback(() => {
    stateRef.current = buildInitialState(playerSpec, opponentSpec);
  }, [playerSpec, opponentSpec]);

  useEffect(() => {
    init();

    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const onKeyDown = (e: KeyboardEvent) => {
      if (!stateRef.current) return;
      const k = e.key.toLowerCase();
      stateRef.current.keys.add(k);
      if (k === "escape") onExit();
      if (k === "r" && stateRef.current.match.phase === "ended") init();
      if (["w","a","s","d"," ","arrowup","arrowdown","arrowleft","arrowright"].includes(k)) e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      stateRef.current?.keys.delete(e.key.toLowerCase());
    };
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0 && stateRef.current) stateRef.current.mouseDown = true;
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0 && stateRef.current) stateRef.current.mouseDown = false;
    };
    const onContextMenu = (e: Event) => e.preventDefault();

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("contextmenu", onContextMenu);

    const loop = (ts: number) => {
      const dt = Math.min((ts - (lastRef.current || ts)) / 1000, 0.05);
      lastRef.current = ts;

      const ctx = canvas.getContext("2d");
      if (!ctx || !stateRef.current) { rafRef.current = requestAnimationFrame(loop); return; }

      const state = stateRef.current;
      stateRef.current = updateGame(state, dt);

      render(ctx, stateRef.current, canvas.width, canvas.height);
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("contextmenu", onContextMenu);
    };
  }, [init, onExit]);

  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      <canvas ref={canvasRef} className="block w-full h-full" style={{ cursor: "crosshair" }} />
    </div>
  );
}

function render(ctx: CanvasRenderingContext2D, state: GameState, cW: number, cH: number) {
  ctx.clearRect(0, 0, cW, cH);

  // Camera: center the arena on screen, letterbox if needed
  const scale = Math.min((cW - 4) / state.arenaW, (cH - 140) / state.arenaH);
  const offX = Math.round((cW - state.arenaW * scale) / 2);
  const offY = Math.round((cH - 140 - state.arenaH * scale) / 2) + 4;

  // Dark bg
  ctx.fillStyle = "#06060c";
  ctx.fillRect(0, 0, cW, cH);

  ctx.save();
  ctx.translate(offX, offY);
  ctx.scale(scale, scale);

  // Arena floor + walls
  drawArena(ctx, state.arenaW, state.arenaH);

  // Particles behind robots
  const bg = state.particles.filter((p) => p.type === "smoke");
  const fg = state.particles.filter((p) => p.type !== "smoke");
  drawParticles(ctx, bg);

  // Robots
  drawRobot(ctx, state.opponent, state.time, false);
  drawRobot(ctx, state.player, state.time, true);

  // Foreground particles
  drawParticles(ctx, fg);

  ctx.restore();

  // HUD (screen space, not arena space)
  drawHUD(ctx, state, cW, cH, offX, offY);

  // Countdown overlay
  if (state.match.phase === "countdown") {
    drawCountdown(ctx, state.match.countdownTimer, cW, cH);
  }

  // Match end overlay
  if (state.match.phase === "ended") {
    drawMatchEnd(ctx, state, cW, cH);
  }
}
