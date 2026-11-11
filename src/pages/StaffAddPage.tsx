import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ChefHat,
  ClipboardList,
  KeyRound,
  Mail,
  ReceiptText,
  ShieldCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { api } from '../lib/api';
import type { Role } from '../lib/types';
import { roleLabels } from '../lib/format';
import { useAuth } from '../lib/auth';
import { useToast } from '../components/Toast';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  buttonClass,
  cn,
} from '../components/ui';

const roleOptions: Array<{ id: Exclude<Role, 'super_admin'>; icon: typeof Users; blurb: string; access: string }> = [
  { id: 'manager', icon: ShieldCheck, blurb: 'Runs the floor and the books', access: 'All operations, reports, menu & team' },
  { id: 'receptionist', icon: Users, blurb: 'Welcomes and seats guests', access: 'Tables, floor plan, reservations' },
  { id: 'waiter', icon: ClipboardList, blurb: 'Takes and serves orders', access: 'Live orders, waiter station, tables' },
  { id: 'cashier', icon: ReceiptText, blurb: 'Closes bills and takes payment', access: 'Bills, payments, table sessions' },
  { id: 'chef', icon: ChefHat, blurb: 'Runs the kitchen pass', access: 'Kitchen display, live orders' },
  { id: 'auditor', icon: ShieldCheck, blurb: 'Reviews without changing', access: 'Reports, sessions, floor plan (read only)' },
];

export function StaffAddPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const [form, setForm] = useState({
    name: '',
    email: '',
    role: 'waiter' as Exclude<Role, 'super_admin'>,
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const options = useMemo(
    () => roleOptions.filter((option) => option.id !== 'manager' || user?.role === 'super_admin'),
    [user],
  );

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    setError('');
    if (form.name.trim().length < 2) {
      setError('Enter the team member’s full name.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) {
      setError('Enter a valid email address for sign-in.');
      return;
    }
    setSaving(true);
    try {
      await api('/restaurant/staff', {
        method: 'POST',
        body: {
          name: form.name.trim(),
          email: form.email.trim(),
          role: form.role,
        },
      });
      toast.success('Invitation sent', `${form.name.trim()} was invited as ${roleLabels[form.role].toLowerCase()}.`);
      navigate('/admin/restaurant/staff');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the account');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="People"
        title="Add staff"
        description="Invite a new team member by email. Their selected role decides which parts of the restaurant they can open."
        actions={
          <Link to="/admin/restaurant/staff" className={buttonClass('ghost', 'md')}>
            <ArrowLeft size={15} /> Back to team
          </Link>
        }
      />

      {error && (
        <div className="rounded-xl border border-rose-300/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.85fr)]">
        <div className="space-y-5">
          <Card className="space-y-4 p-5 sm:p-6">
            <div>
              <p className="eyebrow">01 · Identity</p>
              <h2 className="mt-1 font-display text-xl text-cream-50">Who is joining the team?</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name" required>
                <Input
                  value={form.name}
                  onChange={(event) => update('name', event.target.value)}
                  placeholder="e.g. Selam Bekele"
                  maxLength={80}
                />
              </Field>
              <Field label="Work email" required hint="Used to sign in">
                <div className="relative">
                  <Mail size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-cream-100/35" />
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(event) => update('email', event.target.value)}
                    placeholder="selam@nilehotel.com"
                    className="pl-9"
                    autoComplete="off"
                  />
                </div>
              </Field>
            </div>
          </Card>

          <Card className="space-y-4 p-5 sm:p-6">
            <div>
              <p className="eyebrow">02 · Role & access</p>
              <h2 className="mt-1 font-display text-xl text-cream-50">Choose what they can open</h2>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {options.map((option) => {
                const selected = form.role === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => update('role', option.id)}
                    className={cn(
                      'flex items-start gap-3 rounded-xl border p-3.5 text-left transition',
                      selected
                        ? 'border-gold-400/60 bg-gold-400/[0.09] shadow-[0_10px_28px_-22px_rgba(120,91,40,0.6)]'
                        : 'border-ink-950/10 bg-white hover:border-gold-400/40 hover:bg-gold-400/[0.04]',
                    )}
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border',
                        selected ? 'border-gold-400/50 bg-gold-400/15 text-gold-200' : 'border-ink-950/10 bg-ink-950/[0.03] text-cream-100/45',
                      )}
                    >
                      <option.icon size={14} />
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="text-[13px] font-medium text-cream-50">{roleLabels[option.id]}</span>
                        {selected && (
                          <Badge tone="gold" className="px-1.5 py-0.5 text-[8px]">Selected</Badge>
                        )}
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-relaxed text-cream-100/45">{option.blurb}</span>
                      <span className="mt-1 block text-[9.5px] uppercase tracking-[0.1em] text-cream-100/30">{option.access}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>

        </div>

        <div className="space-y-5 xl:sticky xl:top-24 xl:self-start">
          <Card className="p-5">
            <p className="text-[10px] uppercase tracking-[0.18em] text-cream-100/35">Account preview</p>
            <div className="mt-4 flex flex-col items-center gap-3 text-center">
              <Avatar name={form.name.trim() || 'New Staff'} size="lg" className="h-16 w-16 text-lg" />
              <div className="min-w-0">
                <p className="truncate font-display text-xl text-cream-50">{form.name.trim() || 'New team member'}</p>
                <p className="mt-0.5 truncate text-xs text-cream-100/40">{form.email.trim() || 'email@nilehotel.com'}</p>
              </div>
              <Badge tone="gold">{roleLabels[form.role]}</Badge>
            </div>
            <div className="mt-4 space-y-2 rounded-xl border border-ink-950/[0.07] bg-ink-950/[0.02] p-3 text-[11px] leading-relaxed text-cream-100/50">
              <p className="flex items-start gap-2">
                <ShieldCheck size={12} className="mt-0.5 shrink-0 text-gold-300" />
                Access follows the role — {roleLabels[form.role].toLowerCase()} permissions apply instantly.
              </p>
              <p className="flex items-start gap-2">
                <KeyRound size={12} className="mt-0.5 shrink-0 text-gold-300" />
                Supabase will email them a secure invitation to set their own password.
              </p>
            </div>
            <Button className="mt-4 w-full" size="lg" icon={<UserPlus size={15} />} loading={saving} onClick={submit}>
              Send invitation
            </Button>
            <Link to="/admin/restaurant/staff" className={cn(buttonClass('ghost', 'md'), 'mt-2 w-full')}>
              Cancel
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
