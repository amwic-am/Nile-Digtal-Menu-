import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlarmClock,
  CheckCircle2,
  ChefHat,
  ExternalLink,
  Expand,
  Flame,
  Minimize2,
  RefreshCw,
  Soup,
  Timer,
  Users,
} from 'lucide-react';
import { api } from '../lib/api';
import type { OrderStatus } from '../lib/types';
import { formatClock, orderStatusMeta, titleCase } from '../lib/format';
import { useRealtime } from '../lib/socket';
import { useToast } from '../components/Toast';
import { Button, EmptyState, PageLoader, cn } from '../components/ui';

type KitchenItem = {
  id: number;
  name: string;
  qty: number;
  notes: string | null;
  addons: Array<{ name: string; price: number }>;
};

type KitchenOrder = {
  id: number;
  orderNo: number;
  displayNo: string;
  status: OrderStatus;
  notes: string | null;
  guestName: string | null;
  createdAt: string;
  tableCode: string;
  areaName: string | null;
  waiterName: string | null;
  seats: number;
  guests: number | null;
  items: KitchenItem[];
};

type SeatSummary = {
  availableTables: number;
  freeSeats: number;
};

const columns: Array<{ status: OrderStatus; title: string; hint: string; tone: string }> = [
  { status: 'new', title: 'Incoming', hint: 'Accept to start the ticket', tone: 'border-gold-400/25' },
  { status: 'accepted', title: 'Queued', hint: 'Waiting for a station', tone: 'border-sky-300/20' },
  { status: 'preparing', title: 'On the fire', hint: 'Cooking now', tone: 'border-orange-300/20' },
];

const advanceLabel: Partial<Record<OrderStatus, string>> = {
  new: 'Accept',
  accepted: 'Start cooking',
  preparing: 'Mark ready',
  ready: 'Hand to floor',
};

const advanceTo: Partial<Record<OrderStatus, OrderStatus>> = {
  new: 'accepted',
  accepted: 'preparing',
  preparing: 'ready',
  ready: 'served',
};

function dishCount(order: KitchenOrder) {
  return order.items.reduce((sum, item) => sum + item.qty, 0);
}

function freeSeats(order: KitchenOrder) {
  if (order.guests == null) return null;
  return Math.max(0, order.seats - order.guests);
}

export function KitchenPage() {
  const toast = useToast();
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [seats, setSeats] = useState<SeatSummary>({ availableTables: 0, freeSeats: 0 });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));
  const [, setTick] = useState(0);

  const load = useCallback(async (quiet = false) => {
    try {
      const [res, floor] = await Promise.all([
        api<{ orders: KitchenOrder[] }>('/restaurant/orders/kitchen'),
        api<{ tables: Array<{ status: string; capacity: number }> }>('/restaurant/tables').catch(() => null),
      ]);
      setOrders(res.orders);
      if (floor) {
        const open = floor.tables.filter((table) => table.status === 'available');
        setSeats({
          availableTables: open.length,
          freeSeats: open.reduce((sum, table) => sum + table.capacity, 0),
        });
      }
    } catch (err) {
      if (!quiet) toast.error('Could not reach the kitchen queue', err instanceof Error ? err.message : 'Try again');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
    const timer = setInterval(() => {
      setTick((value) => value + 1);
      load(true);
    }, 20_000);
    const onFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => {
      clearInterval(timer);
      document.removeEventListener('fullscreenchange', onFullscreen);
    };
  }, [load]);

  useRealtime('order:created', () => load(true));
  useRealtime('order:status', () => load(true));

  const advance = async (order: KitchenOrder) => {
    const next = advanceTo[order.status];
    if (!next) return;
    setBusyId(order.id);
    try {
      await api(`/restaurant/orders/${order.id}/status`, { method: 'PATCH', body: { status: next } });
      await load(true);
    } catch (err) {
      toast.error('Could not update the ticket', err instanceof Error ? err.message : 'Please try again');
    } finally {
      setBusyId(null);
    }
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      toast.error('Fullscreen is unavailable', 'Your browser blocked the request.');
    }
  };

  const readyOrders = useMemo(() => orders.filter((order) => order.status === 'ready'), [orders]);

  const stats = useMemo(() => {
    const active = orders.length;
    const items = orders.reduce((sum, order) => sum + dishCount(order), 0);
    const oldest = orders.reduce((value, order) => Math.max(value, Date.now() - new Date(order.createdAt).getTime()), 0);
    return { active, items, oldest: Math.round(oldest / 60000) };
  }, [orders]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow mb-2">Back of house</p>
          <h1 className="font-display text-[1.7rem] leading-tight text-cream-50 sm:text-[2rem]">Kitchen display</h1>
          <p className="mt-1.5 text-sm text-cream-100/45">A calm, glanceable pass. Tickets move straight to the guest’s phone when you touch them.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-2 hidden items-center gap-4 text-[10px] uppercase tracking-[0.14em] text-cream-100/35 sm:flex">
            <span className="inline-flex items-center gap-1.5"><Soup size={12} /> {stats.active} tickets</span>
            <span className="inline-flex items-center gap-1.5"><Flame size={12} /> {stats.items} dishes</span>
            <span className="inline-flex items-center gap-1.5"><Users size={12} /> {seats.freeSeats} seats free</span>
            <span className="inline-flex items-center gap-1.5"><AlarmClock size={12} /> oldest {stats.oldest}m</span>
          </div>
          <Button variant="secondary" icon={<RefreshCw size={14} />} onClick={() => load()}>Refresh</Button>
          <Button variant="secondary" icon={fullscreen ? <Minimize2 size={14} /> : <Expand size={14} />} onClick={toggleFullscreen}>
            {fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          </Button>
        </div>
      </div>

      {loading ? (
        <PageLoader />
      ) : (
        <>
          {readyOrders.length > 0 && (
            <section className="animate-fade-up rounded-xl border border-emerald-300/25 bg-emerald-400/[0.05] p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-emerald-300/30 bg-emerald-400/10 text-emerald-200">
                    <CheckCircle2 size={14} />
                  </span>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-100">Ready to serve</p>
                    <p className="mt-0.5 text-[10px] text-emerald-100/45">Call the order number, hand it to the floor</p>
                  </div>
                </div>
                <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full border border-emerald-300/25 bg-ink-950/5 px-2 font-display text-sm text-emerald-100">
                  {readyOrders.length}
                </span>
              </div>

              <div className="mt-3 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                {readyOrders.map((order) => {
                  const minutes = Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60000);
                  const free = freeSeats(order);
                  const dishes = dishCount(order);
                  return (
                    <article
                      key={order.id}
                      className="flex items-center gap-3 rounded-lg border border-emerald-300/20 bg-ink-850/90 p-3 shadow-lg"
                    >
                      <div className="min-w-[62px] text-center">
                        <p className="font-display text-2xl leading-none text-cream-50">{order.displayNo}</p>
                        <p className="mt-1 text-[8px] font-semibold uppercase tracking-[0.16em] text-emerald-200/60">ready</p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11.5px] text-cream-50">
                          {order.tableCode}
                          <span className="text-cream-100/40"> · {order.areaName ?? 'Floor'}</span>
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-cream-100/40">
                          <span className="inline-flex items-center gap-1"><Users size={9} /> {order.seats} seats</span>
                          {free != null && <span className="text-emerald-200/70">· {free} free</span>}
                          <span>·</span>
                          <span>{dishes} {dishes === 1 ? 'dish' : 'dishes'}</span>
                          <span>·</span>
                          <span>{minutes}m</span>
                        </p>
                        <p className="mt-1 truncate text-[10px] text-cream-100/55">
                          {order.items.map((item) => `${item.qty}× ${item.name}`).join(' · ')}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <Link
                          to={`/admin/restaurant/orders/${order.id}`}
                          className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-ink-950/10 text-cream-100/40 transition hover:text-cream-50"
                          aria-label="Open order detail"
                        >
                          <ExternalLink size={11} />
                        </Link>
                        <Button size="xs" loading={busyId === order.id} onClick={() => advance(order)}>
                          Hand to floor
                        </Button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          <div className="grid gap-4 lg:grid-cols-3">
            {columns.map((column) => {
              const list = orders.filter((order) => order.status === column.status);
              return (
                <section key={column.status} className="flex min-h-[280px] flex-col">
                  <div className={cn('flex items-center justify-between gap-2 rounded-xl border bg-ink-950/[0.025] px-3.5 py-2.5', column.tone)}>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cream-50">{column.title}</p>
                      <p className="mt-0.5 text-[10px] text-cream-100/30">{column.hint}</p>
                    </div>
                    <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full border border-ink-950/12 bg-ink-950/5 px-2 font-display text-sm text-cream-50">
                      {list.length}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-1 flex-col gap-3">
                    {list.length === 0 ? (
                      <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-ink-950/[0.08] px-4 py-10 text-center">
                        <p className="text-[11px] text-cream-100/25">No tickets here</p>
                      </div>
                    ) : (
                      list.map((order) => {
                        const meta = orderStatusMeta[order.status];
                        const minutes = Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60000);
                        const rush = minutes >= 20 && order.status !== 'ready';
                        const free = freeSeats(order);
                        return (
                          <article
                            key={order.id}
                            className={cn(
                              'animate-fade-up rounded-xl border bg-ink-850/90 p-3.5 shadow-xl',
                              rush ? 'border-rose-400/35' : 'border-ink-950/[0.08]',
                            )}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="font-display text-xl leading-none text-cream-50">{order.displayNo}</p>
                                  <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
                                </div>
                                <p className="mt-1 text-[11px] text-cream-100/55">
                                  {order.tableCode}
                                  <span className="text-cream-100/30"> · {order.areaName ?? 'Floor'}</span>
                                </p>
                                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-cream-100/40">
                                  <span className="inline-flex items-center gap-1"><Users size={9} /> {order.seats} seats</span>
                                  {free != null && (
                                    <span
                                      className={cn(
                                        'inline-flex items-center rounded-full border px-1.5 py-px text-[9.5px]',
                                        free > 0
                                          ? 'border-emerald-300/20 bg-emerald-400/[0.06] text-emerald-200/80'
                                          : 'border-ink-950/10 text-cream-100/35',
                                      )}
                                    >
                                      {free} free
                                    </span>
                                  )}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]', rush ? 'border-rose-400/30 bg-rose-500/10 text-rose-200' : 'border-ink-950/10 bg-ink-950/[0.04] text-cream-100/45')}>
                                  <Timer size={10} /> {minutes}m
                                </p>
                                <p className="mt-1 text-[9px] text-cream-100/25">{formatClock(order.createdAt)}</p>
                              </div>
                            </div>

                            <div className="my-3 hairline" />

                            <ul className="space-y-1.5">
                              {order.items.map((item) => (
                                <li key={item.id} className="flex items-start gap-2 text-[12px]">
                                  <span className="mt-px inline-flex h-5 min-w-5 items-center justify-center rounded border border-gold-400/25 bg-gold-400/10 px-1 text-[10px] font-semibold text-gold-200">
                                    {item.qty}
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block text-cream-100/85">{item.name}</span>
                                    {item.addons.length > 0 && (
                                      <span className="mt-0.5 block text-[10px] text-cream-100/40">
                                        {item.addons.map((addon) => addon.name).join(' · ')}
                                      </span>
                                    )}
                                    {item.notes && (
                                      <span className="mt-0.5 block text-[10px] italic text-gold-200/70">{item.notes}</span>
                                    )}
                                  </span>
                                </li>
                              ))}
                            </ul>

                            {order.notes && (
                              <p className="mt-2.5 rounded-lg border border-gold-400/15 bg-gold-400/[0.06] px-2.5 py-1.5 text-[10.5px] leading-relaxed text-gold-100/80">
                                {order.notes}
                              </p>
                            )}

                            <div className="mt-3 flex items-center justify-between gap-2">
                              <div className="min-w-0 text-[9.5px] text-cream-100/30">
                                {order.waiterName ? `Waiter ${order.waiterName}` : order.guestName ?? 'Guest'}
                              </div>
                              <div className="flex shrink-0 items-center gap-1.5">
                                <Link
                                  to={`/admin/restaurant/orders/${order.id}`}
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-ink-950/10 text-cream-100/40 transition hover:text-cream-50"
                                  aria-label="Open order detail"
                                >
                                  <ExternalLink size={12} />
                                </Link>
                                <Button size="xs" loading={busyId === order.id} onClick={() => advance(order)}>
                                  {advanceLabel[order.status] ?? 'Advance'}
                                </Button>
                              </div>
                            </div>
                          </article>
                        );
                      })
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}

      {!loading && orders.length === 0 && (
        <EmptyState
          icon={<ChefHat size={30} />}
          title="The kitchen is all caught up"
          description="New tickets land here the moment a guest places an order — no refresh needed."
        />
      )}

      <p className="flex flex-wrap items-center gap-2 text-[10px] text-cream-100/25">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" />
        Live sync active · tickets refresh automatically every 20 seconds and instantly on new orders · status {orders.length ? titleCase('active') : 'idle'}
        <span className="text-cream-100/20">· {seats.availableTables} tables open with {seats.freeSeats} free seats</span>
      </p>
    </div>
  );
}
