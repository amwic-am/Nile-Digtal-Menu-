import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  CalendarPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Phone,
  RefreshCw,
  Users,
  UserX,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import type { DiningTable, Reservation } from '../lib/types';
import { formatClock, formatDate, money, reservationStatusMeta, timeAgo } from '../lib/format';
import { useRealtime } from '../lib/socket';
import { useToast } from '../components/Toast';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  PageLoader,
  Select,
  StatusPill,
  Textarea,
} from '../components/ui';

const todayIso = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
};

const shiftDate = (iso: string, days: number) => {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
};

type FormState = {
  customerName: string;
  phone: string;
  guests: string;
  tableId: string;
  reservedAt: string;
  durationMin: string;
  notes: string;
  deposit: string;
};

const emptyForm = (date: string): FormState => ({
  customerName: '',
  phone: '',
  guests: '2',
  tableId: '',
  reservedAt: `${date}T19:00`,
  durationMin: '120',
  notes: '',
  deposit: '0',
});

export function ReservationsPage() {
  const toast = useToast();
  const [date, setDate] = useState(todayIso());
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm(todayIso()));
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true);
    try {
      const res = await api<{ reservations: Reservation[] }>(`/restaurant/reservations?date=${date}`);
      setReservations(res.reservations);
    } catch (err) {
      if (!quiet) toast.error('Could not load reservations', err instanceof Error ? err.message : 'Try again');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [date, toast]);

  useEffect(() => {
    setLoading(true);
    load(true);
  }, [load]);

  useEffect(() => {
    api<{ tables: DiningTable[] }>('/restaurant/tables')
      .then((res) => setTables(res.tables))
      .catch(() => undefined);
  }, []);

  useRealtime('reservations:updated', () => load(true));

  const stats = useMemo(() => {
    const confirmed = reservations.filter((r) => r.status === 'confirmed');
    return {
      total: reservations.length,
      confirmed: confirmed.length,
      guests: confirmed.reduce((sum, r) => sum + r.guests, 0),
      deposits: reservations.reduce((sum, r) => sum + Number(r.deposit), 0),
    };
  }, [reservations]);

  const openForm = () => {
    setForm(emptyForm(date));
    setFormError('');
    setFormOpen(true);
  };

  const submit = async () => {
    setFormError('');
    if (!form.customerName.trim()) {
      setFormError('Enter the guest name');
      return;
    }
    if (!form.tableId) {
      setFormError('Choose a table');
      return;
    }
    const reserved = new Date(form.reservedAt);
    if (Number.isNaN(reserved.getTime())) {
      setFormError('Choose a valid date and time');
      return;
    }
    setSaving(true);
    try {
      await api('/restaurant/reservations', {
        method: 'POST',
        body: {
          customerName: form.customerName.trim(),
          phone: form.phone.trim() || null,
          guests: Number(form.guests),
          tableId: Number(form.tableId),
          reservedAt: reserved.toISOString(),
          durationMin: Number(form.durationMin),
          notes: form.notes.trim() || null,
          deposit: Number(form.deposit || 0),
        },
      });
      toast.success('Reservation confirmed', `${form.customerName.trim()} · ${formatDate(reserved)} at ${formatClock(reserved)}`);
      setFormOpen(false);
      await load(true);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save the reservation');
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (reservation: Reservation, status: string) => {
    setBusyId(reservation.id);
    try {
      await api(`/restaurant/reservations/${reservation.id}/status`, { method: 'PATCH', body: { status } });
      toast.success(`Reservation ${status.replace('_', ' ')}`, `${reservation.customerName} · ${reservation.tableCode}`);
      await load(true);
    } catch (err) {
      toast.error('Could not update the reservation', err instanceof Error ? err.message : 'Try again');
    } finally {
      setBusyId(null);
    }
  };

  const availableTables = tables.filter((table) => table.isActive && table.status !== 'inactive');

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Guest relations"
        title="Reservations"
        description="Hold tables for arrivals, prevent double bookings and turn a reservation into a seated session in one step."
        actions={
          <>
            <Button variant="secondary" icon={<RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />} onClick={() => load()}>
              Refresh
            </Button>
            <Button icon={<CalendarPlus size={15} />} onClick={openForm}>New reservation</Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: 'Bookings', value: stats.total, hint: formatDate(new Date(`${date}T12:00:00`)) },
          { label: 'Confirmed', value: stats.confirmed, hint: 'Awaiting arrival' },
          { label: 'Covers', value: stats.guests, hint: 'Guests expected' },
          { label: 'Deposits', value: money(stats.deposits), hint: 'Held on file' },
        ].map((stat) => (
          <Card key={stat.label} className="p-4">
            <p className="text-[10px] uppercase tracking-[0.16em] text-cream-100/40">{stat.label}</p>
            <p className="mt-2 font-display text-2xl leading-none text-cream-50">{stat.value}</p>
            <p className="mt-1.5 text-[10px] text-cream-100/30">{stat.hint}</p>
          </Card>
        ))}
      </div>

      <Card className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setDate(shiftDate(date, -1))} icon={<ChevronLeft size={14} />}>
            Previous
          </Button>
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value || todayIso())}
            className="field h-9 w-[150px] text-xs"
          />
          <Button variant="secondary" size="sm" onClick={() => setDate(shiftDate(date, 1))}>
            Next <ChevronRight size={14} />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDate(todayIso())}>Today</Button>
        </div>
        <p className="inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.14em] text-cream-100/35">
          <CalendarDays size={12} /> {formatDate(new Date(`${date}T12:00:00`))}
        </p>
      </Card>

      {loading ? (
        <PageLoader />
      ) : reservations.length === 0 ? (
        <EmptyState
          icon={<CalendarDays size={30} />}
          title="No reservations for this date"
          description="Create a booking to hold a table. Overlapping bookings on the same table are rejected automatically."
          action={<Button onClick={openForm}>New reservation</Button>}
        />
      ) : (
        <div className="space-y-2">
          {reservations.map((reservation) => {
            const meta = reservationStatusMeta[reservation.status] ?? reservationStatusMeta.confirmed;
            const upcoming = new Date(reservation.reservedAt).getTime() - Date.now();
            return (
              <Card key={reservation.id} className="p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl border border-gold-400/25 bg-gold-400/[0.07]">
                      <span className="font-display text-lg leading-none text-cream-50">{formatClock(reservation.reservedAt)}</span>
                      <span className="mt-0.5 text-[8px] uppercase tracking-[0.16em] text-gold-200/60">{reservation.durationMin}m</span>
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[14px] font-medium text-cream-50">{reservation.customerName}</p>
                        <StatusPill meta={meta} showDot={false} />
                        {reservation.deposit > 0 && <Badge tone="gold">Deposit {money(reservation.deposit)}</Badge>}
                      </div>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-cream-100/45">
                        <span className="inline-flex items-center gap-1"><Users size={11} /> {reservation.guests} guests</span>
                        <span className="inline-flex items-center gap-1"><CalendarDays size={11} /> {reservation.tableCode} · {reservation.areaName}</span>
                        {reservation.phone && <span className="inline-flex items-center gap-1"><Phone size={11} /> {reservation.phone}</span>}
                        <span className="inline-flex items-center gap-1"><Clock3 size={11} /> {upcoming > 0 ? `in ${Math.round(upcoming / 60000)}m` : timeAgo(reservation.reservedAt)}</span>
                      </p>
                      {reservation.notes && <p className="mt-1.5 text-[11px] italic text-cream-100/35">“{reservation.notes}”</p>}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {reservation.status === 'confirmed' && (
                      <>
                        <Button size="xs" variant="success" icon={<Check size={12} />} loading={busyId === reservation.id} onClick={() => setStatus(reservation, 'seated')}>
                          Seat
                        </Button>
                        <Button size="xs" variant="secondary" icon={<UserX size={12} />} loading={busyId === reservation.id} onClick={() => setStatus(reservation, 'no_show')}>
                          No show
                        </Button>
                        <Button size="xs" variant="ghost" icon={<X size={12} />} loading={busyId === reservation.id} onClick={() => setStatus(reservation, 'cancelled')}>
                          Cancel
                        </Button>
                      </>
                    )}
                    {reservation.status === 'seated' && (
                      <Button size="xs" variant="secondary" icon={<Check size={12} />} loading={busyId === reservation.id} onClick={() => setStatus(reservation, 'completed')}>
                        Complete
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="New reservation"
        subtitle="We check for overlapping bookings on the chosen table before confirming."
        footer={
          <>
            <Button variant="ghost" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button loading={saving} onClick={submit}>Confirm reservation</Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Guest name" required className="sm:col-span-2">
            <Input
              value={form.customerName}
              onChange={(event) => setForm({ ...form, customerName: event.target.value })}
              placeholder="Full name"
              autoFocus
            />
          </Field>
          <Field label="Phone">
            <Input
              value={form.phone}
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
              placeholder="+251 …"
            />
          </Field>
          <Field label="Guests" required>
            <Input
              type="number"
              min={1}
              max={30}
              value={form.guests}
              onChange={(event) => setForm({ ...form, guests: event.target.value })}
            />
          </Field>
          <Field label="Table" required>
            <Select value={form.tableId} onChange={(event) => setForm({ ...form, tableId: event.target.value })}>
              <option value="">Choose a table</option>
              {availableTables.map((table) => (
                <option key={table.id} value={table.id}>
                  {table.code} · {table.areaName} · seats {table.capacity}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Duration">
            <Select value={form.durationMin} onChange={(event) => setForm({ ...form, durationMin: event.target.value })}>
              {[60, 90, 120, 150, 180].map((minutes) => (
                <option key={minutes} value={minutes}>{minutes} minutes</option>
              ))}
            </Select>
          </Field>
          <Field label="Date & time" required className="sm:col-span-2">
            <Input
              type="datetime-local"
              value={form.reservedAt}
              onChange={(event) => setForm({ ...form, reservedAt: event.target.value })}
            />
          </Field>
          <Field label="Deposit" hint="optional">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={form.deposit}
              onChange={(event) => setForm({ ...form, deposit: event.target.value })}
            />
          </Field>
          <Field label="Notes" hint="optional" className="sm:col-span-2">
            <Textarea
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
              placeholder="Birthday, window seat, allergies…"
            />
          </Field>
        </div>
        {formError && (
          <p className="mt-3 rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">{formError}</p>
        )}
      </Modal>
    </div>
  );
}
