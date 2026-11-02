import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Clock3,
  Download,
  Percent,
  ReceiptText,
  RefreshCw,
  TrendingUp,
  Users,
  Utensils,
} from 'lucide-react';
import { api } from '../lib/api';
import type { ReportData } from '../lib/types';
import { money, number } from '../lib/format';
import { useToast } from '../components/Toast';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  PageLoader,
  ProgressBar,
  Tabs,
  cn,
} from '../components/ui';

const ranges = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
];

export function ReportsPage() {
  const toast = useToast();
  const [range, setRange] = useState('today');
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true);
    try {
      const res = await api<ReportData>(`/restaurant/reports/summary?range=${range}`);
      setData(res);
    } catch (err) {
      if (!quiet) toast.error('Could not load the report', err instanceof Error ? err.message : 'Try again');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [range, toast]);

  useEffect(() => {
    setLoading(true);
    load(true);
  }, [load]);

  const peakHour = useMemo(() => {
    if (!data?.hourly.length) return null;
    return data.hourly.reduce((best, row) => (row.orders > best.orders ? row : best), data.hourly[0]);
  }, [data]);

  const exportCsv = () => {
    if (!data) return;
    const lines: string[] = [];
    lines.push(`Nile Restaurant report,${range}`);
    lines.push('');
    lines.push('Metric,Value');
    lines.push(`Sales,${data.totals.sales}`);
    lines.push(`Orders,${data.totals.orders}`);
    lines.push(`Average ticket,${data.totals.avgTicket}`);
    lines.push(`Guests,${data.totals.guests}`);
    lines.push(`Payments collected,${data.totals.payments}`);
    lines.push(`Cancelled orders,${data.totals.cancelled}`);
    lines.push(`Cancelled value,${data.totals.cancelledValue}`);
    lines.push(`Sessions,${data.totals.sessions}`);
    lines.push('');
    lines.push('Table,Area,Orders,Sales');
    for (const row of data.byTable) lines.push(`${row.tableCode},${row.areaName},${row.orders},${row.sales}`);
    lines.push('');
    lines.push('Dish,Quantity,Revenue');
    for (const row of data.topItems) lines.push(`"${row.name}",${row.qty},${row.revenue}`);
    lines.push('');
    lines.push('Waiter,Orders,Sales');
    for (const row of data.byWaiter) lines.push(`"${row.waiter}",${row.orders},${row.sales}`);
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `Nile-report-${range}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success('Report exported', 'The CSV is ready for your accountant.');
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Business pulse"
        title="Reports"
        description="Sales, covers and kitchen performance distilled from real service data. Every figure excludes cancelled orders."
        actions={
          <>
            <Button variant="secondary" icon={<RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />} onClick={() => load()}>
              Refresh
            </Button>
            <Button variant="secondary" icon={<Download size={14} />} onClick={exportCsv} disabled={!data}>
              Export CSV
            </Button>
          </>
        }
      />

      <Card className="flex flex-wrap items-center justify-between gap-3 p-3">
        <Tabs variant="pill" value={range} onChange={setRange} items={ranges} />
        <p className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-cream-100/30">
          <BarChart3 size={12} /> {data ? `${data.totals.orders} orders · ${data.totals.sessions} sessions` : 'Loading'}
        </p>
      </Card>

      {loading || !data ? (
        <PageLoader />
      ) : data.totals.orders === 0 ? (
        <EmptyState
          icon={<BarChart3 size={30} />}
          title="No sales in this window"
          description="Serve a few tables and this report will fill with live numbers. Cancelled orders are excluded from sales."
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Net sales', value: money(data.totals.sales), hint: `${data.totals.payments > 0 ? money(data.totals.payments) : 'No'} payments collected`, icon: <TrendingUp size={16} /> },
              { label: 'Orders', value: number(data.totals.orders), hint: `${data.totals.sessions} table sessions`, icon: <ReceiptText size={16} /> },
              { label: 'Average ticket', value: money(data.totals.avgTicket), hint: 'Per order, incl. service', icon: <Percent size={16} /> },
              { label: 'Guests served', value: number(data.totals.guests), hint: 'Across seated sessions', icon: <Users size={16} /> },
            ].map((stat) => (
              <Card key={stat.label} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-cream-100/40">{stat.label}</p>
                  <span className="text-gold-300/70">{stat.icon}</span>
                </div>
                <p className="mt-2.5 font-display text-2xl leading-none text-cream-50">{stat.value}</p>
                <p className="mt-1.5 text-[10px] text-cream-100/30">{stat.hint}</p>
              </Card>
            ))}
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
            <Card className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="micro">Hourly rhythm</p>
                  <p className="mt-1 text-sm text-cream-50">When the room fills</p>
                </div>
                {peakHour && (
                  <Badge tone="gold">
                    <Clock3 size={10} /> Peak {String(peakHour.hour).padStart(2, '0')}:00
                  </Badge>
                )}
              </div>
              <div className="mt-5 flex h-40 items-end gap-1.5">
                {data.hourly.map((row) => {
                  const max = Math.max(...data.hourly.map((entry) => entry.orders), 1);
                  return (
                    <div key={row.hour} className="group flex flex-1 flex-col items-center gap-1.5">
                      <div className="relative flex w-full flex-1 items-end">
                        <div
                          className="w-full rounded-t bg-gradient-to-t from-gold-500/40 to-gold-300/80 transition group-hover:from-gold-400/60 group-hover:to-gold-200"
                          style={{ height: `${Math.max(4, (row.orders / max) * 100)}%` }}
                          title={`${row.orders} orders · ${money(row.sales)}`}
                        />
                      </div>
                      <span className="text-[8.5px] text-cream-100/30">{String(row.hour).padStart(2, '0')}</span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex items-center justify-between text-[10px] text-cream-100/30">
                <span>Orders per hour</span>
                <span>{money(data.totals.avgTicket)} average</span>
              </div>
            </Card>

            <Card className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="micro">Payment mix</p>
                  <p className="mt-1 text-sm text-cream-50">How guests settle</p>
                </div>
                <span className="text-gold-300/70"><ReceiptText size={16} /></span>
              </div>
              <div className="mt-4 space-y-3">
                {data.methods.length === 0 ? (
                  <p className="text-[11px] text-cream-100/35">No payments captured in this window.</p>
                ) : (
                  data.methods.map((method) => {
                    const total = data.methods.reduce((sum, entry) => sum + Number(entry.amount), 0) || 1;
                    const pct = Math.round((Number(method.amount) / total) * 100);
                    return (
                      <div key={method.method}>
                        <div className="flex items-center justify-between text-[11.5px]">
                          <span className="capitalize text-cream-100/60">{method.method.replace('_', ' ')}</span>
                          <span className="text-cream-50">{money(method.amount)} <span className="text-cream-100/30">· {pct}%</span></span>
                        </div>
                        <ProgressBar value={pct} className="mt-1.5" />
                      </div>
                    );
                  })
                )}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-ink-950/[0.06] pt-3 text-[10.5px]">
                <div>
                  <p className="text-cream-100/35">Service charge</p>
                  <p className="mt-1 font-display text-base text-cream-50">{money(data.totals.service)}</p>
                </div>
                <div>
                  <p className="text-cream-100/35">Tax collected</p>
                  <p className="mt-1 font-display text-base text-cream-50">{money(data.totals.tax)}</p>
                </div>
              </div>
            </Card>
          </div>

          <div className="grid gap-5 xl:grid-cols-3">
            <Card className="overflow-hidden">
              <div className="border-b border-ink-950/[0.06] px-5 py-4">
                <p className="micro">Top tables</p>
                <p className="mt-1 text-sm text-cream-50">Where the revenue comes from</p>
              </div>
              <div className="divide-y divide-ink-950/[0.05]">
                {data.byTable.map((row, index) => (
                  <div key={`${row.tableCode}-${index}`} className="flex items-center justify-between gap-2 px-5 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-ink-950/10 text-[9px] text-cream-100/40">
                        {index + 1}
                      </span>
                      <div>
                        <p className="text-[12px] text-cream-50">{row.tableCode}</p>
                        <p className="text-[9.5px] text-cream-100/30">{row.areaName} · {row.orders} orders</p>
                      </div>
                    </div>
                    <span className="text-[11.5px] text-cream-100/60">{money(row.sales)}</span>
                  </div>
                ))}
                {data.byTable.length === 0 && <p className="px-5 py-6 text-[11px] text-cream-100/30">No table sales yet.</p>}
              </div>
            </Card>

            <Card className="overflow-hidden">
              <div className="border-b border-ink-950/[0.06] px-5 py-4">
                <p className="micro">Best sellers</p>
                <p className="mt-1 text-sm text-cream-50">Dishes guests return for</p>
              </div>
              <div className="divide-y divide-ink-950/[0.05]">
                {data.topItems.map((row, index) => (
                  <div key={`${row.name}-${index}`} className="flex items-center justify-between gap-2 px-5 py-2.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-gold-400/20 bg-gold-400/[0.07] text-[9px] text-gold-200">
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[12px] text-cream-50">{row.name}</p>
                        <p className="text-[9.5px] text-cream-100/30">{row.qty} sold</p>
                      </div>
                    </div>
                    <span className="shrink-0 text-[11.5px] text-cream-100/60">{money(row.revenue)}</span>
                  </div>
                ))}
                {data.topItems.length === 0 && <p className="px-5 py-6 text-[11px] text-cream-100/30">No dishes sold yet.</p>}
              </div>
            </Card>

            <Card className="overflow-hidden">
              <div className="border-b border-ink-950/[0.06] px-5 py-4">
                <p className="micro">Waiter performance</p>
                <p className="mt-1 text-sm text-cream-50">Sales by owner</p>
              </div>
              <div className="divide-y divide-ink-950/[0.05]">
                {data.byWaiter.map((row) => (
                  <div key={row.waiter} className="flex items-center justify-between gap-2 px-5 py-2.5">
                    <div>
                      <p className="text-[12px] text-cream-50">{row.waiter}</p>
                      <p className="text-[9.5px] text-cream-100/30">{row.orders} orders</p>
                    </div>
                    <span className="text-[11.5px] text-cream-100/60">{money(row.sales)}</span>
                  </div>
                ))}
                {data.byWaiter.length === 0 && <p className="px-5 py-6 text-[11px] text-cream-100/30">No waiter sales yet.</p>}
              </div>
            </Card>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: 'Cancelled orders', value: number(data.totals.cancelled), hint: `${money(data.totals.cancelledValue)} lost value`, icon: <Utensils size={15} /> },
              { label: 'Reservations', value: number(data.reservations.count), hint: `${data.reservations.cancelled} cancelled · ${data.reservations.noShow} no-shows`, icon: <Users size={15} /> },
              { label: 'Sessions opened', value: number(data.totals.sessions), hint: 'Table turns in range', icon: <Clock3 size={15} /> },
            ].map((stat) => (
              <Card key={stat.label} className="flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-cream-100/40">{stat.label}</p>
                  <p className="mt-2 font-display text-xl text-cream-50">{stat.value}</p>
                  <p className="mt-1 text-[10px] text-cream-100/30">{stat.hint}</p>
                </div>
                <span className={cn('shrink-0 text-gold-300/60')}>{stat.icon}</span>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
