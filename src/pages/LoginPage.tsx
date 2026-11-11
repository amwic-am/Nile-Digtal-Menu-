import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ArrowRight, KeyRound, Mail, QrCode, ShieldCheck, Sparkles } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { Button } from '../components/ui';
import type { Role } from '../lib/types';

function roleHome(role: Role) {
  if (role === 'chef') return '/admin/restaurant/kitchen';
  if (role === 'waiter') return '/admin/restaurant/waiter';
  if (role === 'cashier') return '/admin/restaurant/cashier';
  if (role === 'receptionist') return '/admin/restaurant/reservations';
  return '/admin/restaurant/dashboard';
}

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to={roleHome(user.role)} replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const next = await login(email.trim(), password);
      navigate(roleHome(next.role), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-ink-950">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(1100px_600px_at_100%_0%,rgba(215,180,108,0.1),transparent_58%),radial-gradient(800px_500px_at_0%_100%,rgba(180,85,46,0.08),transparent_55%)]" />

      <div className="relative mx-auto grid min-h-screen w-full max-w-[1560px] lg:grid-cols-[1.08fr_0.92fr]">
        <section className="relative hidden overflow-hidden border-r border-white/10 lg:block">
          <img
            src="/dishes/nile-platter.png"
            alt="Ethiopian platter at Nile Restaurant"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/15" />
          <div className="grain absolute inset-0" />

          <div className="relative flex h-full flex-col justify-between p-10 xl:p-14">
            <Link to="/login" className="inline-flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-full border border-white/25 bg-white/10 backdrop-blur">
                <span className="font-display text-2xl text-[#f0e2bf]">N</span>
              </span>
              <span>
                <span className="block font-display text-xl leading-none tracking-[0.18em] text-white">NILE</span>
                <span className="mt-1 block text-[8px] uppercase tracking-[0.34em] text-[#e6cd97]/80">Hotel Restaurant</span>
              </span>
            </Link>

            <div className="max-w-xl">
              <p className="eyebrow text-white/60">Addis Ababa · Four-star dining</p>
              <h1 className="mt-4 font-display text-5xl leading-[1.02] text-white xl:text-6xl">
                Every table,
                <br />
                its own story.
              </h1>
              <p className="mt-5 max-w-md text-sm leading-relaxed text-white/65">
                One permanent QR per table, live orders to the kitchen, consolidated bills and a guest
                experience that feels effortless from the first scan.
              </p>

              <div className="mt-8 flex flex-wrap gap-2">
                {[
                  { icon: QrCode, label: 'Unique table QR' },
                  { icon: Sparkles, label: 'Digital menu + AR' },
                  { icon: ShieldCheck, label: 'Audited billing' },
                ].map((item) => (
                  <span
                    key={item.label}
                    className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/30 px-3 py-1.5 text-[10.5px] text-white/80 backdrop-blur"
                  >
                    <item.icon size={12} className="text-[#e6cd97]" />
                    {item.label}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex items-end justify-between gap-6">
              <div className="max-w-sm">
                <p className="font-display text-lg leading-snug text-white/90">
                  “The QR is the table. The order finds the kitchen by itself.”
                </p>
                <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-white/45">Nile service standard</p>
              </div>
              <div className="flex gap-2">
                <img src="/dishes/coffee-ceremony.png" alt="Coffee ceremony" className="h-20 w-20 rounded-xl border border-white/20 object-cover" />
                <img src="/dishes/special-tibs.png" alt="Special tibs" className="h-20 w-20 rounded-xl border border-white/20 object-cover" />
              </div>
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center px-5 py-10 sm:px-10">
          <div className="w-full max-w-[420px]">
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <span className="flex h-11 w-11 items-center justify-center rounded-full border border-gold-400/40 bg-gold-400/10">
                <span className="font-display text-xl text-gold-200">N</span>
              </span>
              <div>
                <p className="font-display text-lg tracking-[0.16em] text-cream-50">NILE</p>
                <p className="text-[8px] uppercase tracking-[0.28em] text-gold-300/70">Restaurant OS</p>
              </div>
            </div>

            <div>
              <p className="eyebrow">Staff access</p>
              <h2 className="mt-2 font-display text-[2rem] leading-tight text-cream-50">Welcome back</h2>
              <p className="mt-1.5 text-sm text-cream-100/45">
                Sign in to manage tables, orders and payments.
              </p>
            </div>

            <form onSubmit={submit} className="mt-7 space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.16em] text-cream-100/45">Email</span>
                <span className="relative block">
                  <Mail size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cream-100/30" />
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="field pl-9"
                    placeholder="you@nilehotel.com"
                    autoComplete="email"
                    required
                  />
                </span>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.16em] text-cream-100/45">Password</span>
                <span className="relative block">
                  <KeyRound size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cream-100/30" />
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="field pl-9"
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                  />
                </span>
              </label>

              {error && (
                <p className="rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">{error}</p>
              )}

              <Button type="submit" size="lg" loading={loading} className="w-full" icon={<ArrowRight size={15} />}>
                Sign in
              </Button>
            </form>

            <div className="mt-7 flex items-center justify-between gap-3 rounded-xl border border-ink-950/[0.07] bg-ink-950/[0.025] px-4 py-3">
              <div>
                <p className="text-[11px] font-medium text-cream-100/70">Exploring as a guest?</p>
                <p className="mt-0.5 text-[10px] text-cream-100/35">Open the table QR menu and try AR dish preview.</p>
              </div>
              <Link
                to="/demo"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-gold-400/30 px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] text-gold-200 transition hover:bg-gold-400/10"
              >
                Open demo
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
