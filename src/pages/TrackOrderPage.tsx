import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  ChefHat,
  Clock3,
  ConciergeBell,
  MapPin,
  ReceiptText,
  RefreshCw,
  Sparkles,
  Utensils,
} from 'lucide-react';
import { apiPublic } from '../lib/api';
import type { Bill, OrderStatus } from '../lib/types';
import { formatClock, formatDateTime, money, orderStatusMeta } from '../lib/format';
import { useToast } from '../components/Toast';

type TrackItem = {
  name: string;
  qty: number;
  unitPrice: number;
  total: number;
  notes: string | null;
  addons: Array<{ name: string; price: number }>;
};

type TrackOrder = {
  id: number;
  orderNo: number;
  displayNo: string;
  status: OrderStatus;
  total: number;
  createdAt: string;
  paymentStatus: string;
  guestName: string | null;
  sessionId: number;
  tableCode: string;
  areaName: string | null;
  notes: string | null;
  items: TrackItem[];
  history: Array<{ status: OrderStatus; note: string | null; createdAt: string }>;
};

const steps: Array<{ status: OrderStatus; label: string; icon: typeof Utensils }> = [
  { status: 'new', label: 'Received', icon: ReceiptText },
  { status: 'accepted', label: 'Accepted', icon: Check },
  { status: 'preparing', label: 'Cooking', icon: ChefHat },
  { status: 'ready', label: 'Ready', icon: Sparkles },
  { status: 'served', label: 'Served', icon: Utensils },
  { status: 'completed', label: 'Complete', icon: Check },
];

export function TrackOrderPage() {
  const { token = '', orderNumber = '' } = useParams();
  const toast = useToast();
  const [order, setOrder] = useState<TrackOrder | null>(null);
  const [bill, setBill] = useState<Bill | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [callBusy, setCallBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setRefreshing(true);
      try {
        const res = await apiPublic<{ order: TrackOrder; bill: Bill | null }>(
          `/public/scan/${token}/track/${orderNumber}`,
        );
        setOrder(res.order);
        setBill(res.bill);
        setError('');
      } catch (err) {
        if (!quiet) setError(err instanceof Error ? err.message : 'This order could not be found.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, orderNumber],
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!order || ['completed', 'cancelled'].includes(order.status)) return;
    const timer = setInterval(() => load(true), 6000);
    return () => clearInterval(timer);
  }, [order, load]);

  const callWaiter = async () => {
    if (!order) return;
    setCallBusy(true);
    try {
      await apiPublic(`/public/scan/${token}/call`, {
        method: 'POST',
        body: { sessionId: order.sessionId, type: 'waiter' },
      });
      toast.success('A team member is on the way', 'Someone will be with you shortly.');
    } catch (err) {
      toast.error('Could not call a waiter', err instanceof Error ? err.message : 'Try again');
    } finally {
      setCallBusy(false);
    }
  };

  const currentIndex = order ? steps.findIndex((step) => step.status === order.status) : -1;
  const cancelled = order?.status === 'cancelled';

  if (loading) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#120e07] text-[#f8f2e5]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_440px_at_50%_-8%,rgba(216,180,117,0.16),transparent_65%)]" />
        <div className="relative flex flex-col items-center gap-5">
          <span className="flex h-16 w-16 items-center justify-center rounded-full border border-[#d8b475]/35 bg-[#d8b475]/10 font-display text-2xl text-[#f0e2bf]">
            N
          </span>
          <span className="font-display text-[1.7rem] tracking-[0.42em] text-[#f8f2e5]">NILE</span>
          <span className="h-px w-24 overflow-hidden bg-[#d8b475]/20">
            <span className="block h-full w-1/2 animate-pulse bg-[#d8b475]" />
          </span>
          <p className="text-[10px] uppercase tracking-[0.34em] text-[#d8b475]/70">Finding your order</p>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center gap-4 overflow-hidden bg-[#f6f0e4] px-6 text-center text-[#18130b]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(700px_340px_at_50%_0%,rgba(166,127,56,0.12),transparent_65%)]" />
        <span className="relative flex h-14 w-14 items-center justify-center rounded-full border border-[#a67f38]/35 bg-[#a67f38]/5 font-display text-xl text-[#8a5f20]">
          N
        </span>
        <h1 className="relative font-display text-3xl">Order not found</h1>
        <p className="relative max-w-sm text-sm leading-relaxed text-[#6d5b3d]">
          {error || 'This order may belong to a different table or the link has expired.'}
        </p>
        <Link
          to={`/menu/scan/${token}`}
          className="relative mt-2 inline-flex items-center gap-1.5 rounded-full border border-[#a67f38]/40 px-5 py-2 text-[11px] uppercase tracking-[0.16em] text-[#8a5f20] transition hover:bg-[#a67f38]/10"
        >
          <ArrowLeft size={12} /> Back to menu
        </Link>
      </div>
    );
  }

  const meta = orderStatusMeta[order.status];
  const progress = cancelled ? 100 : currentIndex < 0 ? 0 : (currentIndex / (steps.length - 1)) * 100;

  return (
    <div className="min-h-screen bg-[#f6f0e4] text-[#18130b]">
      <header className="sticky top-0 z-40 border-b border-[#d8b475]/20 bg-[#14100a]/94 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link
            to={`/menu/scan/${token}`}
            className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-[#f4ecdd]/65 transition hover:text-[#f0e2bf]"
          >
            <ArrowLeft size={13} /> Menu
          </Link>
          <span className="font-display text-lg tracking-[0.34em] text-[#f8f2e5]">NILE</span>
          <button
            type="button"
            onClick={() => load()}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#d8b475]/25 bg-white/[0.04] text-[#f0e2bf] transition hover:border-[#d8b475]/55 hover:bg-white/[0.09]"
            aria-label="Refresh order"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:px-6">
        <section className="overflow-hidden rounded-3xl border border-[#d7b46c]/45 bg-[#fffdf9] shadow-[0_30px_70px_-45px_rgba(24,19,11,0.6)]">
          <div className="relative overflow-hidden bg-gradient-to-br from-[#14100a] via-[#241b11] to-[#3d2c17] px-6 py-8 text-[#fbf7ef]">
            <span className="pointer-events-none absolute -right-4 -top-10 font-display text-[10rem] leading-none text-[#e6cd97]/[0.06]">
              N
            </span>
            <span className="pointer-events-none absolute inset-x-6 bottom-0 h-px bg-gradient-to-r from-transparent via-[#d8b475]/45 to-transparent" />
            <div className="relative flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="h-px w-7 bg-[#d8b475]/60" />
                  <p className="text-[9px] uppercase tracking-[0.3em] text-[#e6cd97]">Order status</p>
                </div>
                <p className="mt-3 font-display text-3xl leading-none sm:text-4xl">{cancelled ? 'Cancelled' : meta.label}</p>
                <p className="mt-3 text-[11px] tracking-[0.05em] text-[#f4ecdd]/65">
                  {order.displayNo} · {formatDateTime(order.createdAt)}
                </p>
              </div>
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[9.5px] uppercase tracking-[0.12em] ${cancelled ? 'border-rose-300/30 bg-rose-400/10 text-rose-100' : 'border-[#e6cd97]/35 bg-[#e6cd97]/10 text-[#f0e2bf]'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${cancelled ? 'bg-rose-300' : 'animate-pulse bg-emerald-300'}`} />
                {cancelled ? 'Closed' : 'Live'}
              </span>
            </div>
            <div className="relative mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-[#f4ecdd]/65">
              <span className="inline-flex items-center gap-1.5"><MapPin size={11} className="text-[#d8b475]" /> {order.tableCode} · {order.areaName ?? 'Dining'}</span>
              <span className="inline-flex items-center gap-1.5"><Clock3 size={11} className="text-[#d8b475]" /> {order.items.reduce((sum, item) => sum + item.qty, 0)} dishes</span>
              {order.guestName && <span className="inline-flex items-center gap-1.5"><Utensils size={11} className="text-[#d8b475]" /> {order.guestName}</span>}
            </div>
          </div>

          <div className="px-5 py-6 sm:px-7">
            {cancelled ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-[12px] leading-relaxed text-rose-800">
                This order was cancelled. If this was unexpected, please speak to a member of staff — they can help right away.
              </div>
            ) : (
              <>
                <div className="relative">
                  <div className="absolute left-0 right-0 top-[13px] h-0.5 rounded-full bg-[#18130b]/8">
                    <div className="h-full rounded-full bg-[#c39a4a] transition-all duration-700" style={{ width: `${progress}%` }} />
                  </div>
                  <div className="relative flex justify-between gap-1">
                    {steps.map((step, index) => {
                      const done = index <= currentIndex;
                      const Icon = step.icon;
                      return (
                        <div key={step.status} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                          <span
                            className={`inline-flex h-7 w-7 items-center justify-center rounded-full border-2 transition ${
                              done ? 'border-[#c39a4a] bg-[#c39a4a] text-[#14100a] shadow-[0_0_0_4px_rgba(195,154,74,0.12)]' : 'border-[#18130b]/12 bg-[#fffdf9] text-[#8a7452]'
                            }`}
                          >
                            <Icon size={12} />
                          </span>
                          <span className={`text-center text-[8.5px] uppercase tracking-[0.12em] ${done ? 'text-[#8a5f20]' : 'text-[#8a7452]/60'}`}>
                            {step.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <p className="mt-5 text-center text-[11px] leading-relaxed text-[#6d5b3d]">
                  {order.status === 'new' && 'We have your ticket. The kitchen will accept it shortly.'}
                  {order.status === 'accepted' && 'The kitchen has accepted your order and is getting started.'}
                  {order.status === 'preparing' && 'Your dishes are being prepared right now.'}
                  {order.status === 'ready' && 'Your food is ready and on its way to the table.'}
                  {order.status === 'served' && 'Enjoy your meal. Ask us for anything you need.'}
                  {order.status === 'completed' && 'Thank you for dining with Nile. We hope to see you again.'}
                </p>
              </>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-[#d7b46c]/25 bg-[#fffdf9] p-5 shadow-[0_20px_50px_-42px_rgba(24,19,11,0.6)]">
          <div className="flex items-center gap-2">
            <span className="h-px w-6 bg-[#a67f38]/50" />
            <p className="text-[9.5px] uppercase tracking-[0.28em] text-[#a67f38]">Your dishes</p>
          </div>
          <div className="mt-4 divide-y divide-[#18130b]/8">
            {order.items.map((item, index) => (
              <div key={`${item.name}-${index}`} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-[13px]">
                    <span className="mr-2 inline-flex h-5 min-w-5 items-center justify-center rounded border border-[#a67f38]/30 bg-[#f6ecd8] px-1 text-[10px] font-semibold text-[#8a5f20]">
                      {item.qty}
                    </span>
                    {item.name}
                  </p>
                  {item.addons.length > 0 && <p className="mt-0.5 pl-7 text-[10px] text-[#8a7452]">{item.addons.map((addon) => addon.name).join(' · ')}</p>}
                  {item.notes && <p className="mt-0.5 pl-7 text-[10px] italic text-[#8a7452]">“{item.notes}”</p>}
                </div>
                <span className="shrink-0 text-[12px] text-[#6d5b3d]">{money(item.total)}</span>
              </div>
            ))}
          </div>
          {order.notes && (
            <div className="mt-3 rounded-xl border border-[#a67f38]/20 bg-[#f6ecd8]/60 px-3 py-2 text-[11px] text-[#6d5b3d]">
              {order.notes}
            </div>
          )}
          <div className="mt-4 flex items-end justify-between border-t border-[#d7b46c]/25 pt-3">
            <span className="text-[9.5px] uppercase tracking-[0.22em] text-[#8a7452]">Order total</span>
            <span className="font-display text-xl text-[#8a5f20]">{money(order.total)}</span>
          </div>
        </section>

        {bill && (
          <section className="rounded-3xl border border-[#d7b46c]/25 bg-[#f4ecdd]/50 p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[9.5px] uppercase tracking-[0.28em] text-[#a67f38]">Table bill</p>
              <span className="text-[9px] uppercase tracking-[0.14em] text-[#8a5f20]">
                {bill.balance <= 0.009 ? 'Settled' : 'Balance due'}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-[11.5px]">
              <div className="flex justify-between text-[#6d5b3d]"><span>Subtotal</span><span>{money(bill.subtotal)}</span></div>
              <div className="flex justify-between text-[#6d5b3d]"><span>Service</span><span>{money(bill.serviceCharge)}</span></div>
              {bill.tax > 0 && <div className="flex justify-between text-[#6d5b3d]"><span>Tax</span><span>{money(bill.tax)}</span></div>}
              <div className="flex justify-between text-[#2f6b4b]"><span>Paid</span><span>-{money(bill.paid)}</span></div>
            </div>
            <div className="mt-3 flex items-end justify-between border-t border-[#d7b46c]/25 pt-3">
              <span className="text-[9.5px] uppercase tracking-[0.22em] text-[#8a7452]">{bill.balance > 0.009 ? 'Balance due' : 'Bill total'}</span>
              <span className="font-display text-2xl text-[#8a5f20]">{money(bill.balance > 0.009 ? bill.balance : bill.total)}</span>
            </div>
            <p className="mt-2 text-[10px] text-[#8a7452]">
              {bill.payments.length} payment{bill.payments.length === 1 ? '' : 's'} recorded · settle at the cashier or ask your waiter.
            </p>
          </section>
        )}

        <section className="rounded-3xl border border-[#d7b46c]/25 bg-[#fffdf9] p-5 shadow-[0_20px_50px_-42px_rgba(24,19,11,0.6)]">
          <div className="flex items-center gap-2">
            <span className="h-px w-6 bg-[#a67f38]/50" />
            <p className="text-[9.5px] uppercase tracking-[0.28em] text-[#a67f38]">Status history</p>
          </div>
          <div className="mt-4 space-y-3">
            {order.history.map((entry, index) => (
              <div key={`${entry.status}-${entry.createdAt}-${index}`} className="flex gap-3">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${orderStatusMeta[entry.status]?.dot ?? 'bg-[#c39a4a]'}`} />
                <div className="min-w-0">
                  <p className="text-[12px] text-[#18130b]">{orderStatusMeta[entry.status]?.label ?? entry.status}</p>
                  {entry.note && <p className="mt-0.5 text-[10.5px] leading-relaxed text-[#6d5b3d]">{entry.note}</p>}
                  <p className="mt-0.5 text-[9.5px] text-[#8a7452]">{formatDateTime(entry.createdAt)} · {formatClock(entry.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="grid gap-2 pb-8 sm:grid-cols-2">
          <Link
            to={`/menu/scan/${token}`}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full border border-[#a67f38]/40 text-[12px] font-medium text-[#18130b] transition hover:bg-[#a67f38]/[0.08]"
          >
            <ArrowLeft size={13} /> Back to the menu
          </Link>
          <button
            type="button"
            onClick={callWaiter}
            disabled={callBusy}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full bg-[#b98f45] text-[12px] font-semibold text-[#14100a] shadow-[0_16px_36px_-22px_rgba(166,127,56,0.9)] transition hover:bg-[#c9a45c] disabled:opacity-50"
          >
            <ConciergeBell size={14} /> {callBusy ? 'Calling…' : 'Call a waiter'}
          </button>
        </div>
      </main>
    </div>
  );
}
