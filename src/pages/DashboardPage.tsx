import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  Armchair,
  Banknote,
  CalendarDays,
  ChefHat,
  ClipboardList,
  Clock3,
  ConciergeBell,
  QrCode,
  ReceiptText,
  Sparkles,
  Timer,
  TrendingUp,
  Users,
} from 'lucide-react';
import { api } from '../lib/api';
import type { DashboardData } from '../lib/types';
import { useRealtime } from '../lib/socket';
import {
  formatClock,
  money,
  number,
  orderStatusMeta,
  tableStatusMeta,
  timeAgo,
} from '../lib/format';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  PageLoader,
  ProgressBar,
  StatCard,
  StatusPill,
  cn,
} from '../components/ui';

export function DashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await api<DashboardData>('/restaurant/dashboard');
      setData(res);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dashboard could not load');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtime('order:created', () => void load());
  useRealtime('order:status', () => void load());
  useRealtime('table:updated', () => void load());
  useRealtime('bill:updated', () => void load());
  useRealtime('tables:reload', () => void load());

  const areas = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, DashboardData['tablesMap']>();
    for (const table of data.tablesMap) {
      const list = map.get(table.areaName) ?? [];
      list.push(table);
      map.set(table.areaName, list);
    }
    return [...map.entries()];
  }, [data]);

  if (!data) {
    return error ? (
      <EmptyState title="Dashboard unavailable" description={error} action={<Button onClick={load}>Try again</Button>} />
    ) : (
      <PageLoader />
    );
  }

  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening';
  const orderTotal = Object.values(data.orders).reduce((sum, count) => sum + count, 0);
  const maxItem = Math.max(1, ...data.topItems.map((item) => item.qty));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={greeting}
        title="Nile Restaurant, live"
        description="Every table, ticket and bill in one calm view. Status changes sync across the kitchen, waiters and cashier."
        actions={
          <>
            <Button variant="secondary" icon={<QrCode size={15} />} onClick={() => navigate('/admin/restaurant/qr-codes')}>
              QR studio
            </Button>
            <Button icon={<Armchair size={15} />} onClick={() => navigate('/admin/restaurant/tables')}>
              Manage tables
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          label="Available"
          value={number(data.tables.available)}
          hint="Ready for customers"
          icon={<Armchair size={18} />}
          accent="text-emerald-300"
          onClick={() => navigate('/admin/restaurant/tables?status=available')}
        />
        <StatCard
          label="Occupied"
          value={number(data.tables.occupied)}
          hint={`${data.openSessions} open session${data.openSessions === 1 ? '' : 's'}`}
          icon={<Users size={18} />}
          accent="text-gold-300"
          onClick={() => navigate('/admin/restaurant/tables?status=occupied')}
        />
        <StatCard
          label="Reserved"
          value={number(data.tables.reserved)}
          hint="Reservation scheduled"
          icon={<CalendarDays size={18} />}
          accent="text-indigo-300"
          onClick={() => navigate('/admin/restaurant/tables?status=reserved')}
        />
        <StatCard
          label="Needs cleaning"
          value={number(data.tables.cleaning)}
          hint="Housekeeping required"
          icon={<Sparkles size={18} />}
          accent="text-orange-300"
          onClick={() => navigate('/admin/restaurant/tables?status=cleaning')}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <p className="micro">Sales today</p>
            <TrendingUp size={15} className="text-gold-300/80" />
          </div>
          <p className="mt-2 font-display text-3xl text-cream-50">{money(data.today.sales)}</p>
          <p className="mt-1 text-[11px] text-cream-100/35">{data.today.orders} orders · avg {money(data.today.avgTicket)}</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <p className="micro">Payments collected</p>
            <Banknote size={15} className="text-emerald-300/80" />
          </div>
          <p className="mt-2 font-display text-3xl text-cream-50">{money(data.today.revenue)}</p>
          <p className="mt-1 text-[11px] text-cream-100/35">Recorded at the cashier today</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <p className="micro">Live tickets</p>
            <ChefHat size={15} className="text-orange-300/80" />
          </div>
          <p className="mt-2 font-display text-3xl text-cream-50">{number(orderTotal)}</p>
          <p className="mt-1 text-[11px] text-cream-100/35">
            {data.orders.new} new · {data.orders.preparing} preparing · {data.orders.ready} ready
          </p>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="micro">Live service</p>
                <h2 className="mt-1 font-display text-xl text-cream-50">Order flow</h2>
              </div>
              <Link
                to="/admin/restaurant/orders"
                className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.16em] text-gold-200 hover:text-gold-100"
              >
                Open board <ArrowUpRight size={11} />
              </Link>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {(['new', 'accepted', 'preparing', 'ready', 'served'] as const).map((status) => (
                <Link
                  key={status}
                  to={`/admin/restaurant/orders?status=${status}`}
                  className="group rounded-xl border border-ink-950/[0.07] bg-ink-950/[0.025] p-3 transition hover:border-gold-400/25 hover:bg-ink-950/[0.045]"
                >
                  <span className="flex items-center gap-1.5">
                    <span className={cn('h-1.5 w-1.5 rounded-full', orderStatusMeta[status].dot)} />
                    <span className="text-[9px] uppercase tracking-[0.14em] text-cream-100/35">{orderStatusMeta[status].label}</span>
                  </span>
                  <span className="mt-2 block font-display text-2xl leading-none text-cream-50">{data.orders[status]}</span>
                </Link>
              ))}
            </div>

            <div className="mt-5 overflow-hidden rounded-xl border border-ink-950/[0.06]">
              <div className="grid grid-cols-[64px_70px_1fr_96px_84px] gap-2 bg-ink-950/[0.03] px-3 py-2 text-[9px] uppercase tracking-[0.14em] text-cream-100/30">
                <span>Order</span>
                <span>Table</span>
                <span className="hidden sm:block">Items</span>
                <span className="text-right">Total</span>
                <span className="text-right">Status</span>
              </div>
              <div className="divide-y divide-ink-950/[0.04]">
                {data.recentOrders.length === 0 ? (
                  <p className="px-3 py-6 text-center text-xs text-cream-100/35">No orders yet today.</p>
                ) : (
                  data.recentOrders.map((order) => (
                    <Link
                      key={order.id}
                      to={`/admin/restaurant/orders/${order.id}`}
                      className="grid grid-cols-[64px_70px_1fr_96px_84px] items-center gap-2 px-3 py-2.5 transition hover:bg-ink-950/[0.03]"
                    >
                      <span className="text-[12px] font-medium text-cream-50">{order.displayNo}</span>
                      <span className="text-[11.5px] text-cream-100/60">{order.tableCode}</span>
                      <span className="hidden truncate text-[11px] text-cream-100/40 sm:block">
                        {order.itemsSummary ?? '—'}
                      </span>
                      <span className="text-right text-[11.5px] text-cream-100/70">{money(order.total)}</span>
                      <span className="flex justify-end">
                        <StatusPill meta={orderStatusMeta[order.status]} showDot={false} className="px-2 py-0.5 text-[9.5px]" />
                      </span>
                    </Link>
                  ))
                )}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" icon={<ClipboardList size={13} />} onClick={() => navigate('/admin/restaurant/orders')}>
                Live orders
              </Button>
              <Button size="sm" variant="secondary" icon={<ChefHat size={13} />} onClick={() => navigate('/admin/restaurant/kitchen')}>
                Kitchen display
              </Button>
              <Button size="sm" variant="ghost" icon={<ConciergeBell size={13} />} onClick={() => navigate('/admin/restaurant/waiter')}>
                Waiter station
              </Button>
              <Button size="sm" variant="ghost" icon={<ReceiptText size={13} />} onClick={() => navigate('/admin/restaurant/cashier')}>
                Cashier
              </Button>
            </div>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="p-5">
              <div className="flex items-center justify-between">
                <p className="micro">Top dishes today</p>
                <span className="text-[9px] uppercase tracking-[0.14em] text-cream-100/25">By quantity</span>
              </div>
              <div className="mt-4 space-y-3">
                {data.topItems.length === 0 ? (
                  <p className="py-6 text-center text-xs text-cream-100/35">No dishes sold yet.</p>
                ) : (
                  data.topItems.map((item, index) => (
                    <div key={item.name}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="w-4 text-[10px] text-cream-100/25">0{index + 1}</span>
                          <span className="truncate text-[12px] text-cream-100/75">{item.name}</span>
                        </span>
                        <span className="shrink-0 text-[11px] text-cream-100/45">
                          {item.qty} · {money(item.revenue)}
                        </span>
                      </div>
                      <ProgressBar value={(item.qty / maxItem) * 100} className="mt-1.5" />
                    </div>
                  ))
                )}
              </div>
            </Card>

            <Card className="p-5">
              <div className="flex items-center justify-between">
                <p className="micro">Upcoming reservations</p>
                <CalendarDays size={14} className="text-indigo-300/70" />
              </div>
              <div className="mt-3 space-y-2">
                {data.reservations.length === 0 ? (
                  <p className="py-6 text-center text-xs text-cream-100/35">No upcoming reservations.</p>
                ) : (
                  data.reservations.map((reservation) => (
                    <div key={reservation.id} className="flex items-center justify-between gap-2 rounded-lg border border-ink-950/[0.05] bg-ink-950/[0.02] px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-[12px] text-cream-100/80">{reservation.customerName}</p>
                        <p className="text-[10px] text-cream-100/35">
                          {reservation.tableCode} · {reservation.guests} guests
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[11px] text-gold-200">{formatClock(reservation.reservedAt)}</p>
                        <p className="text-[9px] uppercase tracking-[0.1em] text-cream-100/25">{reservation.status}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="mt-3 w-full"
                onClick={() => navigate('/admin/restaurant/reservations')}
              >
                All reservations
              </Button>
            </Card>
          </div>
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="micro">Floor overview</p>
                <h2 className="mt-1 font-display text-xl text-cream-50">{areas.length} dining areas</h2>
              </div>
              <Button size="sm" variant="secondary" onClick={() => navigate('/admin/restaurant/floor-plan')}>
                Floor plan
              </Button>
            </div>

            <div className="mt-4 space-y-4">
              {areas.map(([areaName, tables]) => (
                <div key={areaName}>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-cream-100/35">{areaName}</p>
                    <p className="text-[9px] text-cream-100/25">{tables.length} tables</p>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                    {tables.map((table) => {
                      const meta = tableStatusMeta[table.status];
                      return (
                        <Link
                          key={table.id}
                          to={`/admin/restaurant/tables/${table.id}`}
                          className="rounded-lg border border-ink-950/[0.06] bg-ink-950/[0.025] px-2.5 py-2 transition hover:border-gold-400/25"
                        >
                          <span className="flex items-center justify-between gap-1">
                            <span className="text-[11px] font-medium text-cream-100/80">{table.code}</span>
                            <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
                          </span>
                          <span className="mt-0.5 block text-[9px] capitalize text-cream-100/30">{meta.label}</span>
                          {table.sessionId && table.billTotal > 0 && (
                            <span className="mt-1 block text-[9.5px] text-gold-200/80">{money(table.billTotal)}</span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <p className="micro">Activity</p>
              <Clock3 size={14} className="text-cream-100/25" />
            </div>
            <div className="mt-3 space-y-3">
              {data.activity.length === 0 ? (
                <p className="py-4 text-center text-xs text-cream-100/35">No recent activity.</p>
              ) : (
                data.activity.slice(0, 6).map((entry) => (
                  <div key={entry.id} className="flex gap-2.5">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold-400/70" />
                    <div className="min-w-0">
                      <p className="text-[11.5px] leading-snug text-cream-100/65">{entry.detail}</p>
                      <p className="mt-0.5 text-[9.5px] uppercase tracking-[0.1em] text-cream-100/25">
                        {entry.tableCode} · {timeAgo(entry.createdAt)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b border-ink-950/[0.06] px-5 py-4">
              <p className="micro">Guest demo</p>
              <p className="mt-1 text-sm text-cream-50">Scan a live table</p>
            </div>
            <div className="space-y-2 p-4">
              <p className="text-[11px] leading-relaxed text-cream-100/40">
                Open the guest menu as if you had scanned T-001. Add dishes, try the AR preview and send an order to this dashboard.
              </p>
              <Button
                variant="goldOutline"
                size="sm"
                className="w-full"
                icon={<QrCode size={13} />}
                onClick={() => window.open('/demo', '_blank', 'noopener')}
              >
                Open guest menu
              </Button>
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <Card className="p-4">
              <Timer size={15} className="text-cream-100/30" />
              <p className="mt-2 font-display text-xl text-cream-50">{data.tables.total}</p>
              <p className="text-[9.5px] uppercase tracking-[0.14em] text-cream-100/30">Active tables</p>
            </Card>
            <Card className="p-4">
              <Badge tone="success">Live</Badge>
              <p className="mt-2 font-display text-xl text-cream-50">
                {data.openSessions}/{data.tables.occupied}
              </p>
              <p className="text-[9.5px] uppercase tracking-[0.14em] text-cream-100/30">Sessions seated</p>
            </Card>
          </div>
        </div>
      </div>

      <Card className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-gold-400/25 bg-gold-400/10">
            <QrCode size={15} className="text-gold-300" />
          </span>
          <div>
            <p className="text-[12px] text-cream-100/75">One QR per table, one consolidated bill per session.</p>
            <p className="text-[10px] text-cream-100/35">Tokens are random, revocable and never expose database IDs.</p>
          </div>
        </div>
        <Link to="/admin/restaurant/sessions" className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.16em] text-gold-200">
          View sessions <ArrowUpRight size={11} />
        </Link>
      </Card>
    </div>
  );
}
