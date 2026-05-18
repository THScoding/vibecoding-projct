import { useEffect, useRef, useCallback } from "react";
import type { RobotTemplate, GameState } from "../game/types";
import { buildInitialState, updateGame } from "../game/engine";
import { renderGame } from "../game/renderer";

interface Props {
  playerTemplate: RobotTemplate;
  onExit: () => void;
}

export default function ArenaScreen({ playerTemplate, onExit }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState | null>(null);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const phaseRef = useRef<"playing" | "victory" | "defeat">("playing");

  const handleRestart = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    stateRef.current = buildInitialState(playerTemplate, canvas.width, canvas.height);
    phaseRef.current = "playing";
  }, [playerTemplate]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      if (!stateRef.current) {
        stateRef.current = buildInitialState(playerTemplate, canvas.width, canvas.height);
      }
    };
    resize();
    window.addEventListener("resize", resize);

    const onKeyDown = (e: KeyboardEvent) => {
      if (!stateRef.current) return;
      stateRef.current.keys.add(e.key.toLowerCase());
      if (e.key === "Escape") onExit();
      if ((e.key === "r" || e.key === "R") && phaseRef.current !== "playing") handleRestart();
      if (["w","s","a","d"," ","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.key)) {
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (!stateRef.current) return;
      stateRef.current.keys.delete(e.key.toLowerCase());
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!stateRef.current) return;
      const rect = canvas.getBoundingClientRect();
      stateRef.current.mouseX = e.clientX - rect.left;
      stateRef.current.mouseY = e.clientY - rect.top;
    };
    const onMouseDown = (e: MouseEvent) => {
      if (!stateRef.current) return;
      if (e.button === 0) stateRef.current.mouseDown = true;
    };
    const onMouseUp = (e: MouseEvent) => {
      if (!stateRef.current) return;
      if (e.button === 0) stateRef.current.mouseDown = false;
    };
    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("contextmenu", onContextMenu);

    const loop = (timestamp: number) => {
      const ctx = canvas.getContext("2d");
      if (!ctx || !stateRef.current) { rafRef.current = requestAnimationFrame(loop); return; }

      const dt = Math.min((timestamp - (lastTimeRef.current || timestamp)) / 1000, 0.05);
      lastTimeRef.current = timestamp;

      if (stateRef.current.phase === "playing") {
        stateRef.current = updateGame(stateRef.current, dt, canvas.width, canvas.height);
        phaseRef.current = stateRef.current.phase;
      }

      renderGame(ctx, stateRef.current, canvas.width, canvas.height);

      if (stateRef.current.phase !== "playing") {
        drawOverlay(ctx, stateRef.current, canvas.width, canvas.height);
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("contextmenu", onContextMenu);
    };
  }, [playerTemplate, onExit, handleRestart]);

  return (
    <div className="fixed inset-0 bg-black overflow-hidden">
      <canvas ref={canvasRef} className="block w-full h-full" style={{ cursor: "crosshair" }} />
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 flex gap-4 text-xs text-gray-500 font-mono pointer-events-none">
        <span>WASD — MOVE</span>
        <span>MOUSE — AIM</span>
        <span>CLICK — FIRE</span>
        <span>ESC — MENU</span>
      </div>
    </div>
  );
}

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  w: number,
  h: number,
) {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.72)";
  ctx.fillRect(0, 0, w, h);

  const isVictory = state.phase === "victory";
  const color = isVictory ? "#f1c40f" : "#e74c3c";
  const title = isVictory ? "VICTORY" : "DEFEATED";
  const sub = isVictory ? "Arena cleared! Well fought." : "Your chassis is destroyed.";

  ctx.shadowColor = color;
  ctx.shadowBlur = 30;
  ctx.fillStyle = color;
  ctx.font = "bold 72px 'Courier New', monospace";
  ctx.textAlign = "center";
  ctx.fillText(title, w / 2, h / 2 - 60);
  ctx.shadowBlur = 0;

  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = "20px 'Courier New', monospace";
  ctx.fillText(sub, w / 2, h / 2 - 10);

  ctx.fillStyle = "#f1c40f";
  ctx.font = "bold 28px 'Courier New', monospace";
  ctx.fillText(`SCORE: ${state.score}`, w / 2, h / 2 + 38);

  ctx.fillStyle = "#fff";
  ctx.font = "bold 16px 'Courier New', monospace";
  ctx.fillText(`WAVE REACHED: ${state.wave}`, w / 2, h / 2 + 78);

  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.font = "14px 'Courier New', monospace";
  ctx.fillText("[R] RESTART   [ESC] MAIN MENU", w / 2, h / 2 + 120);

  ctx.restore();
}
