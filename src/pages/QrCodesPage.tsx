import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Download,
  ExternalLink,
  FileDown,
  History,
  Package,
  Printer,
  QrCode,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Ban,
} from 'lucide-react';
import { api, downloadFile } from '../lib/api';
import type { Area, QrTable } from '../lib/types';
import { useToast } from '../components/Toast';
import { useRealtime } from '../lib/socket';
import { QrCard } from '../components/QrCard';
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
  Modal,
  PageHeader,
  PageLoader,
  Select,
} from '../components/ui';
import { cn } from '../components/ui';

type QrResponse = {
  tables: QrTable[];
  counts: { active: number; missing: number; total: number };
};

export function QrCodesPage() {
  const toast = useToast();
  const [data, setData] = useState<QrResponse>({ tables: [], counts: { active: 0, missing: 0, total: 0 } });
  const [areas, setAreas] = useState<Area[]>([]);
  const [search, setSearch] = useState('');
  const [areaId, setAreaId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [bulkBusy, setBulkBusy] = useState('');
  const [preview, setPreview] = useState<QrTable | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<QrTable | null>(null);
  const [regenTarget, setRegenTarget] = useState<QrTable | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (search.trim()) params.set('q', search.trim());
    if (areaId) params.set('areaId', areaId);
    const res = await api<QrResponse>(`/restaurant/qr${params.size ? `?${params}` : ''}`);
    setData(res);
  }, [search, areaId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load()
      .catch((err: Error) => {
        if (!cancelled) toast.error('Could not load QR codes', err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load, toast]);

  useEffect(() => {
    api<{ areas: Area[] }>('/restaurant/areas')
      .then((res) => setAreas(res.areas))
      .catch(() => undefined);
  }, []);

  useRealtime('qr:updated', () => {
    load().catch(() => undefined);
  });

  const grouped = useMemo(() => {
    const groups = new Map<string, QrTable[]>();
    for (const table of data.tables) {
      const key = `${table.floorName} · ${table.areaName}`;
      const list = groups.get(key) ?? [];
      list.push(table);
      groups.set(key, list);
    }
    return [...groups.entries()];
  }, [data.tables]);

  const runTableAction = async (table: QrTable, action: 'generate' | 'regenerate', path: string) => {
    setBusyId(table.id);
    try {
      const res = await api<{ qr: { token: string; scanUrl: string; dataUrl: string } }>(
        `/restaurant/qr/tables/${table.id}/${path}`,
        { method: 'POST' },
      );
      toast.success(
        action === 'generate' ? `QR code issued for ${table.code}` : `Fresh QR code issued for ${table.code}`,
        action === 'regenerate' ? 'The previous code was revoked immediately.' : 'Print it and place it on the table.',
      );
      await load();
      setPreview({ ...table, qr: { ...res.qr, createdAt: new Date().toISOString() } });
      setRegenTarget(null);
    } catch (err) {
      toast.error('QR action failed', err instanceof Error ? err.message : 'Please try again');
    } finally {
      setBusyId(null);
    }
  };

  const revoke = async () => {
    if (!revokeTarget) return;
    setBusyId(revokeTarget.id);
    try {
      await api(`/restaurant/qr/tables/${revokeTarget.id}/revoke`, { method: 'POST' });
      toast.success(`QR code revoked for ${revokeTarget.code}`, 'Scans of the old code will stop working right away.');
      setRevokeTarget(null);
      if (preview?.id === revokeTarget.id) setPreview(null);
      await load();
    } catch (err) {
      toast.error('Could not revoke the QR code', err instanceof Error ? err.message : 'Please try again');
    } finally {
      setBusyId(null);
    }
  };

  const generateMissing = async () => {
    setBulkBusy('missing');
    try {
      const res = await api<{ created: number }>('/restaurant/qr/generate-missing', { method: 'POST' });
      toast.success(
        res.created ? `${res.created} QR code${res.created === 1 ? '' : 's'} generated` : 'Every active table already has a QR code',
      );
      await load();
    } catch (err) {
      toast.error('Bulk generation failed', err instanceof Error ? err.message : 'Please try again');
    } finally {
      setBulkBusy('');
    }
  };

  const download = async (path: string, fallback: string, label: string) => {
    setBulkBusy(label);
    try {
      await downloadFile(path, fallback);
      toast.success(`${label} downloaded`, 'Ready for the printer.');
    } catch (err) {
      toast.error(`Could not build the ${label.toLowerCase()}`, err instanceof Error ? err.message : 'Try again');
    } finally {
      setBulkBusy('');
    }
  };

  const printCard = (table: QrTable) => {
    if (!table.qr) return;
    const win = window.open('', '_blank', 'width=520,height=760');
    if (!win) {
      toast.error('Printing was blocked', 'Allow pop-ups for this site and try again.');
      return;
    }
    win.document.write(`<!doctype html><html><head><title>Nile · ${table.code}</title>
      <style>
        @page { margin: 0; }
        * { box-sizing: border-box; }
        body { margin: 0; font-family: Georgia, 'Times New Roman', serif; background: #fff; }
        .card { width: 105mm; height: 148mm; margin: 12mm auto; border: 1px solid #d7b46c; border-radius: 14px;
                background: #f7f1e6; color: #15120c; padding: 9mm; position: relative; }
        .brand { font-size: 22px; letter-spacing: 5px; }
        .sub { font-size: 7px; letter-spacing: 3px; color: #a67f38; margin-top: 2px; }
        .area { font-size: 8px; letter-spacing: 1px; color: #8a7452; text-align: right; }
        .row { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 14mm; }
        .label { font-size: 8px; letter-spacing: 2px; color: #8a7452; }
        .code { font-size: 40px; line-height: 1; }
        img { width: 44mm; height: 44mm; background: #fff; border: 1px solid #d7b46c; border-radius: 8px; padding: 4px; }
        .foot { margin-top: 10mm; border-top: 1px solid rgba(21,18,12,0.12); padding-top: 6mm; }
        .foot b { font-size: 12px; }
        .foot span { display: block; font-family: Helvetica, Arial, sans-serif; font-size: 9px; color: #6d5b3d; margin-top: 2px; }
      </style></head><body>
      <div class="card">
        <div style="display:flex;justify-content:space-between;">
          <div><div class="brand">NILE</div><div class="sub">HOTEL RESTAURANT</div></div>
          <div class="area">${table.areaName}${table.floorName ? `<br>${table.floorName}` : ''}</div>
        </div>
        <div class="row">
          <div><div class="label">TABLE</div><div class="code">${table.code}</div></div>
          <img src="${table.qr.dataUrl}" alt="QR code">
        </div>
        <div class="foot"><b>Scan to view our menu</b><span>Order directly from your table</span></div>
      </div>
      <script>window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 250); });</script>
      </body></html>`);
    win.document.close();
  };

  const openPreview = async (table: QrTable) => {
    if (table.qr) {
      setPreview(table);
      return;
    }
    await runTableAction(table, 'generate', 'generate');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Table identity"
        title="QR studio"
        description="Every table carries its own cryptographically random link. Codes can be revoked or reissued without ever exposing a table number."
        actions={
          <>
            <Button
              variant="secondary"
              icon={<Package size={15} />}
              loading={bulkBusy === 'ZIP archive'}
              onClick={() => download('/restaurant/qr/download-all', 'Nile-Table-QR-Codes.zip', 'ZIP archive')}
            >
              Download all
            </Button>
            <Button
              variant="secondary"
              icon={<FileDown size={15} />}
              loading={bulkBusy === 'PDF sheet'}
              onClick={() => download('/restaurant/qr/sheet.pdf', 'Nile-Table-QR-Cards.pdf', 'PDF sheet')}
            >
              Print sheet
            </Button>
            <Button icon={<Sparkles size={15} />} loading={bulkBusy === 'missing'} onClick={generateMissing}>
              Generate missing
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Active codes', value: data.counts.active, tone: 'text-emerald-200', icon: <ShieldCheck size={16} /> },
          { label: 'Needs a code', value: data.counts.missing, tone: 'text-orange-200', icon: <AlertTriangle size={16} /> },
          { label: 'Active tables', value: data.counts.total, tone: 'text-gold-200', icon: <QrCode size={16} /> },
        ].map((stat) => (
          <Card key={stat.label} className="flex items-center justify-between gap-3 p-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.16em] text-cream-100/40">{stat.label}</p>
              <p className={cn('mt-2 font-display text-3xl leading-none', stat.tone)}>{stat.value}</p>
            </div>
            <span className="text-cream-100/25">{stat.icon}</span>
          </Card>
        ))}
      </div>

      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <Field label="Find a table" className="flex-1">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cream-100/35" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by table number"
              className="pl-9"
            />
          </div>
        </Field>
        <Field label="Dining area" className="sm:w-56">
          <Select value={areaId} onChange={(event) => setAreaId(event.target.value)}>
            <option value="">All areas</option>
            {areas.map((area) => (
              <option key={area.id} value={area.id}>
                {area.name}
              </option>
            ))}
          </Select>
        </Field>
        <Button variant="secondary" icon={<RefreshCw size={14} />} onClick={() => load()} className="sm:mb-0.5">
          Refresh
        </Button>
      </Card>

      <div className="flex items-start gap-2 rounded-xl border border-gold-400/20 bg-gold-400/[0.05] px-4 py-3 text-[11.5px] leading-relaxed text-cream-100/55">
        <ShieldCheck size={15} className="mt-0.5 shrink-0 text-gold-300" />
        Each link is a 16-byte random token. Regenerating instantly revokes the old code, which is ideal when a card is lost or a QR is photographed by mistake.
      </div>

      {loading ? (
        <PageLoader />
      ) : data.tables.length === 0 ? (
        <EmptyState
          icon={<QrCode size={30} />}
          title="No tables match this filter"
          description="Clear the search or choose another dining area to see QR cards."
          action={
            <Button variant="secondary" onClick={() => { setSearch(''); setAreaId(''); }}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <div className="space-y-8">
          {grouped.map(([group, tables]) => (
            <section key={group}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="eyebrow">{group}</p>
                <span className="text-[10px] text-cream-100/30">{tables.length} tables</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {tables.map((table) => (
                  <Card key={table.id} className="overflow-hidden p-4">
                    {table.qr ? (
                      <button type="button" onClick={() => setPreview(table)} className="block w-full text-left" aria-label={`Preview QR for ${table.code}`}>
                        <QrCard
                          code={table.code}
                          area={table.areaName}
                          floor={table.floorName}
                          scanUrl={table.qr.scanUrl}
                          dataUrl={table.qr.dataUrl}
                          compact
                        />
                      </button>
                    ) : (
                      <div className="flex h-[218px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-ink-950/12 bg-ink-950/[0.02] text-center">
                        <QrCode size={26} className="text-cream-100/25" />
                        <div>
                          <p className="text-sm text-cream-100/70">{table.code} has no QR code</p>
                          <p className="mt-1 text-[11px] text-cream-100/35">Generate one to enable table ordering.</p>
                        </div>
                        <Button size="sm" loading={busyId === table.id} onClick={() => openPreview(table)}>
                          Generate QR
                        </Button>
                      </div>
                    )}

                    <div className="mt-3 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-[10px] text-cream-100/35">
                        <Badge tone={table.qr ? 'success' : 'warning'}>{table.qr ? 'Active' : 'Missing'}</Badge>
                        <span className="inline-flex items-center gap-1">
                          <History size={11} /> {table.qrHistoryCount}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        {table.qr && (
                          <Button variant="ghost" size="xs" onClick={() => openPreview(table)}>
                            Preview
                          </Button>
                        )}
                        <Menu
                          trigger={
                            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-ink-950/10 bg-ink-950/[0.04] text-cream-100/60 transition hover:border-ink-950/20 hover:text-cream-50">
                              <Download size={14} />
                            </span>
                          }
                        >
                          <MenuLabel>{table.code} actions</MenuLabel>
                          {table.qr ? (
                            <>
                              <MenuItem icon={<Download size={14} />} onClick={() => download(`/restaurant/qr/tables/${table.id}/download?format=png`, `${table.code}-QR.png`, 'PNG')}>
                                Download PNG
                              </MenuItem>
                              <MenuItem icon={<Download size={14} />} onClick={() => download(`/restaurant/qr/tables/${table.id}/download?format=svg`, `${table.code}-QR.svg`, 'SVG')}>
                                Download SVG
                              </MenuItem>
                              <MenuItem icon={<Printer size={14} />} onClick={() => printCard(table)}>
                                Print card
                              </MenuItem>
                              <MenuItem icon={<ExternalLink size={14} />} onClick={() => window.open(table.qr!.scanUrl, '_blank', 'noopener')}>
                                Open scan page
                              </MenuItem>
                            </>
                          ) : (
                            <MenuItem icon={<QrCode size={14} />} onClick={() => openPreview(table)}>
                              Generate QR
                            </MenuItem>
                          )}
                          <MenuItem icon={<RefreshCw size={14} />} disabled={!table.qr} onClick={() => setRegenTarget(table)}>
                            Regenerate code
                          </MenuItem>
                          <MenuItem icon={<Ban size={14} />} danger disabled={!table.qr} onClick={() => setRevokeTarget(table)}>
                            Revoke code
                          </MenuItem>
                        </Menu>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
        title={preview?.qr ? `${preview.code} · table QR` : undefined}
        subtitle="Print this card or download a print-ready file. The link stays valid until you revoke it."
        size="md"
        footer={
          preview?.qr ? (
            <>
              <Button
                variant="secondary"
                icon={<Download size={14} />}
                onClick={() => download(`/restaurant/qr/tables/${preview.id}/download?format=png`, `${preview.code}-QR.png`, 'PNG')}
              >
                PNG
              </Button>
              <Button
                variant="secondary"
                icon={<Download size={14} />}
                onClick={() => download(`/restaurant/qr/tables/${preview.id}/download?format=svg`, `${preview.code}-QR.svg`, 'SVG')}
              >
                SVG
              </Button>
              <Button icon={<Printer size={15} />} onClick={() => printCard(preview)}>
                Print card
              </Button>
            </>
          ) : null
        }
      >
        {preview?.qr && (
          <div className="space-y-4">
            <QrCard
              code={preview.code}
              area={preview.areaName}
              floor={preview.floorName}
              scanUrl={preview.qr.scanUrl}
              dataUrl={preview.qr.dataUrl}
            />
            <CopyField label="Scan link" value={preview.qr.scanUrl} />
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-cream-100/35">
              <span>Capacity {preview.capacity} · {preview.areaName}</span>
              <span>{preview.qrHistoryCount} code{preview.qrHistoryCount === 1 ? '' : 's'} issued for this table</span>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(regenTarget)}
        onClose={() => setRegenTarget(null)}
        onConfirm={() => regenTarget && runTableAction(regenTarget, 'regenerate', 'regenerate')}
        title="Regenerate this QR code?"
        description={
          <>
            The current code for <strong className="text-cream-50">{regenTarget?.code}</strong> will stop working immediately.
            Any printed card still carrying the old code must be replaced.
          </>
        }
        confirmLabel="Issue a new code"
        tone="primary"
        loading={busyId === regenTarget?.id}
      />

      <ConfirmDialog
        open={Boolean(revokeTarget)}
        onClose={() => setRevokeTarget(null)}
        onConfirm={revoke}
        title="Revoke this QR code?"
        description={
          <>
            Guests scanning the code at <strong className="text-cream-50">{revokeTarget?.code}</strong> will be told the code is no longer
            active. You can issue a fresh code at any time.
          </>
        }
        confirmLabel="Revoke code"
        loading={busyId === revokeTarget?.id}
      />
    </div>
  );
}
