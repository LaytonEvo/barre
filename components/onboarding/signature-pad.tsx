'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Draw-your-signature canvas.
 *
 * Pointer events rather than separate mouse and touch handlers, so a finger, a
 * stylus and a mouse all work through one code path — most people signing this
 * will be on a phone.
 *
 * The canvas is sized to its container times the device pixel ratio, otherwise
 * the stroke is blurry on every modern screen, and this PNG ends up in a legal
 * document.
 */
export function SignaturePad({
  name,
  onChange,
}: {
  name: string;
  onChange?: (dataUrl: string | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);
  const [value, setValue] = useState('');

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return;

    // Resizing clears the canvas, so this runs on mount and on orientation
    // change only — not on every render, which would wipe a signature midway.
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1A1F1B';
  }, []);

  useEffect(() => {
    resize();
    window.addEventListener('orientationchange', resize);
    return () => window.removeEventListener('orientationchange', resize);
  }, [resize]);

  const position = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    // Capture, so a stroke that leaves the box still ends cleanly.
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    const { x, y } = position(event);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = position(event);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasInk) setHasInk(true);
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const dataUrl = canvasRef.current?.toDataURL('image/png') ?? '';
    setValue(dataUrl);
    onChange?.(dataUrl || null);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
    setValue('');
    onChange?.(null);
  };

  return (
    <div className="grid gap-2">
      {/* The value the form actually submits. */}
      <input type="hidden" name={name} value={value} />

      <canvas
        ref={canvasRef}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        aria-label="Signature box — draw your signature here"
        // touch-none stops the browser scrolling the page while somebody signs.
        className="border-strong bg-surface h-40 w-full touch-none rounded-md border-2 border-dashed"
      />

      <div className="flex items-center justify-between gap-3">
        <p className="text-muted text-sm">
          {hasInk ? 'Looks good.' : 'Sign with your finger, a stylus or the mouse.'}
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={!hasInk}>
          Clear
        </Button>
      </div>
    </div>
  );
}
