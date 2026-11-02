type WaveLoaderProps = {
  fullscreen?: boolean;
  label?: string;
};

const wavePaths = [
  {
    className: 'wave-track-slow h-[86%] opacity-90',
    fill: 'rgba(181, 139, 70, 0.13)',
    d: 'M0,192L60,181.3C120,171,240,149,360,154.7C480,160,600,192,720,192C840,192,960,160,1080,149.3C1200,139,1320,149,1380,154.7L1440,160L1440,320L1380,320C1320,320,1200,320,1080,320C960,320,840,320,720,320C600,320,480,320,360,320C240,320,120,320,60,320L0,320Z',
  },
  {
    className: 'wave-track h-[68%] opacity-90',
    fill: 'rgba(111, 135, 103, 0.12)',
    d: 'M0,224L60,213.3C120,203,240,181,360,186.7C480,192,600,224,720,229.3C840,235,960,213,1080,197.3C1200,181,1320,171,1380,165.3L1440,160L1440,320L1380,320C1320,320,1200,320,1080,320C960,320,840,320,720,320C600,320,480,320,360,320C240,320,120,320,60,320L0,320Z',
  },
  {
    className: 'wave-track-fast h-[52%] opacity-95',
    fill: 'rgba(180, 85, 46, 0.10)',
    d: 'M0,256L60,261.3C120,267,240,277,360,266.7C480,256,600,224,720,224C840,224,960,256,1080,266.7C1200,277,1320,267,1380,261.3L1440,256L1440,320L1380,320C1320,320,1200,320,1080,320C960,320,840,320,720,320C600,320,480,320,360,320C240,320,120,320,60,320L0,320Z',
  },
];

function Waves() {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[48vh] min-h-[280px] overflow-hidden" aria-hidden="true">
      {wavePaths.map((wave) => (
        <div key={wave.className} className={`absolute inset-x-0 bottom-0 flex w-[200%] ${wave.className}`}>
          <svg className="h-full w-1/2" viewBox="0 0 1440 320" preserveAspectRatio="none">
            <path fill={wave.fill} d={wave.d} />
          </svg>
          <svg className="h-full w-1/2" viewBox="0 0 1440 320" preserveAspectRatio="none">
            <path fill={wave.fill} d={wave.d} />
          </svg>
        </div>
      ))}
    </div>
  );
}

function WaveStrip() {
  return (
    <div className="relative h-9 w-52 overflow-hidden rounded-full border border-gold-400/15 bg-white/60" aria-hidden="true">
      <div className="wave-track-fast absolute inset-y-0 left-0 flex w-[200%]">
        {[0, 1].map((copy) => (
          <svg key={copy} className="h-full w-1/2" viewBox="0 0 400 80" preserveAspectRatio="none">
            <path
              fill="rgba(181, 139, 70, 0.22)"
              d="M0,48L25,42.7C50,37,100,27,150,29.3C200,32,250,48,300,50.7C350,53,400,43,425,37.3L450,32L450,80L0,80Z"
            />
            <path
              fill="rgba(111, 135, 103, 0.20)"
              d="M0,60L25,56C50,52,100,44,150,45.3C200,47,250,59,300,61.3C350,64,400,59,425,56L450,53L450,80L0,80Z"
            />
          </svg>
        ))}
      </div>
    </div>
  );
}

export function WaveLoader({ fullscreen = false, label = 'Setting the table' }: WaveLoaderProps) {
  const content = (
    <div
      className={
        fullscreen
          ? 'relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-ink-950'
          : 'relative flex min-h-[45vh] w-full items-center justify-center'
      }
    >
      {fullscreen && (
        <>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_520px_at_18%_-10%,rgba(181,139,70,0.14),transparent_62%),radial-gradient(760px_460px_at_100%_10%,rgba(180,85,46,0.08),transparent_58%)]" />
          <Waves />
        </>
      )}

      <div className="relative z-10 flex flex-col items-center gap-5 px-6 text-center">
        <div className="relative flex h-16 w-16 items-center justify-center rounded-full border border-gold-400/45 bg-white shadow-[0_18px_44px_-24px_rgba(120,91,40,0.55)]">
          <span className="absolute inset-0 animate-ping rounded-full border border-gold-400/30 opacity-30" />
          <span className="font-display text-[1.7rem] leading-none text-gold-500">N</span>
        </div>

        <div>
          <p className={`font-display tracking-[0.26em] text-cream-50 ${fullscreen ? 'text-2xl' : 'text-lg'}`}>NILE</p>
          <p className="mt-1 text-[8.5px] uppercase tracking-[0.34em] text-gold-500/80">Restaurant OS</p>
        </div>

        <div className="flex flex-col items-center gap-2.5">
          <span className="text-[10px] uppercase tracking-[0.22em] text-cream-100/45">{label}</span>
          <span className="relative h-1 w-32 overflow-hidden rounded-full bg-ink-950/10">
            <span className="loader-sweep-bar absolute inset-y-0 left-0 w-1/3 rounded-full bg-gold-400" />
          </span>
        </div>

        {!fullscreen && <WaveStrip />}
      </div>
    </div>
  );

  if (fullscreen) {
    return <div className="fixed inset-0 z-[300] bg-ink-950">{content}</div>;
  }
  return content;
}
