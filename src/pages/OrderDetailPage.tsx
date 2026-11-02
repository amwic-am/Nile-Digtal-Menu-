import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Ban,
  ChefHat,
  CheckCircle2,
  Clock3,
  ConciergeBell,
  History,
  MapPin,
  ReceiptText,
  UserRound,
  Utensils,
} from 'lucide-react';
import { api } from '../lib/api';
import type { OrderDetail, OrderStatus } from '../lib/types';
import { elapsedLabel, formatDateTime, money, orderStatusMeta, paymentStatusMeta, titleCase } from '../lib/format';
import { useRealtime } from '../lib/socket';
import { useToast } from '../components/Toast';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  PageLoader,
  Select,
  StatusPill,
  Textarea,
  cn,
} from '../components/ui';

const nextActions: Partial<Record<OrderStatus, { status: OrderStatus; label: string; icon: 'accept' | 'cook' | 'serve' | 'complete' }[]>> = {
  new: [{ status: 'accepted', label: 'Accept order', icon: 'accept' }],
  accepted: [{ status: 'preparing', label: 'Start preparing', icon: 'cook' }],
  preparing: [{ status: 'ready', label: 'Mark ready', icon: 'serve' }],
  ready: [{ status: 'served', label: 'Mark served', icon: 'serve' }],
  served: [{ status: 'completed', label: 'Complete order', icon: 'complete' }],
};

function ActionIcon({ kind }: { kind: 'accept' | 'cook' | 'serve' | 'complete' }) {
  if (kind === 'accept') return <CheckCircle2 size={15} />;
  if (kind === 'cook') return <ChefHat size={15} />;
  if (kind === 'serve') return <ConciergeBell size={15} />;
  return <CheckCircle2 size={15} />;
}

export function OrderDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState('');
  const [waiterId, setWaiterId] = useState('');

  const load = useCallback(async (quiet = false) => {
    try {
      const res = await api<{ order: OrderDetail }>(`/restaurant/orders/${id}`);
      setOrder(res.order);
      setWaiterId(res.order.waiterId ? String(res.order.waiterId) : '');
    } catch (err) {
      if (!quiet) toast.error('Could not load this order', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  useRealtime('order:status', () => load(true));
  useRealtime('order:updated', () => load(true));

  const advance = async (status: OrderStatus) => {
    if (!order) return;
    setBusy(status);
    try {
      await api(`/restaurant/orders/${order.id}/status`, { method: 'PATCH', body: { status } });
      toast.success(`Order ${order.displayNo} is now ${orderStatusMeta[status].label.toLowerCase()}`);
      await load(true);
    } catch (err) {
      toast.error('Status change failed', err instanceof Error ? err.message : 'Please try again');
    } finally {
      setBusy('');
    }
  };

  const cancel = async () => {
    if (!order) return;
    if (cancelReason.trim().length < 3) {
      setCancelError('Please give a short reason for the cancellation.');
      return;
    }
    setBusy('cancel');
    setCancelError('');
    try {
      await api(`/restaurant/orders/${order.id}/cancel`, { method: 'POST', body: { reason: cancelReason.trim() } });
      toast.success(`Order ${order.displayNo} cancelled`, 'The table bill has been recalculated.');
      setCancelOpen(false);
      setCancelReason('');
      await load(true);
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : 'Could not cancel this order');
    } finally {
      setBusy('');
    }
  };

  const assign = async (value: string) => {
    if (!order || !value) return;
    setWaiterId(value);
    try {
      await api(`/restaurant/orders/${order.id}/assign-waiter`, { method: 'POST', body: { staffId: Number(value) } });
      toast.success('Waiter assigned', 'The floor team can see the new owner.');
      await load(true);
    } catch (err) {
      toast.error('Could not assign the waiter', err instanceof Error ? err.message : 'Please try again');
    }
  };

  const itemTotal = useMemo(() => order?.items.reduce((sum, item) => sum + item.total, 0) ?? 0, [order]);
  const canCancel = order ? !['completed', 'cancelled'].includes(order.status) : false;
  const actions = order ? nextActions[order.status] ?? [] : [];

  if (loading) return <PageLoader />;
  if (!order) {
    return (
      <EmptyState
        icon={<ReceiptText size={30} />}
        title="Order not found"
        description="It may have been archived. Head back to the live queue to pick another ticket."
        action={<Button onClick={() => navigate('/admin/restaurant/orders')}>Back to live orders</Button>}
      />
    );
  }

  const meta = orderStatusMeta[order.status];
  const payMeta = paymentStatusMeta[order.paymentStatus] ?? paymentStatusMeta.unpaid;

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-cream-100/40 transition hover:text-cream-50"
      >
        <ArrowLeft size={13} /> Back to orders
      </button>

      <PageHeader
        eyebrow={`${order.source === 'qr' ? 'Guest QR' : order.source === 'waiter' ? 'Waiter' : 'Reception'} order`}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {order.displayNo}
            <StatusPill meta={meta} pulse={order.status === 'new'} />
            <Badge tone={order.paymentStatus === 'paid' ? 'success' : order.paymentStatus === 'partial' ? 'warning' : 'danger'}>
              {payMeta.label}
            </Badge>
          </span>
        }
        description={`Placed ${formatDateTime(order.createdAt)} · open for ${elapsedLabel(order.createdAt)}`}
        actions={
          <>
            {actions.map((action) => (
              <Button
                key={action.status}
                loading={busy === action.status}
                icon={<ActionIcon kind={action.icon} />}
                onClick={() => advance(action.status)}
              >
                {action.label}
              </Button>
            ))}
            {canCancel && (
              <Button variant="danger" icon={<Ban size={14} />} onClick={() => setCancelOpen(true)}>
                Cancel
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-5">
          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="micro">Served at</p>
                <p className="mt-1 flex items-center gap-2 font-display text-2xl text-cream-50">
                  {order.tableCode}
                  <span className="text-sm font-sans text-cream-100/40">{order.areaName}</span>
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-[11px] text-cream-100/40">
                  <MapPin size={11} /> {order.floorName ?? 'Restaurant floor'} · seats {order.capacity}
                </p>
              </div>
              <div className="text-right">
                <p className="micro">Session</p>
                <p className="mt-1 font-mono text-xs text-cream-100/60">{order.sessionCode ?? '—'}</p>
                <p className="mt-1 text-[10px] text-cream-100/30">Opened {formatDateTime(order.sessionOpenedAt)}</p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-ink-950/[0.07] bg-ink-950/[0.02] p-3">
                <p className="micro">Guest</p>
                <p className="mt-1.5 text-sm text-cream-50">{order.guestName ?? 'Table guest'}</p>
                {order.guestRoom && <p className="mt-0.5 text-[10px] text-cream-100/35">Room {order.guestRoom}</p>}
              </div>
              <div className="rounded-xl border border-ink-950/[0.07] bg-ink-950/[0.02] p-3">
                <p className="micro">Waiter</p>
                <p className="mt-1.5 text-sm text-cream-50">{order.waiterName ?? 'Unassigned'}</p>
                <p className="mt-0.5 text-[10px] text-cream-100/35">{titleCase(order.source)} channel</p>
              </div>
              <div className="rounded-xl border border-ink-950/[0.07] bg-ink-950/[0.02] p-3">
                <p className="micro">Ticket age</p>
                <p className="mt-1.5 flex items-center gap-1.5 text-sm text-cream-50">
                  <Clock3 size={13} className="text-gold-300" /> {elapsedLabel(order.createdAt)}
                </p>
                <p className="mt-0.5 text-[10px] text-cream-100/35">{order.itemCount} line items</p>
              </div>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-ink-950/[0.06] px-5 py-4">
              <div>
                <p className="font-display text-lg text-cream-50">Order items</p>
                <p className="mt-0.5 text-[11px] text-cream-100/40">Prices were validated on the server when this ticket was created.</p>
              </div>
              <Badge tone="neutral">{order.itemCount} lines</Badge>
            </div>
            <div className="divide-y divide-ink-950/[0.05]">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-start gap-3 px-5 py-3.5">
                  <span className="mt-0.5 inline-flex h-8 min-w-8 items-center justify-center rounded-lg border border-gold-400/25 bg-gold-400/10 px-2 font-display text-sm text-gold-200">
                    {item.qty}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] text-cream-50">{item.name}</p>
                    <p className="mt-0.5 text-[10.5px] text-cream-100/35">{money(item.unitPrice)} each</p>
                    {item.addons.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {item.addons.map((addon, index) => (
                          <span
                            key={`${item.id}-${index}`}
                            className="rounded-full border border-ink-950/10 bg-ink-950/[0.04] px-2 py-0.5 text-[10px] text-cream-100/55"
                          >
                            + {addon.name} · {money(addon.price)}
                          </span>
                        ))}
                      </div>
                    )}
                    {item.notes && (
                      <p className="mt-1.5 rounded-lg border border-gold-400/15 bg-gold-400/[0.05] px-2.5 py-1.5 text-[11px] italic text-gold-100/75">
                        “{item.notes}”
                      </p>
                    )}
                  </div>
                  <p className="shrink-0 text-right font-display text-base text-cream-50">{money(item.total)}</p>
                </div>
              ))}
              {order.items.length === 0 && (
                <p className="px-5 py-8 text-center text-xs text-cream-100/35">This ticket has no items.</p>
              )}
            </div>
            {order.notes && (
              <div className="border-t border-ink-950/[0.06] bg-ink-950/[0.02] px-5 py-3">
                <p className="micro mb-1">Guest note</p>
                <p className="text-[12px] leading-relaxed text-cream-100/60">{order.notes}</p>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="p-5">
            <p className="micro">Bill summary</p>
            <div className="mt-3 space-y-1.5 text-[12.5px]">
              <div className="flex justify-between text-cream-100/55">
                <span>Items</span>
                <span>{money(itemTotal)}</span>
              </div>
              <div className="flex justify-between text-cream-100/55">
                <span>Subtotal</span>
                <span>{money(order.subtotal)}</span>
              </div>
              <div className="flex justify-between text-cream-100/55">
                <span>Service charge</span>
                <span>{money(order.serviceCharge)}</span>
              </div>
              {order.tax > 0 && (
                <div className="flex justify-between text-cream-100/55">
                  <span>Tax</span>
                  <span>{money(order.tax)}</span>
                </div>
              )}
              {order.discount > 0 && (
                <div className="flex justify-between text-emerald-200/80">
                  <span>Discount</span>
                  <span>-{money(order.discount)}</span>
                </div>
              )}
              <div className="my-2 hairline" />
              <div className="flex items-end justify-between">
                <span className="text-[10px] uppercase tracking-[0.18em] text-cream-100/35">Total</span>
                <span className="font-display text-2xl text-cream-50">{money(order.total)}</span>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Link
                to={`/admin/restaurant/tables/${order.tableId}`}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-ink-950/12 bg-ink-950/[0.04] text-[11px] text-cream-50 transition hover:border-ink-950/20 hover:bg-ink-950/[0.07]"
              >
                <Utensils size={13} /> Table view
              </Link>
              <Link
                to="/admin/restaurant/cashier"
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-gold-400/35 text-[11px] text-gold-200 transition hover:bg-gold-400/10"
              >
                <ReceiptText size={13} /> Take payment
              </Link>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="micro">Assign waiter</p>
              <UserRound size={14} className="text-cream-100/30" />
            </div>
            <div className="mt-3">
              <Field label="Responsible staff">
                <Select value={waiterId} onChange={(event) => assign(event.target.value)}>
                  <option value="">Unassigned</option>
                  {order.waiters.map((waiter) => (
                    <option key={waiter.id} value={waiter.id}>
                      {waiter.name} · {titleCase(waiter.role)}
                    </option>
                  ))}
                </Select>
              </Field>
              <p className="mt-2 text-[10.5px] leading-relaxed text-cream-100/35">
                Assigning a waiter updates every order in this table session and notifies the floor.
              </p>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="micro">Status timeline</p>
              <History size={14} className="text-cream-100/30" />
            </div>
            <div className="mt-4 space-y-0">
              {order.history.map((entry, index) => {
                const entryMeta = orderStatusMeta[entry.status] ?? orderStatusMeta.new;
                return (
                  <div key={`${entry.status}-${entry.createdAt}-${index}`} className="relative flex gap-3 pb-4 last:pb-0">
                    {index < order.history.length - 1 && (
                      <span className="absolute left-[5px] top-4 h-full w-px bg-ink-950/10" />
                    )}
                    <span className={cn('relative mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ring-4 ring-ink-850', entryMeta.dot)} />
                    <div className="min-w-0">
                      <p className="text-[12px] font-medium text-cream-50">{entryMeta.label}</p>
                      {entry.note && <p className="mt-0.5 text-[11px] leading-relaxed text-cream-100/45">{entry.note}</p>}
                      <p className="mt-0.5 text-[10px] text-cream-100/30">
                        {formatDateTime(entry.createdAt)}
                        {entry.changedBy ? ` · ${entry.changedBy}` : ''}
                      </p>
                    </div>
                  </div>
                );
              })}
              {order.history.length === 0 && <p className="text-[11px] text-cream-100/35">No history recorded yet.</p>}
            </div>
          </Card>
        </div>
      </div>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title={`Cancel ${order.displayNo}?`}
        subtitle="Cancelling removes this ticket from revenue and recalculates the table bill. The action is logged under your name."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>Keep order</Button>
            <Button variant="danger" loading={busy === 'cancel'} onClick={cancel}>Cancel order</Button>
          </>
        }
      >
        <Field label="Reason" required>
          <Textarea
            value={cancelReason}
            onChange={(event) => setCancelReason(event.target.value)}
            placeholder="e.g. Guest changed their mind, dish unavailable"
            autoFocus
          />
        </Field>
        {cancelError && (
          <p className="mt-3 rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">{cancelError}</p>
        )}
      </Modal>
    </div>
  );
}
