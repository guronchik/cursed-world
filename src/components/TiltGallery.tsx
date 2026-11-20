// TiltGallery (B4): стопка карточек с 3D-наклоном, которая при прокрутке летит по диагонали.
// Высокая область прокрутки + sticky-сцена (нативный скролл, без скролл-джекинга). На элемент ≈ 70vh прокрутки,
// дробный индекс p = прокрутка / шаг, активный = round(p), мягкий snap после остановки.
// Справа список названий, слева мета активного (crossfade с размытием), внизу счётчик «04 /26», точки цветов, «N shown ▸».
// Рендерятся только карточки с |o| ≤ 3. Reduced motion — без наклона, параллакса и blur.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useMedia } from '../lib/hooks';
import { animWindow, blurPx, motionState } from '../lib/motion';
import { L } from '../lib/runtime';
import { play as sound } from '../lib/sound';
import { BlurText } from './BlurText';
import { Icon } from './Icon';

export interface TiltGalleryProps<T> {
  items: T[];
  getId: (t: T) => string;
  getTitle: (t: T) => string;
  getSubtitle?: (t: T) => string;
  /** URL картинки (webp/blob) или готовый узел для карточки. */
  getImage?: (t: T) => string | ReactNode | undefined;
  renderMeta?: (t: T) => ReactNode;
  getColor?: (t: T) => string;
  onOpen: (t: T, index: number) => void;
  /** Наполнение поповера «N shown ▸» (фильтры). */
  filters?: ReactNode;
  total?: number;
  accent?: string;
  empty?: ReactNode;
  /** Вызывается при смене активной карточки (например, превью обоев). */
  onActive?: (t: T, index: number) => void;
  label?: string;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

function Digits({ value }: { value: string }) {
  return (
    <span className="tg-digits" aria-hidden>
      {value.split('').map((d, i) => (
        <span key={i} className="tg-digit">
          <span className="tg-digit-col" style={{ transform: `translate3d(0, ${-Number(d) * 10}%, 0)` }}>
            {'0123456789'.split('').map((x) => (
              <span key={x}>{x}</span>
            ))}
          </span>
        </span>
      ))}
    </span>
  );
}

function CardImage({ src, title, color }: { src?: string; title: string; color: string }) {
  const [ok, setOk] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    setOk(false);
    const img = ref.current;
    if (!img || !src) return;
    let alive = true;
    const done = () => alive && setOk(true);
    if (img.complete && img.naturalWidth) void img.decode().then(done, done);
    else img.onload = () => void img.decode().then(done, done);
    return () => {
      alive = false;
    };
  }, [src]);
  return (
    <div className="absolute inset-0" style={{ background: `linear-gradient(150deg, color-mix(in srgb, ${color} 55%, #000), #0b0b10)` }}>
      {src && <img ref={ref} src={src} alt="" decoding="async" draggable={false} className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${ok ? 'opacity-100' : 'opacity-0'}`} />}
      {!src && <div className="absolute inset-0 grid place-items-center text-white/80 text-[42px]" style={{ fontFamily: 'var(--font-head)' }}>{title.slice(0, 1)}</div>}
    </div>
  );
}

export function TiltGallery<T>({ items, getId, getTitle, getSubtitle, getImage, renderMeta, getColor, onOpen, filters, total, accent, empty, onActive, label }: TiltGalleryProps<T>) {
  const mobile = useMedia('(max-width: 767px), (pointer: coarse)');
  const wrap = useRef<HTMLDivElement>(null);
  const [p, setP] = useState(0);
  const [touched, setTouched] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const n = items.length;
  const reduce = motionState.level === 'off' || motionState.level === 'minimal' || motionState.reduce;
  const stepPx = () => window.innerHeight * 0.7;
  const active = Math.max(0, Math.min(n - 1, Math.round(p)));
  const lastActive = useRef(-1);

  // прокрутка → дробный индекс
  useLayoutEffect(() => {
    let raf = 0;
    let idle = 0;
    const calc = () => {
      raf = 0;
      const el = wrap.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      const v = Math.max(0, Math.min(n - 1, -top / stepPx()));
      setP(v);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(calc);
      setTouched(true);
      animWindow(400);
      window.clearTimeout(idle);
      idle = window.setTimeout(snap, 160);
    };
    const snap = () => {
      const el = wrap.current;
      if (!el || n < 2) return;
      const top = el.getBoundingClientRect().top;
      const raw = -top / stepPx();
      if (raw < -0.4 || raw > n - 0.6) return; // вне сцены
      const target = Math.round(Math.max(0, Math.min(n - 1, raw)));
      const frac = Math.abs(raw - target);
      if (frac > 0.02 && frac < 0.4) window.scrollTo({ top: window.scrollY + (target - raw) * stepPx(), behavior: reduce ? 'auto' : 'smooth' });
    };
    calc();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', calc);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', calc);
      cancelAnimationFrame(raf);
      window.clearTimeout(idle);
    };
  }, [n, reduce]);

  useEffect(() => {
    if (!n || active === lastActive.current) return;
    if (lastActive.current >= 0) {
      if (mobile) navigator.vibrate?.(8);
      sound('click');
    }
    lastActive.current = active;
    onActive?.(items[active], active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, n]);

  const scrollToIndex = (i: number) => {
    const el = wrap.current;
    if (!el) return;
    const base = window.scrollY + el.getBoundingClientRect().top;
    window.scrollTo({ top: base + Math.max(0, Math.min(n - 1, i)) * stepPx(), behavior: reduce ? 'auto' : 'smooth' });
  };

  const k = mobile ? 0.6 : 1;
  const cardTransform = (o: number) => {
    if (reduce) return { transform: 'none', opacity: Math.abs(o) < 0.5 ? 1 : 0, filter: 'none' };
    const a = Math.abs(o);
    const tx = -o * 14 * k;
    const ty = o * 18 * k;
    const tz = -a * 120;
    const ry = -o * 18 * k;
    const rz = o * 4 * k;
    const sc = 1 - a * 0.08;
    const lift = hover && a < 0.5 && !mobile ? ' translate3d(0,-10px,30px)' : '';
    return {
      transform: `perspective(1400px) translate3d(${tx}vw, ${ty}vh, ${tz}px) rotateY(${ry}deg) rotateZ(${rz}deg) scale(${sc})${lift}`,
      opacity: 1 - Math.min(a, 3) / 3.5,
      filter: a > 0.6 && !mobile ? `blur(${blurPx(Math.min(4, a * 1.5))}px)` : 'none',
    };
  };

  const visible = useMemo(() => items.map((t, i) => ({ t, i, o: i - p })).filter((x) => Math.abs(x.o) <= 3), [items, p]);
  const sceneH = mobile ? 'calc(100dvh - 150px)' : 'calc(100dvh - 40px)';
  const totalN = total ?? n;

  if (!n)
    return (
      <div className="tg-empty">
        {empty || L('Пусто', 'Nothing here')}
        {filters && <div className="mt-4">{filters}</div>}
      </div>
    );

  const cur = items[active];
  const card = (x: { t: T; i: number; o: number }) => {
    const img = getImage?.(x.t);
    const st = cardTransform(x.o);
    const isActive = x.i === active;
    return (
      <button
        key={getId(x.t)}
        className={`tg-card ${isActive ? 'tg-card-active' : ''}`}
        style={{ ...st, zIndex: 100 - Math.round(Math.abs(x.o) * 10) }}
        data-cursor={isActive ? 'Open' : undefined}
        tabIndex={-1}
        aria-hidden={!isActive}
        onMouseEnter={() => isActive && setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={() => (isActive ? onOpen(x.t, x.i) : scrollToIndex(x.i))}
      >
        {typeof img === 'string' || img === undefined ? <CardImage src={img as string | undefined} title={getTitle(x.t)} color={getColor?.(x.t) || accent || '#5e5ce6'} /> : <div className="absolute inset-0">{img}</div>}
        <span className="tg-card-shade" />
        <span className="tg-card-title">{getTitle(x.t)}</span>
      </button>
    );
  };

  const rowH = mobile ? 0 : 54;
  return (
    <div
      ref={wrap}
      className="tg"
      style={{ height: `calc(${(n - 1) * 70}vh + ${sceneH})` }}
      tabIndex={0}
      role="listbox"
      aria-label={label || L('Галерея', 'Gallery')}
      aria-activedescendant={cur ? `tg-${getId(cur)}` : undefined}
      onKeyDown={(e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
          e.preventDefault();
          scrollToIndex(active + 1);
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
          e.preventDefault();
          scrollToIndex(active - 1);
        } else if (e.key === 'Enter' && cur) onOpen(cur, active);
      }}
    >
      <div className={`tg-scene ${mobile ? 'tg-mobile' : ''}`} style={{ height: sceneH }}>
        {/* большой счётчик */}
        <div className="tg-counter" aria-live="polite" aria-atomic>
          <Digits value={pad2(active + 1)} />
          <span className="tg-counter-of">/{pad2(totalN)}</span>
          <span className="sr-only">{`${active + 1} / ${totalN}: ${cur ? getTitle(cur) : ''}`}</span>
        </div>

        {/* сцена с карточками */}
        <div className="tg-stage">
          {visible.map(card)}
        </div>

        {!mobile ? (
          <>
            {/* слева — мета активного */}
            <div className="tg-meta">
              {cur && (
                <div key={getId(cur)} className="tg-meta-in">
                  {renderMeta?.(cur)}
                </div>
              )}
            </div>
            {/* справа — список названий */}
            <div className="tg-list" aria-hidden>
              <div className="tg-list-rail" style={{ transform: `translate3d(0, ${-(p + 0.5) * rowH}px, 0)` }}>
                {items.map((t, i) => {
                  const a = Math.abs(i - p);
                  if (a > 7) return <div key={getId(t)} style={{ height: rowH }} />;
                  return (
                    <button key={getId(t)} id={`tg-${getId(t)}`} className="tg-row" style={{ height: rowH, opacity: a < 0.5 ? 1 : a < 1.5 ? 0.25 : 0.08, filter: a >= 0.5 && !reduce ? `blur(${blurPx(2)}px)` : 'none' }} onClick={() => scrollToIndex(i)} tabIndex={-1}>
                      <span className="tg-row-title">{getTitle(t)}</span>
                      {getSubtitle && <span className="tg-row-sub">{getSubtitle(t)}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <div className="tg-mobile-info">
            {cur && (
              <div key={getId(cur)}>
                <BlurText as="div" className="text-[20px] font-bold leading-tight" text={getTitle(cur)} blur={6} />
                {getSubtitle && <BlurText as="div" className="text-[13px] text-muted mt-1" text={getSubtitle(cur)} blur={6} delay={80} />}
                {renderMeta && <div className="tg-chips mt-2">{renderMeta(cur)}</div>}
              </div>
            )}
          </div>
        )}

        {/* точки цветов */}
        {getColor && (
          <div className="tg-dots" aria-hidden>
            {items.slice(0, 40).map((t, i) => (
              <span key={getId(t)} className={i === active ? 'tg-dot tg-dot-on' : 'tg-dot'} style={{ background: getColor(t) }} />
            ))}
          </div>
        )}

        {!touched && (
          <div className="tg-hint" aria-hidden>
            <Icon name="down" size={13} /> Scroll
          </div>
        )}
        <button className="tg-shown" onClick={() => setFilterOpen((f) => !f)} aria-expanded={filterOpen}>
          {n} {L('показано', 'shown')} <Icon name={filterOpen ? 'down' : 'right'} size={12} />
        </button>
        {filterOpen && filters && <div className="tg-filters">{filters}</div>}
      </div>
    </div>
  );
}
