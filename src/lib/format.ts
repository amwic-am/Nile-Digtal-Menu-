import type { OrderStatus, PaymentMethod, Role, TableStatus } from './types';

export function money(value: number | null | undefined, currency = 'ETB') {
  const n = Number(value ?? 0);
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(n);
  return `${currency} ${formatted}`;
}

export function number(value: number | null | undefined) {
  return new Intl.NumberFormat('en-US').format(Number(value ?? 0));
}

export function formatClock(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function formatDate(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value;
  return `${formatDate(date)} · ${formatClock(date)}`;
}

export function timeAgo(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value;
  const diff = Math.max(0, Date.now() - date.getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes === 1) return '1 min ago';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}

export function elapsedLabel(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value;
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export function titleCase(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export const roleLabels: Record<Role, string> = {
  super_admin: 'Super Admin',
  manager: 'General Manager',
  receptionist: 'Receptionist',
  waiter: 'Waiter',
  cashier: 'Cashier',
  chef: 'Head Chef',
  auditor: 'Auditor',
};

export interface StatusMeta {
  label: string;
  text: string;
  bg: string;
  border: string;
  dot: string;
  solid: string;
}

export const tableStatusMeta: Record<TableStatus, StatusMeta> = {
  available: {
    label: 'Available', text: 'text-emerald-200', bg: 'bg-emerald-400/10', border: 'border-emerald-300/25',
    dot: 'bg-emerald-300', solid: '#6fae8c',
  },
  occupied: {
    label: 'Occupied', text: 'text-gold-200', bg: 'bg-gold-400/10', border: 'border-gold-300/30',
    dot: 'bg-gold-300', solid: '#c9a24f',
  },
  reserved: {
    label: 'Reserved', text: 'text-indigo-200', bg: 'bg-indigo-400/10', border: 'border-indigo-300/25',
    dot: 'bg-indigo-300', solid: '#8c9bd6',
  },
  cleaning: {
    label: 'Needs cleaning', text: 'text-orange-200', bg: 'bg-orange-400/10', border: 'border-orange-300/25',
    dot: 'bg-orange-300', solid: '#ce8555',
  },
  inactive: {
    label: 'Inactive', text: 'text-cream-300', bg: 'bg-ink-950/[0.05]', border: 'border-ink-950/12',
    dot: 'bg-ink-950/30', solid: '#6b6b73',
  },
};

export const orderStatusMeta: Record<OrderStatus, StatusMeta> = {
  new: {
    label: 'New', text: 'text-gold-200', bg: 'bg-gold-400/10', border: 'border-gold-300/30',
    dot: 'bg-gold-300', solid: '#d7b46c',
  },
  accepted: {
    label: 'Accepted', text: 'text-sky-200', bg: 'bg-sky-400/10', border: 'border-sky-300/25',
    dot: 'bg-sky-300', solid: '#78a9c9',
  },
  preparing: {
    label: 'Preparing', text: 'text-orange-200', bg: 'bg-orange-400/10', border: 'border-orange-300/25',
    dot: 'bg-orange-300', solid: '#ce8555',
  },
  ready: {
    label: 'Ready', text: 'text-emerald-200', bg: 'bg-emerald-400/10', border: 'border-emerald-300/25',
    dot: 'bg-emerald-300', solid: '#6fae8c',
  },
  served: {
    label: 'Served', text: 'text-cream-200', bg: 'bg-cream-100/10', border: 'border-cream-200/20',
    dot: 'bg-cream-200', solid: '#d5c5a8',
  },
  completed: {
    label: 'Completed', text: 'text-cream-300', bg: 'bg-ink-950/[0.05]', border: 'border-ink-950/12',
    dot: 'bg-ink-950/30', solid: '#8a8a92',
  },
  cancelled: {
    label: 'Cancelled', text: 'text-rose-200', bg: 'bg-rose-500/10', border: 'border-rose-300/25',
    dot: 'bg-rose-300', solid: '#c97676',
  },
};

export const paymentStatusMeta: Record<string, StatusMeta> = {
  unpaid: {
    label: 'Unpaid', text: 'text-rose-200', bg: 'bg-rose-500/10', border: 'border-rose-300/20',
    dot: 'bg-rose-300', solid: '#c97676',
  },
  partial: {
    label: 'Part paid', text: 'text-orange-200', bg: 'bg-orange-400/10', border: 'border-orange-300/25',
    dot: 'bg-orange-300', solid: '#ce8555',
  },
  paid: {
    label: 'Paid', text: 'text-emerald-200', bg: 'bg-emerald-400/10', border: 'border-emerald-300/25',
    dot: 'bg-emerald-300', solid: '#6fae8c',
  },
};

export const reservationStatusMeta: Record<string, StatusMeta> = {
  confirmed: {
    label: 'Confirmed', text: 'text-indigo-200', bg: 'bg-indigo-400/10', border: 'border-indigo-300/25',
    dot: 'bg-indigo-300', solid: '#8c9bd6',
  },
  seated: {
    label: 'Seated', text: 'text-emerald-200', bg: 'bg-emerald-400/10', border: 'border-emerald-300/25',
    dot: 'bg-emerald-300', solid: '#6fae8c',
  },
  cancelled: {
    label: 'Cancelled', text: 'text-rose-200', bg: 'bg-rose-500/10', border: 'border-rose-300/25',
    dot: 'bg-rose-300', solid: '#c97676',
  },
  no_show: {
    label: 'No show', text: 'text-cream-300', bg: 'bg-ink-950/[0.05]', border: 'border-ink-950/12',
    dot: 'bg-ink-950/30', solid: '#6b6b73',
  },
  completed: {
    label: 'Completed', text: 'text-cream-300', bg: 'bg-ink-950/[0.05]', border: 'border-ink-950/12',
    dot: 'bg-ink-950/30', solid: '#8a8a92',
  },
};

export const paymentMethods: Array<{ id: PaymentMethod; label: string }> = [
  { id: 'cash', label: 'Cash' },
  { id: 'card', label: 'Card' },
  { id: 'telebirr', label: 'TeleBirr' },
  { id: 'room_charge', label: 'Room charge' },
];

export const orderSteps: OrderStatus[] = ['new', 'accepted', 'preparing', 'ready', 'served', 'completed'];

export function spiceDots(level: number) {
  return Array.from({ length: 3 }, (_, i) => i < level);
}
