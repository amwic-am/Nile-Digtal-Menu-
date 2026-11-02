import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from './ui';

type Tone = 'success' | 'error' | 'info' | 'warning';

interface ToastInput {
  title: string;
  description?: string;
  tone?: Tone;
  duration?: number;
}

interface ToastItem extends ToastInput {
  id: string;
}

interface ToastValue {
  push: (toast: ToastInput) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastValue | null>(null);

const toneStyles: Record<Tone, { icon: ReactNode; ring: string; iconColor: string }> = {
  success: { icon: <CheckCircle2 size={18} />, ring: 'border-emerald-300/25', iconColor: 'text-emerald-300' },
  error: { icon: <AlertTriangle size={18} />, ring: 'border-rose-300/25', iconColor: 'text-rose-300' },
  info: { icon: <Info size={18} />, ring: 'border-gold-300/25', iconColor: 'text-gold-300' },
  warning: { icon: <AlertTriangle size={18} />, ring: 'border-orange-300/25', iconColor: 'text-orange-300' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const push = useCallback(
    (toast: ToastInput) => {
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      setItems((current) => [...current.slice(-3), { ...toast, id }]);
      const timer = setTimeout(() => dismiss(id), toast.duration ?? 4600);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  const value = useMemo<ToastValue>(
    () => ({
      push,
      success: (title, description) => push({ title, description, tone: 'success' }),
      error: (title, description) => push({ title, description, tone: 'error' }),
      info: (title, description) => push({ title, description, tone: 'info' }),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-3 top-3 z-[200] flex w-[min(92vw,390px)] flex-col gap-3 sm:right-5 sm:top-5">
        {items.map((item) => {
          const tone = toneStyles[item.tone ?? 'info'];
          return (
            <div
              key={item.id}
              className={cn(
                'pointer-events-auto animate-slide-in overflow-hidden rounded-xl border bg-ink-850/95 p-3.5 shadow-2xl backdrop-blur-xl',
                tone.ring,
              )}
            >
              <div className="flex items-start gap-3">
                <span className={cn('mt-0.5 shrink-0', tone.iconColor)}>{tone.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-cream-50">{item.title}</p>
                  {item.description && (
                    <p className="mt-0.5 text-xs leading-relaxed text-cream-100/55">{item.description}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(item.id)}
                  className="shrink-0 rounded-full p-1 text-cream-100/35 transition hover:bg-ink-950/5 hover:text-cream-50"
                  aria-label="Dismiss notification"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
