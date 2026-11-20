// DeskCard (B7): карточки «на столе» поверх страницы — светлые и тёмные, со случайным поворотом.
// Появляются пружиной из точки нажатия, таскаются с инерцией в пределах экрана (или стола), нажатие выводит наверх,
// до 5 карточек (на телефоне до 3), закрытие кнопкой «Close ×» или Esc — карточка улетает с поворотом.
// Нажатие вне карточки её НЕ закрывает.
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { blurPx, CSS_EASE_OUT, motionState, play } from '../lib/motion';
import { L } from '../lib/runtime';
import { play as sound } from '../lib/sound';
import { Icon } from './Icon';

export type DeskVariant = 'light' | 'dark';

export function DeskCard({
  variant = 'light',
  x,
  y,
  rot,
  z,
  width = 320,
  origin,
  bounds,
  onFront,
  onMove,
  onClose,
  title,
  children,
}: {
  variant?: DeskVariant;
  x: number;
  y: number;
  rot: number;
  z: number;
  width?: number;
  origin?: { x: number; y: number };
  /** Контейнер-стол; без него карточка ограничена окном. */
  bounds?: { current: HTMLElement | null };
  onFront: () => void;
  onMove?: (x: number, y: number) => void;
  onClose?: () => void;
  title?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pos = useRef({ x, y });
  const [p, setP] = useState({ x, y });
  const closing = useRef(false);

  useEffect(() => {
    pos.current = { x, y };
    setP({ x, y });
  }, [x, y]);

  // появление: из точки нажатия, scale 0.6→1, y +40→0, blur 6→0
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const dx = origin ? origin.x - (x + width / 2) : 0;
    const dy = origin ? origin.y - (y + 80) : 40;
    const b = blurPx(6);
    void play(el, [{ opacity: 0, transform: `translate3d(${dx}px, ${dy + 40}px, 0) scale(0.6) rotate(${rot * 2}deg)`, filter: `blur(${b}px)` }, { opacity: 1, transform: `rotate(${rot}deg)`, filter: 'blur(0px)' }], { duration: motionState.level === 'cinematic' ? 650 : 250, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)', clear: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clamp = (nx: number, ny: number) => {
    const el = ref.current;
    const box = bounds?.current?.getBoundingClientRect();
    const w = el?.offsetWidth || width;
    const h = el?.offsetHeight || 200;
    const maxX = (box ? box.width : window.innerWidth) - Math.min(w, 120);
    const maxY = (box ? box.height : window.innerHeight) - 60;
    return { x: Math.max(-w + 120, Math.min(maxX, nx)), y: Math.max(box ? 0 : 8, Math.min(maxY, ny)), h };
  };

  const down = (e: RPointerEvent) => {
    onFront();
    if ((e.target as HTMLElement).closest('button, a, input, textarea, select, [contenteditable]')) return;
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const sx = e.clientX - pos.current.x;
    const sy = e.clientY - pos.current.y;
    let vx = 0;
    let vy = 0;
    let lx = e.clientX;
    let ly = e.clientY;
    let lt = performance.now();
    const move = (ev: PointerEvent) => {
      const t = performance.now();
      const dt = Math.max(1, t - lt);
      vx = ((ev.clientX - lx) / dt) * 16;
      vy = ((ev.clientY - ly) / dt) * 16;
      lx = ev.clientX;
      ly = ev.clientY;
      lt = t;
      const c = clamp(ev.clientX - sx, ev.clientY - sy);
      pos.current = { x: c.x, y: c.y };
      setP(pos.current);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      // инерция
      const glide = () => {
        if (motionState.level === 'off' || Math.hypot(vx, vy) < 0.4) {
          onMove?.(pos.current.x, pos.current.y);
          return;
        }
        vx *= 0.92;
        vy *= 0.92;
        const c = clamp(pos.current.x + vx, pos.current.y + vy);
        pos.current = { x: c.x, y: c.y };
        setP(pos.current);
        requestAnimationFrame(glide);
      };
      requestAnimationFrame(glide);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  const close = async () => {
    if (closing.current || !onClose) return;
    closing.current = true;
    sound('click');
    await play(ref.current, [{ opacity: 1, transform: `rotate(${rot}deg)` }, { opacity: 0, transform: `translate3d(${rot >= 0 ? 160 : -160}px, -220px, 0) rotate(${rot * 4 + (rot >= 0 ? 25 : -25)}deg) scale(0.8)` }], { duration: motionState.level === 'cinematic' ? 450 : 150, easing: CSS_EASE_OUT });
    onClose();
  };

  return (
    <div
      ref={ref}
      className={`desk-card desk-${variant}`}
      style={{ left: p.x, top: p.y, width, zIndex: z, transform: `rotate(${rot}deg)`, position: bounds ? 'absolute' : 'fixed' }}
      onPointerDown={down}
      data-cursor="Drag"
      role="dialog"
      aria-label={title}
      data-desk
    >
      {onClose && (
        <button className="desk-close" onClick={() => void close()} data-cursor="Close" aria-label={L('Закрыть', 'Close')}>
          Close <Icon name="x" size={12} />
        </button>
      )}
      {children}
    </div>
  );
}

// ───── слой карточек поверх страницы ─────
type DeskItem = { id: string; variant: DeskVariant; title: string; node: () => ReactNode; x: number; y: number; rot: number; z: number; origin?: { x: number; y: number }; width: number };
let items: DeskItem[] = [];
let zTop = 1;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const store = {
  sub: (f: () => void) => {
    subs.add(f);
    return () => void subs.delete(f);
  },
  get: () => items,
};

/** Открыть карточку поверх страницы. Повторное открытие той же сущности выводит её наверх. */
export function openDesk(o: { id: string; variant?: DeskVariant; title: string; node: () => ReactNode; from?: Element | null; width?: number }) {
  const ex = items.find((i) => i.id === o.id);
  if (ex) {
    ex.z = ++zTop;
    items = [...items];
    return emit();
  }
  const mobile = window.matchMedia('(max-width: 639px)').matches;
  const max = mobile ? 3 : 5;
  const width = Math.min(o.width || 340, window.innerWidth - 32);
  const n = items.length;
  const r = o.from?.getBoundingClientRect();
  const baseX = mobile ? 16 : Math.max(16, window.innerWidth / 2 - width / 2 + 40);
  const baseY = mobile ? 80 : Math.max(70, window.innerHeight * 0.16);
  const it: DeskItem = {
    id: o.id,
    variant: o.variant || 'light',
    title: o.title,
    node: o.node,
    width,
    x: baseX + (n % 5) * (mobile ? 6 : 26) - (mobile ? 0 : 60),
    y: baseY + (n % 5) * (mobile ? 14 : 22),
    rot: Math.round((Math.random() * 14 - 7) * 10) / 10,
    z: ++zTop,
    origin: r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : undefined,
  };
  items = [...items, it].slice(-max);
  sound('click');
  emit();
}
export function closeDesk(id: string) {
  items = items.filter((i) => i.id !== id);
  emit();
}

export function DeskLayer() {
  const list = useSyncExternalStore(store.sub, store.get, store.get);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !items.length || document.querySelector('.modal-backdrop, [role=dialog][aria-modal=true]')) return;
      const top = items.reduce((a, b) => (b.z > a.z ? b : a));
      (document.querySelector(`[data-desk-id="${CSS.escape(top.id)}"] .desk-close`) as HTMLButtonElement | null)?.click();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  if (!list.length) return null;
  return createPortal(
    <div className="desk-layer">
      {list.map((i) => (
        <div key={i.id} data-desk-id={i.id}>
          <DeskCard
            variant={i.variant}
            x={i.x}
            y={i.y}
            rot={i.rot}
            z={i.z}
            width={i.width}
            origin={i.origin}
            title={i.title}
            onFront={() => {
              if (i.z === zTop) return;
              i.z = ++zTop;
              items = [...items];
              emit();
            }}
            onMove={(x, y) => {
              i.x = x;
              i.y = y;
            }}
            onClose={() => closeDesk(i.id)}
          >
            {i.node()}
          </DeskCard>
        </div>
      ))}
    </div>,
    document.body,
  );
}
