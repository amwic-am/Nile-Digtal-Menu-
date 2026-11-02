import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  ChefHat,
  Flame,
  ImageIcon,
  ImageOff,
  Link2,
  Save,
  Sparkles,
} from 'lucide-react';
import { api } from '../lib/api';
import { money } from '../lib/format';
import { useToast } from '../components/Toast';
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  Select,
  Textarea,
  Toggle,
  buttonClass,
  cn,
} from '../components/ui';

const presets = [
  { src: '/dishes/nile-platter.png', label: 'Nile platter' },
  { src: '/dishes/combo-feast.png', label: 'Combo feast' },
  { src: '/dishes/doro-wot.png', label: 'Doro wot' },
  { src: '/dishes/special-tibs.png', label: 'Special tibs' },
  { src: '/dishes/kitfo.png', label: 'Kitfo' },
  { src: '/dishes/nile-burger.png', label: 'Nile burger' },
  { src: '/dishes/fresh-juice.png', label: 'Fresh juice' },
  { src: '/dishes/coffee-ceremony.png', label: 'Coffee ceremony' },
];

type Category = { id: number; name: string; items: unknown[] };

export function ProductAddPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState({
    name: '',
    nameAm: '',
    categoryId: '',
    price: '',
    description: '',
    tags: '',
    image: presets[0].src,
    customImage: '',
    prepMinutes: '15',
    spiceLevel: '0',
    isSignature: false,
    arEnabled: true,
    available: true,
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<{ categories: Category[] }>('/restaurant/menu')
      .then((res) => {
        setCategories(res.categories);
        if (res.categories[0]) setForm((current) => ({ ...current, categoryId: String(res.categories[0].id) }));
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const image = form.customImage.trim() || form.image;
  const priceNumber = Number(form.price);
  const categoryName = useMemo(
    () => categories.find((c) => String(c.id) === form.categoryId)?.name ?? 'Menu',
    [categories, form.categoryId],
  );

  const submit = async () => {
    setError('');
    if (form.name.trim().length < 2) {
      setError('Give the dish a name with at least 2 characters.');
      return;
    }
    if (!form.categoryId) {
      setError('Choose the menu category this dish belongs to.');
      return;
    }
    if (!Number.isFinite(priceNumber) || priceNumber <= 0) {
      setError('Enter a price above zero.');
      return;
    }
    if (!image) {
      setError('Pick a photo preset or paste an image URL.');
      return;
    }
    setSaving(true);
    try {
      await api('/restaurant/menu/items', {
        method: 'POST',
        body: {
          name: form.name.trim(),
          nameAm: form.nameAm.trim(),
          categoryId: Number(form.categoryId),
          price: priceNumber,
          description: form.description.trim(),
          tags: form.tags.trim(),
          image,
          prepMinutes: Number(form.prepMinutes || 15),
          spiceLevel: Number(form.spiceLevel),
          isSignature: form.isSignature,
          arEnabled: form.arEnabled,
          available: form.available,
        },
      });
      toast.success('Dish added to the menu', `${form.name.trim()} is now visible to guests on the QR menu.`);
      navigate('/admin/restaurant/menu');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the dish');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Menu & products"
        title="Add a product"
        description="Photograph, price and publish a dish. It appears on the guest QR menu the moment you save."
        actions={
          <Link to="/admin/restaurant/menu" className={buttonClass('ghost', 'md')}>
            <ArrowLeft size={15} /> Back to menu
          </Link>
        }
      />

      {error && (
        <div className="rounded-xl border border-rose-300/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.9fr)]">
        <div className="space-y-5">
          <Card className="space-y-4 p-5 sm:p-6">
            <div>
              <p className="eyebrow">01 · The dish</p>
              <h2 className="mt-1 font-display text-xl text-cream-50">Name and description</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Dish name" required hint="English">
                <Input
                  value={form.name}
                  onChange={(event) => update('name', event.target.value)}
                  placeholder="e.g. Special tibs"
                  maxLength={120}
                />
              </Field>
              <Field label="Amharic name" hint="Optional">
                <Input
                  value={form.nameAm}
                  onChange={(event) => update('nameAm', event.target.value)}
                  placeholder="ስፔሻል ጥብስ"
                  maxLength={120}
                />
              </Field>
            </div>
            <Field label="Description" hint="Shown under the dish">
              <Textarea
                value={form.description}
                onChange={(event) => update('description', event.target.value)}
                placeholder="Tender beef sautéed with rosemary, jalapeño and clarified butter, served with injera."
                maxLength={400}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Category" required>
                <Select value={form.categoryId} onChange={(event) => update('categoryId', event.target.value)}>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Tags" hint="Comma separated">
                <Input
                  value={form.tags}
                  onChange={(event) => update('tags', event.target.value)}
                  placeholder="beef, spicy, sharing"
                />
              </Field>
            </div>
          </Card>

          <Card className="space-y-4 p-5 sm:p-6">
            <div>
              <p className="eyebrow">02 · Pricing & kitchen</p>
              <h2 className="mt-1 font-display text-xl text-cream-50">Price, prep and spice</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Price (ETB)" required>
                <Input
                  type="number"
                  min="1"
                  step="0.01"
                  value={form.price}
                  onChange={(event) => update('price', event.target.value)}
                  placeholder="480"
                />
              </Field>
              <Field label="Prep time" hint="Minutes">
                <Input
                  type="number"
                  min="1"
                  max="180"
                  value={form.prepMinutes}
                  onChange={(event) => update('prepMinutes', event.target.value)}
                />
              </Field>
              <Field label="Spice level" hint="0 – 3">
                <Select value={form.spiceLevel} onChange={(event) => update('spiceLevel', event.target.value)}>
                  <option value="0">Mild</option>
                  <option value="1">Gentle</option>
                  <option value="2">Warm</option>
                  <option value="3">Fiery</option>
                </Select>
              </Field>
            </div>
            <div className="grid gap-4 rounded-xl border border-ink-950/[0.07] bg-ink-950/[0.02] p-4 sm:grid-cols-3">
              <Toggle
                checked={form.isSignature}
                onChange={(value) => update('isSignature', value)}
                label="Signature dish"
                description="Featured with a gold badge"
              />
              <Toggle
                checked={form.arEnabled}
                onChange={(value) => update('arEnabled', value)}
                label="AR preview"
                description="Guests can place it on the table"
              />
              <Toggle
                checked={form.available}
                onChange={(value) => update('available', value)}
                label="Available now"
                description="Visible on the QR menu"
              />
            </div>
          </Card>

          <Card className="space-y-4 p-5 sm:p-6">
            <div>
              <p className="eyebrow">03 · Photography</p>
              <h2 className="mt-1 font-display text-xl text-cream-50">Choose a photo</h2>
              <p className="mt-1 text-xs text-cream-100/45">Pick one of the house presets, or paste a link to your own photo.</p>
            </div>
            <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-4">
              {presets.map((preset) => (
                <button
                  key={preset.src}
                  type="button"
                  onClick={() => {
                    update('image', preset.src);
                    update('customImage', '');
                  }}
                  className={cn(
                    'group relative aspect-square overflow-hidden rounded-xl border-2 transition',
                    form.image === preset.src && !form.customImage
                      ? 'border-gold-400 ring-2 ring-gold-400/25'
                      : 'border-transparent hover:border-gold-400/40',
                  )}
                  title={preset.label}
                >
                  <img src={preset.src} alt={preset.label} className="h-full w-full object-cover" />
                  {form.image === preset.src && !form.customImage && (
                    <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-gold-400 text-night">
                      <Check size={11} />
                    </span>
                  )}
                </button>
              ))}
            </div>
            <Field label="Or paste an image URL" hint="https://…">
              <div className="relative">
                <Link2 size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-cream-100/35" />
                <Input
                  value={form.customImage}
                  onChange={(event) => update('customImage', event.target.value)}
                  placeholder="https://images.example.com/tibs.jpg"
                  className="pl-9"
                />
              </div>
            </Field>
            {form.customImage.trim() && (
              <div className="flex items-center gap-3 rounded-xl border border-ink-950/[0.07] bg-ink-950/[0.02] p-3">
                <img
                  src={form.customImage}
                  alt="Custom dish"
                  className="h-14 w-14 rounded-lg object-cover"
                  onError={(event) => {
                    (event.target as HTMLImageElement).style.visibility = 'hidden';
                  }}
                />
                <p className="text-[11px] leading-relaxed text-cream-100/45">
                  Custom photo selected. If it fails to load, guests will see a placeholder — double-check the link.
                </p>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-5 xl:sticky xl:top-24 xl:self-start">
          <Card className="overflow-hidden p-0">
            <div className="border-b border-ink-950/[0.07] px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-cream-100/35">Guest preview</p>
            </div>
            <div className="relative aspect-[4/3] overflow-hidden bg-ink-800">
              {image ? (
                <img src={image} alt="Dish preview" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-1.5 text-cream-100/30">
                  <ImageOff size={20} />
                  <span className="text-[10px] uppercase tracking-[0.16em]">No photo yet</span>
                </div>
              )}
              <span className="absolute left-3 top-3 rounded-full border border-white/25 bg-black/45 px-2.5 py-1 text-[9px] uppercase tracking-[0.14em] text-white/85 backdrop-blur">
                {categoryName}
              </span>
              <span className="absolute right-3 top-3 rounded-full border border-white/25 bg-black/45 px-2.5 py-1 font-display text-[13px] text-white backdrop-blur">
                {Number.isFinite(priceNumber) && priceNumber > 0 ? money(priceNumber) : 'ETB —'}
              </span>
            </div>
            <div className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate font-display text-lg leading-tight text-cream-50">
                    {form.name.trim() || 'Your dish name'}
                  </h3>
                  {form.nameAm.trim() && <p className="mt-0.5 truncate text-xs text-cream-100/40">{form.nameAm}</p>}
                </div>
                {form.isSignature && (
                  <Badge tone="gold" className="shrink-0">
                    <Sparkles size={9} /> Signature
                  </Badge>
                )}
              </div>
              <p className="mt-2 line-clamp-3 min-h-[2.6rem] text-[11.5px] leading-relaxed text-cream-100/45">
                {form.description.trim() || 'Your description will appear here, so guests know what arrives at the table.'}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full border border-ink-950/10 bg-ink-950/[0.03] px-2 py-0.5 text-[10px] text-cream-100/55">
                  <Flame size={9} className="text-orange-300" />
                  {Number(form.spiceLevel) === 0 ? 'Mild' : `${form.spiceLevel} / 3`}
                </span>
                <span className="rounded-full border border-ink-950/10 bg-ink-950/[0.03] px-2 py-0.5 text-[10px] text-cream-100/55">
                  {form.prepMinutes || 15} min
                </span>
                {form.arEnabled && (
                  <span className="rounded-full border border-gold-400/25 bg-gold-400/10 px-2 py-0.5 text-[10px] text-gold-200">AR</span>
                )}
                <span
                  className={cn(
                    'rounded-full border px-2 py-0.5 text-[10px]',
                    form.available
                      ? 'border-emerald-300/25 bg-emerald-400/10 text-emerald-200'
                      : 'border-rose-300/25 bg-rose-500/10 text-rose-200',
                  )}
                >
                  {form.available ? 'Available' : 'Sold out'}
                </span>
              </div>
            </div>
          </Card>

          <Card className="space-y-3 p-5">
            <div className="flex items-center gap-2 text-cream-50">
              <ChefHat size={15} className="text-gold-300" />
              <p className="text-sm font-medium">Before you publish</p>
            </div>
            <ul className="space-y-2 text-[11.5px] leading-relaxed text-cream-100/45">
              <li className="flex gap-2">
                <ImageIcon size={12} className="mt-0.5 shrink-0 text-gold-300" />
                Use a bright, top-down photo — dishes sell on the first glance.
              </li>
              <li className="flex gap-2">
                <Flame size={12} className="mt-0.5 shrink-0 text-gold-300" />
                Spice level appears as a chilli marker on the guest menu.
              </li>
              <li className="flex gap-2">
                <Sparkles size={12} className="mt-0.5 shrink-0 text-gold-300" />
                Signature dishes are featured at the top of the QR menu.
              </li>
            </ul>
            <Button className="w-full" size="lg" icon={<Save size={15} />} loading={saving} onClick={submit}>
              Publish dish
            </Button>
            <Link to="/admin/restaurant/menu" className={cn(buttonClass('ghost', 'md'), 'mt-2 w-full')}>
              Cancel
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
