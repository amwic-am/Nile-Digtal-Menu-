import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Banknote,
  CheckCircle2,
  CreditCard,
  Printer,
  ReceiptText,
  RefreshCw,
  Search,
  ShieldAlert,
  Wallet,
} from 'lucide-react';
import { api } from '../lib/api';
import type { Bill, Payment, PaymentMethod, SessionSummary } from '../lib/types';
import { formatClock, formatDateTime, money, paymentMethods, timeAgo } from '../lib/format';
import { useAuth } from '../lib/auth';
import { useRealtime } from '../lib/socket';
import { useToast } from '../components/Toast';
import { BillBreakdown, PaymentModal } from '../components/Billing';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Input,
  Modal,
  PageHeader,
  PageLoader,
  Tabs,
  cn,
} from '../components/ui';

type BillRow = {
  id: number;
  sessionId: number;
  status: string;
  subtotal: number;
  serviceCharge: number;
  tax: number;
  total: number;
  createdAt: string;
  tableCode: string;
  tableId: number;
  areaName: string;
  sessionCode: string;
  openedAt: string;
  paid: number;
  balance: number;
};

type PaymentsResponse = {
  payments: Array<Payment & { tableCode: string; sessionCode: string; receivedByName: string | null }>;
  total: number;
};

type TabId = 'open' | 'settled' | 'payments';

function Receipt({
  bill,
  session,
  cashierName,
  printedAt,
}: {
  bill: Bill;
  session: SessionSummary | null;
  cashierName: string;
  printedAt: string;
}) {
  const orderNumbers = session?.orders.map((order) => order.displayNo).join(', ') || '—';

  return (
    <article className="print-area mx-auto w-full max-w-[360px] rounded-lg bg-white p-6 font-mono text-[11px] text-[#16130d]">
      <header className="receipt-keep text-center">
        <p className="font-serif text-xl tracking-[0.25em]">NILE</p>
        <p className="mt-1 text-[8px] uppercase tracking-[0.3em] text-[#6d5b3d]">Hotel Restaurant</p>
        <p className="mt-2 text-[9px]">Addis Ababa</p>
        <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.16em]">Guest receipt</p>
      </header>
      <div className="receipt-rule my-3 border-t border-dashed border-[#16130d]/30" />
      <section className="receipt-keep space-y-1 text-[10px]">
        <div className="flex justify-between gap-2"><span>Receipt no.</span><span>{bill.id ?? bill.sessionId}</span></div>
        <div className="flex justify-between gap-2"><span>Order no.</span><span className="text-right">{orderNumbers}</span></div>
        <div className="flex justify-between gap-2"><span>Table</span><span>{session?.tableCode ?? bill.tableId}</span></div>
        <div className="flex justify-between gap-2"><span>Dining area</span><span>{session?.areaName || '—'}</span></div>
        <div className="flex justify-between gap-2"><span>Session</span><span>{session?.code ?? `Session ${bill.sessionId}`}</span></div>
        <div className="flex justify-between gap-2"><span>Cashier</span><span>{cashierName || '—'}</span></div>
        <div className="flex justify-between gap-2"><span>Opened</span><span>{session ? formatDateTime(session.openedAt) : '—'}</span></div>
        <div className="flex justify-between gap-2"><span>Printed</span><span>{formatDateTime(printedAt)}</span></div>
      </section>
      <div className="receipt-rule my-3 border-t border-dashed border-[#16130d]/30" />
      <table className="receipt-items w-full table-fixed text-[10px]">
        <thead>
          <tr className="border-b border-[#16130d]/30 text-left">
            <th className="w-[15%] py-1 font-bold">Qty</th>
            <th className="w-[57%] py-1 font-bold">Item / unit</th>
            <th className="w-[28%] py-1 text-right font-bold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {bill.items.map((item, index) => (
            <tr key={`${item.name}-${index}`} className="receipt-item-row border-b border-dashed border-[#16130d]/15 align-top">
              <td className="break-words py-1">{item.qty}</td>
              <td className="break-words py-1 pr-1">
                <span className="block font-bold">{item.name}</span>
                <span className="block text-[9px]">{money(item.unitPrice, 'ETB')} each</span>
              </td>
              <td className="break-words py-1 text-right">{money(item.total, 'ETB').replace('ETB ', '')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="receipt-rule my-3 border-t border-dashed border-[#16130d]/30" />
      <section className="receipt-keep space-y-1 text-[10px]">
        <div className="flex justify-between gap-2"><span>Subtotal</span><span>{money(bill.subtotal, 'ETB')}</span></div>
        <div className="flex justify-between gap-2"><span>Service charge</span><span>{money(bill.serviceCharge, 'ETB')}</span></div>
        {bill.discount > 0 && <div className="flex justify-between gap-2"><span>Discount</span><span>-{money(bill.discount, 'ETB')}</span></div>}
        {bill.tax > 0 && <div className="flex justify-between gap-2"><span>Tax</span><span>{money(bill.tax, 'ETB')}</span></div>}
        <div className="mt-1 flex justify-between gap-2 border-t border-[#16130d] pt-1.5 text-[12px] font-bold">
          <span>GRAND TOTAL</span><span>{money(bill.total, 'ETB')}</span>
        </div>
        <div className="flex justify-between gap-2"><span>Amount paid</span><span>{money(bill.paid, 'ETB')}</span></div>
        <div className="flex justify-between gap-2 font-bold"><span>Remaining balance</span><span>{money(Math.max(0, bill.balance), 'ETB')}</span></div>
      </section>
      <div className="receipt-rule my-3 border-t border-dashed border-[#16130d]/30" />
      <section className="text-[10px]">
        <p className="mb-1 font-bold">Payment transactions</p>
        {bill.payments.length ? bill.payments.map((payment) => (
          <div key={payment.id} className="receipt-keep mb-2 border-b border-dashed border-[#16130d]/15 pb-1">
            <div className="flex justify-between gap-2">
              <span className="capitalize">{payment.method.replace(/_/g, ' ')}</span>
              <span>{money(payment.amount, 'ETB')}</span>
            </div>
            <div className="flex justify-between gap-2 text-[9px]">
              <span>Transaction #{payment.id}{payment.reference ? ` · Ref ${payment.reference}` : ''}</span>
            </div>
            <div className="text-[9px]">{formatDateTime(payment.createdAt)}</div>
          </div>
        )) : <p>No payments recorded.</p>}
      </section>
      <div className="receipt-rule my-3 border-t border-dashed border-[#16130d]/30" />
      <p className="receipt-keep text-center text-[9px] leading-relaxed">Thank you for dining with Nile.</p>
    </article>
  );
}

export function CashierPage() {
  const toast = useToast();
  const { user } = useAuth();
  const [tab, setTab] = useState<TabId>('open');
  const [bills, setBills] = useState<BillRow[]>([]);
  const [payments, setPayments] = useState<PaymentsResponse>({ payments: [], total: 0 });
  const [detail, setDetail] = useState<{ bill: Bill; session: SessionSummary | null } | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [forceOpen, setForceOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptPrintedAt, setReceiptPrintedAt] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (quiet = false) => {
    try {
      if (tab === 'payments') {
        const res = await api<PaymentsResponse>('/restaurant/payments?date=all');
        setPayments(res);
        setLoading(false);
        return;
      }
      const res = await api<{ bills: BillRow[] }>(`/restaurant/bills?status=${tab}`);
      setBills(res.bills);
      setSelected((current) => {
        if (current && res.bills.some((bill) => bill.sessionId === current)) return current;
        return res.bills[0]?.sessionId ?? null;
      });
    } catch (err) {
      if (!quiet) toast.error('Could not load bills', err instanceof Error ? err.message : 'Please try again');
    } finally {
      setLoading(false);
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
    api<{ bill: Bill; session: SessionSummary }>(`/restaurant/bills/${selected}`)
      .then((res) => {
        if (!cancelled) setDetail(res);
      })
      .catch((err: Error) => {
        if (!cancelled) toast.error('Could not load this bill', err.message);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected, toast]);

  const refreshAll = useCallback(() => {
    load(true);
    if (selected) {
      api<{ bill: Bill; session: SessionSummary }>(`/restaurant/bills/${selected}`)
        .then(setDetail)
        .catch(() => undefined);
    }
  }, [load, selected]);

  useRealtime('bill:updated', refreshAll);
  useRealtime('session:closed', refreshAll);
  useRealtime('payment:received', refreshAll);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return bills;
    return bills.filter(
      (bill) =>
        bill.tableCode.toLowerCase().includes(term) ||
        bill.sessionCode.toLowerCase().includes(term) ||
        bill.areaName.toLowerCase().includes(term),
    );
  }, [bills, search]);

  const submitPayment = async (payload: { amount: number; method: PaymentMethod; reference: string | null }) => {
    if (!detail) return;
    await api(`/restaurant/sessions/${detail.bill.sessionId}/payments`, {
      method: 'POST',
      body: payload,
    });
    toast.success(`${money(payload.amount)} recorded`, `Table ${detail.session?.tableCode ?? ''} · ${payload.method.replace('_', ' ')}`);
    setPayOpen(false);
    await load(true);
    const res = await api<{ bill: Bill; session: SessionSummary }>(`/restaurant/bills/${detail.bill.sessionId}`);
    setDetail(res);
  };

  const closeSession = async (force: boolean) => {
    if (!detail) return;
    setBusy(true);
    try {
      await api(`/restaurant/sessions/${detail.bill.sessionId}/close`, {
        method: 'POST',
        body: force ? { force: true } : {},
      });
      toast.success(
        `Table ${detail.session?.tableCode ?? ''} closed`,
        'Housekeeping has been notified to reset the table.',
      );
      setCloseOpen(false);
      setForceOpen(false);
      setDetail(null);
      setSelected(null);
      await load(true);
    } catch (err) {
      toast.error('Could not close the table', err instanceof Error ? err.message : 'Please try again');
    } finally {
      setBusy(false);
    }
  };

  const canForce = user?.role === 'manager' || user?.role === 'super_admin';
  const balance = detail?.bill.balance ?? 0;
  const settled = balance <= 0.009;

  const methodsSummary = useMemo(() => {
    const map = new Map<PaymentMethod, number>();
    for (const payment of payments.payments) {
      map.set(payment.method, (map.get(payment.method) ?? 0) + Number(payment.amount));
    }
    return paymentMethods.map((method) => ({ ...method, amount: map.get(method.id) ?? 0 }));
  }, [payments.payments]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Front of house"
        title="Bills & payments"
        description="One consolidated bill per table session. Split payments, settle the balance and close the table in a single flow."
        actions={
          <>
            <Button variant="secondary" icon={<RefreshCw size={14} />} onClick={() => load()}>Refresh</Button>
            <Button
              icon={<ReceiptText size={15} />}
              onClick={() => setTab('open')}
            >
              Open bills
            </Button>
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[1fr_1.25fr]">
        <div className="space-y-4">
          <Card className="p-3">
            <Tabs
              variant="pill"
              value={tab}
              onChange={(id) => setTab(id as TabId)}
              items={[
                { id: 'open', label: 'Open bills' },
                { id: 'settled', label: 'Settled' },
                { id: 'payments', label: 'Payment log' },
              ]}
            />
          </Card>

          {tab !== 'payments' && (
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cream-100/35" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search table, session or area"
                className="pl-9"
              />
            </div>
          )}

          {loading ? (
            <PageLoader />
          ) : tab === 'payments' ? (
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-ink-950/[0.06] px-4 py-3">
                <div>
                  <p className="micro">Collected to date</p>
                  <p className="mt-1 font-display text-2xl text-cream-50">{money(payments.total)}</p>
                </div>
                <Wallet size={18} className="text-gold-300" />
              </div>
              <div className="divide-y divide-ink-950/[0.05]">
                {payments.payments.length === 0 ? (
                  <p className="px-4 py-8 text-center text-xs text-cream-100/35">No payments recorded yet today.</p>
                ) : (
                  payments.payments.map((payment) => (
                    <div key={payment.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-[12px] text-cream-50">
                          {payment.tableCode}
                          <span className="ml-2 text-[10px] text-cream-100/35">{payment.sessionCode}</span>
                        </p>
                        <p className="mt-0.5 text-[10px] text-cream-100/35">
                          {payment.receivedByName ?? 'Staff'} · {formatDateTime(payment.createdAt)}
                          {payment.reference ? ` · ${payment.reference}` : ''}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-display text-sm text-cream-50">{money(payment.amount)}</p>
                        <p className="text-[9px] uppercase tracking-[0.14em] text-cream-100/30">{payment.method.replace('_', ' ')}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<ReceiptText size={28} />}
              title={tab === 'open' ? 'No open bills' : 'No settled bills yet'}
              description={tab === 'open' ? 'Bills appear as soon as guests start ordering at a table.' : 'Once a table is closed its bill is archived here.'}
            />
          ) : (
            <div className="space-y-2">
              {filtered.map((bill) => (
                <button
                  key={bill.id}
                  type="button"
                  onClick={() => setSelected(bill.sessionId)}
                  className={cn(
                    'block w-full rounded-xl border px-4 py-3 text-left transition',
                    selected === bill.sessionId
                      ? 'border-gold-400/45 bg-gold-400/[0.07]'
                      : 'border-ink-950/[0.07] bg-ink-950/[0.02] hover:border-ink-950/20',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="flex items-center gap-2 font-display text-lg text-cream-50">
                        {bill.tableCode}
                        <span className="text-[10px] font-sans uppercase tracking-[0.14em] text-cream-100/35">{bill.areaName}</span>
                      </p>
                      <p className="mt-0.5 text-[10px] text-cream-100/35">
                        {bill.sessionCode} · opened {timeAgo(bill.openedAt)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-base text-cream-50">{money(bill.total)}</p>
                      <p className={cn('mt-0.5 text-[10px]', bill.balance > 0.009 ? 'text-rose-200/80' : 'text-emerald-200/80')}>
                        {bill.balance > 0.009 ? `${money(bill.balance)} due` : 'Settled'}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge tone={bill.balance > 0.009 ? (bill.paid > 0 ? 'warning' : 'danger') : 'success'}>
                      {bill.balance > 0.009 ? (bill.paid > 0 ? 'Part paid' : 'Unpaid') : 'Paid'}
                    </Badge>
                    <span className="text-[9.5px] text-cream-100/30">{formatClock(bill.openedAt)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {tab === 'payments' && (
            <Card className="p-4">
              <p className="micro mb-3">By method</p>
              <div className="space-y-2">
                {methodsSummary.map((method) => (
                  <div key={method.id} className="flex items-center justify-between gap-2 text-[11.5px]">
                    <span className="text-cream-100/55">{method.label}</span>
                    <span className="text-cream-50">{money(method.amount)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          {detailLoading ? (
            <PageLoader />
          ) : detail ? (
            <>
              <Card className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="micro">Table {detail.bill.tableId} · {detail.session?.areaName ?? 'Dining'}</p>
                    <p className="mt-1 font-display text-2xl text-cream-50">{detail.session?.tableCode ?? `Session ${detail.bill.sessionId}`}</p>
                    <p className="mt-1 text-[10.5px] text-cream-100/40">
                      {detail.session?.code ?? ''} · {detail.session?.guestsCount ?? 0} guests · opened {detail.session ? timeAgo(detail.session.openedAt) : ''}
                    </p>
                  </div>
                  <Badge tone={settled ? 'success' : 'warning'}>{settled ? 'Ready to close' : 'Balance open'}</Badge>
                </div>

                <div className="mt-5">
                  <BillBreakdown bill={detail.bill} />
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  <Button
                    icon={<CreditCard size={15} />}
                    disabled={settled}
                    onClick={() => setPayOpen(true)}
                  >
                    Record payment
                  </Button>
                  <Button
                    variant="secondary"
                    icon={<Printer size={15} />}
                    onClick={() => {
                      setReceiptPrintedAt(new Date().toISOString());
                      setReceiptOpen(true);
                    }}
                  >
                    Receipt
                  </Button>
                  {settled ? (
                    <Button variant="success" icon={<CheckCircle2 size={15} />} onClick={() => setCloseOpen(true)}>
                      Close table
                    </Button>
                  ) : canForce ? (
                    <Button variant="danger" icon={<ShieldAlert size={15} />} onClick={() => setForceOpen(true)}>
                      Close with balance
                    </Button>
                  ) : (
                    <Button variant="secondary" icon={<Banknote size={15} />} disabled>
                      Balance must be zero
                    </Button>
                  )}
                </div>
              </Card>

              <Card className="p-4">
                <p className="micro">Recent payments on this table</p>
                <div className="mt-3 space-y-2">
                  {detail.bill.payments.length === 0 ? (
                    <p className="text-[11px] text-cream-100/30">No payments recorded yet.</p>
                  ) : (
                    detail.bill.payments.map((payment) => (
                      <div key={payment.id} className="flex items-center justify-between gap-2 rounded-lg border border-ink-950/[0.05] px-3 py-2">
                        <div>
                          <p className="text-[11.5px] capitalize text-cream-100/70">{payment.method.replace('_', ' ')}</p>
                          <p className="text-[9.5px] text-cream-100/30">{formatDateTime(payment.createdAt)}</p>
                        </div>
                        <span className="font-display text-sm text-emerald-200">{money(payment.amount)}</span>
                      </div>
                    ))
                  )}
                </div>
              </Card>
            </>
          ) : (
            <EmptyState
              icon={<Wallet size={30} />}
              title="Select a bill"
              description="Choose a table on the left to review its consolidated bill, take payments and close the session."
            />
          )}
        </div>
      </div>

      {detail && (
        <PaymentModal
          open={payOpen}
          onClose={() => setPayOpen(false)}
          bill={detail.bill}
          onSubmit={submitPayment}
          title={`Payment · ${detail.session?.tableCode ?? 'table'}`}
        />
      )}

      <ConfirmDialog
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        onConfirm={() => closeSession(false)}
        title="Close this table?"
        description="The session will be closed, the bill marked settled and the table sent to housekeeping."
        confirmLabel="Close table"
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
            <strong className="text-rose-200">{money(balance)}</strong> is still unpaid. The bill will be voided and the table released
            to housekeeping. This action is logged against your name.
          </>
        }
        confirmLabel="Close anyway"
        loading={busy}
      />

      <Modal
        open={receiptOpen}
        onClose={() => setReceiptOpen(false)}
        title="Guest receipt"
        subtitle="Print or save as PDF from the browser dialog."
        size="sm"
        overlayClassName="guest-receipt-overlay"
        className="guest-receipt-modal"
        footer={
          <>
            <Button variant="ghost" onClick={() => setReceiptOpen(false)}>Close</Button>
            <Button icon={<Printer size={15} />} onClick={() => window.print()}>Print receipt</Button>
          </>
        }
      >
        {detail && receiptPrintedAt && (
          <Receipt bill={detail.bill} session={detail.session} cashierName={user?.name ?? ''} printedAt={receiptPrintedAt} />
        )}
      </Modal>
    </div>
  );
}
