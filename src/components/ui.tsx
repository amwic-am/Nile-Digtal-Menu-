import { useEffect, useState } from 'react';
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, Loader2, X } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { StatusMeta } from '../lib/format';
import { WaveLoader } from './WaveLoader';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'goldOutline' | 'cream' | 'dark' | 'success';
type Size = 'xs' | 'sm' | 'md' | 'lg' | 'icon';

const variants: Record<Variant, string> = {
  primary:
    'bg-gold-400 text-night hover:bg-gold-500 shadow-[0_10px_28px_-16px_rgba(120,91,40,0.65)] border border-transparent',
  secondary:
    'border border-ink-950/12 bg-ink-950/[0.045] text-cream-50 hover:border-ink-950/20 hover:bg-ink-950/[0.075]',
  ghost: 'border border-transparent text-cream-100/65 hover:bg-ink-950/[0.055] hover:text-cream-50',
  danger: 'border border-rose-400/25 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20',
  goldOutline: 'border border-gold-400/35 text-gold-200 hover:bg-gold-400/10',
  cream: 'border border-ink-950/12 bg-white text-cream-50 hover:bg-ink-950/[0.04] shadow-sm',
  dark: 'border border-ink-700 bg-ink-900 text-cream-50 hover:bg-ink-800',
  success: 'border border-emerald-300/25 bg-emerald-400/12 text-emerald-100 hover:bg-emerald-400/20',
};

const sizes: Record<Size, string> = {
  xs: 'h-7 px-2.5 text-[11px] gap-1.5',
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-[13px] gap-2',
  lg: 'h-11 px-5 text-sm gap-2',
  icon: 'h-9 w-9 p-0',
};

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', className?: string) {
  return cn(
    'inline-flex items-center justify-center rounded-full font-medium tracking-[0.01em] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950 disabled:pointer-events-none disabled:opacity-40',
    variants[variant],
    sizes[size],
    className,
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  icon,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      className={buttonClass(variant, size, className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 size={15} className="animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function IconButton({
  className,
  label,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        'inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink-950/10 bg-ink-950/[0.04] text-cream-100/65 transition hover:border-ink-950/20 hover:bg-ink-950/[0.08] hover:text-cream-50',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('panel', className)}>{children}</div>;
}

export function StatusPill({
  meta,
  pulse,
  className,
  showDot = true,
}: {
  meta: StatusMeta;
  pulse?: boolean;
  className?: string;
  showDot?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-medium',
        meta.text,
        meta.bg,
        meta.border,
        className,
      )}
    >
      {showDot && (
        <span className={cn('relative flex h-1.5 w-1.5 rounded-full', meta.dot)}>
          {pulse && <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-60', meta.dot)} />}
        </span>
      )}
      {meta.label}
    </span>
  );
}

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'gold' | 'success' | 'danger' | 'info' | 'warning';
  className?: string;
}) {
  const tones = {
    neutral: 'border-ink-950/12 bg-ink-950/5 text-cream-100/65',
    gold: 'border-gold-400/30 bg-gold-400/10 text-gold-200',
    success: 'border-emerald-300/25 bg-emerald-400/10 text-emerald-200',
    danger: 'border-rose-300/25 bg-rose-500/10 text-rose-200',
    info: 'border-sky-300/25 bg-sky-400/10 text-sky-200',
    warning: 'border-orange-300/25 bg-orange-400/10 text-orange-200',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.1em]',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn('field', className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn('field min-h-[84px] resize-y', className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn('field appearance-none bg-ink-850 pr-8', className)} {...props}>
      {children}
    </select>
  );
}

export function Field({
  label,
  hint,
  children,
  className,
  required,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
  required?: boolean;
}) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-cream-100/50">
          {label}
          {required && <span className="ml-0.5 text-gold-300">*</span>}
        </span>
        {hint && <span className="text-[10px] text-cream-100/30">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

const modalSizes = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-xl',
  lg: 'sm:max-w-3xl',
  xl: 'sm:max-w-5xl',
  full: 'sm:max-w-6xl',
};

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
  className,
  overlayClassName,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: keyof typeof modalSizes;
  className?: string;
  overlayClassName?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className={cn('fixed inset-0 z-[130] flex items-end justify-center sm:items-center sm:p-6', overlayClassName)}>
      <div className="absolute inset-0 animate-fade-in bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-ink-950/10 bg-ink-850 shadow-2xl animate-pop sm:rounded-2xl',
          modalSizes[size],
          className,
        )}
      >
        {(title || subtitle) && (
          <div className="flex items-start justify-between gap-4 border-b border-ink-950/[0.07] px-5 py-4 sm:px-6">
            <div>
              {title && <h2 className="font-display text-xl text-cream-50">{title}</h2>}
              {subtitle && <p className="mt-1 text-xs leading-relaxed text-cream-100/45">{subtitle}</p>}
            </div>
            <IconButton label="Close dialog" onClick={onClose} className="-mr-1 -mt-1 shrink-0">
              <X size={16} />
            </IconButton>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-ink-950/[0.07] bg-ink-900/60 px-5 py-4 sm:px-6">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

const sheetWidths = { md: 'sm:max-w-md', lg: 'sm:max-w-lg', xl: 'sm:max-w-2xl' };

export function SlideOver({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 'lg',
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: keyof typeof sheetWidths;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[130] flex justify-end">
      <div className="absolute inset-0 animate-fade-in bg-black/65 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative flex h-full w-full flex-col border-l border-ink-950/10 bg-ink-850 shadow-2xl animate-slide-in',
          sheetWidths[width],
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-ink-950/[0.07] px-5 py-4">
          <div>
            {title && <h2 className="font-display text-xl text-cream-50">{title}</h2>}
            {subtitle && <p className="mt-1 text-xs text-cream-100/45">{subtitle}</p>}
          </div>
          <IconButton label="Close panel" onClick={onClose} className="-mr-1 -mt-1">
            <X size={16} />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-ink-950/[0.07] bg-ink-900/60 px-5 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div>
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="font-display text-[1.7rem] leading-tight text-cream-50 sm:text-[2rem]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-cream-100/45">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  accent = 'text-gold-300',
  onClick,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  accent?: string;
  onClick?: () => void;
  className?: string;
}) {
  const content = (
    <div className={cn('panel h-full p-4', onClick && 'panel-hover cursor-pointer text-left', className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-cream-100/40">{label}</p>
        {icon && <span className={cn('opacity-80', accent)}>{icon}</span>}
      </div>
      <p className="mt-3 font-display text-[1.75rem] leading-none text-cream-50">{value}</p>
      {hint && <p className="mt-2 text-[11px] text-cream-100/40">{hint}</p>}
    </div>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="block w-full">
        {content}
      </button>
    );
  }
  return content;
}

export function Tabs({
  items,
  value,
  onChange,
  variant = 'underline',
  className,
}: {
  items: Array<{ id: string; label: string; count?: number }>;
  value: string;
  onChange: (id: string) => void;
  variant?: 'underline' | 'pill';
  className?: string;
}) {
  if (variant === 'pill') {
    return (
      <div className={cn('inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-ink-950/8 bg-ink-950/[0.035] p-1', className)}>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition',
              value === item.id ? 'bg-gold-400 text-night' : 'text-cream-100/55 hover:text-cream-50',
            )}
          >
            {item.label}
            {typeof item.count === 'number' && (
              <span className={cn('text-[10px]', value === item.id ? 'text-night/60' : 'text-cream-100/35')}>
                {item.count}
              </span>
            )}
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className={cn('flex gap-5 overflow-x-auto border-b border-ink-950/[0.07]', className)}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={cn(
            'relative shrink-0 pb-3 text-[13px] font-medium transition',
            value === item.id ? 'text-cream-50' : 'text-cream-100/40 hover:text-cream-100/70',
          )}
        >
          <span className="inline-flex items-center gap-2">
            {item.label}
            {typeof item.count === 'number' && (
              <span className="rounded-full bg-ink-950/8 px-1.5 py-0.5 text-[10px] text-cream-100/50">{item.count}</span>
            )}
          </span>
          {value === item.id && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-gold-400" />}
        </button>
      ))}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label?: string;
  description?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      {(label || description) && (
        <div>
          {label && <p className="text-sm text-cream-50">{label}</p>}
          {description && <p className="mt-0.5 text-xs leading-relaxed text-cream-100/40">{description}</p>}
        </div>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors',
          checked ? 'border-gold-400/40 bg-gold-400' : 'border-ink-950/12 bg-ink-950/10',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white shadow transition-all',
            checked ? 'left-[22px]' : 'left-0.5',
          )}
          style={{ height: 18, width: 18 }}
        />
      </button>
    </div>
  );
}

export function Menu({
  trigger,
  children,
  align = 'end',
  width = 'w-60',
}: {
  trigger: ReactNode;
  children: ReactNode;
  align?: 'start' | 'end';
  width?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-flex">
      <span
        onClick={(event) => {
          event.stopPropagation();
          event.preventDefault();
          setOpen((current) => !current);
        }}
      >
        {trigger}
      </span>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={(event) => { event.stopPropagation(); setOpen(false); }} />
          <div
            className={cn(
              'absolute top-[calc(100%+6px)] z-50 overflow-hidden rounded-xl border border-ink-950/10 bg-ink-850/98 p-1.5 shadow-2xl backdrop-blur-xl animate-pop',
              align === 'end' ? 'right-0' : 'left-0',
              width,
            )}
            onClick={() => setOpen(false)}
          >
            {children}
          </div>
        </>
      )}
    </div>
  );
}

export function MenuItem({
  children,
  icon,
  onClick,
  danger,
  disabled,
  hint,
}: {
  children: ReactNode;
  icon?: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] transition disabled:cursor-not-allowed disabled:opacity-40',
        danger ? 'text-rose-200 hover:bg-rose-500/10' : 'text-cream-100/75 hover:bg-ink-950/[0.06] hover:text-cream-50',
      )}
    >
      {icon && <span className="shrink-0 opacity-70">{icon}</span>}
      <span className="flex-1">{children}</span>
      {hint && <span className="text-[10px] text-cream-100/30">{hint}</span>}
    </button>
  );
}

export function MenuSeparator() {
  return <div className="my-1 h-px bg-ink-950/[0.07]" />;
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <p className="px-2.5 pb-1 pt-2 text-[9px] uppercase tracking-[0.18em] text-cream-100/30">{children}</p>;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink-950/10 px-6 py-12 text-center', className)}>
      {icon && <div className="mb-3 text-cream-100/25">{icon}</div>}
      <p className="font-display text-lg text-cream-100/70">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs leading-relaxed text-cream-100/35">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Avatar({ name, size = 'md', className }: { name: string; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const sizes = { sm: 'h-7 w-7 text-[10px]', md: 'h-9 w-9 text-xs', lg: 'h-12 w-12 text-sm' };
  const letters = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full border border-gold-400/25 bg-gold-400/10 font-medium tracking-wide text-gold-200',
        sizes[size],
        className,
      )}
    >
      {letters}
    </span>
  );
}

export function CopyField({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      {label && <p className="micro mb-1.5">{label}</p>}
      <div className="flex items-center gap-2 rounded-lg border border-ink-950/10 bg-ink-950/[0.035] px-3 py-2">
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-cream-100/60">{value}</span>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            } catch {
              setCopied(false);
            }
          }}
          className="shrink-0 rounded-md p-1 text-cream-100/40 transition hover:bg-ink-950/5 hover:text-cream-50"
          aria-label="Copy to clipboard"
        >
          {copied ? <Check size={13} className="text-emerald-300" /> : <Copy size={13} />}
        </button>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  tone = 'danger',
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  tone?: Variant;
  loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={tone} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-cream-100/55">{description}</p>
    </Modal>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-lg', className)} />;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('animate-spin text-gold-300', className)} size={18} />;
}

export function PageLoader({ label = 'Loading' }: { label?: string }) {
  return <WaveLoader label={label} />;
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn('h-1.5 overflow-hidden rounded-full bg-ink-950/8', className)}>
      <div
        className="h-full rounded-full bg-gold-400 transition-all duration-500"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}
