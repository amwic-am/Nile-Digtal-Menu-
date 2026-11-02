import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ClipboardList,
  Clock3,
  History,
  RefreshCw,
  Search,
  Timer,
  Utensils,
} from 'lucide-react';
import { api } from '../lib/api';
import type { OrderStatus, OrderSummary } from '../lib/types';
import { elapsedLabel, money, orderStatusMeta, paymentStatusMeta } from '../lib/format';
import { useRealtime } from '../lib/socket';
import { useToast } from '../components/Toast';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  PageLoader,
  StatusPill,
  Tabs,
  cn,
} from '../components/ui';

type OrdersResponse = {
  orders: OrderSummary[];
  counts: { new: number; accepted: number; preparing: number; ready: number; served: number; active: number };
};

const statusTabs: Array<{ id: string; label: string }> = [
  { id: 'active', label: 'Active' },
  { id: 'new', label: 'New' },
  { id: 'accepted', label: 'Accepted' },
  { id: 'preparing', label: 'Preparing' },
  { id: 'ready', label: 'Ready' },
  { id: 'served', label: 'Served' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
];

export function OrdersPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [status, setStatus] = useState('active');
  const [history, setHistory] = useState(false);
  const [search, setSearch] = useState('');
  const [data, setData] = useState<OrdersResponse>({
    orders: [],
    counts: { new: 0, accepted: 0, preparing: 0, ready: 0, served: 0, active: 0 },
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true);
    const params = new URLSearchParams();
    params.set('status', history ? 'all' : status);
    if (history) params.set('history', 'true');
    if (search.trim()) params.set('q', search.trim());
    const res = await api<OrdersResponse>(`/restaurant/orders?${params}`);
    setData(res);
  }, [history, status, search]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load(true)
      .catch((err: Error) => {
        if (!cancelled) toast.error('Could not load orders', err.message);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [load, toast]);

  const refresh = useCallback(() => {
    load().catch((err: Error) => toast.error('Could not refresh orders', err.message));
  }, [load, toast]);

  useRealtime('order:created', refresh);
  useRealtime('order:status', refresh);
  useRealtime('order:updated', refresh);

  const tabs = useMemo(
    () =>
      statusTabs.map((tab) => ({
        ...tab,
        count: tab.id === 'active' ? data.counts.active : ((data.counts as Record<string, number>)[tab.id] ?? 0),
      })),
    [data.counts],
  );

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Service floor"
        title="Live orders"
        description="Every ticket from the QR menu, waiter station and kitchen in one synchronized queue."
        actions={
          <>
            <Button
              variant="secondary"
              icon={<History size={15} />}
              onClick={() => setHistory((value) => !value)}
              className={cn(history && 'border-gold-400/40 text-gold-200')}
            >
              {history ? 'Showing all history' : 'Older orders'}
            </Button>
            <Button variant="secondary" icon={<RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />} onClick={refresh}>
              Refresh
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {(['new', 'accepted', 'preparing', 'ready', 'served'] as OrderStatus[]).map((key) => {
          const meta = orderStatusMeta[key];
          return (
            <Card
              key={key}
              className={cn(
                'cursor-pointer p-4 transition hover:border-ink-950/20',
                status === key && !history && 'border-gold-400/45 bg-gold-400/[0.06]',
              )}
            >
              <button
                type="button"
                className="w-full text-left"
                onClick={() => {
                  setHistory(false);
                  setStatus(key);
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] uppercase tracking-[0.14em] text-cream-100/40">{meta.label}</span>
                  <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
                </div>
                <p className="mt-2 font-display text-2xl leading-none text-cream-50">
                  {(data.counts as Record<string, number>)[key] ?? 0}
                </p>
              </button>
            </Card>
          );
        })}
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-xs">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cream-100/35" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Order number, table or guest"
              className="pl-9"
            />
          </div>
          <Tabs items={tabs} value={history ? 'history' : status} onChange={(id) => { setHistory(false); setStatus(id); }} variant="pill" />
        </div>
      </Card>

      {loading ? (
        <PageLoader />
      ) : data.orders.length === 0 ? (
        <EmptyState
          icon={<ClipboardList size={30} />}
          title={history ? 'No older orders found' : 'The queue is clear'}
          description={
            history
              ? 'Orders from previous days will appear here once they exist.'
              : 'New tickets will appear the moment a guest orders from a table QR or a waiter submits an order.'
          }
          action={
            <Button variant="secondary" onClick={() => navigate('/admin/restaurant/qr-codes')}>
              Open QR studio
            </Button>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="hidden grid-cols-[86px_1.2fr_1.6fr_110px_110px_90px_64px] items-center gap-3 border-b border-ink-950/[0.06] bg-ink-950/[0.025] px-4 py-3 text-[9px] uppercase tracking-[0.16em] text-cream-100/35 lg:grid">
            <span>Order</span>
            <span>Table</span>
            <span>Items</span>
            <span>Status</span>
            <span>Payment</span>
            <span className="text-right">Total</span>
            <span />
          </div>
          <div className="divide-y divide-ink-950/[0.05]">
            {data.orders.map((order) => {
              const meta = orderStatusMeta[order.status];
              const payMeta = paymentStatusMeta[order.paymentStatus] ?? paymentStatusMeta.unpaid;
              return (
                <button
                  key={order.id}
                  type="button"
                  onClick={() => navigate(`/admin/restaurant/orders/${order.id}`)}
                  className="group block w-full px-4 py-3.5 text-left transition hover:bg-ink-950/[0.035]"
                >
                  <div className="flex items-start justify-between gap-3 lg:grid lg:grid-cols-[86px_1.2fr_1.6fr_110px_110px_90px_64px] lg:items-center">
                    <div className="flex items-center gap-2">
                      <span className="font-display text-lg text-cream-50">{order.displayNo}</span>
                      <span className="lg:hidden"><StatusPill meta={meta} pulse={order.status === 'new'} /></span>
                    </div>

                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-cream-50">
                        {order.tableCode}
                        <span className="ml-2 text-[11px] font-normal text-cream-100/40">{order.areaName}</span>
                      </p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-cream-100/35">
                        <Clock3 size={10} /> {elapsedLabel(order.createdAt)} ago
                        {order.source === 'qr' && <Badge tone="gold" className="ml-1 px-1.5 py-0">QR</Badge>}
                      </p>
                    </div>

                    <div className="hidden min-w-0 lg:block">
                      <p className="truncate text-[11.5px] text-cream-100/55">{order.itemsSummary ?? 'No items'}</p>
                      <p className="mt-0.5 text-[10px] text-cream-100/30">
                        {order.itemCount} item{order.itemCount === 1 ? '' : 's'}
                        {order.waiterName ? ` · ${order.waiterName}` : ''}
                        {order.guestName ? ` · ${order.guestName}` : ''}
                      </p>
                    </div>

                    <div className="hidden lg:block">
                      <StatusPill meta={meta} pulse={order.status === 'new'} />
                    </div>
                    <div className="hidden lg:block">
                      <Badge tone={order.paymentStatus === 'paid' ? 'success' : order.paymentStatus === 'partial' ? 'warning' : 'danger'}>
                        {payMeta.label}
                      </Badge>
                    </div>

                    <div className="text-right">
                      <p className="font-display text-base text-cream-50">{money(order.total)}</p>
                      <p className="mt-0.5 text-[9px] uppercase tracking-[0.14em] text-cream-100/30">
                        {order.itemCount} items
                      </p>
                    </div>

                    <div className="hidden justify-end lg:flex">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full text-cream-100/30 transition group-hover:bg-ink-950/[0.06] group-hover:text-gold-200">
                        <ArrowRight size={15} />
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-4 text-[10px] text-cream-100/30">
        <span className="inline-flex items-center gap-1.5"><Utensils size={11} /> {data.orders.length} tickets shown</span>
        <span className="inline-flex items-center gap-1.5"><Timer size={11} /> Statuses sync live to the kitchen and guest phones</span>
      </div>
    </div>
  );
}
