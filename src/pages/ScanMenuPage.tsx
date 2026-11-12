import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowRight,
  BellRing,
  Camera,
  CheckCircle2,
  ChevronRight,
  Clock3,
  ConciergeBell,
  Flame,
  Languages,
  MapPin,
  Minus,
  Plus,
  ReceiptText,
  Search,
  ShoppingBag,
  Sparkles,
  Trash2,
  Users,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { apiPublic } from '../lib/api';
import type { Bill, MenuItem, OrderStatus, PublicScan, SessionSummary } from '../lib/types';
import { money, orderStatusMeta } from '../lib/format';
import { useToast } from '../components/Toast';
import { ARPreview } from '../components/ARPreview';

type Lang = 'en' | 'am';

const copy = {
  en: {
    menu: 'Menu',
    search: 'Search dishes, drinks, coffee…',
    all: 'All',
    add: 'Add',
    addToOrder: 'Add to order',
    yourOrder: 'Your order',
    emptyCart: 'Your table order is empty',
    emptyCartHint: 'Browse the menu and add a few dishes to begin.',
    subtotal: 'Subtotal',
    service: 'Service charge',
    tax: 'Tax',
    total: 'Total',
    placeOrder: 'Place order',
    placing: 'Sending to the kitchen…',
    yourName: 'Your name',
    nameHint: 'So the waiter knows who ordered',
    orderNotes: 'Notes for the kitchen',
    notesPlaceholder: 'Allergies, spice level, serving preferences…',
    clear: 'Clear order',
    quantity: 'Quantity',
    extras: 'Make it special',
    dishNotes: 'Special request',
    signature: 'Signature',
    prep: 'min prep',
    spice: 'Spice',
    myTable: 'My table',
    tableOrders: 'Orders at this table',
    bill: 'Bill',
    callWaiter: 'Call waiter',
    requestBill: 'Request the bill',
    calling: 'A team member is on the way',
    browse: 'Browse menu',
    viewOrder: 'View order',
    items: 'items',
    noOrders: 'No orders yet',
    orderPlaced: 'Order placed',
    orderPlacedHint: 'The kitchen has your ticket. We will bring it to your table.',
    choosePaymentMethod: 'Choose Payment Method',
    paymentSummary: 'Order summary',
    payAtCounter: 'Pay at the cashier',
    pendingPayment: 'Pending payment confirmation',
    paymentPendingHint: 'Your order is confirmed, but payment still needs to be verified before final completion.',
    confirmSelection: 'Confirm selection',
    selected: 'Selected',
    trackOrder: 'Track this order',
    orderMore: 'Order more',
    swipeToPlace: 'Swipe to Place Order',
    swipeHint: 'Slide the handle to confirm your order',
    continueToOrder: 'Continue to current order',
    paymentNotice: 'Selecting a method does not record payment. A cashier or supported provider must confirm it.',
    guests: 'guests at this table',
    tableClosed: 'This table is not taking orders',
    joinedAs: 'Ordering as',
    arPreview: 'AR preview',
    arHint: 'Preview the dish over your camera',
    scanToOrder: 'Scan · order · enjoy',
    hours: 'Open daily · 07:00 – 23:00',
    added: 'added to your order',
    sessionClosed: 'This table visit has ended',
    billDue: 'Balance due',
    settled: 'Settled',
    payments: 'Payments',
    close: 'Close',
    backToMenu: 'Back to the menu',
    viewMenu: 'View menu',
    addFirst: 'Add at least one dish first.',
    enterName: 'Add your name so the waiter can find you.',
    qrExpired: 'This QR code is unavailable',
    qrExpiredHint: 'Please ask a member of staff for a fresh QR code.',
    demoNote: 'This is a live preview of the Nile table-ordering experience.',
  },
  am: {
    menu: 'ምናሌ',
    search: 'ምግብ፣ መጠጥ፣ ቡና ፈልግ…',
    all: 'ሁሉም',
    add: 'ጨምር',
    addToOrder: 'ወደ ትእዛዝ ጨምር',
    yourOrder: 'ትእዛዝህ',
    emptyCart: 'የጠረጴዛህ ትእዛዝ ሕዘብ የለውም',
    emptyCartHint: 'ምናሌውን ተመልክተህ ጥቂት ምግቦችን ጨምር።',
    subtotal: 'ንዑስ ድምር',
    service: 'የአገልግሎት ክፍያ',
    tax: 'ታክስ',
    total: 'ጠቅላላ ድምር',
    placeOrder: 'ትእዛዝ አስገባ',
    placing: 'ወደ ኩሽና በመላክ ላይ…',
    yourName: 'ስምህ',
    nameHint: 'አስተናጋጁ ማን እንደዘዘ እንዲያውቅ',
    orderNotes: 'ለኩሽና ማስታወሻ',
    notesPlaceholder: 'አለርጂ፣ የቅመም መጠን፣ ምርጫዎች…',
    clear: 'ትእዛዙን አጽዳ',
    quantity: 'ብዛት',
    extras: 'በልዩ ሁኔታ አዘጋጅ',
    dishNotes: 'ልዩ ጥያቄ',
    signature: 'ልዩ ምግብ',
    prep: 'ደቂቃ ዝግጅት',
    spice: 'ቅመም',
    myTable: 'የእኔ ጠረጴዛ',
    tableOrders: 'በዚህ ጠረጴዛ ላይ የተሰጡ ትእዛዞች',
    bill: 'ሂሳብ',
    callWaiter: 'አስተናጋጅ ጥራ',
    requestBill: 'ሂሳብ ጠይቅ',
    calling: 'የሠራተኛ ቡድን በመንገድ ላይ ነው',
    browse: 'ምናሌ ተመልከት',
    viewOrder: 'ትእዛዝ ተመልከት',
    items: 'ዕቃዎች',
    noOrders: 'እስካሁን ትእዛዝ የለም',
    orderPlaced: 'ትእዛዝ ተሰጥቷል',
    orderPlacedHint: 'ኩሽናው ትእዛዝህን ተቀብሏል። ወደ ጠረጴዛህ እናመጣዋለን።',
    choosePaymentMethod: 'የክፍያ ዘዴ ይምረጡ',
    paymentSummary: 'የትእዛዝ አጠቃላይ',
    payAtCounter: 'በካሽየር ክፍያ ይከፈላል',
    pendingPayment: 'ክፍያ በመጠባበቅ ላይ',
    paymentPendingHint: 'ትእዛዝህ ተረጋግጧል፣ ነገሩ ግን በክፍያ ማረጋገጥ እስኪያጠናቅቅ እስከ መጨረሻ የሚቀጥል ነው።',
    confirmSelection: 'ምርጫ አረጋግጥ',
    selected: 'ተመርጧል',
    trackOrder: 'ትእዛዝን ተከታተል',
    orderMore: 'ተጨማሪ አዘዝ',
    swipeToPlace: 'ወደ ትእዛዝ ማድረግ',
    swipeHint: 'መሽከርከር ለማረጋገጥ',
    continueToOrder: 'ወደ አሁኑ ትእዛዝ ቀጥል',
    paymentNotice: 'ዘዴ መምረጥ ክፍያን አያረጋግጥም። ካሽየር ወይም የተደገፈ አቅራቢ ማረጋገጥ አለበት።',
    guests: 'እንግዶች በዚህ ጠረጴዛ',
    tableClosed: 'ይህ ጠረጴዛ ትእዛዝ አይቀበልም',
    joinedAs: 'በስም እያዘዝክ',
    arPreview: 'AR ቅድመ እይታ',
    arHint: 'ምግቡን በካሜራህ ላይ ተመልከት',
    scanToOrder: 'ቃኝ · አዘዝ · ተደሰት',
    hours: 'በየቀኑ ክፍት · 07:00 – 23:00',
    added: 'ወደ ትእዛዝህ ተጨምሯል',
    sessionClosed: 'የዚህ ጠረጴዛ ጉብኝት ተጠናቅቋል',
    billDue: 'የሚከፈል ቀሪ',
    settled: 'ተከፍሏል',
    payments: 'ክፍያዎች',
    close: 'ዝጋ',
    backToMenu: 'ወደ ምናሌ ተመለስ',
    viewMenu: 'ምናሌ ተመልከት',
    addFirst: 'መጀመሪያ ቢያንስ አንድ ምግብ ጨምር።',
    enterName: 'አስተናጋጁ እንዲያገኝህ ስምህን ጨምር።',
    qrExpired: 'ይህ QR ኮድ አይገኝም',
    qrExpiredHint: 'እባክህ አዲስ QR ኮድ ለማግኘት ሠራተኛ ጠይቅ።',
    demoNote: 'ይህ የናይል ጠረጴዛ ትእዛዝ ተሞክሮ ቀጥታ ቅድመ እይታ ነው።',
  },
};

type GuestSession = { id: number; code: string; guestsCount: number; openedAt: string };

type CartLine = {
  key: string;
  itemId: number;
  name: string;
  nameAm: string | null;
  image: string | null;
  unitPrice: number;
  qty: number;
  addonIds: number[];
  addonNames: string[];
  notes: string;
};

type PaymentChoice = 'cash' | 'bank_abyssinia' | 'cbe' | 'telebirr';

const paymentChoices: Array<{ id: PaymentChoice; name: string; hint: string }> = [
  { id: 'cash', name: 'Cash', hint: 'Pay at the cashier when you finish your meal.' },
  { id: 'bank_abyssinia', name: 'Bank of Abyssinia', hint: 'Ask the cashier for Bank of Abyssinia transfer details.' },
  { id: 'cbe', name: 'CBE', hint: 'Ask the cashier for Commercial Bank of Ethiopia payment details.' },
  { id: 'telebirr', name: 'Telebirr', hint: 'Use Telebirr and confirm payment with the cashier.' },
];

function PaymentMethodLogo({ method }: { method: PaymentChoice }) {
  const logos: Record<PaymentChoice, { src: string; alt: string }> = {
    cash: { src: '/payment-logos/cash.png', alt: 'Cash' },
    bank_abyssinia: { src: '/payment-logos/bank-of-abyssinia.jpg', alt: 'Bank of Abyssinia' },
    cbe: { src: '/payment-logos/cbe.png', alt: 'Commercial Bank of Ethiopia' },
    telebirr: { src: '/payment-logos/telebirr.png', alt: 'Telebirr' },
  };
  const logo = logos[method];
  return <img src={logo.src} alt={logo.alt} className="h-11 w-11 rounded-xl object-contain" />;
}

const readGuestKey = () => {
  const existing = localStorage.getItem('nile.guestKey');
  if (existing) return existing;
  const key = crypto.randomUUID();
  localStorage.setItem('nile.guestKey', key);
  return key;
};

const guestStatusTone: Record<OrderStatus, string> = {
  new: 'bg-[#f6e7c2] text-[#7c5c16]',
  accepted: 'bg-[#e2edf5] text-[#2f6484]',
  preparing: 'bg-[#fbe4d3] text-[#9a4f1f]',
  ready: 'bg-[#dff0e5] text-[#2f6b4b]',
  served: 'bg-[#efe8da] text-[#5b5140]',
  completed: 'bg-[#e9e6df] text-[#6a665d]',
  cancelled: 'bg-[#f8dcdc] text-[#8f3a3a]',
};

function GuestSheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[140] flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 animate-fade-in bg-[#17120a]/55 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[28px] border border-[#d7b46c]/45 bg-[#fbf8f1] text-[#18130b] shadow-[-24px_48px_80px_-24px_rgba(15,11,6,0.65)] animate-pop sm:max-w-lg sm:rounded-[28px]">
        <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#c9a45c]/80 to-transparent" />
        <div className="flex items-start justify-between gap-4 border-b border-[#d7b46c]/25 px-5 py-4">
          <div>
            <h2 className="font-display text-xl leading-tight">{title}</h2>
            {subtitle && <p className="mt-1 text-[11.5px] leading-relaxed text-[#6d5b3d]">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#18130b]/10 text-[#6d5b3d] transition hover:border-[#a67f38]/40 hover:bg-[#18130b]/5"
            aria-label="Close"
          >
            <X size={15} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="border-t border-[#d7b46c]/25 bg-[#f4ecdd]/60 px-5 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

function ItemSheet({
  item,
  lang,
  open,
  onClose,
  onAdd,
}: {
  item: MenuItem | null;
  lang: Lang;
  open: boolean;
  onClose: () => void;
  onAdd: (line: Omit<CartLine, 'key'>) => void;
}) {
  const L = copy[lang];
  const [qty, setQty] = useState(1);
  const [addonIds, setAddonIds] = useState<number[]>([]);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    setQty(1);
    setAddonIds([]);
    setNotes('');
  }, [open, item?.id]);

  if (!item) return null;
  const chosen = item.addons.filter((addon) => addonIds.includes(addon.id));
  const unitPrice = Math.round((item.price + chosen.reduce((sum, addon) => sum + addon.price, 0)) * 100) / 100;
  const total = Math.round(unitPrice * qty * 100) / 100;

  const submit = () => {
    onAdd({
      itemId: item.id,
      name: item.name,
      nameAm: item.nameAm,
      image: item.image,
      unitPrice,
      qty,
      addonIds: chosen.map((addon) => addon.id),
      addonNames: chosen.map((addon) => addon.name),
      notes: notes.trim(),
    });
    onClose();
  };

  return (
    <GuestSheet
      open={open}
      onClose={onClose}
      title={lang === 'am' && item.nameAm ? item.nameAm : item.name}
      subtitle={item.description ?? undefined}
      footer={
        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-full border border-[#18130b]/15 bg-white">
            <button type="button" onClick={() => setQty((value) => Math.max(1, value - 1))} className="inline-flex h-10 w-10 items-center justify-center text-[#6d5b3d]" aria-label="Decrease quantity">
              <Minus size={14} />
            </button>
            <span className="w-7 text-center text-sm font-medium">{qty}</span>
            <button type="button" onClick={() => setQty((value) => Math.min(20, value + 1))} className="inline-flex h-10 w-10 items-center justify-center text-[#6d5b3d]" aria-label="Increase quantity">
              <Plus size={14} />
            </button>
          </div>
          <button
            type="button"
            onClick={submit}
            className="inline-flex h-11 flex-1 items-center justify-between gap-2 rounded-full bg-[#18130b] px-5 text-sm font-medium text-[#fbf7ef] transition hover:bg-[#2c2418]"
          >
            <span>{L.addToOrder}</span>
            <span>{money(total)}</span>
          </button>
        </div>
      }
    >
      {item.image && (
        <div className="overflow-hidden rounded-2xl border border-[#d7b46c]/30">
          <img src={item.image} alt={item.name} className="aspect-[4/3] w-full object-cover" />
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {item.isSignature && (
          <span className="rounded-full bg-[#dff0e5] px-2.5 py-1 text-[10px] font-medium text-[#2f6b4b]">
            ★ {L.signature}
          </span>
        )}
        {item.prepMinutes > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full border border-[#18130b]/12 px-2.5 py-1 text-[10px] text-[#6d5b3d]">
            <Clock3 size={10} /> {item.prepMinutes} {L.prep}
          </span>
        )}
        {item.spiceLevel > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full border border-[#b4552e]/20 bg-[#b4552e]/5 px-2.5 py-1 text-[10px] text-[#9a4f1f]">
            {Array.from({ length: item.spiceLevel }).map((_, index) => (
              <Flame key={index} size={10} />
            ))}
            {L.spice}
          </span>
        )}
      </div>

      {item.addons.length > 0 && (
        <div className="mt-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8a7452]">{L.extras}</p>
          <div className="mt-2 space-y-1.5">
            {item.addons.map((addon) => {
              const active = addonIds.includes(addon.id);
              return (
                <button
                  key={addon.id}
                  type="button"
                  onClick={() =>
                    setAddonIds((current) =>
                      current.includes(addon.id) ? current.filter((id) => id !== addon.id) : [...current, addon.id],
                    )
                  }
                  className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left text-[12.5px] transition ${
                    active ? 'border-[#c39a4a] bg-[#f6ecd8]' : 'border-[#18130b]/10 bg-white hover:border-[#18130b]/20'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <span
                      className={`inline-flex h-4 w-4 items-center justify-center rounded-full border ${
                        active ? 'border-[#a67f38] bg-[#a67f38] text-white' : 'border-[#18130b]/25'
                      }`}
                    >
                      {active && <CheckCircle2 size={10} />}
                    </span>
                    {addon.name}
                  </span>
                  <span className="text-[#6d5b3d]">+ {money(addon.price)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8a7452]">{L.dishNotes}</p>
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder={L.notesPlaceholder}
          rows={2}
          className="mt-2 w-full resize-none rounded-xl border border-[#18130b]/12 bg-white px-3.5 py-2.5 text-sm outline-none transition placeholder:text-[#8a7452]/60 focus:border-[#a67f38]"
        />
      </div>
    </GuestSheet>
  );
}

function SwipeToPlaceOrder({
  disabled,
  loading,
  label,
  onConfirm,
}: {
  disabled: boolean;
  loading: boolean;
  label: string;
  onConfirm: () => void;
}) {
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(0);
  const grabOffsetRef = useRef(0);
  const trackRef = useRef<HTMLDivElement | null>(null);

  const updateProgress = (clientX: number) => {
    const track = trackRef.current;
    if (!track || disabled) return;
    const rect = track.getBoundingClientRect();
    const handleWidth = 48;
    const inset = 4;
    const travel = Math.max(1, rect.width - handleWidth - inset * 2);
    const next = Math.min(1, Math.max(0, (clientX - rect.left - grabOffsetRef.current - inset) / travel));
    progressRef.current = next;
    setProgress(next);
  };

  const release = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (progressRef.current > 0.74) {
      progressRef.current = 1;
      setProgress(1);
      onConfirm();
      window.setTimeout(() => {
        progressRef.current = 0;
        setProgress(0);
      }, 450);
      return;
    }
    progressRef.current = 0;
    setProgress(0);
  };

  return (
    <div className={`relative overflow-hidden rounded-full border p-[2px] shadow-[0_18px_50px_-30px_rgba(22,101,52,0.45)] transition-colors duration-200 ${
      loading
        ? 'border-emerald-300 bg-emerald-500'
        : 'border-[#d7b46c]/45 bg-[linear-gradient(135deg,#d7b46c_0%,#bf8e3b_45%,#a66e27_100%)]'
    }`}>
      <div
        ref={trackRef}
        className={`relative h-14 overflow-hidden rounded-full transition-colors duration-200 ${
          loading ? 'bg-emerald-600' : 'bg-[linear-gradient(135deg,rgba(184,143,69,0.9),rgba(140,104,45,0.95))]'
        }`}
      >
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-14 text-center text-[9px] font-semibold uppercase tracking-[0.12em] text-[#f8f2e5]/90 sm:px-16 sm:text-[11px] sm:tracking-[0.2em]">
          {loading ? 'Sending order…' : label}
        </div>
        <div
          className="pointer-events-none absolute inset-y-0 left-0 overflow-hidden bg-[linear-gradient(135deg,rgba(247,225,174,0.38),rgba(240,205,124,0.12))] transition-[width] duration-100"
          style={{ width: `${Math.max(0, progress * 100)}%` }}
        />
        <button
          type="button"
          disabled={disabled || loading}
          onPointerDown={(event) => {
            if (disabled || loading) return;
            event.preventDefault();
            const handleRect = event.currentTarget.getBoundingClientRect();
            grabOffsetRef.current = event.clientX - handleRect.left;
            event.currentTarget.setPointerCapture(event.pointerId);
            updateProgress(event.clientX);
          }}
          onPointerMove={(event) => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId) || disabled || loading) return;
            updateProgress(event.clientX);
          }}
          onPointerUp={release}
          onPointerCancel={(event) => {
            progressRef.current = 0;
            setProgress(0);
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowRight') {
              event.preventDefault();
              const next = Math.min(1, progressRef.current + 0.15);
              progressRef.current = next;
              setProgress(next);
            }
            if (event.key === 'Enter' && progressRef.current >= 0.75) onConfirm();
          }}
          className={`absolute left-1 top-1 h-12 w-12 touch-none select-none rounded-full border shadow-[0_8px_18px_rgba(25,18,10,0.2)] transition-[left,background-color,border-color] duration-150 active:scale-[0.98] ${
            loading
              ? 'border-emerald-100 bg-emerald-50'
              : 'border-[#f7f0dc]/70 bg-[linear-gradient(135deg,#fffaf3,#f5e8c7)]'
          }`}
          style={{
            left: `calc(4px + ${progress * 100}% - ${progress * 56}px)`,
          }}
          aria-label={label}
          aria-valuenow={Math.round(progress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span className="flex h-full w-full items-center justify-center text-[#1f160d]">
            <ArrowRight size={18} />
          </span>
        </button>
      </div>
    </div>
  );
}

export function ScanMenuPage() {
  const { token = '' } = useParams();
  const toast = useToast();
  const [scan, setScan] = useState<PublicScan | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem('nile.lang') === 'am' ? 'am' : 'en'));
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [activeItem, setActiveItem] = useState<MenuItem | null>(null);
  const [arItem, setArItem] = useState<MenuItem | null>(null);
  const [session, setSession] = useState<GuestSession | null>(null);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [tableOpen, setTableOpen] = useState(false);
  const [name, setName] = useState(() => localStorage.getItem('nile.guestName') ?? '');
  const [orderNotes, setOrderNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [placingStep, setPlacingStep] = useState('');
  const [lastOrder, setLastOrder] = useState<{
    id: number;
    orderNo: number;
    displayNo: string;
    total: number;
    subtotal: number;
    serviceCharge: number;
    tax: number;
    items: Array<{ name: string; qty: number; total: number }>;
    status: OrderStatus;
    sessionId: number;
  } | null>(null);
  const [showPaymentFlow, setShowPaymentFlow] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<PaymentChoice | null>(null);
  const [callBusy, setCallBusy] = useState('');
  const [callMessage, setCallMessage] = useState('');
  const guestKey = useRef<string>('');

  const L = copy[lang];

  useEffect(() => {
    guestKey.current = readGuestKey();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    apiPublic<PublicScan>(`/public/scan/${token}`)
      .then((res) => {
        if (cancelled) return;
        setScan(res);
        setSession(res.session);
        setActiveCategory(res.menu[0] ? String(res.menu[0].id) : '');
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const refreshSummary = useCallback(async (sessionId?: number) => {
    const id = sessionId ?? session?.id;
    if (!id) return;
    try {
      const res = await apiPublic<{ session: SessionSummary }>(`/public/scan/${token}/session/${id}`);
      setSummary(res.session);
      setSession((current) =>
        current ?? { id: res.session.id, code: res.session.code, guestsCount: res.session.guestsCount, openedAt: res.session.openedAt },
      );
    } catch {
      /* the session may have just closed */
    }
  }, [session?.id, token]);

  useEffect(() => {
    if (!session) return;
    refreshSummary(session.id);
    const timer = setInterval(() => refreshSummary(session.id), 20_000);
    return () => clearInterval(timer);
  }, [session, refreshSummary]);

  const cartCount = cart.reduce((sum, line) => sum + line.qty, 0);
  const cartSubtotal = cart.reduce((sum, line) => sum + line.unitPrice * line.qty, 0);
  const servicePct = scan?.restaurant.serviceChargePct ?? 0;
  const taxPct = scan?.restaurant.taxPct ?? 0;
  const serviceFee = Math.round(cartSubtotal * (servicePct / 100) * 100) / 100;
  const taxFee = Math.round(cartSubtotal * (taxPct / 100) * 100) / 100;
  const cartTotal = Math.round((cartSubtotal + serviceFee + taxFee) * 100) / 100;

  const addLine = (line: Omit<CartLine, 'key'>) => {
    const key = `${line.itemId}|${[...line.addonIds].sort().join(',')}|${line.notes}`;
    setCart((current) => {
      const existing = current.find((entry) => entry.key === key);
      if (existing) {
        return current.map((entry) => (entry.key === key ? { ...entry, qty: Math.min(20, entry.qty + line.qty) } : entry));
      }
      return [...current, { ...line, key }];
    });
    toast.success(
      lang === 'am' && line.nameAm ? `${line.nameAm} ${L.added}` : `${line.name} ${L.added}`,
      L.viewOrder,
    );
  };

  const updateQty = (key: string, delta: number) => {
    setCart((current) =>
      current
        .map((line) => (line.key === key ? { ...line, qty: Math.min(20, line.qty + delta) } : line))
        .filter((line) => line.qty > 0),
    );
  };

  const placeOrder = async () => {
    if (!scan || !cart.length) {
      toast.error(L.addFirst);
      return;
    }
    const guestName = name.trim();
    if (!guestName) {
      toast.error(L.enterName);
      return;
    }
    setSubmitting(true);
    try {
      let sessionId = session?.id ?? 0;
      if (!sessionId) {
        setPlacingStep('opening');
        const joined = await apiPublic<{ session: SessionSummary }>(`/public/scan/${token}/join`, {
          method: 'POST',
          body: { guestKey: guestKey.current, name: guestName },
        });
        sessionId = joined.session.id;
        setSession(joined.session);
        setSummary(joined.session);
      }
      setPlacingStep('sending');
      localStorage.setItem('nile.guestName', guestName);
      const res = await apiPublic<{
        order: { id: number; orderNo: number; displayNo: string; total: number; status: OrderStatus; sessionId: number };
        bill: Bill;
      }>(`/public/scan/${token}/orders`, {
        method: 'POST',
        body: {
          sessionId,
          guestName,
          notes: orderNotes.trim() || null,
          items: cart.map((line) => ({
            menuItemId: line.itemId,
            qty: line.qty,
            addonIds: line.addonIds,
            notes: line.notes || null,
          })),
        },
      });
      setCart([]);
      setOrderNotes('');
      setCartOpen(false);
      setLastOrder({
        ...res.order,
        sessionId,
        subtotal: cartSubtotal,
        serviceCharge: serviceFee,
        tax: taxFee,
        items: cart.map((line) => ({ name: line.name, qty: line.qty, total: line.unitPrice * line.qty })),
      });
      setSelectedPayment(null);
      setShowPaymentFlow(true);
      setPlacingStep('');
      await refreshSummary(sessionId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Your order could not be sent', 'Please try again or ask a waiter.');
    } finally {
      setSubmitting(false);
      setPlacingStep('');
    }
  };

  const callTeam = async (type: 'waiter' | 'bill') => {
    if (!session) {
      toast.info(L.callWaiter, 'Place an order or ask a waiter to open your table first.');
      return;
    }
    setCallBusy(type);
    try {
      await apiPublic(`/public/scan/${token}/call`, { method: 'POST', body: { sessionId: session.id, type } });
      setCallMessage(L.calling);
      toast.success(L.calling, type === 'bill' ? L.requestBill : L.callWaiter);
    } catch (err) {
      toast.error('Could not send the request', err instanceof Error ? err.message : 'Try again');
    } finally {
      setCallBusy('');
    }
  };

  const filteredCategories = useMemo(() => {
    if (!scan) return [];
    const term = search.trim().toLowerCase();
    if (!term) return scan.menu;
    return scan.menu
      .map((category) => ({
        ...category,
        items: category.items.filter(
          (item) =>
            item.name.toLowerCase().includes(term) ||
            (item.nameAm ?? '').toLowerCase().includes(term) ||
            (item.description ?? '').toLowerCase().includes(term),
        ),
      }))
      .filter((category) => category.items.length > 0);
  }, [scan, search]);

  const sessionBill = summary?.bill ?? null;
  const activeSessionClosed = summary?.status === 'closed';

  if (loading) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#120e07] text-[#f8f2e5]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_440px_at_50%_-8%,rgba(216,180,117,0.16),transparent_65%)]" />
        <div className="relative flex flex-col items-center gap-5">
          <span className="flex h-16 w-16 items-center justify-center rounded-full border border-[#d8b475]/35 bg-[#d8b475]/10 font-display text-2xl text-[#f0e2bf]">
            N
          </span>
          <span className="font-display text-[1.7rem] tracking-[0.42em] text-[#f8f2e5]">NILE</span>
          <span className="h-px w-24 overflow-hidden bg-[#d8b475]/20">
            <span className="block h-full w-1/2 animate-pulse bg-[#d8b475]" />
          </span>
          <p className="text-[10px] uppercase tracking-[0.34em] text-[#d8b475]/70">{L.scanToOrder}</p>
        </div>
      </div>
    );
  }

  if (error || !scan) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center gap-4 overflow-hidden bg-[#f6f0e4] px-6 text-center text-[#18130b]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(700px_340px_at_50%_0%,rgba(166,127,56,0.12),transparent_65%)]" />
        <span className="relative flex h-14 w-14 items-center justify-center rounded-full border border-[#a67f38]/35 bg-[#a67f38]/5 font-display text-xl text-[#8a5f20]">
          N
        </span>
        <h1 className="relative font-display text-3xl">{L.qrExpired}</h1>
        <p className="relative max-w-sm text-sm leading-relaxed text-[#6d5b3d]">{error || L.qrExpiredHint}</p>
        <Link
          to="/"
          className="relative mt-2 rounded-full border border-[#a67f38]/40 px-5 py-2 text-[11px] uppercase tracking-[0.18em] text-[#8a5f20] transition hover:bg-[#a67f38]/10"
        >
          {L.backToMenu}
        </Link>
      </div>
    );
  }

  const { restaurant, table } = scan;
  const canOrder = scan.canOrder && !activeSessionClosed;

  return (
    <div className="min-h-screen bg-[#f6f0e4] text-[#18130b]">
      <header className="sticky top-0 z-40 border-b border-[#d8b475]/20 bg-[#14100a]/94 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link to={`/menu/scan/${token}`} className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-[#d8b475]/40 bg-[#d8b475]/10 font-display text-[15px] text-[#f0e2bf]">
              N
            </span>
            <span className="min-w-0">
              <span className="block font-display text-[17px] leading-none tracking-[0.34em] text-[#f8f2e5]">NILE</span>
              <span className="mt-1 block text-[7px] uppercase tracking-[0.3em] text-[#d8b475]/70">Hotel · Restaurant</span>
            </span>
          </Link>
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#d8b475]/25 bg-white/[0.04] px-2.5 py-1 text-[10px] font-medium tracking-[0.08em] text-[#f0e2bf]">
              <MapPin size={10} className="text-[#d8b475]" /> {table.code}
            </span>
            <button
              type="button"
              onClick={() => {
                const next = lang === 'en' ? 'am' : 'en';
                setLang(next);
                localStorage.setItem('nile.lang', next);
              }}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#d8b475]/25 bg-white/[0.04] px-2.5 text-[10px] font-medium text-[#f0e2bf] transition hover:border-[#d8b475]/55 hover:bg-white/[0.08]"
            >
              <Languages size={12} className="text-[#d8b475]" /> {lang === 'en' ? 'አማርኛ' : 'English'}
            </button>
            <button
              type="button"
              onClick={() => setTableOpen(true)}
              className="relative inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#d8b475]/25 bg-white/[0.04] text-[#f0e2bf] transition hover:border-[#d8b475]/55 hover:bg-white/[0.08]"
              aria-label={L.myTable}
            >
              <ReceiptText size={14} />
              {summary && summary.orders.length > 0 && (
                <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#d8b475] px-1 text-[8px] font-semibold text-[#14100a]">
                  {summary.orders.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-[#d8b475]/25">
        <div className="absolute inset-0">
          <img src="/dishes/nile-platter.png" alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0f0b06]/95 via-[#17120a]/72 to-[#17120a]/25" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0f0b06]/60 via-transparent to-transparent" />
        </div>
        <div className="pointer-events-none absolute inset-3 border border-[#d8b475]/25 sm:inset-5" />
        <div className="relative mx-auto max-w-6xl px-6 py-14 sm:px-10 sm:py-20">
          <div className="flex items-center gap-3">
            <span className="h-px w-9 bg-[#d8b475]/60" />
            <p className="text-[9.5px] uppercase tracking-[0.34em] text-[#e6cd97]">{L.scanToOrder}</p>
          </div>
          <h1 className="mt-4 max-w-2xl font-display text-4xl leading-[1.03] text-[#fbf7ef] sm:text-6xl">
            {restaurant.name}
          </h1>
          <p className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] tracking-[0.04em] text-[#f4ecdd]/70">
            <span className="inline-flex items-center gap-1.5"><MapPin size={12} className="text-[#d8b475]" /> {table.code} · {table.areaName}</span>
            <span className="inline-flex items-center gap-1.5"><Users size={12} className="text-[#d8b475]" /> seats {table.capacity}</span>
            <span className="inline-flex items-center gap-1.5"><Clock3 size={12} className="text-[#d8b475]" /> {L.hours}</span>
            <span className="inline-flex items-center gap-1 tracking-[0.18em] text-[#e6cd97]">
              <Sparkles size={10} /> ★★★★
            </span>
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            {session ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e6cd97]/30 bg-white/[0.06] px-3 py-1.5 text-[10.5px] text-[#f6ecd8] backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                {L.myTable} · {session.code} · {session.guestsCount} {L.guests}
              </span>
            ) : canOrder ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e6cd97]/40 bg-[#e6cd97]/12 px-3 py-1.5 text-[10.5px] text-[#f6ecd8] backdrop-blur">
                <Sparkles size={11} /> {lang === 'am' ? 'ጠረጴዛህን ከፍተህ ማዘዝ ትችላለህ' : 'Your table is ready — start ordering'}
              </span>
            ) : null}
            {name && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e6cd97]/20 px-3 py-1.5 text-[10.5px] text-[#f4ecdd]/75">
                {L.joinedAs} {name}
              </span>
            )}
          </div>
        </div>
      </section>

      {(!scan.canOrder || activeSessionClosed) && (
        <div className="border-b border-[#b4552e]/20 bg-[#fbe4d3]">
          <div className="mx-auto max-w-6xl px-4 py-3 text-[12px] text-[#8f4a21] sm:px-6">
            {activeSessionClosed
              ? L.sessionClosed
              : scan.notice ?? L.tableClosed}
          </div>
        </div>
      )}

      <div className="sticky top-[61px] z-30 border-b border-[#d7b46c]/25 bg-[#f6f0e4]/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <div className="relative flex-1">
            <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8a7452]" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={L.search}
              className="h-10 w-full rounded-full border border-[#d7b46c]/30 bg-white pl-9 pr-4 text-[12.5px] shadow-[0_10px_30px_-24px_rgba(24,19,11,0.7)] outline-none transition placeholder:text-[#8a7452]/70 focus:border-[#a67f38]"
            />
          </div>
          <div className="hidden items-center gap-1 overflow-x-auto md:flex">
            {scan.menu.map((category) => (
              <a
                key={category.id}
                href={`#category-${category.id}`}
                onClick={() => setActiveCategory(String(category.id))}
                className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] transition ${
                  activeCategory === String(category.id)
                    ? 'bg-[#18130b] text-[#f0e2bf] shadow-[inset_0_0_0_1px_rgba(216,180,117,0.4)]'
                    : 'border border-[#18130b]/12 text-[#6d5b3d] hover:border-[#a67f38] hover:text-[#18130b]'
                }`}
              >
                {lang === 'am' && category.nameAm ? category.nameAm : category.name}
              </a>
            ))}
          </div>
        </div>
        <div className="flex gap-1 overflow-x-auto px-4 pb-3 md:hidden">
          {scan.menu.map((category) => (
            <a
              key={category.id}
              href={`#category-${category.id}`}
              onClick={() => setActiveCategory(String(category.id))}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] transition ${
                activeCategory === String(category.id)
                  ? 'bg-[#18130b] text-[#f0e2bf] shadow-[inset_0_0_0_1px_rgba(216,180,117,0.4)]'
                  : 'border border-[#18130b]/12 text-[#6d5b3d]'
              }`}
            >
              {lang === 'am' && category.nameAm ? category.nameAm : category.name}
            </a>
          ))}
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 pb-36 pt-6 sm:px-6 sm:pb-24">
        {filteredCategories.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#18130b]/15 px-6 py-16 text-center">
            <UtensilsCrossed size={26} className="mx-auto text-[#8a7452]/50" />
            <p className="mt-3 font-display text-lg">{lang === 'am' ? 'ምንም ምግብ አልተገኘም' : 'No dishes match your search'}</p>
            <p className="mt-1 text-xs text-[#6d5b3d]">{lang === 'am' ? 'ሌላ ቃል ሞክር።' : 'Try another word, or browse the full menu.'}</p>
          </div>
        ) : (
          <div className="space-y-10">
            {filteredCategories.map((category) => (
              <section key={category.id} id={`category-${category.id}`} className="scroll-mt-[150px]">
                <div className="mb-5 flex items-end justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="h-px w-6 bg-[#a67f38]/50" />
                      <p className="text-[9.5px] uppercase tracking-[0.3em] text-[#a67f38]">{L.menu}</p>
                    </div>
                    <h2 className="mt-2 font-display text-[1.7rem] leading-tight sm:text-[2rem]">
                      {lang === 'am' && category.nameAm ? category.nameAm : category.name}
                    </h2>
                    {category.description && <p className="mt-1.5 max-w-lg text-[11.5px] leading-relaxed text-[#6d5b3d]">{category.description}</p>}
                  </div>
                  <span className="hidden shrink-0 text-[9.5px] uppercase tracking-[0.2em] text-[#8a7452] sm:block">
                    {category.items.length} {L.items}
                  </span>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {category.items.map((item) => {
                    const title = lang === 'am' && item.nameAm ? item.nameAm : item.name;
                    return (
                      <article
                        key={item.id}
                        className="group flex flex-col overflow-hidden rounded-[22px] border border-[#18130b]/10 bg-[#fffdf9] shadow-[0_22px_50px_-34px_rgba(24,19,11,0.6)] transition duration-300 hover:-translate-y-1 hover:border-[#d7b46c]/70 hover:shadow-[0_30px_60px_-32px_rgba(24,19,11,0.55)]"
                      >
                        <div className="relative aspect-[5/4] overflow-hidden bg-[#efe4d0]">
                          {item.image ? (
                            <img src={item.image} alt={item.name} loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.05]" />
                          ) : (
                            <div className="flex h-full items-center justify-center font-display text-4xl text-[#a67f38]/40">{item.name.slice(0, 1)}</div>
                          )}
                          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#14100a]/35 via-transparent to-transparent opacity-70" />
                          <div className="absolute left-2.5 top-2.5 flex flex-wrap gap-1.5">
                            {item.isSignature && (
                              <span className="inline-flex items-center gap-1 rounded-full border border-[#e6cd97]/40 bg-[#14100a]/80 px-2 py-0.5 text-[8px] uppercase tracking-[0.18em] text-[#f0e2bf] backdrop-blur">
                                <Sparkles size={8} /> {L.signature}
                              </span>
                            )}
                            {item.spiceLevel > 0 && (
                              <span className="inline-flex items-center gap-0.5 rounded-full bg-[#fbf7ef]/90 px-1.5 py-0.5 text-[9px] text-[#9a4f1f] backdrop-blur">
                                {Array.from({ length: item.spiceLevel }).map((_, index) => (
                                  <Flame key={index} size={8} />
                                ))}
                              </span>
                            )}
                          </div>
                          {item.arEnabled && item.image && (
                            <button
                              type="button"
                              onClick={() => setArItem(item)}
                              className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 rounded-full border border-[#e6cd97]/40 bg-[#14100a]/80 px-2.5 py-1.5 text-[9.5px] font-medium text-[#f0e2bf] backdrop-blur transition hover:bg-[#14100a]"
                              aria-label={`${L.arPreview}: ${item.name}`}
                            >
                              <Camera size={11} /> AR
                            </button>
                          )}
                        </div>

                        <div className="flex flex-1 flex-col p-4">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-display text-[1.08rem] leading-snug">{title}</h3>
                            <p className="shrink-0 font-display text-[1.02rem] text-[#8a5f20]">{money(item.price)}</p>
                          </div>
                          {lang === 'am' && item.nameAm && <p className="mt-0.5 text-[10px] text-[#8a7452]">{item.name}</p>}
                          {item.description && <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-relaxed text-[#6d5b3d]">{item.description}</p>}
                          <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                            <span className="inline-flex items-center gap-1 text-[9.5px] text-[#8a7452]">
                              {item.prepMinutes > 0 && <><Clock3 size={10} /> {item.prepMinutes} {L.prep}</>}
                            </span>
                            <div className="flex items-center gap-1.5">
                              {item.arEnabled && item.image && (
                                <button
                                  type="button"
                                  onClick={() => setArItem(item)}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#a67f38]/30 text-[#8a5f20] transition hover:border-[#a67f38] hover:bg-[#a67f38]/5"
                                  aria-label={`${L.arPreview}: ${item.name}`}
                                >
                                  <Sparkles size={13} />
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={!canOrder}
                                onClick={() => setActiveItem(item)}
                                className="inline-flex h-8 items-center gap-1 rounded-full bg-[#18130b] px-3.5 text-[11px] font-medium text-[#f6ecd8] shadow-[inset_0_0_0_1px_rgba(216,180,117,0.25)] transition hover:bg-[#2c2418] hover:shadow-[inset_0_0_0_1px_rgba(216,180,117,0.55)] disabled:cursor-not-allowed disabled:opacity-35"
                              >
                                <Plus size={12} /> {L.add}
                              </button>
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}

        <footer className="mt-14 border-t border-[#d7b46c]/25 pt-7 text-center">
          <p className="font-display text-lg tracking-[0.42em] text-[#8a5f20]">NILE</p>
          <p className="mt-2 text-[9px] uppercase tracking-[0.26em] text-[#8a7452]/80">Four-star hospitality · Addis Ababa</p>
          <p className="mt-3 text-[9px] uppercase tracking-[0.2em] text-[#8a7452]/55">{L.demoNote}</p>
        </footer>
      </main>

      {cartCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#d8b475]/25 bg-[#14100a]/95 px-4 py-3 text-[#f8f2e5] shadow-[0_-20px_50px_-30px_rgba(8,6,3,0.85)] backdrop-blur-xl sm:px-6">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#d8b475]/35 bg-white/[0.05] text-[#f0e2bf]">
                <ShoppingBag size={16} />
                <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#d8b475] px-1 text-[8.5px] font-semibold text-[#14100a]">
                  {cartCount}
                </span>
              </span>
              <div>
                <p className="text-[9px] uppercase tracking-[0.24em] text-[#d8b475]/70">{L.yourOrder}</p>
                <p className="font-display text-lg leading-tight">{money(cartTotal)}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-[#d8b475] px-5 text-sm font-medium text-[#14100a] transition hover:bg-[#e6cd97]"
            >
              {L.viewOrder} <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      <ItemSheet
        item={activeItem}
        lang={lang}
        open={Boolean(activeItem)}
        onClose={() => setActiveItem(null)}
        onAdd={addLine}
      />

      <GuestSheet
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        title={L.yourOrder}
        subtitle={`${table.code} · ${table.areaName}`}
        footer={
          <div className="space-y-3">
            <div className="space-y-1 text-[11.5px]">
              <div className="flex justify-between text-[#6d5b3d]"><span>{L.subtotal}</span><span>{money(cartSubtotal)}</span></div>
              <div className="flex justify-between text-[#6d5b3d]"><span>{L.service} · {servicePct}%</span><span>{money(serviceFee)}</span></div>
              {taxPct > 0 && <div className="flex justify-between text-[#6d5b3d]"><span>{L.tax} · {taxPct}%</span><span>{money(taxFee)}</span></div>}
              <div className="flex items-end justify-between border-t border-[#d7b46c]/30 pt-2">
                <span className="text-[10px] uppercase tracking-[0.18em] text-[#8a7452]">{L.total}</span>
                <span className="font-display text-xl">{money(cartTotal)}</span>
              </div>
            </div>
            <SwipeToPlaceOrder
              disabled={submitting || !canOrder}
              loading={submitting}
              label={submitting ? (placingStep === 'opening' ? L.joinedAs : L.swipeToPlace) : L.swipeToPlace}
              onConfirm={placeOrder}
            />
            {!canOrder && <p className="text-center text-[10.5px] text-[#9a4f1f]">{scan.notice ?? L.tableClosed}</p>}
          </div>
        }
      >
        {cart.length === 0 ? (
          <div className="py-10 text-center">
            <ShoppingBag size={26} className="mx-auto text-[#8a7452]/50" />
            <p className="mt-3 font-display text-lg">{L.emptyCart}</p>
            <p className="mt-1 text-xs text-[#6d5b3d]">{L.emptyCartHint}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {cart.map((line) => {
              const title = lang === 'am' && line.nameAm ? line.nameAm : line.name;
              return (
                <div key={line.key} className="flex items-start gap-3 rounded-xl border border-[#d7b46c]/20 bg-[#fffdf9] p-3">
                  {line.image ? (
                    <img src={line.image} alt={line.name} className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-[#efe4d0] font-display text-lg text-[#a67f38]/60">
                      {line.name.slice(0, 1)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-medium leading-snug">{title}</p>
                    {line.addonNames.length > 0 && <p className="mt-0.5 text-[10px] text-[#8a7452]">{line.addonNames.join(' · ')}</p>}
                    {line.notes && <p className="mt-0.5 text-[10px] italic text-[#8a7452]">“{line.notes}”</p>}
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="flex items-center rounded-full border border-[#18130b]/12">
                        <button type="button" onClick={() => updateQty(line.key, -1)} className="inline-flex h-7 w-7 items-center justify-center text-[#6d5b3d]" aria-label="Decrease">
                          <Minus size={11} />
                        </button>
                        <span className="w-5 text-center text-[11.5px]">{line.qty}</span>
                        <button type="button" onClick={() => updateQty(line.key, 1)} className="inline-flex h-7 w-7 items-center justify-center text-[#6d5b3d]" aria-label="Increase">
                          <Plus size={11} />
                        </button>
                      </div>
                      <p className="text-[12px] font-medium">{money(line.unitPrice * line.qty)}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCart((current) => current.filter((entry) => entry.key !== line.key))}
                    className="shrink-0 text-[#8a7452] transition hover:text-[#9a4f1f]"
                    aria-label="Remove"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })}

            <div className="rounded-xl border border-[#d7b46c]/20 bg-[#fffdf9] p-3.5">
              <label className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8a7452]">
                {L.yourName}
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={L.nameHint}
                  className="mt-2 w-full rounded-lg border border-[#d7b46c]/30 px-3 py-2 text-[13px] font-normal normal-case tracking-normal outline-none focus:border-[#a67f38]"
                />
              </label>
              <label className="mt-3 block text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8a7452]">
                {L.orderNotes}
                <textarea
                  value={orderNotes}
                  onChange={(event) => setOrderNotes(event.target.value)}
                  placeholder={L.notesPlaceholder}
                  rows={2}
                  className="mt-2 w-full resize-none rounded-lg border border-[#d7b46c]/30 px-3 py-2 text-[12px] font-normal normal-case tracking-normal outline-none focus:border-[#a67f38]"
                />
              </label>
            </div>

            <button
              type="button"
              onClick={() => setCart([])}
              className="inline-flex items-center gap-1.5 text-[10.5px] text-[#8a7452] transition hover:text-[#9a4f1f]"
            >
              <Trash2 size={11} /> {L.clear}
            </button>
          </div>
        )}
      </GuestSheet>

      {lastOrder && showPaymentFlow && (
        <div className="fixed inset-0 z-[150] flex items-end justify-center bg-[#17120a]/55 p-2 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-[24px] border border-[#d7b46c]/30 bg-[#fffdf9] p-4 text-[#18130b] shadow-[0_30px_80px_-30px_rgba(18,13,8,0.7)] sm:rounded-[28px] sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[9px] uppercase tracking-[0.24em] text-[#8a7452]">Nile</p>
                <h2 className="mt-1 font-display text-xl sm:text-2xl">{L.choosePaymentMethod}</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowPaymentFlow(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#18130b]/10 text-[#6d5b3d]"
                aria-label="Close payment selector"
              >
                <X size={15} />
              </button>
            </div>

            <div className="mt-5 rounded-2xl border border-[#d7b46c]/25 bg-[#f6efd8] p-3">
              <div className="flex items-center justify-between gap-2 text-[11px] text-[#6d5b3d]">
                <span>{L.paymentSummary}</span>
                <span className="font-medium text-[#18130b]">{lastOrder.displayNo} · {table.code}</span>
              </div>
              <div className="mt-2 max-h-24 space-y-1 overflow-y-auto border-b border-[#d7b46c]/20 pb-2 text-[11px]">
                {lastOrder.items.map((item, index) => (
                  <div key={`${item.name}-${index}`} className="flex justify-between gap-3">
                    <span className="min-w-0 truncate text-[#6d5b3d]">{item.qty} × {item.name}</span>
                    <span className="shrink-0">{money(item.total)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 space-y-1 text-[10px] text-[#6d5b3d]">
                <div className="flex justify-between"><span>{L.subtotal}</span><span>{money(lastOrder.subtotal)}</span></div>
                <div className="flex justify-between"><span>{L.service}</span><span>{money(lastOrder.serviceCharge)}</span></div>
                {lastOrder.tax > 0 && <div className="flex justify-between"><span>{L.tax}</span><span>{money(lastOrder.tax)}</span></div>}
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-[0.18em] text-[#8a7452]">Total</span>
                <span className="font-display text-xl sm:text-2xl">{money(lastOrder.total)}</span>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {paymentChoices.map((method) => {
                const active = selectedPayment === method.id;
                return (
                  <button
                    key={method.id}
                    type="button"
                    onClick={() => setSelectedPayment(method.id)}
                    aria-pressed={active}
                    className={`relative flex min-h-24 min-w-0 flex-col items-center justify-center gap-2 rounded-xl border p-2 text-center transition sm:min-h-28 sm:rounded-2xl sm:p-3 ${
                      active ? 'border-[#a67f38] bg-[#f8f0dc] shadow-[0_10px_20px_-18px_rgba(166,127,56,0.9)]' : 'border-[#18130b]/10 bg-white hover:border-[#18130b]/20'
                    }`}
                  >
                    <PaymentMethodLogo method={method.id} />
                    <span className="max-w-full text-[10px] font-medium leading-tight sm:text-[11px]">{method.name}</span>
                    {active && (
                      <span className="absolute right-1.5 top-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#18130b] text-[#fffdf9]">
                        <CheckCircle2 size={11} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {selectedPayment && (
              <p className="mt-2 rounded-xl bg-[#f6efd8] px-3 py-2 text-[10px] leading-relaxed text-[#6d5b3d]">
                {paymentChoices.find((method) => method.id === selectedPayment)?.hint}
              </p>
            )}
            <p className="mt-2 text-[9.5px] leading-relaxed text-[#8a7452]">{L.paymentNotice}</p>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setShowPaymentFlow(false)}
                className="rounded-full border border-[#18130b]/12 bg-white px-4 py-2.5 text-[10px] font-medium uppercase tracking-[0.12em] text-[#5d4c34] sm:text-[11px] sm:tracking-[0.18em]"
              >
                {L.close}
              </button>
              <Link
                to={`/menu/scan/${token}/track/${lastOrder.orderNo}`}
                onClick={() => setShowPaymentFlow(false)}
                className="flex flex-1 items-center justify-center gap-2 rounded-full bg-[#18130b] px-4 py-2.5 text-center text-[10px] font-medium uppercase tracking-[0.12em] text-[#f8f2e5] sm:text-[11px] sm:tracking-[0.18em]"
              >
                {L.continueToOrder} <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </div>
      )}

      <GuestSheet
        open={tableOpen}
        onClose={() => setTableOpen(false)}
        title={L.myTable}
        subtitle={session ? `${session.code} · ${table.code} · ${table.areaName}` : `${table.code} · ${table.areaName}`}
        footer={
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => callTeam('waiter')}
              disabled={callBusy === 'waiter'}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full border border-[#a67f38]/40 text-[11.5px] font-medium transition hover:bg-[#a67f38]/[0.08] disabled:opacity-50"
            >
              <ConciergeBell size={13} /> {L.callWaiter}
            </button>
            <button
              type="button"
              onClick={() => callTeam('bill')}
              disabled={callBusy === 'bill'}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-[#b98f45] text-[11.5px] font-medium text-[#14100a] transition hover:bg-[#c9a45c] disabled:opacity-50"
            >
              <ReceiptText size={13} /> {L.requestBill}
            </button>
          </div>
        }
      >
        {callMessage && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-[#6fae8c]/30 bg-[#dff0e5] px-3 py-2 text-[11.5px] text-[#2f6b4b]">
            <BellRing size={13} /> {callMessage}
          </div>
        )}

        {!summary ? (
          <div className="py-8 text-center">
            <ReceiptText size={24} className="mx-auto text-[#8a7452]/50" />
            <p className="mt-3 text-sm text-[#6d5b3d]">{L.noOrders}</p>
            <button type="button" onClick={() => setTableOpen(false)} className="mt-3 rounded-full border border-[#a67f38]/40 px-4 py-1.5 text-[11px] text-[#8a5f20]">
              {L.browse}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8a7452]">{L.tableOrders}</p>
              <div className="mt-2 space-y-2">
                {summary.orders.length === 0 && <p className="text-[11.5px] text-[#6d5b3d]">{L.noOrders}</p>}
                {summary.orders.map((order) => (
                  <div key={order.id} className="flex items-center justify-between gap-3 rounded-xl border border-[#d7b46c]/20 bg-[#fffdf9] px-3 py-2.5">
                    <div>
                      <p className="text-[12px] font-medium">{order.displayNo} · {order.itemCount} {L.items}</p>
                      <p className="mt-0.5 text-[10px] text-[#8a7452]">{new Date(order.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    <div className="text-right">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-medium ${guestStatusTone[order.status]}`}>
                        {orderStatusMeta[order.status]?.label ?? order.status}
                      </span>
                      <p className="mt-1 text-[11px]">{money(order.total)}</p>
                    </div>
                  </div>
                ))}
              </div>
              <Link
                to={summary.orders.length ? `/menu/scan/${token}/track/${summary.orders[summary.orders.length - 1].orderNo}` : '#'}
                onClick={(event) => {
                  if (!summary.orders.length) event.preventDefault();
                  else setTableOpen(false);
                }}
                className="mt-2 inline-flex items-center gap-1 text-[10.5px] text-[#8a5f20]"
              >
                {L.trackOrder} <ChevronRight size={11} />
              </Link>
            </div>

            {sessionBill && (
              <div className="rounded-xl border border-[#d7b46c]/25 bg-[#f4ecdd]/50 p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8a7452]">{L.bill}</p>
                  <span className="text-[9px] uppercase tracking-[0.12em] text-[#8a5f20]">
                    {sessionBill.balance <= 0.009 ? L.settled : L.billDue}
                  </span>
                </div>
                <div className="mt-2.5 space-y-1 text-[11.5px]">
                  <div className="flex justify-between text-[#6d5b3d]"><span>{L.subtotal}</span><span>{money(sessionBill.subtotal)}</span></div>
                  <div className="flex justify-between text-[#6d5b3d]"><span>{L.service}</span><span>{money(sessionBill.serviceCharge)}</span></div>
                  {sessionBill.tax > 0 && <div className="flex justify-between text-[#6d5b3d]"><span>{L.tax}</span><span>{money(sessionBill.tax)}</span></div>}
                  <div className="flex justify-between text-[#2f6b4b]"><span>{L.payments}</span><span>-{money(sessionBill.paid)}</span></div>
                  <div className="flex items-end justify-between border-t border-[#d7b46c]/30 pt-2">
                    <span className="text-[10px] uppercase tracking-[0.16em] text-[#8a7452]">{sessionBill.balance > 0.009 ? L.billDue : L.total}</span>
                    <span className="font-display text-lg">{money(Math.max(0, sessionBill.balance))}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </GuestSheet>

      <ARPreview
        open={Boolean(arItem)}
        onClose={() => setArItem(null)}
        dish={{ name: arItem?.name ?? '', nameAm: arItem?.nameAm ?? null, image: arItem?.image ?? null }}
      />

      <GuestSheet
        open={Boolean(lastOrder) && !showPaymentFlow}
        onClose={() => setLastOrder(null)}
        title={L.orderPlaced}
        subtitle={lastOrder ? `${lastOrder.displayNo} · ${table.code}` : undefined}
        footer={
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setLastOrder(null)}
              className="inline-flex h-10 items-center justify-center rounded-full border border-[#a67f38]/40 text-[11.5px] font-medium transition hover:bg-[#a67f38]/[0.08]"
            >
              {L.orderMore}
            </button>
            <Link
              to={lastOrder ? `/menu/scan/${token}/track/${lastOrder.orderNo}` : '#'}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-[#b98f45] text-[11.5px] font-medium text-[#14100a] transition hover:bg-[#c9a45c]"
            >
              {L.trackOrder} <ArrowRight size={13} />
            </Link>
          </div>
        }
      >
        {lastOrder && (
          <div className="py-2 text-center">
            <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#dff0e5] text-[#2f6b4b]">
              <CheckCircle2 size={26} />
            </span>
            <p className="mt-3 font-display text-2xl">{lastOrder.displayNo}</p>
            <p className="mt-1 text-[12px] leading-relaxed text-[#6d5b3d]">{L.orderPlacedHint}</p>
            <p className="mt-3 font-display text-xl text-[#8a5f20]">{money(lastOrder.total)}</p>
            <span className={`mt-2 inline-block rounded-full px-2.5 py-1 text-[10px] font-medium ${guestStatusTone[lastOrder.status]}`}>
              {orderStatusMeta[lastOrder.status]?.label ?? lastOrder.status}
            </span>
          </div>
        )}
      </GuestSheet>
    </div>
  );
}
