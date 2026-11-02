import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Armchair,
  CheckCircle2,
  ClipboardList,
  Download,
  Eye,
  LayoutGrid,
  List,
  MapPin,
  Pencil,
  Plus,
  Printer,
  QrCode,
  ReceiptText,
  RefreshCw,
  Search,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { api, downloadFile } from '../lib/api';
import type { Area, DiningTable, Floor, QrTable, TableShape, TableStatus, WaiterUser } from '../lib/types';
import { useToast } from '../components/Toast';
import { useRealtime } from '../lib/socket';
import { money, tableStatusMeta } from '../lib/format';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  CopyField,
  EmptyState,
  Field,
  IconButton,
  Input,
  Menu,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  Modal,
  PageHeader,
  PageLoader,
  Select,
  StatusPill,
  Toggle,
  cn,
} from '../components/ui';
import { QrCard } from '../components/QrCard';

type TableForm = {
  code: string;
  name: string;
  areaId: string;
  capacity: string;
  shape: TableShape;
  locationLabel: string;
  isActive: boolean;
};

const emptyForm = (areas: Area[]): TableForm => ({
  code: '',
  name: '',
  areaId: areas[0] ? String(areas[0].id) : '',
  capacity: '4',
  shape: 'square',
  locationLabel: '',
  isActive: true,
});

const statusOptions: TableStatus[] = ['available', 'occupied', 'reserved', 'cleaning', 'inactive'];

function TablePreview({ form, areaName, floorName }: { form: TableForm; areaName: string; floorName: string }) {
  const shapeClass =
    form.shape === 'round' ? 'rounded-full' : form.shape === 'rect' ? 'h-20 w-32 rounded-lg' : 'h-24 w-24 rounded-lg';
  return (
    <div className="rounded-xl border border-ink-950/[0.07] bg-[radial-gradient(520px_200px_at_50%_0%,rgba(215,180,108,0.08),transparent_65%)] p-5">
      <p className="micro mb-4">Table preview</p>
      <div className="flex items-center gap-5">
        <div
          className={cn(
            'relative flex shrink-0 items-center justify-center border border-gold-400/40 bg-gradient-to-br from-gold-400/15 to-gold-400/[0.03]',
            shapeClass,
          )}
        >
          <span className="font-display text-lg text-gold-100">{form.code || 'T-000'}</span>
          <span className="absolute -bottom-5 text-[9px] uppercase tracking-[0.14em] text-cream-100/30">
            {form.capacity || '0'} seats
          </span>
        </div>
        <div className="min-w-0">
          <p className="text-sm text-cream-50">{form.name || form.code || 'New table'}</p>
          <p className="mt-1 text-[11px] text-cream-100/40">
            {areaName || 'Dining area'} · {floorName || 'Floor'}
          </p>
          <p className="mt-0.5 text-[11px] text-cream-100/40">
            {form.capacity || 0} seats · {form.shape === 'rect' ? 'Rectangle' : form.shape === 'round' ? 'Round' : 'Square'}
          </p>
          {form.locationLabel && <p className="mt-1 text-[10px] text-gold-200/70">{form.locationLabel}</p>}
        </div>
      </div>
    </div>
  );
}

export function TablesPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const initialStatus = (searchParams.get('status') as TableStatus | null) ?? 'all';

  const [tables, setTables] = useState<DiningTable[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [staff, setStaff] = useState<WaiterUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [q, setQ] = useState('');
  const [status, setStatus] = useState<TableStatus | 'all'>(initialStatus);
  const [areaId, setAreaId] = useState('');
  const [floorId, setFloorId] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [view, setView] = useState<'grid' | 'list'>('grid');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DiningTable | null>(null);
  const [form, setForm] = useState<TableForm>(() => emptyForm([]));
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [qrTable, setQrTable] = useState<DiningTable | null>(null);
  const [qrInfo, setQrInfo] = useState<QrTable['qr']>(null);
  const [qrLoading, setQrLoading] = useState(false);

  const [statusTarget, setStatusTarget] = useState<DiningTable | null>(null);
  const [statusValue, setStatusValue] = useState<TableStatus>('available');
  const [waiterTarget, setWaiterTarget] = useState<DiningTable | null>(null);
  const [waiterId, setWaiterId] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<DiningTable | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [tableRes, areaRes, staffRes] = await Promise.all([
        api<{ tables: DiningTable[] }>('/restaurant/tables?includeInactive=true'),
        api<{ areas: Area[]; floors: Floor[] }>('/restaurant/areas'),
        api<{ staff: WaiterUser[] }>('/restaurant/staff'),
      ]);
      setTables(tableRes.tables);
      setAreas(areaRes.areas);
      setFloors(areaRes.floors);
      setStaff(staffRes.staff);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tables could not load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtime('table:updated', () => void load());
  useRealtime('table:removed', () => void load());
  useRealtime('tables:reload', () => void load());
  useRealtime('qr:updated', () => void load());

  const counts = useMemo(() => {
    const base: Record<string, number> = { all: 0, available: 0, occupied: 0, reserved: 0, cleaning: 0, inactive: 0 };
    for (const table of tables) {
      base.all += 1;
      base[table.status] = (base[table.status] ?? 0) + 1;
    }
    return base;
  }, [tables]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return tables.filter((table) => {
      if (!includeInactive && !table.isActive) return false;
      if (status !== 'all' && table.status !== status) return false;
      if (areaId && String(table.areaId) !== areaId) return false;
      if (floorId && String(table.floorId) !== floorId) return false;
      if (needle && !`${table.code} ${table.name} ${table.areaName}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [tables, q, status, areaId, floorId, includeInactive]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm(areas));
    setFormError('');
    setFormOpen(true);
  };

  const openEdit = (table: DiningTable) => {
    setEditing(table);
    setForm({
      code: table.code,
      name: table.name,
      areaId: String(table.areaId),
      capacity: String(table.capacity),
      shape: table.shape,
      locationLabel: table.locationLabel ?? '',
      isActive: table.isActive,
    });
    setFormError('');
    setFormOpen(true);
  };

  const submitForm = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.code.trim()) {
      setFormError('Table number is required');
      return;
    }
    if (!form.areaId) {
      setFormError('Choose a dining area');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const body = {
        code: form.code.trim(),
        name: form.name.trim() || form.code.trim(),
        areaId: Number(form.areaId),
        capacity: Number(form.capacity),
        shape: form.shape,
        locationLabel: form.locationLabel.trim() || null,
        isActive: form.isActive,
      };
      if (editing) {
        await api(`/restaurant/tables/${editing.id}`, { method: 'PUT', body });
        toast.push({ title: 'Table updated', description: `${form.code} is up to date.`, tone: 'success' });
      } else {
        const res = await api<{ qr: QrTable['qr'] }>('/restaurant/tables', { method: 'POST', body });
        toast.push({
          title: 'Table created',
          description: `${form.code} is ready${res.qr ? ' with a unique QR code' : ''}.`,
          tone: 'success',
        });
      }
      setFormOpen(false);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Table could not be saved');
    } finally {
      setSaving(false);
    }
  };

  const openQr = async (table: DiningTable) => {
    setQrTable(table);
    setQrInfo(null);
    setQrLoading(true);
    try {
      const res = await api<{ tables: QrTable[] }>(`/restaurant/qr?q=${encodeURIComponent(table.code)}`);
      const found = res.tables.find((entry) => entry.id === table.id);
      setQrInfo(found?.qr ?? null);
    } catch (err) {
      toast.push({ title: 'QR unavailable', description: err instanceof Error ? err.message : 'Could not load QR', tone: 'error' });
    } finally {
      setQrLoading(false);
    }
  };

  const generateQr = async () => {
    if (!qrTable) return;
    setQrLoading(true);
    try {
      const res = await api<{ qr: NonNullable<QrTable['qr']> }>(`/restaurant/qr/tables/${qrTable.id}/generate`, { method: 'POST' });
      setQrInfo(res.qr);
      toast.push({ title: 'QR generated', description: `A permanent QR is now active for ${qrTable.code}.`, tone: 'success' });
      await load();
    } catch (err) {
      toast.push({ title: 'Could not generate QR', description: err instanceof Error ? err.message : 'Try again', tone: 'error' });
    } finally {
      setQrLoading(false);
    }
  };

  const changeStatus = async () => {
    if (!statusTarget) return;
    setBusy(true);
    try {
      await api(`/restaurant/tables/${statusTarget.id}/status`, { method: 'PATCH', body: { status: statusValue } });
      toast.push({ title: 'Status updated', description: `${statusTarget.code} is now ${tableStatusMeta[statusValue].label.toLowerCase()}.`, tone: 'success' });
      setStatusTarget(null);
      await load();
    } catch (err) {
      toast.push({ title: 'Status not changed', description: err instanceof Error ? err.message : 'Try again', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const assignWaiter = async () => {
    if (!waiterTarget || !waiterId) return;
    setBusy(true);
    try {
      await api(`/restaurant/tables/${waiterTarget.id}/assign-waiter`, { method: 'POST', body: { staffId: Number(waiterId) } });
      toast.push({ title: 'Waiter assigned', description: `${waiterTarget.code} is now covered.`, tone: 'success' });
      setWaiterTarget(null);
      setWaiterId('');
      await load();
    } catch (err) {
      toast.push({ title: 'Could not assign waiter', description: err instanceof Error ? err.message : 'Try again', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const markCleaned = async (table: DiningTable) => {
    try {
      await api(`/restaurant/tables/${table.id}/cleaned`, { method: 'POST' });
      toast.push({ title: 'Table released', description: `${table.code} is available again.`, tone: 'success' });
      await load();
    } catch (err) {
      toast.push({ title: 'Could not release table', description: err instanceof Error ? err.message : 'Try again', tone: 'error' });
    }
  };

  const removeTable = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      const res = await api<{ softDeleted: boolean }>(`/restaurant/tables/${deleteTarget.id}`, { method: 'DELETE' });
      toast.push({
        title: 'Table archived',
        description: res.softDeleted
          ? `${deleteTarget.code} has history, so financial records were preserved.`
          : `${deleteTarget.code} was removed.`,
        tone: 'success',
      });
      setDeleteTarget(null);
      await load();
    } catch (err) {
      toast.push({ title: 'Could not delete table', description: err instanceof Error ? err.message : 'Try again', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const formArea = areas.find((area) => String(area.id) === form.areaId);

  if (loading) return <PageLoader />;
  if (error) {
    return <EmptyState title="Tables unavailable" description={error} action={<Button onClick={load}>Try again</Button>} />;
  }

  const waiterOptions = staff.filter((person) => ['waiter', 'manager', 'super_admin'].includes(person.role));

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Front of house"
        title="Tables & dining rooms"
        description="Manage capacity, availability and the permanent QR that identifies every table."
        actions={
          <>
            <Button variant="secondary" icon={<RefreshCw size={14} />} onClick={load}>Refresh</Button>
            <Button icon={<Plus size={15} />} onClick={openCreate}>New table</Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {(['all', 'available', 'occupied', 'reserved', 'cleaning', 'inactive'] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setStatus(key)}
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[11px] transition',
              status === key
                ? 'border-gold-400/45 bg-gold-400/12 text-gold-100'
                : 'border-ink-950/10 bg-ink-950/[0.025] text-cream-100/50 hover:border-ink-950/20',
            )}
          >
            {key !== 'all' && <span className={cn('h-1.5 w-1.5 rounded-full', tableStatusMeta[key].dot)} />}
            {key === 'all' ? 'All tables' : tableStatusMeta[key].label}
            <span className={cn('text-[10px]', status === key ? 'text-gold-200/60' : 'text-cream-100/25')}>{counts[key] ?? 0}</span>
          </button>
        ))}
        <span className="ml-auto flex items-center gap-1 rounded-full border border-ink-950/10 bg-ink-950/[0.025] p-1">
          <button
            type="button"
            onClick={() => setView('grid')}
            className={cn('inline-flex h-7 w-7 items-center justify-center rounded-full transition', view === 'grid' ? 'bg-gold-400 text-night' : 'text-cream-100/40')}
            aria-label="Grid view"
          >
            <LayoutGrid size={14} />
          </button>
          <button
            type="button"
            onClick={() => setView('list')}
            className={cn('inline-flex h-7 w-7 items-center justify-center rounded-full transition', view === 'list' ? 'bg-gold-400 text-night' : 'text-cream-100/40')}
            aria-label="List view"
          >
            <List size={14} />
          </button>
        </span>
      </div>

      <Card className="flex flex-col gap-3 p-4 lg:flex-row lg:items-end">
        <div className="relative min-w-0 flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cream-100/30" />
          <Input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search table number, name or area"
            className="pl-9"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Select value={floorId} onChange={(event) => { setFloorId(event.target.value); setAreaId(''); }} className="min-w-[150px]">
            <option value="">All floors</option>
            {floors.map((floor) => (
              <option key={floor.id} value={floor.id}>{floor.name}</option>
            ))}
          </Select>
          <Select value={areaId} onChange={(event) => setAreaId(event.target.value)} className="min-w-[170px]">
            <option value="">All dining areas</option>
            {areas.filter((area) => !floorId || String(area.floorId) === floorId).map((area) => (
              <option key={area.id} value={area.id}>{area.name}</option>
            ))}
          </Select>
        </div>
        <label className="flex items-center gap-2 rounded-lg border border-ink-950/10 bg-ink-950/[0.025] px-3 py-2 text-[11px] text-cream-100/55">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(event) => setIncludeInactive(event.target.checked)}
            className="accent-gold-400"
          />
          Include inactive
        </label>
      </Card>

      {visible.length === 0 ? (
        <EmptyState
          icon={<Armchair size={26} />}
          title="No tables match this view"
          description="Adjust the filters or create a new table to get started."
          action={<Button icon={<Plus size={14} />} onClick={openCreate}>New table</Button>}
        />
      ) : view === 'grid' ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {visible.map((table) => {
            const meta = tableStatusMeta[table.status];
            return (
              <div
                key={table.id}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/admin/restaurant/tables/${table.id}`)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') navigate(`/admin/restaurant/tables/${table.id}`);
                }}
                className={cn(
                  'panel panel-hover group cursor-pointer p-4',
                  !table.isActive && 'opacity-70',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={cn(
                        'flex h-12 w-12 shrink-0 items-center justify-center border bg-gradient-to-br from-white/[0.06] to-transparent text-[12px] font-medium',
                        table.shape === 'round' ? 'rounded-full' : table.shape === 'rect' ? 'h-10 w-16 rounded-lg' : 'rounded-lg',
                        meta.border,
                        meta.text,
                      )}
                    >
                      {table.code.replace(/^T-?/, '') || table.code}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-cream-50">{table.code}</p>
                      <p className="truncate text-[10px] text-cream-100/35">
                        {table.areaName} · {table.floorName}
                      </p>
                    </div>
                  </div>
                  <Menu
                    width="w-56"
                    trigger={
                      <IconButton label={`Actions for ${table.code}`} className="h-8 w-8">
                        <span className="text-base leading-none">···</span>
                      </IconButton>
                    }
                  >
                    <MenuLabel>{table.code} actions</MenuLabel>
                    <MenuItem icon={<Eye size={14} />} onClick={() => navigate(`/admin/restaurant/tables/${table.id}`)}>
                      View details
                    </MenuItem>
                    <MenuItem icon={<Pencil size={14} />} onClick={() => openEdit(table)}>Edit table</MenuItem>
                    <MenuItem icon={<QrCode size={14} />} onClick={() => void openQr(table)}>View QR code</MenuItem>
                    <MenuItem icon={<ClipboardList size={14} />} onClick={() => navigate(`/admin/restaurant/orders?tableId=${table.id}`)}>
                      Current orders
                    </MenuItem>
                    <MenuItem
                      icon={<ReceiptText size={14} />}
                      onClick={() => navigate(`/admin/restaurant/tables/${table.id}`)}
                      hint={table.billTotal > 0 ? money(table.billTotal) : undefined}
                    >
                      View bill
                    </MenuItem>
                    <MenuSeparator />
                    <MenuItem icon={<UserPlus size={14} />} onClick={() => { setWaiterTarget(table); setWaiterId(table.waiterId ? String(table.waiterId) : ''); }}>
                      Assign waiter
                    </MenuItem>
                    <MenuItem
                      icon={<span className={cn('block h-2 w-2 rounded-full', meta.dot)} />}
                      onClick={() => { setStatusTarget(table); setStatusValue(table.status); }}
                    >
                      Change status
                    </MenuItem>
                    {table.status === 'cleaning' && (
                      <MenuItem icon={<CheckCircle2 size={14} />} onClick={() => void markCleaned(table)}>
                        Mark as cleaned
                      </MenuItem>
                    )}
                    <MenuSeparator />
                    <MenuItem icon={<Trash2 size={14} />} danger onClick={() => setDeleteTarget(table)}>Delete table</MenuItem>
                  </Menu>
                </div>

                <div className="mt-3 flex items-center justify-between gap-2">
                  <StatusPill meta={meta} pulse={table.status === 'occupied'} />
                  <span className="inline-flex items-center gap-1 text-[10.5px] text-cream-100/40">
                    <Users size={11} /> {table.capacity}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
                  <div className="rounded-lg border border-ink-950/[0.05] bg-ink-950/[0.02] px-2.5 py-1.5">
                    <p className="text-cream-100/30">Orders</p>
                    <p className="mt-0.5 text-[12px] text-cream-100/75">{table.orderCount}</p>
                  </div>
                  <div className="rounded-lg border border-ink-950/[0.05] bg-ink-950/[0.02] px-2.5 py-1.5">
                    <p className="text-cream-100/30">Live bill</p>
                    <p className="mt-0.5 text-[12px] text-gold-200/90">{table.billTotal > 0 ? money(table.billTotal) : '—'}</p>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between gap-2 text-[10px] text-cream-100/35">
                  <span className="flex min-w-0 items-center gap-1">
                    {table.locationLabel ? <MapPin size={10} className="shrink-0" /> : <Armchair size={10} className="shrink-0" />}
                    <span className="truncate">{table.locationLabel || (table.shape === 'rect' ? 'Rectangle' : table.shape === 'round' ? 'Round' : 'Square')}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {table.waiterName && <span className="truncate text-cream-100/45">{table.waiterName}</span>}
                    <span className={cn('flex items-center gap-1', table.qrToken ? 'text-emerald-300/70' : 'text-rose-300/70')}>
                      <QrCode size={10} /> {table.qrToken ? 'QR' : 'No QR'}
                    </span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Card className="overflow-hidden">
          <div className="hidden grid-cols-[80px_1fr_110px_110px_140px_110px_44px] gap-3 border-b border-ink-950/[0.06] bg-ink-950/[0.02] px-4 py-2.5 text-[9px] uppercase tracking-[0.14em] text-cream-100/30 md:grid">
            <span>Table</span>
            <span>Area</span>
            <span>Capacity</span>
            <span>Status</span>
            <span>Current</span>
            <span>QR</span>
            <span />
          </div>
          <div className="divide-y divide-ink-950/[0.045]">
            {visible.map((table) => {
              const meta = tableStatusMeta[table.status];
              return (
                <div
                  key={table.id}
                  className="grid cursor-pointer grid-cols-2 items-center gap-2 px-4 py-3 transition hover:bg-ink-950/[0.025] md:grid-cols-[80px_1fr_110px_110px_140px_110px_44px] md:gap-3"
                  onClick={() => navigate(`/admin/restaurant/tables/${table.id}`)}
                >
                  <div className="flex items-center gap-2">
                    <span className={cn('h-2 w-2 rounded-full', meta.dot)} />
                    <span className="text-[12.5px] font-medium text-cream-50">{table.code}</span>
                  </div>
                  <span className="truncate text-[11.5px] text-cream-100/50">
                    {table.areaName} <span className="text-cream-100/25">· {table.floorName}</span>
                  </span>
                  <span className="text-[11.5px] text-cream-100/55">{table.capacity} seats</span>
                  <span><StatusPill meta={meta} showDot={false} className="px-2 py-0.5 text-[9.5px]" /></span>
                  <span className="text-[11px] text-cream-100/45">
                    {table.orderCount} orders{table.billTotal > 0 ? ` · ${money(table.billTotal)}` : ''}
                  </span>
                  <span className={cn('flex items-center gap-1 text-[10px]', table.qrToken ? 'text-emerald-300/70' : 'text-rose-300/70')}>
                    <QrCode size={11} /> {table.qrToken ? 'Active' : 'Missing'}
                  </span>
                  <span className="flex justify-end">
                    <Menu
                      width="w-56"
                      trigger={<IconButton label={`Actions for ${table.code}`} className="h-8 w-8">···</IconButton>}
                    >
                      <MenuItem icon={<Eye size={14} />} onClick={() => navigate(`/admin/restaurant/tables/${table.id}`)}>View details</MenuItem>
                      <MenuItem icon={<Pencil size={14} />} onClick={() => openEdit(table)}>Edit table</MenuItem>
                      <MenuItem icon={<QrCode size={14} />} onClick={() => void openQr(table)}>View QR code</MenuItem>
                      <MenuItem icon={<ClipboardList size={14} />} onClick={() => navigate(`/admin/restaurant/orders?tableId=${table.id}`)}>Current orders</MenuItem>
                      <MenuItem icon={<UserPlus size={14} />} onClick={() => { setWaiterTarget(table); setWaiterId(table.waiterId ? String(table.waiterId) : ''); }}>Assign waiter</MenuItem>
                      <MenuItem icon={<span className={cn('block h-2 w-2 rounded-full', meta.dot)} />} onClick={() => { setStatusTarget(table); setStatusValue(table.status); }}>Change status</MenuItem>
                      {table.status === 'cleaning' && (
                        <MenuItem icon={<CheckCircle2 size={14} />} onClick={() => void markCleaned(table)}>Mark as cleaned</MenuItem>
                      )}
                      <MenuSeparator />
                      <MenuItem icon={<Trash2 size={14} />} danger onClick={() => setDeleteTarget(table)}>Delete table</MenuItem>
                    </Menu>
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <p className="text-[10px] text-cream-100/30">
        {visible.length} of {tables.length} tables · {counts.occupied} occupied · {counts.available} available ·{" "}
        {tables.filter((table) => table.qrToken).length} active QR codes
      </p>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Edit ${editing.code}` : 'Create restaurant table'}
        subtitle={editing ? 'Changes apply immediately to the floor plan and QR menu.' : 'A unique, cryptographically random QR code is generated automatically.'}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button type="submit" form="table-form" loading={saving}>
              {editing ? 'Save changes' : 'Create table'}
            </Button>
          </>
        }
      >
        <form id="table-form" onSubmit={submitForm} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Table number / name" required>
              <Input
                value={form.code}
                onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))}
                placeholder="T-015"
                autoFocus
              />
            </Field>
            <Field label="Display name" hint="optional">
              <Input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Window table"
              />
            </Field>
            <Field label="Dining area" required>
              <Select
                value={form.areaId}
                onChange={(event) => setForm((current) => ({ ...current, areaId: event.target.value }))}
              >
                <option value="">Select an area</option>
                {areas.map((area) => (
                  <option key={area.id} value={area.id}>{area.name} · {area.floorName}</option>
                ))}
              </Select>
            </Field>
            <Field label="Floor">
              <Input value={formArea?.floorName ?? 'Determined by area'} readOnly className="text-cream-100/45" />
            </Field>
            <Field label="Seating capacity" required>
              <Input
                type="number"
                min="1"
                max="30"
                value={form.capacity}
                onChange={(event) => setForm((current) => ({ ...current, capacity: event.target.value }))}
              />
            </Field>
            <Field label="Location label" hint="optional">
              <Input
                value={form.locationLabel}
                onChange={(event) => setForm((current) => ({ ...current, locationLabel: event.target.value }))}
                placeholder="By the window, near bar"
              />
            </Field>
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-cream-100/50">Table shape</p>
            <div className="grid grid-cols-3 gap-2">
              {(['square', 'round', 'rect'] as TableShape[]).map((shape) => (
                <button
                  key={shape}
                  type="button"
                  onClick={() => setForm((current) => ({ ...current, shape }))}
                  className={cn(
                    'flex flex-col items-center gap-2 rounded-xl border px-3 py-3 text-[11px] transition',
                    form.shape === shape
                      ? 'border-gold-400/50 bg-gold-400/10 text-cream-50'
                      : 'border-ink-950/10 bg-ink-950/[0.025] text-cream-100/45 hover:border-ink-950/20',
                  )}
                >
                  <span
                    className={cn(
                      'border border-current',
                      shape === 'round' ? 'h-6 w-6 rounded-full' : shape === 'rect' ? 'h-4 w-8 rounded-sm' : 'h-6 w-6 rounded-sm',
                    )}
                  />
                  {shape === 'rect' ? 'Rectangle' : shape === 'round' ? 'Round' : 'Square'}
                </button>
              ))}
            </div>
          </div>

          <TablePreview form={form} areaName={formArea?.name ?? ''} floorName={formArea?.floorName ?? ''} />

          <div className="rounded-xl border border-ink-950/[0.07] bg-ink-950/[0.02] px-3 py-2.5">
            <Toggle
              checked={form.isActive}
              onChange={(value) => setForm((current) => ({ ...current, isActive: value }))}
              label="Table is active"
              description="Inactive tables stay in history but cannot receive orders."
            />
          </div>

          {formError && (
            <p className="rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">{formError}</p>
          )}
        </form>
      </Modal>

      <Modal
        open={Boolean(qrTable)}
        onClose={() => { setQrTable(null); setQrInfo(null); }}
        title={qrTable ? `${qrTable.code} QR code` : 'QR code'}
        subtitle="Permanent table QR. Tokens are random and can be revoked or regenerated at any time."
        size="md"
        footer={
          qrInfo ? (
            <>
              <Button variant="ghost" icon={<Printer size={14} />} onClick={() => window.print()}>Print</Button>
              <Button variant="secondary" icon={<Download size={14} />} onClick={() => qrTable && downloadFile(`/restaurant/qr/tables/${qrTable.id}/download?format=svg`, `Nile-Table-${qrTable.code}-QR.svg`).catch((err: Error) => toast.push({ title: 'Download failed', description: err.message, tone: 'error' }))}>
                SVG
              </Button>
              <Button icon={<Download size={14} />} onClick={() => qrTable && downloadFile(`/restaurant/qr/tables/${qrTable.id}/download?format=png`, `Nile-Table-${qrTable.code}-QR.png`).catch((err: Error) => toast.push({ title: 'Download failed', description: err.message, tone: 'error' }))}>
                Download PNG
              </Button>
            </>
          ) : undefined
        }
      >
        {qrLoading ? (
          <div className="flex items-center justify-center py-14"><RefreshCw size={18} className="animate-spin text-gold-300" /></div>
        ) : qrInfo ? (
          <div className="space-y-4">
            <QrCard
              className="print-area mx-auto max-w-[340px]"
              code={qrTable?.code ?? ''}
              area={qrTable?.areaName ?? ''}
              floor={qrTable?.floorName}
              scanUrl={qrInfo.scanUrl}
              dataUrl={qrInfo.dataUrl}
            />
            <CopyField label="Scan destination" value={qrInfo.scanUrl} />
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="success"><CheckCircle2 size={10} /> Active</Badge>
              <span className="text-[10px] text-cream-100/35">Never share a sequential table number as a QR target.</span>
            </div>
          </div>
        ) : (
          <EmptyState
            icon={<QrCode size={24} />}
            title="No active QR for this table"
            description="Generate a permanent QR token now. It will keep working for every new guest session."
            action={<Button onClick={generateQr} loading={qrLoading}>Generate QR code</Button>}
          />
        )}
      </Modal>

      <Modal
        open={Boolean(statusTarget)}
        onClose={() => setStatusTarget(null)}
        title={statusTarget ? `Change status · ${statusTarget.code}` : 'Change status'}
        subtitle="Tables with an open session cannot be released without closing the bill."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setStatusTarget(null)}>Cancel</Button>
            <Button onClick={changeStatus} loading={busy}>Update status</Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-2">
          {statusOptions.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setStatusValue(option)}
              className={cn(
                'flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-[12px] transition',
                statusValue === option
                  ? 'border-gold-400/50 bg-gold-400/10 text-cream-50'
                  : 'border-ink-950/10 bg-ink-950/[0.025] text-cream-100/50',
              )}
            >
              <span className={cn('h-2 w-2 rounded-full', tableStatusMeta[option].dot)} />
              {tableStatusMeta[option].label}
            </button>
          ))}
        </div>
      </Modal>

      <Modal
        open={Boolean(waiterTarget)}
        onClose={() => setWaiterTarget(null)}
        title={waiterTarget ? `Assign waiter · ${waiterTarget.code}` : 'Assign waiter'}
        subtitle="The waiter will see this table in the service station."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setWaiterTarget(null)}>Cancel</Button>
            <Button onClick={assignWaiter} loading={busy} disabled={!waiterId}>Assign</Button>
          </>
        }
      >
        <Field label="Waiter" required>
          <Select value={waiterId} onChange={(event) => setWaiterId(event.target.value)}>
            <option value="">Select a team member</option>
            {waiterOptions.map((person) => (
              <option key={person.id} value={person.id}>{person.name} · {person.role.replace('_', ' ')}</option>
            ))}
          </Select>
        </Field>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={removeTable}
        title={deleteTarget ? `Archive ${deleteTarget.code}?` : 'Archive table?'}
        description="The table will disappear from service. If it has historical orders, it is soft-deleted so financial and audit records remain intact."
        confirmLabel="Archive table"
        loading={busy}
      />
    </div>
  );
}
