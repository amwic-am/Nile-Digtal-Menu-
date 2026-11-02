import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { Camera, Download, Move, RotateCcw, RotateCw, VideoOff, X, ZoomIn, ZoomOut } from 'lucide-react';
import { Button, IconButton, cn } from './ui';

type Transform = { x: number; y: number; scale: number; rotation: number };
type Point = { x: number; y: number };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function ARPreview({
  open,
  onClose,
  dish,
}: {
  open: boolean;
  onClose: () => void;
  dish: { name: string; nameAm?: string | null; image: string | null };
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const dragRef = useRef<{ start: Point; origin: Transform } | null>(null);
  const pinchRef = useRef<{ distance: number; angle: number; origin: Transform } | null>(null);
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 1, rotation: 0 });
  const transformRef = useRef(transform);
  const [mode, setMode] = useState<'requesting' | 'live' | 'fallback'>('requesting');
  const [cameraError, setCameraError] = useState('');
  const [captured, setCaptured] = useState(false);

  useEffect(() => {
    transformRef.current = transform;
  }, [transform]);

  useEffect(() => {
    if (!open) return;
    setTransform({ x: 0, y: 0, scale: 1, rotation: 0 });
    setCaptured(false);
    setMode('requesting');
    setCameraError('');
    let stream: MediaStream | null = null;
    let cancelled = false;

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setMode('fallback');
        setCameraError('This browser does not expose a camera feed.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setMode('live');
      } catch (error) {
        if (!cancelled) {
          setMode('fallback');
          setCameraError(error instanceof Error ? error.message : 'Camera permission was not granted.');
        }
      }
    };

    void start();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const values = [...pointers.current.values()];
    if (values.length === 1) {
      dragRef.current = { start: values[0], origin: transformRef.current };
      pinchRef.current = null;
    } else if (values.length >= 2) {
      const [a, b] = values;
      pinchRef.current = {
        distance: Math.hypot(b.x - a.x, b.y - a.y),
        angle: Math.atan2(b.y - a.y, b.x - a.x),
        origin: transformRef.current,
      };
      dragRef.current = null;
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const values = [...pointers.current.values()];

    if (values.length >= 2 && pinchRef.current) {
      const [a, b] = values;
      const distance = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const gesture = pinchRef.current;
      setTransform({
        ...gesture.origin,
        scale: clamp(gesture.origin.scale * (distance / Math.max(1, gesture.distance)), 0.3, 3.2),
        rotation: gesture.origin.rotation + ((angle - gesture.angle) * 180) / Math.PI,
      });
      return;
    }

    if (dragRef.current) {
      const gesture = dragRef.current;
      setTransform({
        ...gesture.origin,
        x: gesture.origin.x + (event.clientX - gesture.start.x),
        y: gesture.origin.y + (event.clientY - gesture.start.y),
      });
    }
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    const remaining = [...pointers.current.values()];
    if (remaining.length === 1) {
      dragRef.current = { start: remaining[0], origin: transformRef.current };
      pinchRef.current = null;
    } else {
      dragRef.current = null;
      pinchRef.current = null;
    }
  };

  const adjust = (patch: Partial<Transform>) => setTransform((current) => ({ ...current, ...patch }));

  const capture = () => {
    const video = videoRef.current;
    const surface = surfaceRef.current;
    const image = imageRef.current;
    if (!surface || !image) return;
    const canvas = document.createElement('canvas');

    if (mode === 'live' && video && video.videoWidth > 0) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const kx = canvas.width / surface.clientWidth;
      const ky = canvas.height / surface.clientHeight;
      const drawnWidth = surface.clientWidth * 0.58 * transform.scale * kx;
      const drawnHeight = drawnWidth * (image.naturalHeight / Math.max(1, image.naturalWidth));
      ctx.save();
      ctx.translate(canvas.width / 2 + transform.x * kx, canvas.height / 2 + transform.y * ky);
      ctx.rotate((transform.rotation * Math.PI) / 180);
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 40;
      ctx.shadowOffsetY = 24;
      ctx.drawImage(image, -drawnWidth / 2, -drawnHeight / 2, drawnWidth, drawnHeight);
      ctx.restore();
    } else {
      canvas.width = 1080;
      canvas.height = 1440;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const gradient = ctx.createLinearGradient(0, 0, 1080, 1440);
      gradient.addColorStop(0, '#1b1a17');
      gradient.addColorStop(0.55, '#111115');
      gradient.addColorStop(1, '#08080a');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = 'rgba(215,180,108,0.28)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(540, 700, 330, 0, Math.PI * 2);
      ctx.stroke();
      const drawnWidth = 1080 * 0.62 * transform.scale;
      const drawnHeight = drawnWidth * (image.naturalHeight / Math.max(1, image.naturalWidth));
      ctx.save();
      ctx.translate(540 + transform.x * (1080 / surface.clientWidth), 720 + transform.y * (1440 / surface.clientHeight));
      ctx.rotate((transform.rotation * Math.PI) / 180);
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 50;
      ctx.shadowOffsetY = 30;
      ctx.drawImage(image, -drawnWidth / 2, -drawnHeight / 2, drawnWidth, drawnHeight);
      ctx.restore();
      ctx.fillStyle = 'rgba(247,241,230,0.75)';
      ctx.font = '600 24px Georgia, serif';
      ctx.fillText('NILE RESTAURANT', 60, 90);
      ctx.fillStyle = 'rgba(247,241,230,0.35)';
      ctx.font = '18px Arial, sans-serif';
      ctx.fillText('Dish preview · not a photo of the served plate', 60, 122);
    }

    const url = canvas.toDataURL('image/png');
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `nile-preview-${dish.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setCaptured(true);
    window.setTimeout(() => setCaptured(false), 2200);
  };

  return createPortal(
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[200] overflow-hidden bg-black">
      <div
        ref={surfaceRef}
        className="absolute inset-0 touch-none select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <video ref={videoRef} muted playsInline className={cn('h-full w-full object-cover', mode !== 'live' && 'hidden')} />
        {mode !== 'live' && (
          <div className="grain absolute inset-0 bg-[radial-gradient(900px_600px_at_50%_35%,rgba(215,180,108,0.16),transparent_65%),linear-gradient(160deg,#1b1a17,#08080a)]" />
        )}
        {mode === 'requesting' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex items-center gap-3 rounded-full border border-white/10 bg-black/40 px-4 py-2 text-xs text-white/75 backdrop-blur">
              <Camera size={15} className="animate-pulse text-[#e6cd97]" /> Opening camera…
            </div>
          </div>
        )}

        {dish.image ? (
          <img
            ref={imageRef}
            src={dish.image}
            alt={dish.name}
            draggable={false}
            className="pointer-events-none absolute left-1/2 top-1/2 max-h-[62%] w-[58%] object-contain drop-shadow-2xl"
            style={{
              transform: `translate(calc(-50% + ${transform.x}px), calc(-50% + ${transform.y}px)) rotate(${transform.rotation}deg) scale(${transform.scale})`,
            }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white/50">
            No dish preview available
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/75 to-transparent" />
      </div>

      <div className="absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-4 p-4 sm:p-6">
        <div className="rounded-2xl border border-white/10 bg-black/45 px-4 py-3 backdrop-blur-xl">
          <p className="text-[9px] uppercase tracking-[0.22em] text-[#e6cd97]/85">
            {mode === 'live' ? 'Camera overlay preview' : 'Studio preview'}
          </p>
          <p className="mt-1 font-display text-xl leading-tight text-white">{dish.name}</p>
          {dish.nameAm && <p className="text-xs text-white/55">{dish.nameAm}</p>}
          <p className="mt-1.5 text-[10px] text-white/45">
            {mode === 'live'
              ? 'Drag to move · pinch to resize · twist to rotate'
              : cameraError || 'Camera unavailable — showing a studio preview.'}
          </p>
        </div>
        <IconButton
          label="Close AR preview"
          onClick={onClose}
          className="h-10 w-10 border-white/15 bg-black/45 text-white backdrop-blur-xl"
        >
          <X size={18} />
        </IconButton>
      </div>

      {mode !== 'live' && (
        <div className="absolute left-4 top-32 z-10 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-[10px] text-white/60 backdrop-blur sm:left-6">
          <VideoOff size={12} />
          Studio mode
        </div>
      )}

      <div
        className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-3 p-4 sm:p-6"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/50 p-1.5 backdrop-blur-xl [&_button]:border-white/15 [&_button]:bg-white/10 [&_button]:text-white [&_button:hover]:bg-white/20">
          <IconButton label="Zoom out" onClick={() => adjust({ scale: clamp(transform.scale - 0.12, 0.3, 3.2) })}>
            <ZoomOut size={15} />
          </IconButton>
          <IconButton label="Zoom in" onClick={() => adjust({ scale: clamp(transform.scale + 0.12, 0.3, 3.2) })}>
            <ZoomIn size={15} />
          </IconButton>
          <span className="mx-1 h-5 w-px bg-white/10" />
          <IconButton label="Rotate left" onClick={() => adjust({ rotation: transform.rotation - 15 })}>
            <RotateCcw size={15} />
          </IconButton>
          <IconButton label="Rotate right" onClick={() => adjust({ rotation: transform.rotation + 15 })}>
            <RotateCw size={15} />
          </IconButton>
          <span className="mx-1 h-5 w-px bg-white/10" />
          <IconButton
            label="Reset placement"
            onClick={() => setTransform({ x: 0, y: 0, scale: 1, rotation: 0 })}
          >
            <Move size={15} />
          </IconButton>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="cream"
            size="lg"
            icon={<Download size={15} />}
            onClick={capture}
          >
            {captured ? 'Preview saved' : 'Save preview'}
          </Button>
          <Button variant="secondary" size="lg" onClick={onClose} className="border-white/15 bg-black/35 text-white">
            Done
          </Button>
        </div>
        <p className="max-w-md text-center text-[9.5px] leading-relaxed text-white/45">
          Visual preview only — the dish illustration is overlaid on your camera. The plate served at your table may differ.
        </p>
      </div>
    </div>,
    document.body,
  );
}
