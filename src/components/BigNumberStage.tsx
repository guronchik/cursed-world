// BigNumberStage (B6): огромные полупрозрачные цифры по бокам, между ними слово, по центру аватар/сигил.
// При входе «крышка» аватара приподнимается, из центра по одной (stagger 90 мс, пружина, лёгкое вращение)
// вылетают иконки, потом парят (3–5 с, ±6px). Размер и яркость — от прогресса, выполненное «гаснет» с галочкой.
// При скролле цифры расходятся параллаксом, иконки разлетаются дальше. Reduced motion — без параллакса и вращения.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useMedia } from '../lib/hooks';
import { useBlobUrl } from '../lib/media';
import { motionState, play } from '../lib/motion';
import { useSettings } from '../lib/settings';
import { Icon } from './Icon';

export interface StageItem {
  id: string;
  icon: ReactNode;
  label: string;
  progress: number; // 0..1
  done?: boolean;
  color?: string;
  onClick?: () => void;
}

/** Оригинальный сигил-аватар: печать с «крышкой», которая приподнимается. */
function Sigil({ lidRef }: { lidRef: { current: SVGGElement | null } }) {
  return (
    <svg viewBox="0 0 200 220" className="w-full h-full" aria-hidden>
      <defs>
        <linearGradient id="bns-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent-1)" />
          <stop offset="1" stopColor="var(--accent-2)" />
        </linearGradient>
      </defs>
      <circle cx="100" cy="125" r="78" fill="none" stroke="url(#bns-g)" strokeWidth="3" strokeDasharray="4 7" opacity="0.6" />
      <path d="M40 130 Q100 210 160 130 L160 118 Q100 150 40 118 Z" fill="url(#bns-g)" opacity="0.9" />
      <circle cx="100" cy="128" r="52" fill="color-mix(in srgb, var(--accent-1) 18%, #0b0b10)" stroke="url(#bns-g)" strokeWidth="3" />
      <text x="100" y="146" textAnchor="middle" fontSize="48" fill="url(#bns-g)" style={{ fontFamily: 'serif' }}>
        呪
      </text>
      <g ref={lidRef} style={{ transformOrigin: '60px 92px', transformBox: 'view-box' } as CSSProperties}>
        <path d="M44 96 Q100 40 156 96 Z" fill="url(#bns-g)" />
        <rect x="38" y="94" width="124" height="9" rx="4.5" fill="url(#bns-g)" />
        <circle cx="100" cy="58" r="6" fill="var(--accent-text)" />
      </g>
    </svg>
  );
}

export function BigNumberStage({ left, right, mid = '·', items, caption, children }: { left: string; right: string; mid?: string; items: StageItem[]; caption?: ReactNode; children?: ReactNode }) {
  const s = useSettings();
  const avatar = useBlobUrl(s.avatarBlobId);
  const mobile = useMedia('(max-width: 767px)');
  const root = useRef<HTMLDivElement>(null);
  const lid = useRef<SVGGElement | null>(null);
  const av = useRef<HTMLDivElement>(null);
  const [spread, setSpread] = useState(0);
  const [settled, setSettled] = useState(false);
  const reduce = motionState.level === 'off' || motionState.level === 'minimal' || motionState.reduce;

  // позиции иконок по орбите (верхняя полуокружность и бока)
  const pos = items.map((_, i) => {
    const n = Math.max(1, items.length);
    const a = Math.PI * (1.05 + (0.9 * (i + 0.5)) / n) + (i % 2 ? 0.08 : -0.08);
    const r = (mobile ? 0.3 : 0.3) * (1 + (i % 3) * 0.12);
    return { x: Math.cos(a) * r, y: Math.sin(a) * r * (mobile ? 1.1 : 0.9) };
  });

  // вход: крышка приподнимается, иконки вылетают по одной
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    setSettled(false);
    if (reduce) {
      setSettled(true);
      return;
    }
    void play(lid.current as unknown as Element, [{ transform: 'none' }, { transform: 'translate(0px, -26px) rotate(-14deg)' }], { duration: 650, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)', delay: 150 });
    void play(av.current, [{ transform: 'translate3d(0, 24px, 0) scale(0.92)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 600, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', clear: true });
    const nodes = Array.from(el.querySelectorAll<HTMLElement>('[data-orb]'));
    const anims = nodes.map((n, i) => {
      const rot = (i % 2 ? 1 : -1) * (8 + (i % 4) * 4);
      return play(n, [{ transform: `translate(-50%, -50%) translate3d(0, 0, 0) scale(0.2) rotate(${rot * 3}deg)`, opacity: 0 }, { transform: 'translate(-50%, -50%) scale(1) rotate(0deg)', opacity: 1 }], { duration: 750, delay: 420 + i * 90, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)', clear: true });
    });
    void Promise.all(anims).then(() => setSettled(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, reduce]);

  // скролл: цифры расходятся, иконки разлетаются дальше
  useEffect(() => {
    if (reduce) return;
    let raf = 0;
    const on = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const el = root.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        setSpread(Math.max(0, Math.min(1, -r.top / Math.max(1, r.height))));
      });
    };
    window.addEventListener('scroll', on, { passive: true });
    return () => {
      window.removeEventListener('scroll', on);
      cancelAnimationFrame(raf);
    };
  }, [reduce]);

  const k = 1 + spread * 0.9;
  return (
    <div ref={root} className={`bns ${mobile ? 'bns-m' : ''}`}>
      <div className="bns-num bns-left" style={{ transform: reduce ? undefined : `translate3d(${-spread * 18}vw, 0, 0)` }} aria-hidden>
        {left}
      </div>
      <div className="bns-num bns-right" style={{ transform: reduce ? undefined : `translate3d(${spread * 18}vw, 0, 0)` }} aria-hidden>
        {right}
      </div>
      <div className="bns-mid" aria-hidden>
        {mid}
      </div>
      <div ref={av} className="bns-avatar">
        {avatar ? <img src={avatar} alt="" className="w-full h-full object-contain bns-bob" /> : <Sigil lidRef={lid} />}
      </div>
      <div className="bns-orbit">
        {items.map((it, i) => {
          const p = pos[i];
          const size = 0.78 + Math.max(0, Math.min(1, it.progress)) * 0.42;
          return (
            <button
              key={it.id}
              data-orb
              className={`bns-orb ${settled && !reduce ? 'bns-float' : ''} ${it.done ? 'bns-done' : ''}`}
              style={{ left: `${50 + p.x * 100 * k}%`, top: `${(mobile ? 56 : 48) + p.y * 100 * k}%`, ['--s' as string]: size, ['--fd' as string]: `${3 + (i % 5) * 0.5}s`, ['--fdl' as string]: `${(i % 4) * -0.7}s`, ['--c' as string]: it.color || 'var(--accent-1)', opacity: it.done ? 0.45 : 0.55 + it.progress * 0.45 }}
              onClick={it.onClick}
              title={it.label}
              aria-label={`${it.label} — ${Math.round(it.progress * 100)}%`}
              data-cursor="Open"
            >
              <span className="bns-orb-ic">{it.icon}</span>
              {it.done && (
                <span className="bns-check">
                  <Icon name="check" size={11} />
                </span>
              )}
              <span className="bns-orb-label">{it.label}</span>
            </button>
          );
        })}
      </div>
      {caption && <div className="bns-caption">{caption}</div>}
      {children}
    </div>
  );
}
