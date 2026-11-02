import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  DoorClosed,
  QrCode,
  RefreshCw,
  Users,
  UtensilsCrossed,
} from 'lucide-react';
import { api } from '../lib/api';
import type { SessionSummary } from '../lib/types';
import { formatDateTime, money, orderStatusMeta, timeAgo } from '../lib/format';
import { useAuth } from '../lib/auth';
import { useRealtime } from '../lib/socket';
import { useToast } from '../components/Toast';
import { BillBreakdown } from '../components/Billing';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Modal,
  PageHeader,
  PageLoader,
  StatusPill,
  Tabs,
  cn,
} from '../components/ui';

type SessionRow = {
  id: number;
  code: string;
  status: 'open' | 'closed';
  guestsCount: number;
  openedAt: string;
  closedAt: string | null;
  tableId: number;
  tableCode: string;
  capacity: number;
  areaName: string;
  openedByName: string | null;
  orderCount: number;
  total: number;
  paid: number;
  guestRows: number;
  balance: number;
};

type TabId = 'open' | 'closed' | 'all';

export function SessionsPage() {
  const toast = useToast();
  const { user } = useAuth();
  const [tab, setTab] = useState<TabId>('open');
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<SessionRow | null>(null);
  const [detail, setDetail] = useState<SessionSummary | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [forceOpen, setForceOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true);
    try {
      const res = await api<{ sessions: SessionRow[] }>(`/restaurant/sessions?status=${tab}`);
      setSessions(res.sessions);
      setSelected((current) => (current ? res.sessions.find((session) => session.id === current.id) ?? null : null));
    } catch (err) {
      if (!quiet) toast.error('Could not load table sessions', err instanceof Error ? err.message : 'Try again');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tab, toast]);

  useEffect(() => {
    setLoading(true);
    load(true);
  }, [load]);

  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    api<{ session: SessionSummary }>(`/restaurant/sessions/${selected.id}`)
      .then((res) => {
        if (!cancelled) setDetail(res.session);
      })
      .catch((err: Error) => {
        if (!cancelled) toast.error('Could not load this session', err.message);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected, toast]);

  useRealtime('session:opened', () => load(true));
  useRealtime('session:closed', () => load(true));
  useRealtime('bill:updated', () => load(true));

  const stats = useMemo(() => {
    const open = sessions.filter((session) => session.status === 'open');
    return {
      open: open.length,
      guests: open.reduce((sum, session) => sum + Math.max(session.guestsCount, session.guestRows), 0),
      outstanding: open.reduce((sum, session) => sum + Math.max(0, session.balance), 0),
      sales: open.reduce((sum, session) => sum + Number(session.total), 0),
    };
  }, [sessions]);

  const closeSession = async (force: boolean) => {
    if (!selected) return;
    setBusy(true);
    try {
      await api(`/restaurant/sessions/${selected.id}/close`, {
        method: 'POST',
        body: force ? { force: true } : {},
      });
      toast.success(`Session ${selected.code} closed`, `Table ${selected.tableCode} sent to housekeeping.`);
      setCloseOpen(false);
      setForceOpen(false);
      setSelected(null);
      await load(true);
    } catch (err) {
      toast.error('Could not close the session', err instanceof Error ? err.message : 'Try again');
    } finally {
      setBusy(false);
    }
  };

  const canForce = user?.role === 'manager' || user?.role === 'super_admin';
  const balance = detail?.bill?.balance ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Table lifecycle"
        title="Table sessions"
        description="A session binds every scan, order and payment to one table visit. Close it to settle the bill and release the table."
        actions={
          <Button variant="secondary" icon={<RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />} onClick={() => load()}>
            Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: tab === 'closed' ? 'Sessions shown' : 'Open tables', value: tab === 'closed' ? sessions.length : stats.open },
          { label: 'Guests seated', value: stats.guests },
          { label: 'Open sales', value: money(stats.sales) },
          { label: 'Outstanding', value: money(stats.outstanding) },
        ].map((stat) => (
          <Card key={stat.label} className="p-4">
            <p className="text-[10px] uppercase tracking-[0.16em] text-cream-100/40">{stat.label}</p>
            <p className="mt-2 font-display text-2xl leading-none text-cream-50">{stat.value}</p>
          </Card>
        ))}
      </div>

      <Card className="flex items-center justify-between gap-3 p-3">
        <Tabs
          variant="pill"
          value={tab}
          onChange={(id) => setTab(id as TabId)}
          items={[
            { id: 'open', label: 'Open' },
            { id: 'closed', label: 'Closed' },
            { id: 'all', label: 'All' },
          ]}
        />
        <span className="hidden text-[10px] uppercase tracking-[0.14em] text-cream-100/30 sm:block">{sessions.length} records</span>
      </Card>

      {loading ? (
        <PageLoader />
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={<Users size={30} />}
          title={tab === 'open' ? 'No open sessions' : 'No sessions found'}
          description={tab === 'open' ? 'Seat guests from the waiter station or by scanning a table QR to open the first session.' : 'Older sessions will appear here after the first table is closed.'}
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {sessions.map((session) => (
            <Card key={session.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <button type="button" className="min-w-0 text-left" onClick={() => setSelected(session)}>
                  <div className="flex items-center gap-2">
                    <p className="font-display text-xl text-cream-50">{session.tableCode}</p>
                    <Badge tone={session.status === 'open' ? 'success' : 'neutral'}>{session.status}</Badge>
                  </div>
                  <p className="mt-1 text-[10.5px] text-cream-100/40">
                    {session.code} · {session.areaName} · {session.guestsCount} guests
                  </p>
                  <p className="mt-0.5 text-[10px] text-cream-100/30">
                    Opened {timeAgo(session.openedAt)}{session.openedByName ? ` by ${session.openedByName}` : ''}
                  </p>
                </button>
                <div className="text-right">
                  <p className="font-display text-lg text-cream-50">{money(session.total)}</p>
                  <p className={cn('mt-0.5 text-[10px]', session.balance > 0.009 ? 'text-rose-200/80' : 'text-emerald-200/80')}>
                    {session.status === 'closed' ? 'Closed' : session.balance > 0.009 ? `${money(session.balance)} due` : 'Settled'}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-3 text-[10px] text-cream-100/35">
                  <span className="inline-flex items-center gap-1"><UtensilsCrossed size={11} /> {session.orderCount} orders</span>
                  <span className="inline-flex items-center gap-1"><Clock3 size={11} /> {formatDateTime(session.openedAt).split(' · ')[1]}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button size="xs" variant="ghost" onClick={() => setSelected(session)}>Details</Button>
                  <Link
                    to={`/admin/restaurant/tables/${session.tableId}`}
                    className="inline-flex h-7 items-center gap-1 rounded-full border border-ink-950/10 px-2.5 text-[10px] text-cream-100/60 transition hover:text-cream-50"
                  >
                    Table <ArrowUpRight size={10} />
                  </Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected ? `${selected.tableCode} · session ${selected.code}` : undefined}
        subtitle={selected ? `${selected.areaName} · opened ${formatDateTime(selected.openedAt)}` : undefined}
        size="lg"
        footer={
          selected?.status === 'open' ? (
            <>
              <Button variant="ghost" onClick={() => setSelected(null)}>Close panel</Button>
              {balance <= 0.009 ? (
                <Button variant="success" icon={<CheckCircle2 size={15} />} onClick={() => setCloseOpen(true)}>
                  Close session
                </Button>
              ) : canForce ? (
                <Button variant="danger" icon={<DoorClosed size={15} />} onClick={() => setForceOpen(true)}>
                  Close with balance
                </Button>
              ) : (
                <Button variant="secondary" disabled>Balance must be settled</Button>
              )}
            </>
          ) : (
            <Button variant="secondary" onClick={() => setSelected(null)}>Close panel</Button>
          )
        }
      >
        {detailLoading ? (
          <PageLoader />
        ) : detail ? (
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-4">
              <div className="rounded-xl border border-ink-950/[0.07] bg-ink-950/[0.02] p-4">
                <p className="micro mb-2">Guests at this table</p>
                <div className="space-y-1.5">
                  {detail.guests.map((guest) => (
                    <div key={guest.id} className="flex items-center justify-between gap-2 text-[11.5px]">
                      <span className="text-cream-100/70">{guest.name}</span>
                      <span className="text-[10px] text-cream-100/30">{guest.isLead ? 'Lead guest' : 'Guest'}</span>
                    </div>
                  ))}
                  {detail.guests.length === 0 && <p className="text-[11px] text-cream-100/30">No guests recorded.</p>}
                </div>
              </div>

              <div className="rounded-xl border border-ink-950/[0.07] bg-ink-950/[0.02] p-4">
                <p className="micro mb-2">Orders in this session</p>
                <div className="space-y-2">
                  {detail.orders.map((order) => {
                    const meta = orderStatusMeta[order.status];
                    return (
                      <div key={order.id} className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-[11.5px] text-cream-50">{order.displayNo} · {order.itemCount} items</p>
                          <p className="text-[9.5px] text-cream-100/30">{formatDateTime(order.createdAt)}</p>
                        </div>
                        <div className="text-right">
                          <StatusPill meta={meta} showDot={false} />
                          <p className="mt-0.5 text-[10.5px] text-cream-100/55">{money(order.total)}</p>
                        </div>
                      </div>
                    );
                  })}
                  {detail.orders.length === 0 && <p className="text-[11px] text-cream-100/30">No orders yet.</p>}
                </div>
              </div>

              {detail.qrToken && (
                <div className="flex items-center gap-2 rounded-xl border border-gold-400/20 bg-gold-400/[0.05] px-3 py-2.5 text-[10.5px] text-cream-100/50">
                  <QrCode size={14} className="text-gold-300" /> QR ordering is live for this table.
                </div>
              )}
            </div>

            <div>
              {detail.bill ? (
                <BillBreakdown bill={detail.bill} />
              ) : (
                <p className="text-[11px] text-cream-100/35">No bill has been generated for this session yet.</p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-xs text-cream-100/40">Session details are unavailable.</p>
        )}
      </Modal>

      <ConfirmDialog
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        onConfirm={() => closeSession(false)}
        title="Close this session?"
        description="The table will be released for cleaning and its bill marked settled. Guests will need to scan again for a new visit."
        confirmLabel="Close session"
        tone="success"
        loading={busy}
      />
      <ConfirmDialog
        open={forceOpen}
        onClose={() => setForceOpen(false)}
        onConfirm={() => closeSession(true)}
        title="Close with an outstanding balance?"
        description={
          <>
            <strong className="text-rose-200">{money(balance)}</strong> remains unpaid. The bill will be voided and the table released.
            Only managers can perform this action and it is logged.
          </>
        }
        confirmLabel="Close anyway"
        loading={busy}
      />
    </div>
  );
}
