import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  BellRing,
  Check,
  ConciergeBell,
  Filter,
  HandPlatter,
  MapPin,
  RefreshCw,
  Sparkles,
  Users,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import type { DiningTable, NotificationItem, TableStatus } from '../lib/types';
import { money, tableStatusMeta, timeAgo } from '../lib/format';
import { useAuth } from '../lib/auth';
import { useRealtime } from '../lib/socket';
import { useToast } from '../components/Toast';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  PageLoader,
  StatusPill,
  Tabs,
  cn,
} from '../components/ui';

type FilterId = 'all' | 'mine' | 'occupied' | 'available' | 'cleaning';

export function WaiterPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [filter, setFilter] = useState<FilterId>('all');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true);
    try {
      const res = await api<{ tables: DiningTable[] }>('/restaurant/tables');
      setTables(res.tables);
    } catch (err) {
      if (!quiet) toast.error('Could not load the floor', err instanceof Error ? err.message : 'Try again');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    load(true);
  }, [load]);

  useRealtime('table:updated', () => load(true));
  useRealtime('tables:reload', () => load(true));
  useRealtime('session:opened', () => load(true));
  useRealtime('session:closed', () => load(true));
  useRealtime('notification', (item: NotificationItem) => {
    if (!item?.message) return;
    setNotifications((current) => [item, ...current.filter((entry) => entry.id !== item.id)].slice(0, 14));
    if (item.kind === 'call') {
      toast.info(item.message, item.callType === 'bill' ? 'Bill requested at the table' : 'A guest would like assistance');
    }
  });

  const seat = async (table: DiningTable) => {
    setBusyId(table.id);
    try {
      const res = await api<{ created: boolean; session: { id: number } }>(
        `/restaurant/sessions/tables/${table.id}/open`,
        { method: 'POST', body: { guestsCount: 2 } },
      );
      toast.success(
        res.created ? `${table.code} is now seated` : `${table.code} already had an open session`,
        'Guests can scan the table QR to order.',
      );
      await load(true);
    } catch (err) {
      toast.error('Could not open the table', err instanceof Error ? err.message : 'Please try again');
    } finally {
      setBusyId(null);
    }
  };

  const cleaned = async (table: DiningTable) => {
    setBusyId(table.id);
    try {
      await api(`/restaurant/tables/${table.id}/cleaned`, { method: 'POST' });
      toast.success(`${table.code} is ready for guests`);
      await load(true);
    } catch (err) {
      toast.error('Could not release the table', err instanceof Error ? err.message : 'Please try again');
    } finally {
      setBusyId(null);
    }
  };

  const visible = useMemo(() => {
    const list = tables.filter((table) => {
      if (filter === 'mine') return table.waiterId === user?.id;
      if (filter === 'occupied') return table.status === 'occupied';
      if (filter === 'available') return table.status === 'available' || table.status === 'reserved';
      if (filter === 'cleaning') return table.status === 'cleaning';
      return true;
    });
    const order: Record<TableStatus, number> = { cleaning: 0, occupied: 1, reserved: 2, available: 3, inactive: 4 };
    return list.sort((a, b) => order[a.status] - order[b.status] || a.code.localeCompare(b.code));
  }, [tables, filter, user?.id]);

  const counts = useMemo(() => {
    return {
      all: tables.length,
      mine: tables.filter((table) => table.waiterId === user?.id).length,
      occupied: tables.filter((table) => table.status === 'occupied').length,
      available: tables.filter((table) => table.status === 'available' || table.status === 'reserved').length,
      cleaning: tables.filter((table) => table.status === 'cleaning').length,
    };
  }, [tables, user?.id]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={user ? `Good service, ${user.name.split(' ')[0]}` : 'Service floor'}
        title="Waiter station"
        description="Seat guests, watch the floor and answer calls without leaving the pass. Table cards update in real time."
        actions={
          <>
            <Button variant="secondary" icon={<RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />} onClick={() => load()}>
              Refresh
            </Button>
            <Button icon={<UtensilsCrossed size={15} />} onClick={() => navigate('/admin/restaurant/orders')}>
              Live orders
            </Button>
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[1.7fr_1fr]">
        <div className="space-y-4">
          <Card className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
            <Tabs
              variant="pill"
              items={[
                { id: 'all', label: 'All', count: counts.all },
                { id: 'mine', label: 'My tables', count: counts.mine },
                { id: 'occupied', label: 'Seated', count: counts.occupied },
                { id: 'available', label: 'Ready', count: counts.available },
                { id: 'cleaning', label: 'Cleaning', count: counts.cleaning },
              ]}
              value={filter}
              onChange={(id) => setFilter(id as FilterId)}
            />
            <span className="hidden items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-cream-100/30 sm:inline-flex">
              <Filter size={11} /> {visible.length} tables
            </span>
          </Card>

          {loading ? (
            <PageLoader />
          ) : visible.length === 0 ? (
            <EmptyState
              icon={<HandPlatter size={30} />}
              title="Nothing needs you here"
              description="Try another filter, or head to the floor plan to see every table at once."
              action={
                <Button variant="secondary" onClick={() => navigate('/admin/restaurant/floor-plan')}>
                  Open floor plan
                </Button>
              }
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {visible.map((table) => {
                const meta = tableStatusMeta[table.status];
                const mine = table.waiterId === user?.id;
                return (
                  <Card key={table.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => navigate(`/admin/restaurant/tables/${table.id}`)}
                        className="min-w-0 text-left"
                      >
                        <div className="flex items-center gap-2">
                          <p className="font-display text-2xl leading-none text-cream-50">{table.code}</p>
                          {mine && <Badge tone="gold">Mine</Badge>}
                        </div>
                        <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-cream-100/40">
                          <MapPin size={11} /> {table.areaName} · seats {table.capacity}
                        </p>
                      </button>
                      <StatusPill meta={meta} pulse={table.status === 'cleaning'} />
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl border border-ink-950/[0.06] bg-ink-950/[0.02] p-2.5 text-center">
                      <div>
                        <p className="text-[9px] uppercase tracking-[0.14em] text-cream-100/30">Guests</p>
                        <p className="mt-1 font-display text-base text-cream-50">{table.guestsCount ?? '—'}</p>
                      </div>
                      <div>
                        <p className="text-[9px] uppercase tracking-[0.14em] text-cream-100/30">Orders</p>
                        <p className="mt-1 font-display text-base text-cream-50">{table.orderCount}</p>
                      </div>
                      <div>
                        <p className="text-[9px] uppercase tracking-[0.14em] text-cream-100/30">Bill</p>
                        <p className="mt-1 font-display text-base text-cream-50">
                          {table.sessionId ? money(table.billTotal) : '—'}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate text-[10.5px] text-cream-100/35">
                        {table.waiterName ? `Waiter · ${table.waiterName}` : 'No waiter assigned'}
                      </p>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {table.status === 'cleaning' ? (
                          <Button size="xs" variant="success" icon={<Sparkles size={12} />} loading={busyId === table.id} onClick={() => cleaned(table)}>
                            Cleaning done
                          </Button>
                        ) : table.sessionId ? (
                          <Button size="xs" variant="secondary" onClick={() => navigate(`/admin/restaurant/tables/${table.id}`)}>
                            Open table
                          </Button>
                        ) : (
                          <Button size="xs" loading={busyId === table.id} onClick={() => seat(table)}>
                            Seat guests
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="micro">Call bell</p>
                <p className="mt-1 text-sm text-cream-50">Requests from the floor</p>
              </div>
              <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-gold-400/25 bg-gold-400/10 text-gold-200">
                <BellRing size={16} />
                {notifications.filter((item) => item.kind === 'call').length > 0 && (
                  <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-400 px-1 text-[9px] font-semibold text-night">
                    {notifications.filter((item) => item.kind === 'call').length}
                  </span>
                )}
              </span>
            </div>

            <div className="mt-4 space-y-2">
              {notifications.length === 0 ? (
                <div className="rounded-xl border border-dashed border-ink-950/10 px-4 py-8 text-center">
                  <Bell size={20} className="mx-auto text-cream-100/20" />
                  <p className="mt-2 text-[11px] text-cream-100/30">Calls and new orders appear here in real time.</p>
                </div>
              ) : (
                notifications.map((item) => (
                  <div
                    key={item.id}
                    className={cn(
                      'flex items-start gap-2.5 rounded-xl border px-3 py-2.5',
                      item.kind === 'call'
                        ? 'border-gold-400/25 bg-gold-400/[0.07]'
                        : 'border-ink-950/[0.07] bg-ink-950/[0.025]',
                    )}
                  >
                    <span className={cn('mt-0.5', item.kind === 'call' ? 'text-gold-300' : 'text-cream-100/40')}>
                      {item.kind === 'call' ? <BellRing size={14} /> : <ConciergeBell size={14} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11.5px] leading-snug text-cream-50">{item.message}</p>
                      <p className="mt-0.5 text-[9.5px] text-cream-100/30">{timeAgo(item.createdAt)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {item.tableId && (
                        <button
                          type="button"
                          onClick={() => navigate(`/admin/restaurant/tables/${item.tableId}`)}
                          className="rounded-full border border-ink-950/10 px-2 py-0.5 text-[9.5px] text-cream-100/60 transition hover:text-cream-50"
                        >
                          Open
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setNotifications((current) => current.filter((entry) => entry.id !== item.id))}
                        className="rounded-full p-1 text-cream-100/30 transition hover:text-cream-50"
                        aria-label="Dismiss"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card className="p-4">
            <p className="micro">Floor at a glance</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-emerald-300/15 bg-emerald-400/[0.05] px-3 py-2.5">
                <p className="text-[9px] uppercase tracking-[0.14em] text-emerald-200/60">Ready to seat</p>
                <p className="mt-1 font-display text-xl text-cream-50">{counts.available}</p>
              </div>
              <div className="rounded-xl border border-gold-400/20 bg-gold-400/[0.06] px-3 py-2.5">
                <p className="text-[9px] uppercase tracking-[0.14em] text-gold-200/60">Seated now</p>
                <p className="mt-1 font-display text-xl text-cream-50">{counts.occupied}</p>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-ink-950/[0.06] bg-ink-950/[0.02] px-3 py-2.5">
              <Users size={14} className="text-cream-100/35" />
              <p className="text-[10.5px] leading-relaxed text-cream-100/40">
                {tables.reduce((sum, table) => sum + (table.guestsCount ?? 0), 0)} guests in the restaurant right now.
              </p>
            </div>
          </Card>

          <Card className="p-4">
            <p className="micro">Recently updated</p>
            <div className="mt-3 space-y-2">
              {tables
                .filter((table) => table.sessionId)
                .slice(0, 4)
                .map((table) => (
                  <button
                    key={table.id}
                    type="button"
                    onClick={() => navigate(`/admin/restaurant/tables/${table.id}`)}
                    className="flex w-full items-center justify-between gap-2 rounded-lg border border-ink-950/[0.05] px-3 py-2 text-left transition hover:border-ink-950/15"
                  >
                    <span className="flex items-center gap-2 text-[11.5px] text-cream-100/70">
                      <Check size={12} className="text-emerald-300" /> {table.code} · {table.guestsCount ?? 0} guests
                    </span>
                    <span className="text-[10px] text-cream-100/35">{money(table.billTotal)}</span>
                  </button>
                ))}
              {tables.filter((table) => table.sessionId).length === 0 && (
                <p className="text-[11px] text-cream-100/30">No occupied tables yet.</p>
              )}
            </div>
          </Card>

          <p className="flex items-center gap-1.5 px-1 text-[9.5px] text-cream-100/20">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" />
            Listening for calls and new orders in real time
          </p>
        </div>
      </div>
    </div>
  );
}
