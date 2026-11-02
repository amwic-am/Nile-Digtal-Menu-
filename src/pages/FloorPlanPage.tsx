import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Armchair,
  ExternalLink,
  Maximize2,
  Minimize2,
  Move,
  Plus,
  RotateCw,
  Save,
  Users,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { api } from '../lib/api';
import type { Area, DiningTable, Floor, TableShape, TableStatus } from '../lib/types';
import { useToast } from '../components/Toast';
import { money, tableStatusMeta } from '../lib/format';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  IconButton,
  PageHeader,
  PageLoader,
  Select,
  cn,
} from '../components/ui';

const CANVAS_W = 1200;
const CANVAS_H = 760;
const statuses: TableStatus[] = ['available', 'occupied', 'reserved', 'cleaning', 'inactive'];

type Interaction = {
  mode: 'drag' | 'resize' | 'rotate';
  id: number;
  startX: number;
  startY: number;
  original: { x: number; y: number; w: number; h: number; rot: number };
  startAngle?: number;
  centerX?: number;
  centerY?: number;
};

export function FloorPlanPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [areaId, setAreaId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(0.9);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const interaction = useRef<Interaction | null>(null);

  const load = useCallback(async () => {
    try {
      const [tableRes, areaRes] = await Promise.all([
        api<{ tables: DiningTable[] }>('/restaurant/tables?includeInactive=true'),
        api<{ areas: Area[]; floors: Floor[] }>('/restaurant/areas'),
      ]);
      setTables(tableRes.tables);
      setAreas(areaRes.areas);
      setFloors(areaRes.floors);
      setAreaId((current) => current || String(areaRes.areas[0]?.id ?? ''));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Floor plan could not load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const visible = useMemo(
    () => tables.filter((table) => !areaId || String(table.areaId) === areaId),
    [tables, areaId],
  );
  const selected = tables.find((table) => table.id === selectedId) ?? null;
  const activeArea = areas.find((area) => String(area.id) === areaId);
  const activeFloor = floors.find((floor) => floor.id === activeArea?.floorId);

  const updateTable = (id: number, patch: Partial<DiningTable>) => {
    setTables((current) => current.map((table) => (table.id === id ? { ...table, ...patch } : table)));
    setDirty(true);
  };

  const begin = (event: ReactPointerEvent<HTMLDivElement>, table: DiningTable, mode: Interaction['mode']) => {
    event.stopPropagation();
    event.preventDefault();
    setSelectedId(table.id);
    canvasRef.current?.setPointerCapture(event.pointerId);
    const rect = canvasRef.current?.getBoundingClientRect();
    const px = rect ? (event.clientX - rect.left) / zoom : event.clientX;
    const py = rect ? (event.clientY - rect.top) / zoom : event.clientY;
    const centerX = table.posX + table.width / 2;
    const centerY = table.posY + table.height / 2;
    interaction.current = {
      mode,
      id: table.id,
      startX: event.clientX,
      startY: event.clientY,
      original: { x: table.posX, y: table.posY, w: table.width, h: table.height, rot: table.rotation },
      centerX,
      centerY,
      startAngle: Math.atan2(py - centerY, px - centerX),
    };
    setDragging(true);
  };

  const onMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = interaction.current;
    if (!current) return;
    const dx = (event.clientX - current.startX) / zoom;
    const dy = (event.clientY - current.startY) / zoom;
    const table = tables.find((entry) => entry.id === current.id);
    if (!table) return;

    if (current.mode === 'drag') {
      updateTable(current.id, {
        posX: Math.max(0, Math.min(CANVAS_W - table.width, Math.round(current.original.x + dx))),
        posY: Math.max(0, Math.min(CANVAS_H - table.height, Math.round(current.original.y + dy))),
      });
      return;
    }

    if (current.mode === 'resize') {
      if (table.shape === 'round') {
        const size = Math.max(60, Math.min(300, Math.round(current.original.w + Math.max(dx, dy))));
        updateTable(current.id, { width: size, height: size });
      } else {
        updateTable(current.id, {
          width: Math.max(60, Math.min(420, Math.round(current.original.w + dx))),
          height: Math.max(60, Math.min(360, Math.round(current.original.h + dy))),
        });
      }
      return;
    }

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || current.centerX === undefined || current.centerY === undefined || current.startAngle === undefined) return;
    const px = (event.clientX - rect.left) / zoom;
    const py = (event.clientY - rect.top) / zoom;
    const angle = Math.atan2(py - current.centerY, px - current.centerX);
    const rotation = Math.round(current.original.rot + ((angle - current.startAngle) * 180) / Math.PI);
    updateTable(current.id, { rotation });
  };

  const finish = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!interaction.current) return;
    interaction.current = null;
    setDragging(false);
    try {
      canvasRef.current?.releasePointerCapture(event.pointerId);
    } catch {
      /* pointer already released */
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await api('/restaurant/tables/layout', {
        method: 'POST',
        body: {
          tables: tables.map((table) => ({
            id: table.id,
            posX: table.posX,
            posY: table.posY,
            width: table.width,
            height: table.height,
            rotation: table.rotation,
            shape: table.shape,
          })),
        },
      });
      setDirty(false);
      toast.push({ title: 'Floor layout saved', description: 'Waiters and the host stand now see the new arrangement.', tone: 'success' });
    } catch (err) {
      toast.push({ title: 'Could not save layout', description: err instanceof Error ? err.message : 'Try again', tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const toggleFullscreen = async () => {
    if (!screenRef.current) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await screenRef.current.requestFullscreen();
    } catch (err) {
      toast.push({ title: 'Full screen unavailable', description: err instanceof Error ? err.message : 'Try again', tone: 'error' });
    }
  };

  if (loading) return <PageLoader />;
  if (error) return <EmptyState title="Floor plan unavailable" description={error} action={<Button onClick={load}>Try again</Button>} />;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Front of house"
        title="Visual floor plan"
        description="Drag tables to reposition, pull the corner handle to resize, or twist the top handle to rotate. Save once — every screen updates."
        actions={
          <>
            {dirty && <Badge tone="warning">Unsaved layout</Badge>}
            <Button variant="secondary" icon={<Plus size={14} />} onClick={() => navigate('/admin/restaurant/tables')}>
              Add table
            </Button>
            <Button icon={<Save size={14} />} onClick={save} loading={saving} disabled={!dirty}>Save layout</Button>
          </>
        }
      />

      <Card className="flex flex-wrap items-center gap-2 p-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <Select value={areaId} onChange={(event) => { setAreaId(event.target.value); setSelectedId(null); }} className="min-w-[220px] max-w-[260px]">
            {areas.map((area) => (
              <option key={area.id} value={area.id}>{area.name}</option>
            ))}
          </Select>
          <span className="text-[10px] text-cream-100/35">
            {activeFloor?.name ?? 'Floor'} · {visible.length} tables
          </span>
          {saving && <span className="text-[10px] text-gold-300">Saving…</span>}
        </div>

        <div className="flex items-center gap-1 rounded-full border border-ink-950/10 bg-ink-950/[0.025] p-1">
          <IconButton label="Zoom out" className="h-7 w-7" onClick={() => setZoom((value) => Math.max(0.5, Math.round((value - 0.1) * 10) / 10))}>
            <ZoomOut size={13} />
          </IconButton>
          <button type="button" onClick={() => setZoom(0.9)} className="min-w-[46px] text-center text-[10.5px] text-cream-100/55">
            {Math.round(zoom * 100)}%
          </button>
          <IconButton label="Zoom in" className="h-7 w-7" onClick={() => setZoom((value) => Math.min(1.5, Math.round((value + 0.1) * 10) / 10))}>
            <ZoomIn size={13} />
          </IconButton>
        </div>

        <Button variant="secondary" size="sm" icon={isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />} onClick={toggleFullscreen}>
          {isFullscreen ? 'Exit' : 'Full screen'}
        </Button>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1fr_280px]">
        <div
          ref={screenRef}
          className={cn(
            'relative overflow-auto rounded-2xl border border-ink-950/[0.07] bg-ink-900/70',
            isFullscreen && 'h-screen rounded-none border-0 bg-ink-950',
          )}
          style={isFullscreen ? undefined : { height: 'calc(100vh - 300px)', minHeight: 480 }}
        >
          <div
            ref={canvasRef}
            className="relative origin-top-left touch-none select-none bg-[radial-gradient(900px_500px_at_20%_0%,rgba(215,180,108,0.07),transparent_60%),linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:auto,40px_40px,40px_40px]"
            style={{ width: CANVAS_W, height: CANVAS_H, transform: `scale(${zoom})` }}
            onPointerMove={onMove}
            onPointerUp={finish}
            onPointerCancel={finish}
            onPointerDown={() => setSelectedId(null)}
          >
            <div className="absolute left-6 top-5">
              <p className="text-[9px] uppercase tracking-[0.26em] text-cream-100/30">Restaurant floor plan</p>
              <p className="mt-1 font-display text-2xl text-cream-100/70">{activeArea?.name ?? 'All areas'}</p>
              <p className="text-[10px] text-cream-100/25">{activeFloor?.name ?? ''}</p>
            </div>

            <div className="absolute bottom-7 right-8 rounded-xl border border-ink-950/10 bg-ink-950/[0.025] px-5 py-3 text-center">
              <p className="text-[8px] uppercase tracking-[0.2em] text-cream-100/30">Reception</p>
              <p className="mt-1 text-[10px] text-cream-100/50">Host stand</p>
            </div>
            <div className="absolute bottom-7 left-8 h-14 w-56 rounded-xl border border-ink-950/10 bg-ink-950/[0.02]">
              <p className="mt-2 text-center text-[8px] uppercase tracking-[0.22em] text-cream-100/25">Bar counter</p>
            </div>

            {visible.map((table) => {
              const meta = tableStatusMeta[table.status];
              const isSelected = table.id === selectedId;
              return (
                <div
                  key={table.id}
                  onPointerDown={(event) => begin(event, table, 'drag')}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedId(table.id);
                  }}
                  className={cn(
                    'group absolute cursor-grab touch-none border-2 text-center transition-shadow active:cursor-grabbing',
                    table.shape === 'round' ? 'rounded-full' : table.shape === 'rect' ? 'rounded-lg' : 'rounded-xl',
                    !table.isActive && 'opacity-45',
                    isSelected && 'shadow-[0_0_0_3px_rgba(215,180,108,0.35)]',
                  )}
                  style={{
                    left: table.posX,
                    top: table.posY,
                    width: table.width,
                    height: table.height,
                    transform: `rotate(${table.rotation}deg)`,
                    backgroundColor: `${meta.solid}2b`,
                    borderColor: isSelected ? '#e6cd97' : `${meta.solid}99`,
                  }}
                >
                  <div className="flex h-full flex-col items-center justify-center px-1">
                    <span className="font-display text-[15px] leading-none text-cream-50">{table.code}</span>
                    <span className="mt-1 flex items-center gap-1 text-[9px] text-cream-100/55">
                      <Users size={9} /> {table.capacity}
                    </span>
                    {table.orderCount > 0 && (
                      <span className="mt-0.5 text-[8.5px] text-gold-100/90">{table.orderCount} ord</span>
                    )}
                    {table.billTotal > 0 && (
                      <span className="text-[8px] text-cream-100/45">{money(table.billTotal)}</span>
                    )}
                  </div>

                  {isSelected && (
                    <>
                      <div
                        role="presentation"
                        onPointerDown={(event) => begin(event, table, 'resize')}
                        className="absolute -bottom-2 -right-2 h-4 w-4 cursor-nwse-resize rounded-sm border border-gold-200 bg-gold-400 shadow"
                      />
                      <div
                        role="presentation"
                        onPointerDown={(event) => begin(event, table, 'rotate')}
                        className="absolute -top-6 left-1/2 flex h-5 w-5 -translate-x-1/2 cursor-grab items-center justify-center rounded-full border border-gold-200/70 bg-ink-900 text-gold-200"
                      >
                        <RotateCw size={10} />
                      </div>
                    </>
                  )}
                </div>
              );
            })}

            {visible.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <Armchair size={28} className="mx-auto text-cream-100/20" />
                  <p className="mt-2 text-xs text-cream-100/40">No tables in this area yet.</p>
                  <Button size="sm" variant="goldOutline" className="mt-3" onClick={() => navigate('/admin/restaurant/tables')}>
                    Create a table
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="pointer-events-none sticky bottom-3 left-3 z-10 inline-flex flex-wrap gap-2 rounded-full border border-ink-950/10 bg-ink-950/80 px-3 py-1.5 backdrop-blur-xl">
            {statuses.map((status) => (
              <span key={status} className="inline-flex items-center gap-1.5 text-[9px] text-cream-100/45">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tableStatusMeta[status].solid }} />
                {tableStatusMeta[status].label}
              </span>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {selected ? (
            <Card className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="micro">Selected table</p>
                  <p className="mt-1 font-display text-2xl text-cream-50">{selected.code}</p>
                  <p className="text-[10px] text-cream-100/35">{selected.areaName} · {selected.floorName}</p>
                </div>
                <span
                  className="rounded-full border px-2 py-1 text-[9px]"
                  style={{ borderColor: `${tableStatusMeta[selected.status].solid}66`, color: tableStatusMeta[selected.status].solid, backgroundColor: `${tableStatusMeta[selected.status].solid}1f` }}
                >
                  {tableStatusMeta[selected.status].label}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
                <div className="rounded-lg border border-ink-950/[0.06] bg-ink-950/[0.02] px-2.5 py-2">
                  <p className="text-cream-100/30">Capacity</p>
                  <p className="mt-0.5 text-[12px] text-cream-100/75">{selected.capacity} seats</p>
                </div>
                <div className="rounded-lg border border-ink-950/[0.06] bg-ink-950/[0.02] px-2.5 py-2">
                  <p className="text-cream-100/30">Live bill</p>
                  <p className="mt-0.5 text-[12px] text-cream-100/75">{money(selected.billTotal)}</p>
                </div>
                <div className="rounded-lg border border-ink-950/[0.06] bg-ink-950/[0.02] px-2.5 py-2">
                  <p className="text-cream-100/30">Orders</p>
                  <p className="mt-0.5 text-[12px] text-cream-100/75">{selected.orderCount}</p>
                </div>
                <div className="rounded-lg border border-ink-950/[0.06] bg-ink-950/[0.02] px-2.5 py-2">
                  <p className="text-cream-100/30">Rotation</p>
                  <p className="mt-0.5 text-[12px] text-cream-100/75">{selected.rotation}°</p>
                </div>
              </div>

              <p className="mt-3 text-[11px] text-cream-100/35">{selected.locationLabel || 'No location label'}</p>

              <div className="mt-3">
                <p className="mb-1.5 text-[9px] uppercase tracking-[0.14em] text-cream-100/30">Shape</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['square', 'round', 'rect'] as TableShape[]).map((shape) => (
                    <button
                      key={shape}
                      type="button"
                      onClick={() => updateTable(selected.id, { shape })}
                      className={cn(
                        'rounded-lg border px-1 py-1.5 text-[9.5px] capitalize transition',
                        selected.shape === shape
                          ? 'border-gold-400/45 bg-gold-400/10 text-gold-100'
                          : 'border-ink-950/10 bg-ink-950/[0.02] text-cream-100/40',
                      )}
                    >
                      {shape === 'rect' ? 'rect' : shape}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="secondary" icon={<RotateCw size={12} />} onClick={() => updateTable(selected.id, { rotation: (selected.rotation + 15) % 360 })}>
                  Rotate 15°
                </Button>
                <Button size="sm" variant="ghost" icon={<ExternalLink size={12} />} onClick={() => navigate(`/admin/restaurant/tables/${selected.id}`)}>
                  Details
                </Button>
              </div>
            </Card>
          ) : (
            <Card className="p-4">
              <p className="micro">Floor controls</p>
              <div className="mt-3 space-y-3 text-[11px] leading-relaxed text-cream-100/45">
                <p className="flex items-start gap-2"><Move size={13} className="mt-0.5 shrink-0 text-gold-300/70" /> Drag any table to reposition it on the floor.</p>
                <p className="flex items-start gap-2"><span className="mt-1 h-3 w-3 shrink-0 rounded-sm border border-gold-300" /> Select a table, then pull the corner to resize.</p>
                <p className="flex items-start gap-2"><RotateCw size={13} className="mt-0.5 shrink-0 text-gold-300/70" /> Twist the top handle to rotate, or use the inspector.</p>
                <p className="flex items-start gap-2"><Save size={13} className="mt-0.5 shrink-0 text-gold-300/70" /> Save once to persist positions for every staff screen.</p>
              </div>
            </Card>
          )}

          <Card className="p-4">
            <p className="micro">Dining areas</p>
            <div className="mt-2 space-y-1">
              {areas.map((area) => (
                <button
                  key={area.id}
                  type="button"
                  onClick={() => { setAreaId(String(area.id)); setSelectedId(null); }}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-[11.5px] transition',
                    String(area.id) === areaId ? 'bg-gold-400/10 text-gold-100' : 'text-cream-100/50 hover:bg-ink-950/[0.04]',
                  )}
                >
                  <span className="truncate">{area.name}</span>
                  <span className="text-[9px] text-cream-100/25">{area.tableCount}</span>
                </button>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <p className="micro">Notes</p>
            <p className="mt-2 text-[10.5px] leading-relaxed text-cream-100/35">
              Floor changes affect the visual map only. To change capacity, area or table number, open the table detail page.
            </p>
          </Card>
        </div>
      </div>

      {dragging && (
        <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full border border-gold-400/25 bg-ink-900/90 px-4 py-2 text-[10px] text-gold-200 shadow-2xl backdrop-blur">
          Dragging · release to place · save when done
        </div>
      )}
    </div>
  );
}
