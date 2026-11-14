"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Sign or initial with a finger, stylus or mouse. Produces a PNG data URL (transparent background,
 * ink-colored strokes) through `onChange`, or "" when cleared.
 */
export function SignaturePad({ label, kind = "signature", value, onChange, invalid }: { label: string; kind?: "signature" | "initials"; value: string; onChange: (v: string) => void; invalid?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(!value);
  const height = kind === "signature" ? 160 : 110;

  // Size the canvas for sharp lines on high-density screens.
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      const w = c.parentElement!.clientWidth;
      const keep = !empty ? c.toDataURL("image/png") : null;
      c.width = w * ratio;
      c.height = height * ratio;
      c.style.width = `${w}px`;
      c.style.height = `${height}px`;
      const ctx = c.getContext("2d")!;
      ctx.scale(ratio, ratio);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = kind === "signature" ? 2.4 : 2.2;
      ctx.strokeStyle = "#292c45";
      if (keep) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, w, height);
        img.src = keep;
      }
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = point(e);
    const ctx = e.currentTarget.getContext("2d")!;
    ctx.beginPath();
    ctx.arc(last.current.x, last.current.y, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fillStyle = "#292c45";
    ctx.fill();
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !last.current) return;
    const p = point(e);
    const ctx = e.currentTarget.getContext("2d")!;
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    setEmpty(false);
    onChange(canvas.current!.toDataURL("image/png"));
  };
  const clear = () => {
    const c = canvas.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setEmpty(true);
    onChange("");
  };

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-[0.92rem] text-ink">{label}</span>
        <button type="button" onClick={clear} disabled={empty} className="text-[0.8rem] text-ink-soft underline-offset-4 hover:text-ink hover:underline disabled:opacity-40">
          Clear
        </button>
      </div>
      <div className={`relative mt-2 overflow-hidden rounded-lg border bg-white ${invalid ? "border-oxblood/60" : "border-ink/20"} ${kind === "initials" ? "max-w-[16rem]" : ""}`}>
        <canvas
          ref={canvas}
          role="img"
          aria-label={`${label}. Draw with your finger, stylus or mouse.`}
          className="block cursor-crosshair touch-none"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onPointerLeave={up}
        />
        {empty ? (
          <span className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-[0.8rem] text-ink-soft/70">
            {kind === "signature" ? "Sign here with your finger or mouse" : "Initial here"}
          </span>
        ) : null}
        <span className="pointer-events-none absolute inset-x-5 bottom-9 border-b border-dashed border-ink/15" aria-hidden />
      </div>
    </div>
  );
}
