import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  ArrowLeft,
  ArrowRightLeft,
  Armchair,
  Banknote,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Download,
  History,
  MapPin,
  Merge,
  Pencil,
  Plus,
  Printer,
  QrCode,
  ReceiptText,
  RefreshCw,
  UserCheck,
  UserPlus,
  Users,
  UtensilsCrossed,
} from 'lucide-react';
import { api, downloadFile } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useRealtime } from '../lib/socket';
import type { DiningTable, QrTable, TableDetailResponse, TableStatus } from '../lib/types';
import {
  formatClock,
  formatDate,
  formatDateTime,
  money,
  orderStatusMeta,
  tableStatusMeta,
  timeAgo,
} from '../lib/format';
import { useToast } from '../components/Toast';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  CopyField,
  EmptyState,
  Field,
  Input,
  Menu,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  Modal,
  PageLoader,
  Select,
  StatusPill,
  Tabs,
  Textarea,
  cn,
} from '../components/ui';
import { BillBreakdown, PaymentModal } from '../components/Billing';
import { QrCard } from '../components/QrCard';

const tabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'orders', label: 'Current orders' },
  { id: 'items', label: 'Menu orders' },
  { id: 'bill', label: 'Current bill' },
  { id: 'payments', label: 'Payments' },
  { id: 'qr', label: 'QR code' },
  { id: 'history', label: 'Order history' },
  { id: 'activity', label: 'Activity' },
];

const statuses: TableStatus[] = ['available', 'occupied', 'reserved', 'cleaning', 'inactive'];

function localInputValue(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function Receipt({
  data,
}: {
  data: TableDetailResponse;
}) {
  const bill = data.bill;
  if (!bill) return null;
  return (
    <div className="mx-auto max-w-[360px] bg-white px-6 py-7 text-[#15120c]">
      <div className="text-center">
        <p className="font-display text-2xl tracking-[0.16em]">NILE</p>
        <p className="mt-1 text-[8px] uppercase tracking-[0.26em] text-[#a67f38]">Hotel Restaurant · Addis Ababa</p>
        <p className="mt-1 text-[9px] text-[#6d5b3d]">{data.table.areaName} · {data.table.floorName}</p>
      </div>
      <div className="mt-4 border-y border-dashed border-[#15120c]/20 py-2 text-[10px]">
        <div className="flex justify-between"><span>Table</span><span className="font-semibold">{data.table.code}</span></div>
        <div className="mt-1 flex justify-between"><span>Session</span><span>{data.session?.code ?? '—'}</span></div>
        <div className="mt-1 flex justify-between"><span>Printed</span><span>{formatDateTime(new Date())}</span></div>
      </div>
      <div className="mt-3 space-y-1.5 text-[10.5px]">
        {bill.items.map((item) => (
          <div key={item.name} className="flex justify-between gap-2">
            <span className="min-w-0 truncate">{item.qty} × {item.name}</span>
            <span className="shrink-0">{money(item.total)}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 border-t border-[#15120c]/15 pt-2 text-[10.5px]">
        <div className="flex justify-between"><span>Subtotal</span><span>{money(bill.subtotal)}</span></div>
        <div className="flex justify-between"><span>Service charge</span><span>{money(bill.serviceCharge)}</span></div>
        {bill.tax > 0 && <div className="flex justify-between"><span>Tax</span><span>{money(bill.tax)}</span></div>}
        <div className="mt-1.5 flex justify-between border-t border-[#15120c]/15 pt-1.5 text-[13px] font-bold"><span>Total</span><span>{money(bill.total)}</span></div>
        <div className="flex justify-between"><span>Paid</span><span>{money(bill.paid)}</span></div>
        <div className="flex justify-between font-semibold"><span>Balance</span><span>{money(Math.max(0, bill.balance))}</span></div>
      </div>
      <p className="mt-4 text-center text-[8.5px] text-[#6d5b3d]">Thank you for dining with Nile · እናመሰግናለን</p>
    </div>
  );
}

export function TableDetailPage() {
  const { id } = useParams();
  const tableId = Number(id);
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();

  const [data, setData] = useState<TableDetailResponse | null>(null);
  const [qr, setQr] = useState<QrTable | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('overview');
  const [busy, setBusy] = useState(false);

  const [openSessionOpen, setOpenSessionOpen] = useState(false);
  const [guests, setGuests] = useState('2');
  const [assignOpen, setAssignOpen] = useState(false);
  const [waiterId, setWaiterId] = useState('');
  const [transferOpen, setTransferOpen] = useState(false);
  const [toTableId, setToTableId] = useState('');
  const [allTables, setAllTables] = useState<DiningTable[]>([]);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeIds, setMergeIds] = useState<number[]>([]);
  const [reserveOpen, setReserveOpen] = useState(false);
  const [reserveForm, setReserveForm] = useState({
    customerName: '',
    phone: '',
    guests: '2',
    reservedAt: localInputValue(new Date(Date.now() + 2 * 60 * 60 * 1000)),
    durationMin: '120',
    deposit: '0',
    notes: '',
  });
  const [reserveError, setReserveError] = useState('');
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusValue, setStatusValue] = useState<TableStatus>('available');
  const [payOpen, setPayOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [detail, qrRes] = await Promise.all([
        api<TableDetailResponse>(`/restaurant/tables/${tableId}`),
        api<{ tables: QrTable[] }>('/restaurant/qr'),
      ]);
      setData(detail);
      setQr(qrRes.tables.find((entry) => entry.id === tableId) ?? null);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Table could not load');
    } finally {
      setLoading(false);
    }
  }, [tableId]);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtime('order:status', () => void load());
  useRealtime('order:created', () => void load());
  useRealtime('bill:updated', () => void load());
  useRealtime('tables:reload', () => void load());
  useRealtime('reservations:updated', () => void load());
  useRealtime('qr:updated', () => void load());
  useRealtime<{ id?: number }>('table:updated', (payload) => {
    if (!payload?.id || payload.id === tableId) void load();
  });

  const loadTables = useCallback(async () => {
    const res = await api<{ tables: DiningTable[] }>('/restaurant/tables?includeInactive=true');
    setAllTables(res.tables);
    return res.tables;
  }, []);

  const run = async (action: () => Promise<unknown>, success: { title: string; description?: string }) => {
    setBusy(true);
    try {
      await action();
      toast.push({ ...success, tone: 'success' });
      await load();
      return true;
    } catch (err) {
      toast.push({ title: 'Action failed', description: err instanceof Error ? err.message : 'Please try again', tone: 'error' });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const openSession = () =>
    run(
      () => api(`/restaurant/sessions/tables/${tableId}/open`, { method: 'POST', body: { guestsCount: Number(guests) } }),
      { title: 'Table session opened', description: 'Guests can now scan the QR and order.' },
    ).then((ok) => {
      if (ok) setOpenSessionOpen(false);
    });

  const assignWaiter = () =>
    run(
      () => api(`/restaurant/tables/${tableId}/assign-waiter`, { method: 'POST', body: { staffId: Number(waiterId) } }),
      { title: 'Waiter assigned' },
    ).then((ok) => {
      if (ok) setAssignOpen(false);
    });

  const transfer = () =>
    run(
      () => api(`/restaurant/tables/${tableId}/transfer`, { method: 'POST', body: { toTableId: Number(toTableId) } }),
      { title: 'Guests transferred', description: 'The open session moved to the destination table.' },
    ).then((ok) => {
      if (ok) setTransferOpen(false);
    });

  const merge = () =>
    run(
      () => api('/restaurant/tables/merge', { method: 'POST', body: { primaryTableId: tableId, mergeTableIds: mergeIds } }),
      { title: 'Tables merged', description: 'Guests and orders now share this consolidated bill.' },
    ).then((ok) => {
      if (ok) setMergeOpen(false);
    });

  const reserve = async (event: FormEvent) => {
    event.preventDefault();
    setReserveError('');
    setBusy(true);
    try {
      await api('/restaurant/reservations', {
        method: 'POST',
        body: {
          tableId,
          customerName: reserveForm.customerName,
          phone: reserveForm.phone || null,
          guests: Number(reserveForm.guests),
          reservedAt: new Date(reserveForm.reservedAt).toISOString(),
          durationMin: Number(reserveForm.durationMin),
          deposit: Number(reserveForm.deposit),
          notes: reserveForm.notes || null,
        },
      });
      toast.push({ title: 'Reservation created', description: `${reserveForm.customerName} is booked for ${data?.table.code}.`, tone: 'success' });
      setReserveOpen(false);
      await load();
    } catch (err) {
      setReserveError(err instanceof Error ? err.message : 'Reservation could not be created');
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = () =>
    run(
      () => api(`/restaurant/tables/${tableId}/status`, { method: 'PATCH', body: { status: statusValue } }),
      { title: 'Status updated' },
    ).then((ok) => {
      if (ok) setStatusOpen(false);
    });

  const cleaned = () =>
    run(
      () => api(`/restaurant/tables/${tableId}/cleaned`, { method: 'POST' }),
      { title: 'Table released', description: 'Housekeeping confirmed the table is ready.' },
    );

  const pay = async (payload: { amount: number; method: 'cash' | 'card' | 'telebirr' | 'room_charge'; reference: string | null }) => {
    if (!data?.session) return;
    await api(`/restaurant/sessions/${data.session.id}/payments`, { method: 'POST', body: payload });
    toast.push({ title: 'Payment recorded', description: `${money(payload.amount)} received.`, tone: 'success' });
    await load();
  };

  const closeSession = async () => {
    if (!data?.session) return;
    setBusy(true);
    try {
      await api(`/restaurant/sessions/${data.session.id}/close`, {
        method: 'POST',
        body: { force: (data.bill?.balance ?? 0) > 0.009 },
      });
      toast.push({ title: 'Session closed', description: 'The table is now marked for cleaning.', tone: 'success' });
      setCloseOpen(false);
      await load();
    } catch (err) {
      toast.push({ title: 'Could not close session', description: err instanceof Error ? err.message : 'Try again', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const regenerateQr = async () => {
    setBusy(true);
    try {
      await api(`/restaurant/qr/tables/${tableId}/regenerate`, { method: 'POST' });
      toast.push({ title: 'QR regenerated', description: 'The previous code was revoked immediately.', tone: 'success' });
      setRegenOpen(false);
      await load();
    } catch (err) {
      toast.push({ title: 'Could not regenerate QR', description: err instanceof Error ? err.message : 'Try again', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <PageLoader />;
  if (!data || error) {
    return (
      <EmptyState
        title="Table not found"
        description={error || 'This table may have been archived.'}
        action={<Button onClick={() => navigate('/admin/restaurant/tables')}>Back to tables</Button>}
      />
    );
  }

  const { table, session, bill } = data;
  const meta = tableStatusMeta[table.status];
  const hasSession = Boolean(session);
  const isManager = user?.role === 'manager' || user?.role === 'super_admin';
  const mergeCandidates = allTables.filter((entry) => entry.id !== tableId && entry.sessionId);
  const transferCandidates = allTables.filter(
    (entry) => entry.id !== tableId && !entry.sessionId && !['cleaning', 'inactive'].includes(entry.status),
  );

  const openTransfer = async () => {
    setTransferOpen(true);
    if (!allTables.length) await loadTables().catch(() => undefined);
  };
  const openMerge = async () => {
    setMergeOpen(true);
    if (!allTables.length) await loadTables().catch(() => undefined);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/admin/restaurant/tables')}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink-950/10 text-cream-100/50 transition hover:text-cream-50"
          aria-label="Back to tables"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="min-w-0">
          <p className="eyebrow">Table detail</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl leading-none text-cream-50">{table.code}</h1>
            <StatusPill meta={meta} pulse={table.status === 'occupied'} />
            {session && <Badge tone="gold">Session {session.code}</Badge>}
            {!table.isActive && <Badge tone="neutral">Inactive</Badge>}
          </div>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-cream-100/40">
            <span>{table.areaName}</span>
            <span>·</span>
            <span>{table.floorName}</span>
            <span>·</span>
            <span className="inline-flex items-center gap-1"><Users size={11} /> {table.capacity} seats</span>
            {table.waiterName && (
              <>
                <span>·</span>
                <span className="inline-flex items-center gap-1"><UserCheck size={11} /> {table.waiterName}</span>
              </>
            )}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {hasSession ? (
            <Button icon={<Banknote size={15} />} onClick={() => setTab('bill')}>Take payment</Button>
          ) : table.status === 'cleaning' ? (
            <Button icon={<CheckCircle2 size={15} />} onClick={cleaned} loading={busy}>Mark cleaned</Button>
          ) : (
            <Button icon={<Plus size={15} />} onClick={() => setOpenSessionOpen(true)} disabled={!table.isActive}>Open session</Button>
          )}
          <Menu
            width="w-60"
            trigger={<Button variant="secondary" size="md">Table actions</Button>}
          >
            <MenuLabel>{table.code}</MenuLabel>
            {!hasSession && table.status !== 'cleaning' && (
              <MenuItem icon={<Plus size={14} />} onClick={() => setOpenSessionOpen(true)}>Open session</MenuItem>
            )}
            <MenuItem icon={<UserPlus size={14} />} onClick={() => { setAssignOpen(true); setWaiterId(table.waiterId ? String(table.waiterId) : ''); }}>
              Assign waiter
            </MenuItem>
            <MenuItem icon={<ArrowRightLeft size={14} />} onClick={() => void openTransfer()}>Transfer guests</MenuItem>
            <MenuItem icon={<Merge size={14} />} onClick={() => void openMerge()}>Merge tables</MenuItem>
            <MenuItem icon={<CalendarDays size={14} />} onClick={() => setReserveOpen(true)}>Reserve table</MenuItem>
            <MenuItem icon={<Pencil size={14} />} onClick={() => { setStatusOpen(true); setStatusValue(table.status); }}>Change status</MenuItem>
            {table.status === 'cleaning' && (
              <MenuItem icon={<CheckCircle2 size={14} />} onClick={cleaned}>Mark as cleaned</MenuItem>
            )}
            <MenuSeparator />
            <MenuItem
              icon={<QrCode size={14} />}
              onClick={async () => {
                await loadTables().catch(() => undefined);
                setTab('qr');
              }}
            >
              View QR code
            </MenuItem>
            <MenuItem icon={<RefreshCw size={14} />} onClick={() => setRegenOpen(true)}>Regenerate QR</MenuItem>
          </Menu>
          <Button variant="ghost" size="md" icon={<RefreshCw size={14} />} onClick={() => void load()}>Refresh</Button>
        </div>
      </div>

      <Tabs items={tabs} value={tab} onChange={setTab} />

      {tab === 'overview' && (
        <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="p-4">
                <p className="micro">Status</p>
                <div className="mt-2"><StatusPill meta={meta} /></div>
                <p className="mt-2 text-[10px] text-cream-100/30">{table.isActive ? 'Active table' : 'Deactivated'}</p>
              </Card>
              <Card className="p-4">
                <p className="micro">Active orders</p>
                <p className="mt-2 font-display text-2xl text-cream-50">{data.orders.length}</p>
                <p className="text-[10px] text-cream-100/30">{bill ? `${bill.orderCount} billable` : 'No bill yet'}</p>
              </Card>
              <Card className="p-4">
                <p className="micro">Live bill</p>
                <p className="mt-2 font-display text-2xl text-cream-50">{money(table.billTotal)}</p>
                <p className="text-[10px] text-cream-100/30">{bill ? `${money(Math.max(0, bill.balance))} due` : '—'}</p>
              </Card>
              <Card className="p-4">
                <p className="micro">Guests seated</p>
                <p className="mt-2 font-display text-2xl text-cream-50">{session?.guestsCount ?? 0}</p>
                <p className="text-[10px] text-cream-100/30">{data.guests.length} session guest{data.guests.length === 1 ? '' : 's'}</p>
              </Card>
            </div>

            <Card className="p-5">
              <div className="flex items-center justify-between">
                <p className="micro">Table information</p>
                <Armchair size={15} className="text-cream-100/25" />
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {[
                  ['Dining area', table.areaName],
                  ['Floor', table.floorName],
                  ['Capacity', `${table.capacity} guests`],
                  ['Shape', table.shape === 'rect' ? 'Rectangle' : table.shape === 'round' ? 'Round' : 'Square'],
                  ['Location', table.locationLabel || 'Not specified'],
                  ['Waiter', table.waiterName || 'Unassigned'],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-ink-950/[0.05] bg-ink-950/[0.02] px-3 py-2.5">
                    <p className="text-[9px] uppercase tracking-[0.14em] text-cream-100/30">{label}</p>
                    <p className="mt-1 text-[12.5px] text-cream-100/75">{value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge tone={qr?.qr ? 'success' : 'danger'}><QrCode size={10} /> {qr?.qr ? 'QR active' : 'QR missing'}</Badge>
                {qr?.qr && <span className="text-[10px] text-cream-100/30">Created {formatDate(qr.qr.createdAt ?? '')}</span>}
                <button type="button" onClick={() => setTab('qr')} className="text-[10px] uppercase tracking-[0.12em] text-gold-300 hover:text-gold-200">
                  Open QR
                </button>
              </div>
            </Card>

            <Card className="p-5">
              <div className="flex items-center justify-between">
                <p className="micro">Session</p>
                <Users size={15} className="text-cream-100/25" />
              </div>
              {session ? (
                <>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <div><p className="text-[9px] uppercase tracking-[0.14em] text-cream-100/30">Code</p><p className="mt-1 text-[13px] text-cream-50">{session.code}</p></div>
                    <div><p className="text-[9px] uppercase tracking-[0.14em] text-cream-100/30">Opened</p><p className="mt-1 text-[13px] text-cream-100/70">{formatDateTime(session.openedAt)}</p></div>
                    <div><p className="text-[9px] uppercase tracking-[0.14em] text-cream-100/30">Opened by</p><p className="mt-1 text-[13px] text-cream-100/70">{session.openedByName ?? 'Guest QR'}</p></div>
                  </div>
                  <div className="mt-4">
                    <p className="text-[9px] uppercase tracking-[0.14em] text-cream-100/30">Guests</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {data.guests.length === 0 ? (
                        <span className="text-[11px] text-cream-100/35">No guests linked yet.</span>
                      ) : (
                        data.guests.map((guest) => (
                          <span key={guest.id} className={cn('rounded-full border px-2.5 py-1 text-[10px]', guest.isLead ? 'border-gold-400/30 bg-gold-400/10 text-gold-200' : 'border-ink-950/10 bg-ink-950/[0.03] text-cream-100/55')}>
                            {guest.name}{guest.isLead ? ' · lead' : ''}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="mt-3 rounded-lg border border-dashed border-ink-950/12 px-4 py-5 text-center">
                  <p className="text-[12px] text-cream-100/45">No open session. Scanning the QR is not enough — open a session to seat guests.</p>
                  <Button size="sm" variant="goldOutline" className="mt-3" onClick={() => setOpenSessionOpen(true)}>Open table session</Button>
                </div>
              )}
            </Card>
          </div>

          <div className="space-y-4">
            <Card className="p-5">
              <div className="flex items-center justify-between">
                <p className="micro">Reservations</p>
                <CalendarDays size={15} className="text-indigo-300/60" />
              </div>
              <div className="mt-3 space-y-2">
                {data.reservations.length === 0 ? (
                  <p className="py-4 text-center text-xs text-cream-100/35">No active reservations for this table.</p>
                ) : (
                  data.reservations.map((reservation) => (
                    <div key={reservation.id} className="rounded-lg border border-ink-950/[0.05] bg-ink-950/[0.02] px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-[12px] text-cream-100/80">{reservation.customerName}</p>
                        <Badge tone={reservation.status === 'seated' ? 'success' : 'info'}>{reservation.status}</Badge>
                      </div>
                      <p className="mt-1 text-[10.5px] text-cream-100/40">
                        {formatDateTime(reservation.reservedAt)} · {reservation.guests} guests · {reservation.durationMin}m
                      </p>
                      {reservation.phone && <p className="text-[10px] text-cream-100/30">{reservation.phone}</p>}
                      {reservation.notes && <p className="mt-1 text-[10px] italic text-cream-100/35">“{reservation.notes}”</p>}
                    </div>
                  ))
                )}
              </div>
              <Button size="sm" variant="secondary" className="mt-3 w-full" icon={<Plus size={13} />} onClick={() => setReserveOpen(true)}>
                Reserve this table
              </Button>
            </Card>

            <Card className="p-5">
              <div className="flex items-center justify-between">
                <p className="micro">Recent activity</p>
                <Activity size={15} className="text-cream-100/25" />
              </div>
              <div className="mt-3 space-y-3">
                {data.activity.slice(0, 5).map((entry) => (
                  <div key={entry.id} className="flex gap-2.5">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold-400/70" />
                    <div className="min-w-0">
                      <p className="text-[11.5px] leading-snug text-cream-100/65">{entry.detail}</p>
                      <p className="mt-0.5 text-[9px] uppercase tracking-[0.1em] text-cream-100/25">
                        {entry.staffName ?? 'Guest'} · {timeAgo(entry.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
                {data.activity.length === 0 && <p className="py-3 text-center text-xs text-cream-100/35">No activity yet.</p>}
              </div>
            </Card>
          </div>
        </div>
      )}

      {tab === 'orders' && (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-ink-950/[0.06] px-4 py-3">
            <div>
              <p className="text-sm text-cream-50">Active orders</p>
              <p className="text-[10px] text-cream-100/35">
                {session ? `Session ${session.code}` : 'No session open'} · updates live
              </p>
            </div>
            <Link to={`/admin/restaurant/orders?tableId=${tableId}`} className="text-[10px] uppercase tracking-[0.14em] text-gold-200">
              Open board
            </Link>
          </div>
          {data.orders.length === 0 ? (
            <EmptyState icon={<ClipboardList size={22} />} title="No active orders" description="Orders placed from this table QR will appear here instantly." className="m-4" />
          ) : (
            <div className="divide-y divide-ink-950/[0.045]">
              {data.orders.map((order) => (
                <Link
                  key={order.id}
                  to={`/admin/restaurant/orders/${order.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition hover:bg-ink-950/[0.025]"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-ink-950/10 bg-ink-950/[0.03] text-[11px] text-cream-100/70">
                    {order.displayNo.replace('#', '')}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] text-cream-100/80">{order.itemsSummary ?? 'Order items'}</p>
                    <p className="mt-0.5 text-[10px] text-cream-100/35">
                      {formatClock(order.createdAt)} · {order.itemCount} item{order.itemCount === 1 ? '' : 's'} · {order.source.toUpperCase()}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[12px] text-cream-50">{money(order.total)}</p>
                    <StatusPill meta={orderStatusMeta[order.status]} showDot={false} className="mt-1 px-2 py-0.5 text-[9px]" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === 'items' && (
        <Card className="overflow-hidden">
          <div className="border-b border-ink-950/[0.06] px-4 py-3">
            <p className="text-sm text-cream-50">Individual menu orders</p>
            <p className="text-[10px] text-cream-100/35">All billable food and drink lines for this session.</p>
          </div>
          {!bill || bill.items.length === 0 ? (
            <EmptyState icon={<UtensilsCrossed size={22} />} title="No menu items yet" description="Dishes ordered by guests will appear here." className="m-4" />
          ) : (
            <div className="divide-y divide-ink-950/[0.045]">
              {bill.items.map((item) => (
                <div key={item.name} className="grid grid-cols-[1fr_60px_90px] items-center gap-2 px-4 py-2.5">
                  <div>
                    <p className="text-[12.5px] text-cream-100/80">{item.name}</p>
                    <p className="text-[10px] text-cream-100/30">{money(item.unitPrice)} each</p>
                  </div>
                  <span className="text-center text-[12px] text-cream-100/55">× {item.qty}</span>
                  <span className="text-right text-[12px] text-cream-50">{money(item.total)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === 'bill' && (
        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <Card className="p-5">
            {bill ? (
              <BillBreakdown bill={bill} />
            ) : (
              <EmptyState
                icon={<ReceiptText size={24} />}
                title="No open bill"
                description={session ? 'The bill is created as soon as the first order arrives.' : 'Open a table session to start a bill.'}
                action={!session ? <Button size="sm" onClick={() => setOpenSessionOpen(true)}>Open session</Button> : undefined}
              />
            )}
          </Card>
          <div className="space-y-4">
            <Card className="p-5">
              <p className="micro">Bill actions</p>
              <div className="mt-3 space-y-2">
                <Button
                  className="w-full"
                  icon={<Banknote size={15} />}
                  disabled={!bill || bill.balance <= 0}
                  onClick={() => setPayOpen(true)}
                >
                  Record payment
                </Button>
                <Button
                  variant="secondary"
                  className="w-full"
                  icon={<Printer size={15} />}
                  disabled={!bill}
                  onClick={() => setPrintOpen(true)}
                >
                  Print receipt
                </Button>
                <Button
                  variant={bill && bill.balance > 0.009 ? 'danger' : 'success'}
                  className="w-full"
                  icon={<CheckCircle2 size={15} />}
                  disabled={!session || (Boolean(bill && bill.balance > 0.009) && !isManager)}
                  onClick={() => setCloseOpen(true)}
                >
                  Close session
                </Button>
                {bill && bill.balance > 0.009 && !isManager && (
                  <p className="text-[10px] leading-relaxed text-cream-100/35">A manager must settle or authorise an outstanding balance before closing.</p>
                )}
              </div>
            </Card>
            <Card className="p-5">
              <p className="micro">Session summary</p>
              <div className="mt-3 space-y-2 text-[11.5px]">
                <div className="flex justify-between"><span className="text-cream-100/40">Session</span><span className="text-cream-100/75">{session?.code ?? '—'}</span></div>
                <div className="flex justify-between"><span className="text-cream-100/40">Orders</span><span className="text-cream-100/75">{bill?.orderCount ?? 0}</span></div>
                <div className="flex justify-between"><span className="text-cream-100/40">Paid</span><span className="text-emerald-200/80">{money(bill?.paid ?? 0)}</span></div>
                <div className="flex justify-between"><span className="text-cream-100/40">Balance</span><span className="text-cream-50">{money(Math.max(0, bill?.balance ?? 0))}</span></div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {tab === 'payments' && (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-ink-950/[0.06] px-4 py-3">
            <div>
              <p className="text-sm text-cream-50">Payments</p>
              <p className="text-[10px] text-cream-100/35">{money(bill?.paid ?? 0)} received across {bill?.payments.length ?? 0} payments</p>
            </div>
            <Button size="sm" icon={<Banknote size={13} />} disabled={!bill || bill.balance <= 0} onClick={() => setPayOpen(true)}>
              Add payment
            </Button>
          </div>
          {!bill || bill.payments.length === 0 ? (
            <EmptyState icon={<Banknote size={22} />} title="No payments recorded" description="Payments made at this table will be listed here." className="m-4" />
          ) : (
            <div className="divide-y divide-ink-950/[0.045]">
              {bill.payments.map((payment) => (
                <div key={payment.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="text-[12.5px] capitalize text-cream-100/80">{payment.method.replace('_', ' ')}</p>
                    <p className="text-[10px] text-cream-100/35">
                      {formatDateTime(payment.createdAt)}{payment.reference ? ` · ${payment.reference}` : ''}
                    </p>
                  </div>
                  <span className="text-[13px] text-emerald-200/90">{money(payment.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === 'qr' && (
        <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <p className="micro">QR code</p>
              <Badge tone={qr?.qr ? 'success' : 'danger'}>{qr?.qr ? 'Active' : 'Missing'}</Badge>
            </div>
            {qr?.qr ? (
              <>
                <QrCard
                  className="print-area mx-auto mt-4 max-w-[330px]"
                  code={table.code}
                  area={table.areaName}
                  floor={table.floorName}
                  scanUrl={qr.qr.scanUrl}
                  dataUrl={qr.qr.dataUrl}
                />
                <div className="mt-4 space-y-2">
                  <CopyField label="Scan destination" value={qr.qr.scanUrl} />
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" icon={<Download size={13} />} onClick={() => downloadFile(`/restaurant/qr/tables/${tableId}/download?format=png`, `Nile-Table-${table.code}-QR.png`).catch((err: Error) => toast.push({ title: 'Download failed', description: err.message, tone: 'error' }))}>
                      PNG
                    </Button>
                    <Button size="sm" variant="secondary" icon={<Download size={13} />} onClick={() => downloadFile(`/restaurant/qr/tables/${tableId}/download?format=svg`, `Nile-Table-${table.code}-QR.svg`).catch((err: Error) => toast.push({ title: 'Download failed', description: err.message, tone: 'error' }))}>
                      SVG
                    </Button>
                    <Button size="sm" variant="secondary" icon={<Printer size={13} />} onClick={() => window.print()}>Print card</Button>
                    <Button size="sm" variant="danger" icon={<RefreshCw size={13} />} onClick={() => setRegenOpen(true)}>Regenerate</Button>
                  </div>
                </div>
              </>
            ) : (
              <EmptyState
                icon={<QrCode size={22} />}
                title="QR missing"
                description="Generate a permanent QR for this table in the QR studio."
                action={<Button size="sm" onClick={() => navigate('/admin/restaurant/qr-codes')}>Open QR studio</Button>}
              />
            )}
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b border-ink-950/[0.06] px-4 py-3">
              <p className="text-sm text-cream-50">QR history</p>
              <p className="text-[10px] text-cream-100/35">Every token issued for {table.code}. Revoked tokens stop resolving immediately.</p>
            </div>
            {data.qrHistory.length === 0 ? (
              <EmptyState icon={<History size={22} />} title="No QR history" description="Generating a QR creates the first entry." className="m-4" />
            ) : (
              <div className="divide-y divide-ink-950/[0.045]">
                {data.qrHistory.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <Badge tone={entry.status === 'active' ? 'success' : 'neutral'}>{entry.status}</Badge>
                      <p className="mt-1 text-[10px] text-cream-100/35">Created {formatDateTime(entry.createdAt)}</p>
                    </div>
                    <p className="text-[10px] text-cream-100/35">
                      {entry.revokedAt ? `Revoked ${formatDateTime(entry.revokedAt)}` : 'In service'}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === 'history' && (
        <Card className="overflow-hidden">
          <div className="border-b border-ink-950/[0.06] px-4 py-3">
            <p className="text-sm text-cream-50">Order history</p>
            <p className="text-[10px] text-cream-100/35">Completed and cancelled orders for this table.</p>
          </div>
          {data.history.length === 0 ? (
            <EmptyState icon={<History size={22} />} title="No past orders" description="Closed orders are retained here for audit." className="m-4" />
          ) : (
            <div className="divide-y divide-ink-950/[0.045]">
              {data.history.map((entry) => (
                <Link key={entry.id} to={`/admin/restaurant/orders/${entry.id}`} className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-ink-950/[0.025]">
                  <div className="flex items-center gap-3">
                    <span className="text-[12px] font-medium text-cream-50">{entry.displayNo}</span>
                    <StatusPill meta={orderStatusMeta[entry.status]} showDot={false} className="px-2 py-0.5 text-[9px]" />
                  </div>
                  <div className="text-right">
                    <p className="text-[12px] text-cream-100/70">{money(entry.total)}</p>
                    <p className="text-[10px] text-cream-100/30">{formatDateTime(entry.createdAt)}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === 'activity' && (
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <p className="micro">Activity & audit</p>
            <Activity size={15} className="text-cream-100/25" />
          </div>
          <div className="mt-4 space-y-4">
            {data.activity.length === 0 ? (
              <p className="py-6 text-center text-xs text-cream-100/35">No activity recorded yet.</p>
            ) : (
              data.activity.map((entry) => (
                <div key={entry.id} className="flex gap-3">
                  <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-ink-950/10 bg-ink-950/[0.03]">
                    <History size={12} className="text-cream-100/40" />
                  </span>
                  <div className="min-w-0 flex-1 border-b border-ink-950/[0.04] pb-3">
                    <p className="text-[12px] leading-snug text-cream-100/75">{entry.detail}</p>
                    <p className="mt-1 text-[9.5px] uppercase tracking-[0.1em] text-cream-100/25">
                      {entry.action.replace(/_/g, ' ')} · {entry.staffName ?? 'Guest'} · {formatDateTime(entry.createdAt)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      )}

      <Modal
        open={openSessionOpen}
        onClose={() => setOpenSessionOpen(false)}
        title={`Open session · ${table.code}`}
        subtitle="Scanning a QR alone does not occupy a table. Opening a session authorises guest ordering."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpenSessionOpen(false)}>Cancel</Button>
            <Button onClick={openSession} loading={busy}>Open session</Button>
          </>
        }
      >
        <Field label="Guests seated" required>
          <Input type="number" min="1" max={table.capacity} value={guests} onChange={(event) => setGuests(event.target.value)} />
        </Field>
        <p className="mt-3 text-[11px] leading-relaxed text-cream-100/35">
          The table will become occupied and the nearest confirmed reservation will be marked seated.
        </p>
      </Modal>

      <Modal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title={`Assign waiter · ${table.code}`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAssignOpen(false)}>Cancel</Button>
            <Button onClick={assignWaiter} loading={busy} disabled={!waiterId}>Assign</Button>
          </>
        }
      >
        <Field label="Waiter" required>
          <Select value={waiterId} onChange={(event) => setWaiterId(event.target.value)}>
            <option value="">Select a team member</option>
            {data.waiters.map((person) => (
              <option key={person.id} value={person.id}>{person.name} · {person.role.replace('_', ' ')}</option>
            ))}
          </Select>
        </Field>
      </Modal>

      <Modal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        title={`Transfer guests · ${table.code}`}
        subtitle="The open session, orders and bill move together to the destination table."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setTransferOpen(false)}>Cancel</Button>
            <Button onClick={transfer} loading={busy} disabled={!toTableId}>Transfer</Button>
          </>
        }
      >
        <Field label="Destination table" required>
          <Select value={toTableId} onChange={(event) => setToTableId(event.target.value)}>
            <option value="">Choose an available table</option>
            {transferCandidates.map((entry) => (
              <option key={entry.id} value={entry.id}>{entry.code} · {entry.areaName} · {entry.capacity} seats</option>
            ))}
          </Select>
        </Field>
        {transferCandidates.length === 0 && <p className="mt-2 text-[11px] text-rose-200/80">No free table is available to receive these guests.</p>}
      </Modal>

      <Modal
        open={mergeOpen}
        onClose={() => setMergeOpen(false)}
        title={`Merge tables into ${table.code}`}
        subtitle="Orders, guests and bills from the selected tables are consolidated onto this session."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setMergeOpen(false)}>Cancel</Button>
            <Button onClick={merge} loading={busy} disabled={!mergeIds.length}>Merge {mergeIds.length || ''}</Button>
          </>
        }
      >
        {mergeCandidates.length === 0 ? (
          <p className="text-[12px] text-cream-100/45">No other table currently has an open session.</p>
        ) : (
          <div className="space-y-2">
            {mergeCandidates.map((entry) => (
              <label key={entry.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-ink-950/10 bg-ink-950/[0.025] px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={mergeIds.includes(entry.id)}
                  onChange={(event) =>
                    setMergeIds((current) =>
                      event.target.checked ? [...current, entry.id] : current.filter((value) => value !== entry.id),
                    )
                  }
                  className="accent-gold-400"
                />
                <span className="flex-1">
                  <span className="block text-[12px] text-cream-100/80">{entry.code} · {entry.areaName}</span>
                  <span className="text-[10px] text-cream-100/35">{entry.orderCount} orders · {money(entry.billTotal)}</span>
                </span>
              </label>
            ))}
          </div>
        )}
      </Modal>

      <Modal
        open={reserveOpen}
        onClose={() => setReserveOpen(false)}
        title={`Reserve ${table.code}`}
        subtitle={`${table.areaName} · seats ${table.capacity}. Overlapping reservations are rejected automatically.`}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setReserveOpen(false)}>Cancel</Button>
            <Button type="submit" form="reserve-form" loading={busy}>Create reservation</Button>
          </>
        }
      >
        <form id="reserve-form" onSubmit={reserve} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Guest name" required>
              <Input value={reserveForm.customerName} onChange={(event) => setReserveForm((current) => ({ ...current, customerName: event.target.value }))} placeholder="Full name" />
            </Field>
            <Field label="Phone">
              <Input value={reserveForm.phone} onChange={(event) => setReserveForm((current) => ({ ...current, phone: event.target.value }))} placeholder="+251 ..." />
            </Field>
            <Field label="Guests" required>
              <Input type="number" min="1" max={table.capacity} value={reserveForm.guests} onChange={(event) => setReserveForm((current) => ({ ...current, guests: event.target.value }))} />
            </Field>
            <Field label="Date & time" required>
              <Input type="datetime-local" value={reserveForm.reservedAt} onChange={(event) => setReserveForm((current) => ({ ...current, reservedAt: event.target.value }))} />
            </Field>
            <Field label="Duration (minutes)">
              <Input type="number" min="30" max="360" step="15" value={reserveForm.durationMin} onChange={(event) => setReserveForm((current) => ({ ...current, durationMin: event.target.value }))} />
            </Field>
            <Field label="Deposit">
              <Input type="number" min="0" step="0.01" value={reserveForm.deposit} onChange={(event) => setReserveForm((current) => ({ ...current, deposit: event.target.value }))} />
            </Field>
          </div>
          <Field label="Special requests">
            <Textarea value={reserveForm.notes} onChange={(event) => setReserveForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Window seat, birthday, allergies…" />
          </Field>
          {reserveError && <p className="rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">{reserveError}</p>}
        </form>
      </Modal>

      <Modal
        open={statusOpen}
        onClose={() => setStatusOpen(false)}
        title={`Change status · ${table.code}`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setStatusOpen(false)}>Cancel</Button>
            <Button onClick={changeStatus} loading={busy}>Update status</Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-2">
          {statuses.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setStatusValue(option)}
              className={cn(
                'flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-[12px] transition',
                statusValue === option ? 'border-gold-400/50 bg-gold-400/10 text-cream-50' : 'border-ink-950/10 bg-ink-950/[0.025] text-cream-100/50',
              )}
            >
              <span className={cn('h-2 w-2 rounded-full', tableStatusMeta[option].dot)} />
              {tableStatusMeta[option].label}
            </button>
          ))}
        </div>
        {hasSession && <p className="mt-3 text-[11px] text-orange-200/80">Close the active session before releasing this table.</p>}
      </Modal>

      {bill && (
        <PaymentModal
          open={payOpen}
          onClose={() => setPayOpen(false)}
          bill={bill}
          onSubmit={pay}
        />
      )}

      <ConfirmDialog
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        onConfirm={closeSession}
        title={`Close session ${session?.code ?? ''}?`}
        description={
          bill && bill.balance > 0.009
            ? `There is an outstanding balance of ${money(bill.balance)}. Closing will mark the table for cleaning and keep the balance on record.`
            : 'The bill is settled. The table will move to Needs cleaning, and the permanent QR will be ready for the next guests.'
        }
        confirmLabel={bill && bill.balance > 0.009 ? 'Close with balance' : 'Close session'}
        tone={bill && bill.balance > 0.009 ? 'danger' : 'success'}
        loading={busy}
      />

      <ConfirmDialog
        open={regenOpen}
        onClose={() => setRegenOpen(false)}
        onConfirm={regenerateQr}
        title={`Regenerate QR for ${table.code}?`}
        description="The current QR code stops working immediately and printed table cards must be replaced. Historical orders keep their original QR source."
        confirmLabel="Regenerate QR"
        tone="danger"
        loading={busy}
      />

      <Modal
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        title={`Receipt · ${table.code}`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPrintOpen(false)}>Close</Button>
            <Button icon={<Printer size={14} />} onClick={() => window.print()}>Print</Button>
          </>
        }
      >
        <div className="print-area">
          <Receipt data={data} />
        </div>
      </Modal>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-cream-100/30">
        <span className="inline-flex items-center gap-1"><MapPin size={10} /> {table.areaName} · {table.floorName}</span>
        <span>Table ID {table.id} · updates live across kitchen, waiter and cashier</span>
      </div>
    </div>
  );
}
