// Свой курсор (только мышь, pointer: fine) — без задержки: координаты пишутся напрямую в style.transform
// на каждом pointermove (с учётом getCoalescedEvents), без пружины, lerp, transition и React state.
// Анимируются только размер (отдельная обёртка), прозрачность и подписи «Open», «Drag», «Close».
// В полях ввода — системный курсор. На touch и при reduced-motion не монтируется (см. App).
import { useEffect, useRef } from 'react';

const INTERACTIVE = 'a, button, [role=button], [role=radio], [role=checkbox], [role=switch], [role=menuitem], label, select, summary, [data-cursor]';
const TEXT = 'input, textarea, [contenteditable=true], [contenteditable=""], .be-text';

export function Cursor({ hideSystem }: { hideSystem: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLSpanElement>(null);

  // системный курсор: «скрыть» — класс на <html>, «оставить рядом» — стрелка видна под точкой
  useEffect(() => {
    const c = document.documentElement.classList;
    c.toggle('cursor-hide', hideSystem);
    return () => c.remove('cursor-hide');
  }, [hideSystem]);

  useEffect(() => {
    if (!window.matchMedia('(pointer: fine)').matches) return;
    const el = root.current;
    const b = body.current;
    if (!el || !b) return;
    let lastTarget: Element | null = null;
    let state = '';

    const place = (x: number, y: number) => {
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    };
    const look = (target: EventTarget | null) => {
      const t = target instanceof Element ? target : null;
      if (t === lastTarget) return;
      lastTarget = t;
      const text = !!t?.closest(TEXT);
      const inter = !text && t?.closest(INTERACTIVE);
      const name = inter ? (inter as HTMLElement).getAttribute('data-cursor') || '' : '';
      const next = text ? 'input' : name ? 'label' : inter ? 'big' : '';
      if (next !== state) {
        state = next;
        b.className = `cur-body${next ? ` cur-${next}` : ''}`;
      }
      if (label.current && label.current.textContent !== name) label.current.textContent = name;
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      // последние координаты из склеенных событий — без отставания на быстрых движениях
      const list = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
      const p = list.length ? list[list.length - 1] : e;
      place(p.clientX, p.clientY);
      look(e.target);
      if (!el.classList.contains('cur-on')) el.classList.add('cur-on');
    };
    const enter = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      place(e.clientX, e.clientY); // сразу в текущей позиции, без «выезда» из угла
      el.classList.add('cur-on');
    };
    const leave = (e: MouseEvent) => {
      if (!e.relatedTarget) el.classList.remove('cur-on');
    };
    const blur = () => el.classList.remove('cur-on');
    const down = () => b.classList.add('cur-down');
    const up = () => b.classList.remove('cur-down');
    window.addEventListener('pointermove', move, { passive: true });
    document.documentElement.addEventListener('pointerenter', enter, { passive: true });
    document.addEventListener('mouseout', leave, { passive: true });
    window.addEventListener('blur', blur);
    window.addEventListener('pointerdown', down, { passive: true });
    window.addEventListener('pointerup', up, { passive: true });
    document.documentElement.classList.add('cursor-on');
    return () => {
      document.documentElement.classList.remove('cursor-on');
      window.removeEventListener('pointermove', move);
      document.documentElement.removeEventListener('pointerenter', enter);
      document.removeEventListener('mouseout', leave);
      window.removeEventListener('blur', blur);
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
    };
  }, []);

  return (
    <div ref={root} className="cur" aria-hidden>
      <div ref={body} className="cur-body">
        <span className="cur-ring">
          <span ref={label} className="cur-text" />
        </span>
        <span className="cur-dot" />
      </div>
    </div>
  );
}
