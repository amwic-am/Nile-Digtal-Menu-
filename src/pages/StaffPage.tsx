import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BadgeCheck,
  BriefcaseBusiness,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { api } from '../lib/api';
import type { Role } from '../lib/types';
import { formatDate, roleLabels } from '../lib/format';
import { useRealtime } from '../lib/socket';
import { useToast } from '../components/Toast';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  PageLoader,
  StatCard,
  buttonClass,
  cn,
} from '../components/ui';

interface StaffMember {
  id: number;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt?: string;
}

const roleTone: Record<Role, 'gold' | 'info' | 'success' | 'warning' | 'neutral' | 'danger'> = {
  super_admin: 'gold',
  manager: 'info',
  receptionist: 'info',
  waiter: 'success',
  chef: 'warning',
  cashier: 'neutral',
  auditor: 'danger',
};

export function StaffPage() {
  const toast = useToast();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [role, setRole] = useState<Role | 'all'>('all');

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setRefreshing(true);
      try {
        const res = await api<{ staff: StaffMember[] }>('/restaurant/staff');
        setStaff(res.staff);
      } catch (err) {
        toast.error('Could not load the team', err instanceof Error ? err.message : 'Try again');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    load(true);
  }, [load]);

  useRealtime('staff:updated', () => load(true));

  const roles = useMemo(() => [...new Set(staff.map((member) => member.role))], [staff]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return staff
      .filter((member) => (role === 'all' ? true : member.role === role))
      .filter((member) =>
        term ? member.name.toLowerCase().includes(term) || member.email.toLowerCase().includes(term) : true,
      );
  }, [staff, query, role]);

  if (loading) return <PageLoader label="Gathering the team" />;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="People"
        title="The Nile team"
        description="Everyone who can sign in to the restaurant — servers, kitchen, cashier and management."
        actions={
          <>
            <Button
              variant="secondary"
              icon={<RefreshCw size={15} className={cn(refreshing && 'animate-spin')} />}
              onClick={() => load()}
            >
              Refresh
            </Button>
            <Link to="/admin/restaurant/staff/new" className={buttonClass('primary', 'md')}>
              <Plus size={15} /> Add staff
            </Link>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Team members" value={staff.length} icon={<UsersRound size={17} />} hint={`${roles.length} roles covered`} />
        <StatCard
          label="Active accounts"
          value={staff.filter((member) => member.isActive).length}
          icon={<BadgeCheck size={17} />}
          accent="text-emerald-300"
          hint="Can sign in now"
        />
        <StatCard
          label="Management"
          value={staff.filter((member) => member.role === 'super_admin' || member.role === 'manager').length}
          icon={<ShieldCheck size={17} />}
          hint="Super admin & managers"
        />
      </div>

      <Card className="p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-sm">
            <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-cream-100/35" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name or email…"
              className="pl-9"
            />
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setRole('all')}
              className={cn(
                'shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition',
                role === 'all'
                  ? 'border-gold-400 bg-gold-400 text-night'
                  : 'border-ink-950/10 bg-white text-cream-100/65 hover:border-gold-400/40',
              )}
            >
              Everyone
            </button>
            {roles.map((entry) => (
              <button
                key={entry}
                type="button"
                onClick={() => setRole(entry)}
                className={cn(
                  'shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition',
                  role === entry
                    ? 'border-gold-400 bg-gold-400 text-night'
                    : 'border-ink-950/10 bg-white text-cream-100/65 hover:border-gold-400/40',
                )}
              >
                {roleLabels[entry]}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<UserRound size={22} />}
          title={query ? 'No team member matches that search' : 'No staff in this role yet'}
          description="Add a staff account so they can sign in to the restaurant workspace."
          action={
            <Link to="/admin/restaurant/staff/new" className={buttonClass('primary', 'sm')}>
              <Plus size={14} /> Add staff
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((member) => (
            <article key={member.id} className="panel p-5 transition hover:-translate-y-0.5 hover:shadow-[0_22px_48px_-30px_rgba(90,68,32,0.5)]">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={member.name} size="lg" />
                  <div className="min-w-0">
                    <h3 className="truncate font-display text-lg leading-tight text-cream-50">{member.name}</h3>
                    <p className="mt-0.5 truncate text-[11px] text-cream-100/40">{member.email}</p>
                  </div>
                </div>
                <Badge tone={roleTone[member.role]}>{roleLabels[member.role]}</Badge>
              </div>

              <div className="mt-4 space-y-2 border-t border-ink-950/[0.07] pt-3 text-[11.5px] text-cream-100/55">
                <p className="flex items-center gap-2">
                  <BriefcaseBusiness size={12} className="shrink-0 text-gold-300" />
                  {member.createdAt ? `Joined ${formatDate(member.createdAt)}` : 'Active staff account'}
                </p>
                <p className="flex items-center gap-2">
                  <ShieldCheck size={12} className="shrink-0 text-gold-300" />
                  <span className="truncate">{roleLabels[member.role]} permissions</span>
                </p>
              </div>

              <div className="mt-4 flex items-center justify-between gap-2 rounded-xl border border-ink-950/[0.07] bg-ink-950/[0.02] px-3 py-2">
                <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-cream-100/45">
                  <span className={cn('h-1.5 w-1.5 rounded-full', member.isActive ? 'bg-emerald-400' : 'bg-white/30')} />
                  {member.isActive ? 'Active' : 'Disabled'}
                </span>
                <span className="text-[10px] uppercase tracking-[0.12em] text-cream-100/30">
                  Staff ID #{member.id}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-ink-950/12 px-5 py-4">
        <p className="text-xs text-cream-100/45">
          {filtered.length} of {staff.length} accounts · permissions follow each role
        </p>
        <Link
          to="/admin/restaurant/staff/new"
          className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.14em] text-gold-300 transition hover:text-gold-200"
        >
          Invite a team member <Plus size={12} />
        </Link>
      </div>
    </div>
  );
}
