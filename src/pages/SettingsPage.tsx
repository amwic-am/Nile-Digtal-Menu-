import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BadgeCheck,
  Building2,
  ExternalLink,
  KeyRound,
  Languages,
  Percent,
  RefreshCw,
  Save,
  ShieldCheck,
  Utensils,
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
  PageLoader,
  Select,
  Toggle,
  cn,
} from '../components/ui';

type RestaurantSettings = {
  id: number;
  name: string;
  slug: string;
  currency: string;
  address: string;
  phone: string;
  serviceChargePct: number;
  taxPct: number;
  autoAcceptOrders: boolean;
  autoOpenSessions: boolean;
  menuLanguages: string;
};

type StaffRow = { id: number; name: string; email: string; role: Role; isActive: boolean };

export function SettingsPage() {
  const toast = useToast();
  const { user } = useAuth();
  const [restaurant, setRestaurant] = useState<RestaurantSettings | null>(null);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    address: '',
    phone: '',
    serviceChargePct: '10',
    taxPct: '0',
    autoAcceptOrders: false,
    autoOpenSessions: false,
    menuLanguages: 'en,am',
  });

  const load = async (quiet = false) => {
    try {
      const res = await api<{ restaurant: RestaurantSettings; staff: StaffRow[] }>('/restaurant/settings');
      setRestaurant(res.restaurant);
      setStaff(res.staff);
      setForm({
        name: res.restaurant.name,
        address: res.restaurant.address ?? '',
        phone: res.restaurant.phone ?? '',
        serviceChargePct: String(res.restaurant.serviceChargePct),
        taxPct: String(res.restaurant.taxPct),
        autoAcceptOrders: res.restaurant.autoAcceptOrders,
        autoOpenSessions: res.restaurant.autoOpenSessions,
        menuLanguages: res.restaurant.menuLanguages ?? 'en,am',
      });
    } catch (err) {
      if (!quiet) toast.error('Could not load settings', err instanceof Error ? err.message : 'Try again');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const res = await api<{ restaurant: RestaurantSettings }>('/restaurant/settings', {
        method: 'PATCH',
        body: {
          name: form.name.trim(),
          address: form.address.trim(),
          phone: form.phone.trim(),
          serviceChargePct: Number(form.serviceChargePct),
          taxPct: Number(form.taxPct),
          autoAcceptOrders: form.autoAcceptOrders,
          autoOpenSessions: form.autoOpenSessions,
        },
      });
      setRestaurant(res.restaurant);
      toast.success('Settings saved', 'Menus, QR pages and bills now use the new values.');
    } catch (err) {
      toast.error('Could not save settings', err instanceof Error ? err.message : 'Try again');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !restaurant) return <PageLoader />;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Restaurant"
        title="Settings"
        description="Service charges, order automation and the restaurant identity shown to guests."
        actions={
          <>
            <Button variant="secondary" icon={<RefreshCw size={14} />} onClick={() => load()}>Reload</Button>
            <Button icon={<Save size={15} />} loading={saving} onClick={save}>Save changes</Button>
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <Card className="p-5">
            <div className="flex items-center gap-2">
              <Building2 size={16} className="text-gold-300" />
              <p className="font-display text-lg text-cream-50">Identity</p>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Restaurant name" required className="sm:col-span-2">
                <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
              </Field>
              <Field label="Address" className="sm:col-span-2">
                <Input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
              </Field>
              <Field label="Telephone">
                <Input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
              </Field>
              <Field label="Public menu slug" hint="used in links">
                <Input value={restaurant.slug} readOnly disabled />
              </Field>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2">
              <Percent size={16} className="text-gold-300" />
              <p className="font-display text-lg text-cream-50">Charges & tax</p>
            </div>
            <p className="mt-1 text-[11px] text-cream-100/40">
              Applied to every new order. Existing bills keep the values they were created with.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Service charge %" hint="0 – 30">
                <Input
                  type="number"
                  min={0}
                  max={30}
                  step="0.5"
                  value={form.serviceChargePct}
                  onChange={(event) => setForm({ ...form, serviceChargePct: event.target.value })}
                />
              </Field>
              <Field label="Tax %" hint="0 – 30">
                <Input
                  type="number"
                  min={0}
                  max={30}
                  step="0.5"
                  value={form.taxPct}
                  onChange={(event) => setForm({ ...form, taxPct: event.target.value })}
                />
              </Field>
            </div>
            <div className="mt-4 rounded-xl border border-ink-950/[0.07] bg-ink-950/[0.02] px-4 py-3 text-[11px] leading-relaxed text-cream-100/45">
              On a 1,000 ETB order guests pay <strong className="text-cream-50">{Math.round(1000 * (1 + Number(form.serviceChargePct || 0) / 100 + Number(form.taxPct || 0) / 100))} ETB</strong> including
              service and tax. Prices shown on the menu stay pre-service so guests can see the breakdown.
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} className="text-gold-300" />
              <p className="font-display text-lg text-cream-50">Order flow</p>
            </div>
            <div className="mt-4 space-y-4">
              <div className="rounded-xl border border-ink-950/[0.07] bg-ink-950/[0.02] p-4">
                <Toggle
                  checked={form.autoAcceptOrders}
                  onChange={(value) => setForm({ ...form, autoAcceptOrders: value })}
                  label="Auto-accept QR orders"
                  description="Guest orders skip the New column and land directly in the kitchen as Accepted."
                />
              </div>
              <div className="rounded-xl border border-ink-950/[0.07] bg-ink-950/[0.02] p-4">
                <Toggle
                  checked={form.autoOpenSessions}
                  onChange={(value) => setForm({ ...form, autoOpenSessions: value })}
                  label="Let guests open a table session"
                  description="Scanning a free table QR opens the session automatically. Turn this off to require a waiter to seat guests."
                />
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="p-5">
            <div className="flex items-center gap-2">
              <Languages size={16} className="text-gold-300" />
              <p className="font-display text-lg text-cream-50">Languages</p>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-cream-100/40">
              The guest menu ships in English and Amharic. Dish names are translated in the menu seed; guests toggle languages on the scan page.
            </p>
            <div className="mt-4 space-y-2">
              {[
                { code: 'en', label: 'English', note: 'Default' },
                { code: 'am', label: 'አማርኛ · Amharic', note: 'Included' },
              ].map((language) => (
                <div key={language.code} className="flex items-center justify-between gap-2 rounded-lg border border-ink-950/[0.06] px-3 py-2.5">
                  <span className="flex items-center gap-2 text-[12px] text-cream-100/70">
                    <BadgeCheck size={13} className="text-emerald-300" /> {language.label}
                  </span>
                  <Badge tone="gold">{language.note}</Badge>
                </div>
              ))}
            </div>
            <a
              href="/demo"
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-full border border-gold-400/30 text-[11px] text-gold-200 transition hover:bg-gold-400/10"
            >
              <Utensils size={13} /> Open guest menu demo <ExternalLink size={11} />
            </a>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <KeyRound size={16} className="text-gold-300" />
                <p className="font-display text-lg text-cream-50">Team access</p>
              </div>
              <Badge tone="neutral">{staff.length} staff</Badge>
            </div>
            <p className="mt-1 text-[11px] text-cream-100/40">
              Roles are enforced on the server.{' '}
              <Link to="/admin/restaurant/staff" className="text-gold-300 underline-offset-2 hover:underline">
                Manage staff accounts
              </Link>{' '}
              to add new team members.
            </p>
            <div className="mt-4 space-y-1.5">
              {staff.map((member) => (
                <div
                  key={member.id}
                  className={cn(
                    'flex items-center gap-3 rounded-lg border px-3 py-2',
                    member.id === user?.id ? 'border-gold-400/25 bg-gold-400/[0.06]' : 'border-ink-950/[0.06]',
                  )}
                >
                  <Avatar name={member.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] text-cream-50">
                      {member.name}
                      {member.id === user?.id && <span className="ml-1.5 text-[9px] uppercase tracking-[0.12em] text-gold-300">You</span>}
                    </p>
                    <p className="truncate text-[9.5px] text-cream-100/30">{member.email}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[9.5px] text-cream-100/45">{roleLabels[member.role]}</p>
                    <span className={cn('text-[9px]', member.isActive ? 'text-emerald-300/80' : 'text-cream-100/25')}>
                      {member.isActive ? 'Active' : 'Disabled'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <p className="micro">System</p>
            <div className="mt-3 space-y-2 text-[11px] text-cream-100/45">
              <div className="flex items-center justify-between"><span>API</span><span className="text-emerald-200">Online</span></div>
              <div className="flex items-center justify-between"><span>Realtime</span><span className="text-emerald-200">Socket.IO</span></div>
              <div className="flex items-center justify-between"><span>Database</span><span>PostgreSQL · PGlite</span></div>
              <div className="flex items-center justify-between"><span>Currency</span><span>{restaurant.currency}</span></div>
              <div className="flex items-center justify-between"><span>Your role</span><span>{user ? roleLabels[user.role] : '—'}</span></div>
            </div>
            <div className="mt-4">
              <Field label="Default currency">
                <Select value={restaurant.currency} disabled>
                  <option>{restaurant.currency} · Ethiopian Birr</option>
                </Select>
              </Field>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
