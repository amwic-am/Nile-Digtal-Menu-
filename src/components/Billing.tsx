import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Banknote, BedDouble, CreditCard, Smartphone } from 'lucide-react';
import type { Bill, PaymentMethod } from '../lib/types';
import { money, paymentMethods } from '../lib/format';
import { Badge, Button, Field, Input, Modal, cn } from './ui';

export function BillBreakdown({
  bill,
  currency = 'ETB',
  className,
}: {
  bill: Bill;
  currency?: string;
  className?: string;
}) {
  const paidTone = bill.balance <= 0.009 ? 'success' : bill.paid > 0 ? 'warning' : 'danger';
  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="micro">Consolidated table bill</p>
          <p className="mt-0.5 text-sm text-cream-50">{bill.orderCount} order{bill.orderCount === 1 ? '' : 's'} · session #{bill.sessionId}</p>
        </div>
        <Badge tone={paidTone}>{bill.balance <= 0.009 ? 'Settled' : bill.paid > 0 ? 'Part paid' : 'Open'}</Badge>
      </div>

      <div className="overflow-hidden rounded-xl border border-ink-950/[0.07]">
        <div className="grid grid-cols-[1fr_44px_90px] gap-2 bg-ink-950/[0.035] px-3 py-2 text-[9px] uppercase tracking-[0.16em] text-cream-100/35">
          <span>Item</span>
          <span className="text-center">Qty</span>
          <span className="text-right">Amount</span>
        </div>
        <div className="divide-y divide-ink-950/[0.05]">
          {bill.items.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-cream-100/35">No billable items yet.</p>
          ) : (
            bill.items.map((item) => (
              <div key={item.name} className="grid grid-cols-[1fr_44px_90px] items-center gap-2 px-3 py-2.5 text-[12.5px]">
                <span className="min-w-0">
                  <span className="block truncate text-cream-100/80">{item.name}</span>
                  <span className="text-[10px] text-cream-100/30">{money(item.unitPrice, currency)} each</span>
                </span>
                <span className="text-center text-cream-100/55">{item.qty}</span>
                <span className="text-right font-medium text-cream-50">{money(item.total, currency)}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="space-y-1.5 text-[12.5px]">
        <div className="flex justify-between text-cream-100/50">
          <span>Subtotal</span>
          <span>{money(bill.subtotal, currency)}</span>
        </div>
        <div className="flex justify-between text-cream-100/50">
          <span>Service charge</span>
          <span>{money(bill.serviceCharge, currency)}</span>
        </div>
        {bill.tax > 0 && (
          <div className="flex justify-between text-cream-100/50">
            <span>Tax</span>
            <span>{money(bill.tax, currency)}</span>
          </div>
        )}
        {bill.discount > 0 && (
          <div className="flex justify-between text-emerald-200/80">
            <span>Discount</span>
            <span>-{money(bill.discount, currency)}</span>
          </div>
        )}
        <div className="my-2 hairline" />
        <div className="flex items-end justify-between">
          <span className="text-[10px] uppercase tracking-[0.18em] text-cream-100/35">Total</span>
          <span className="font-display text-2xl text-cream-50">{money(bill.total, currency)}</span>
        </div>
        {bill.paid > 0 && (
          <div className="flex justify-between text-emerald-200/80">
            <span>Paid</span>
            <span>{money(bill.paid, currency)}</span>
          </div>
        )}
        <div className="flex justify-between font-medium">
          <span className={bill.balance > 0.009 ? 'text-rose-200/90' : 'text-emerald-200/90'}>
            {bill.balance > 0.009 ? 'Balance due' : 'Balance'}
          </span>
          <span className={bill.balance > 0.009 ? 'text-rose-100' : 'text-emerald-100'}>
            {money(Math.max(0, bill.balance), currency)}
          </span>
        </div>
      </div>

      {bill.payments.length > 0 && (
        <div className="rounded-xl border border-ink-950/[0.06] bg-ink-950/[0.02] p-3">
          <p className="micro mb-2">Payments received</p>
          <div className="space-y-1.5">
            {bill.payments.map((payment) => (
              <div key={payment.id} className="flex items-center justify-between text-[11.5px]">
                <span className="capitalize text-cream-100/55">
                  {payment.method.replace('_', ' ')}
                  {payment.reference ? ` · ${payment.reference}` : ''}
                </span>
                <span className="text-emerald-200/90">{money(payment.amount, currency)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const methodIcons: Record<PaymentMethod, ReactNode> = {
  cash: <Banknote size={15} />,
  card: <CreditCard size={15} />,
  telebirr: <Smartphone size={15} />,
  room_charge: <BedDouble size={15} />,
};

export function PaymentModal({
  open,
  onClose,
  bill,
  currency = 'ETB',
  title = 'Record payment',
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  bill: Bill;
  currency?: string;
  title?: string;
  onSubmit: (payload: { amount: number; method: PaymentMethod; reference: string | null }) => Promise<void>;
}) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAmount(bill.balance > 0 ? bill.balance.toFixed(2) : '');
    setMethod('cash');
    setReference('');
    setError('');
    setLoading(false);
  }, [open, bill.balance]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter a payment amount greater than zero');
      return;
    }
    if (value > bill.balance + 0.009) {
      setError(`Payment cannot exceed the balance of ${money(bill.balance, currency)}`);
      return;
    }
    setLoading(true);
    setError('');
    try {
      await onSubmit({ amount: Math.round(value * 100) / 100, method, reference: reference.trim() || null });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment could not be recorded');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      subtitle={`Balance due ${money(Math.max(0, bill.balance), currency)} · ${bill.orderCount} order${bill.orderCount === 1 ? '' : 's'}`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={loading} type="submit" form="payment-form">
            Record payment
          </Button>
        </>
      }
    >
      <form id="payment-form" onSubmit={submit} className="space-y-4">
        <div className="rounded-xl border border-gold-400/20 bg-gold-400/[0.06] px-4 py-3">
          <p className="micro">Amount due</p>
          <p className="mt-1 font-display text-2xl text-cream-50">{money(Math.max(0, bill.balance), currency)}</p>
        </div>

        <Field label="Amount" required>
          <div className="flex gap-2">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
              autoFocus
            />
            <Button variant="secondary" size="md" className="shrink-0" onClick={() => setAmount(bill.balance.toFixed(2))}>
              Full
            </Button>
          </div>
        </Field>

        <div>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-cream-100/50">Method</p>
          <div className="grid grid-cols-2 gap-2">
            {paymentMethods.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setMethod(option.id)}
                className={cn(
                  'flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-xs transition',
                  method === option.id
                    ? 'border-gold-400/50 bg-gold-400/10 text-cream-50'
                    : 'border-ink-950/10 bg-ink-950/[0.025] text-cream-100/55 hover:border-ink-950/20',
                )}
              >
                <span className={method === option.id ? 'text-gold-300' : 'text-cream-100/35'}>{methodIcons[option.id]}</span>
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <Field label="Reference" hint="optional">
          <Input
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            placeholder="Receipt, transaction or room number"
          />
        </Field>

        {error && (
          <p className="rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">{error}</p>
        )}
      </form>
    </Modal>
  );
}
