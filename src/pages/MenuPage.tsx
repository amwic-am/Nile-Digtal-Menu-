import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  ChefHat,
  Flame,
  ImageOff,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Tag,
  UtensilsCrossed,
} from 'lucide-react';
import { api } from '../lib/api';
import { money } from '../lib/format';
import { useRealtime } from '../lib/socket';
import { useToast } from '../components/Toast';
import {
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

export interface AdminMenuItem {
  id: number;
  categoryId: number;
  name: string;
  nameAm: string | null;
  description: string | null;
  price: number;
  image: string | null;
  available: boolean;
  isSignature: boolean;
  arEnabled: boolean;
  spiceLevel: number;
  prepMinutes: number;
  tags: string | null;
}

interface AdminCategory {
  id: number;
  name: string;
  nameAm: string | null;
  description: string | null;
  items: AdminMenuItem[];
}

interface MenuPayload {
  categories: AdminCategory[];
  stats: { items: number; available: number; avgPrice: number; categories: number };
}

export function MenuPage() {
  const toast = useToast();
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [stats, setStats] = useState<MenuPayload['stats']>({ items: 0, available: 0, avgPrice: 0, categories: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState<number | 'all'>('all');
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setRefreshing(true);
      try {
        const res = await api<MenuPayload>('/restaurant/menu');
        setCategories(res.categories);
        setStats(res.stats);
      } catch (err) {
        toast.error('Could not load the menu', err instanceof Error ? err.message : 'Try again');
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

  useRealtime('menu:updated', () => load(true));

  const allItems = useMemo(() => categories.flatMap((c) => c.items), [categories]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return allItems
      .filter((item) => (categoryId === 'all' ? true : item.categoryId === categoryId))
      .filter((item) =>
        term
          ? item.name.toLowerCase().includes(term) ||
            (item.nameAm ?? '').toLowerCase().includes(term) ||
            (item.tags ?? '').toLowerCase().includes(term)
          : true,
      );
  }, [allItems, categoryId, query]);

  const categoryName = (id: number) => categories.find((c) => c.id === id)?.name ?? 'Menu';

  const toggleAvailability = async (item: AdminMenuItem) => {
    setBusyId(item.id);
    try {
      await api(`/restaurant/menu/items/${item.id}`, {
        method: 'PATCH',
        body: { available: !item.available },
      });
      setCategories((current) =>
        current.map((category) => ({
          ...category,
          items: category.items.map((entry) =>
            entry.id === item.id ? { ...entry, available: !entry.available } : entry,
          ),
        })),
      );
      toast.success(
        item.available ? `${item.name} marked as sold out` : `${item.name} is back on the menu`,
      );
      load(true);
    } catch (err) {
      toast.error('Could not update availability', err instanceof Error ? err.message : 'Try again');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <PageLoader label="Plating the menu" />;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Menu & products"
        title="The Nile dish library"
        description="Every dish your guests can scan, see and order — with photography, pricing and live availability."
        actions={
          <>
            <Button
              variant="secondary"
              icon={<RefreshCw size={15} className={cn(refreshing && 'animate-spin')} />}
              onClick={() => load()}
            >
              Refresh
            </Button>
            <Link to="/admin/restaurant/menu/new" className={buttonClass('primary', 'md')}>
              <Plus size={15} /> Add product
            </Link>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Dishes on the menu" value={stats.items} icon={<UtensilsCrossed size={17} />} hint={`${stats.categories} categories`} />
        <StatCard
          label="Available now"
          value={stats.available}
          icon={<Sparkles size={17} />}
          accent="text-emerald-300"
          hint={`${Math.max(0, stats.items - stats.available)} sold out`}
        />
        <StatCard label="Average plate" value={money(stats.avgPrice)} icon={<Tag size={17} />} hint="Across all categories" />
        <StatCard
          label="AR ready"
          value={allItems.filter((item) => item.arEnabled).length}
          icon={<ChefHat size={17} />}
          hint="Dishes with table preview"
        />
      </div>

      <Card className="p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-sm">
            <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-cream-100/35" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search dishes, Amharic names or tags…"
              className="pl-9"
            />
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setCategoryId('all')}
              className={cn(
                'shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition',
                categoryId === 'all'
                  ? 'border-gold-400 bg-gold-400 text-night'
                  : 'border-ink-950/10 bg-white text-cream-100/65 hover:border-gold-400/40',
              )}
            >
              All dishes
              <span className="ml-1.5 text-[10px] opacity-60">{allItems.length}</span>
            </button>
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => setCategoryId(category.id)}
                className={cn(
                  'shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition',
                  categoryId === category.id
                    ? 'border-gold-400 bg-gold-400 text-night'
                    : 'border-ink-950/10 bg-white text-cream-100/65 hover:border-gold-400/40',
                )}
              >
                {category.name}
                <span className="ml-1.5 text-[10px] opacity-60">{category.items.length}</span>
              </button>
            ))}
          </div>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<UtensilsCrossed size={22} />}
          title={query ? 'No dish matches that search' : 'No dishes in this category yet'}
          description={query ? 'Try another name, or clear the search to see the whole menu.' : 'Add your first product to start building the menu.'}
          action={
            <Link to="/admin/restaurant/menu/new" className={buttonClass('primary', 'sm')}>
              <Plus size={14} /> Add product
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filtered.map((item) => (
            <article
              key={item.id}
              className={cn(
                'group panel overflow-hidden p-0 transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_48px_-30px_rgba(90,68,32,0.5)]',
                !item.available && 'opacity-70',
              )}
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-ink-800">
                {item.image ? (
                  <img
                    src={item.image}
                    alt={item.name}
                    loading="lazy"
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-1.5 text-cream-100/30">
                    <ImageOff size={20} />
                    <span className="text-[10px] uppercase tracking-[0.16em]">No photo</span>
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/45 to-transparent" />
                <span className="absolute left-3 top-3 rounded-full border border-white/25 bg-black/45 px-2.5 py-1 text-[9px] uppercase tracking-[0.14em] text-white/85 backdrop-blur">
                  {categoryName(item.categoryId)}
                </span>
                <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border border-white/25 bg-black/45 px-2.5 py-1 font-display text-[13px] text-white backdrop-blur">
                  {money(item.price)}
                </span>
                {!item.available && (
                  <span className="absolute bottom-3 left-3 rounded-full border border-rose-300/40 bg-rose-500/80 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-white backdrop-blur">
                    Sold out
                  </span>
                )}
              </div>

              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-display text-lg leading-tight text-cream-50">{item.name}</h3>
                    {item.nameAm && <p className="mt-0.5 truncate text-xs text-cream-100/40">{item.nameAm}</p>}
                  </div>
                  {item.isSignature && (
                    <Badge tone="gold" className="shrink-0">
                      <Sparkles size={9} /> Signature
                    </Badge>
                  )}
                </div>

                <p className="mt-2 line-clamp-2 min-h-[2.4rem] text-[11.5px] leading-relaxed text-cream-100/45">
                  {item.description || 'No description yet — add tasting notes so guests know what arrives at the table.'}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded-full border border-ink-950/10 bg-ink-950/[0.03] px-2 py-0.5 text-[10px] text-cream-100/55">
                    <Flame size={9} className="text-orange-300" />
                    {item.spiceLevel === 0 ? 'Mild' : `${item.spiceLevel} / 3`}
                  </span>
                  <span className="rounded-full border border-ink-950/10 bg-ink-950/[0.03] px-2 py-0.5 text-[10px] text-cream-100/55">
                    {item.prepMinutes} min
                  </span>
                  {item.arEnabled && (
                    <span className="rounded-full border border-gold-400/25 bg-gold-400/10 px-2 py-0.5 text-[10px] text-gold-200">
                      AR
                    </span>
                  )}
                </div>

                <div className="mt-4 flex items-center justify-between gap-2 border-t border-ink-950/[0.07] pt-3">
                  <Button
                    size="xs"
                    variant={item.available ? 'secondary' : 'success'}
                    loading={busyId === item.id}
                    onClick={() => toggleAvailability(item)}
                  >
                    {item.available ? 'Mark sold out' : 'Make available'}
                  </Button>
                  <span className={cn('text-[10px] uppercase tracking-[0.14em]', item.available ? 'text-emerald-200' : 'text-rose-200')}>
                    {item.available ? 'On menu' : 'Off menu'}
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-ink-950/12 px-5 py-4">
        <p className="text-xs text-cream-100/45">
          Showing {filtered.length} of {allItems.length} dishes · service charge and tax are added at checkout
        </p>
        <Link
          to="/admin/restaurant/menu/new"
          className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.14em] text-gold-300 transition hover:text-gold-200"
        >
          Add a new dish <ArrowUpRight size={12} />
        </Link>
      </div>
    </div>
  );
}
