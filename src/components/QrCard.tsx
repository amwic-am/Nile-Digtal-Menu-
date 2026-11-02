import { cn } from './ui';

export function QrCard({
  code,
  area,
  floor,
  scanUrl,
  dataUrl,
  compact,
  className,
}: {
  code: string;
  area: string;
  floor?: string;
  scanUrl: string;
  dataUrl: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border border-gold-500/45 bg-[#f7f1e6] text-[#15120c] shadow-2xl',
        compact ? 'p-4' : 'p-6',
        className,
      )}
    >
      <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full border border-gold-500/20" />
      <div className="pointer-events-none absolute -bottom-14 -left-10 h-36 w-36 rounded-full border border-gold-500/15" />
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className={cn('font-display tracking-[0.18em]', compact ? 'text-base' : 'text-lg')}>NILE</p>
            <p className="mt-0.5 text-[7px] font-semibold uppercase tracking-[0.3em] text-[#a67f38]">Hotel Restaurant</p>
          </div>
          <p className="text-right text-[7.5px] uppercase tracking-[0.18em] text-[#8a7452]">
            {area}
            {floor ? <span className="block normal-case tracking-normal">{floor}</span> : null}
          </p>
        </div>

        <div className="mt-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-[7.5px] font-semibold uppercase tracking-[0.24em] text-[#8a7452]">Table</p>
            <p className={cn('font-display leading-none', compact ? 'text-3xl' : 'text-4xl')}>{code}</p>
          </div>
          <div className={cn('rounded-xl border border-[#d7b46c]/60 bg-white p-1.5', compact ? 'h-[86px] w-[86px]' : 'h-[112px] w-[112px]')}>
            <img src={dataUrl} alt={`QR code for table ${code}`} className="h-full w-full" />
          </div>
        </div>

        <div className="mt-4 border-t border-[#15120c]/10 pt-3">
          <p className="text-[11px] font-semibold tracking-[0.01em]">Scan to view our menu</p>
          <p className="mt-0.5 text-[8.5px] text-[#6d5b3d]">Order directly from your table</p>
          <p className="mt-2 truncate font-mono text-[7px] text-[#8a7452]">{scanUrl.replace(/^https?:\/\//, '')}</p>
        </div>
      </div>
    </div>
  );
}
