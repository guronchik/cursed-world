// Страница сущности (B5): слева липкая мета-колонка, по центру блоки контента, справа вертикальная мини-карта разделов.
// Огромный заголовок градиентом акцента у нижнего края первого экрана (въезжает снизу из blur, параллакс при скролле).
// В конце — «Next …»: потянуть дальше и удержать ~0.8 с (кольцо заполняется) или нажать кнопку.
// Wordmark в верхней панели после 80px прокрутки превращается в сигил. Телефон: мета сворачивается, вместо мини-карты — тонкая полоса прогресса.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useMedia } from '../lib/hooks';
import { blurPx, CSS_EASE_OUT, motionState, play } from '../lib/motion';
import { L } from '../lib/runtime';
import { Icon } from './Icon';
import { IBtn } from './ui';

export interface EntitySection {
  id: string;
  label: string;
  icon?: string;
  node: ReactNode;
}

export function EntityLayout({
  kind,
  title,
  meta,
  sections,
  next,
  actions,
  onClose,
  hero,
  titleNode,
  children,
}: {
  kind: string;
  title: string;
  meta: ReactNode;
  sections: EntitySection[];
  next?: { label: string; title: string; onOpen: () => void };
  actions?: ReactNode;
  onClose: () => void;
  hero?: ReactNode;
  /** Свой заголовок вместо стандартного (например, редактируемый для видео). */
  titleNode?: ReactNode;
  children?: ReactNode;
}) {
  const mobile = useMedia('(max-width: 1023px)');
  const scroller = useRef<HTMLDivElement>(null);
  const bigRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [activeSec, setActiveSec] = useState(sections[0]?.id);
  const [prog, setProg] = useState(0);
  const [showProg, setShowProg] = useState(false);
  const [metaOpen, setMetaOpen] = useState(false);
  const [hold, setHold] = useState(0);
  const holdRef = useRef({ v: 0, last: 0, raf: 0, fired: false });

  // Esc — закрыть (если поверх нет диалога)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && document.querySelectorAll('[role=dialog]').length <= 1) onClose();
    };
    window.addEventListener('keydown', onKey);
    document.documentElement.classList.add('modal-open');
    return () => {
      window.removeEventListener('keydown', onKey);
      document.documentElement.classList.remove('modal-open');
    };
  }, [onClose]);

  // огромный заголовок въезжает снизу из размытия
  useLayoutEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
    holdRef.current.fired = false;
    setHold(0);
    const b = blurPx(14);
    void play(bigRef.current, [{ opacity: 0, transform: 'translate3d(0, 40%, 0)', filter: `blur(${b}px)` }, { opacity: 1, transform: 'none', filter: 'blur(0px)' }], { duration: motionState.level === 'cinematic' ? 900 : 300, easing: CSS_EASE_OUT, clear: true });
  }, [title]);

  // прокрутка: wordmark → сигил, параллакс заголовка, активный раздел, полоса прогресса
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let hideT = 0;
    const on = () => {
      const top = el.scrollTop;
      setScrolled(top > 80);
      const max = el.scrollHeight - el.clientHeight;
      setProg(max > 0 ? top / max : 0);
      if (mobile) {
        setShowProg(true);
        window.clearTimeout(hideT);
        hideT = window.setTimeout(() => setShowProg(false), 800);
      }
      if (bigRef.current && motionState.level === 'cinematic' && !motionState.reduce) bigRef.current.style.transform = `translate3d(0, ${top * 0.25}px, 0)`;
      const secs = Array.from(el.querySelectorAll<HTMLElement>('[data-sec]'));
      let cur = secs[0]?.dataset.sec;
      for (const s of secs) if (s.getBoundingClientRect().top < el.clientHeight * 0.4) cur = s.dataset.sec;
      if (cur) setActiveSec(cur);
    };
    el.addEventListener('scroll', on, { passive: true });
    return () => {
      el.removeEventListener('scroll', on);
      window.clearTimeout(hideT);
    };
  }, [mobile, sections.length]);

  // «потяни дальше и удерживай» в конце страницы: колесо (ПК) или палец вверх (телефон)
  useEffect(() => {
    const el = scroller.current;
    if (!el || !next) return;
    const h = holdRef.current;
    const atEnd = () => el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
    const tick = () => {
      const now = performance.now();
      if (now - h.last > 180) h.v = Math.max(0, h.v - 0.06);
      setHold(h.v);
      if (h.v >= 1 && !h.fired) {
        h.fired = true;
        next.onOpen();
        return;
      }
      h.raf = h.v > 0 ? requestAnimationFrame(tick) : 0;
    };
    const push = (amount: number) => {
      h.last = performance.now();
      h.v = Math.min(1, h.v + amount);
      if (!h.raf) h.raf = requestAnimationFrame(tick);
    };
    const wheel = (e: WheelEvent) => {
      if (e.deltaY > 0 && atEnd()) push(0.045); // ≈0.8 с непрерывной прокрутки
    };
    let ty = 0;
    const ts = (e: TouchEvent) => (ty = e.touches[0].clientY);
    const tm = (e: TouchEvent) => {
      const dy = ty - e.touches[0].clientY;
      if (dy > 0 && atEnd()) push(Math.min(0.05, dy / 2400));
    };
    el.addEventListener('wheel', wheel, { passive: true });
    el.addEventListener('touchstart', ts, { passive: true });
    el.addEventListener('touchmove', tm, { passive: true });
    return () => {
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('touchstart', ts);
      el.removeEventListener('touchmove', tm);
      cancelAnimationFrame(h.raf);
      h.raf = 0;
    };
  }, [next]);

  const goSec = (id: string) => scroller.current?.querySelector(`[data-sec="${id}"]`)?.scrollIntoView({ behavior: motionState.level === 'off' ? 'auto' : 'smooth', block: 'start' });

  return createPortal(
    <div className="ep" role="dialog" aria-modal="true" aria-label={`${kind}: ${title}`}>
      <div className="ep-bar">
        <IBtn icon="left" onClick={onClose} title={L('Назад', 'Back')} />
        <div className="ep-mark" aria-hidden>
          <span className={`ep-word ${scrolled ? 'ep-word-off' : ''}`}>CURSED WORLD</span>
          <span className={`ep-sigil ${scrolled ? 'ep-sigil-on' : ''}`}>呪</span>
        </div>
        <span className={`text-[13.5px] font-semibold truncate min-w-0 transition-opacity ${scrolled ? 'opacity-100' : 'opacity-0'}`}>{title}</span>
        <div className="ml-auto flex items-center gap-1">{actions}</div>
      </div>
      <div ref={scroller} className="ep-scroll">
        {hero}
        <div className="ep-first">
          <div className="ep-kind">{kind}</div>
          <div className="ep-big-wrap">
            <div ref={bigRef} className="ep-big">
              {titleNode || title}
            </div>
          </div>
        </div>
        <div className="ep-grid">
          {mobile ? (
            <div className="ep-meta-m">
              <button className="flex items-center gap-2 w-full min-h-[44px] text-[14px] font-semibold" aria-expanded={metaOpen} onClick={() => setMetaOpen((o) => !o)}>
                <Icon name={metaOpen ? 'down' : 'right'} size={14} /> {L('Сведения', 'Details')}
              </button>
              {metaOpen && <div className="pb-3">{meta}</div>}
            </div>
          ) : (
            <aside className="ep-meta">{meta}</aside>
          )}
          <div className="ep-content">
            {sections.map((s) => (
              <section key={s.id} data-sec={s.id} className="ep-sec">
                <h2 className="ep-sec-title">{s.label}</h2>
                {s.node}
              </section>
            ))}
            {children}
            {next && (
              <div className="ep-next">
                <div className="label">{next.label}</div>
                <button className="ep-next-title" onClick={next.onOpen} data-cursor="Open">
                  {next.title}
                </button>
                <div className="flex items-center gap-3 mt-4">
                  <svg width="38" height="38" viewBox="0 0 38 38" aria-hidden className="shrink-0">
                    <circle cx="19" cy="19" r="16" fill="none" stroke="var(--line)" strokeWidth="2.5" />
                    <circle cx="19" cy="19" r="16" fill="none" stroke="var(--accent-1)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={`${hold * 100.5} 100.5`} transform="rotate(-90 19 19)" />
                  </svg>
                  <span className="text-[12.5px] text-muted">{mobile ? L('Потяни вверх и держи, чтобы открыть следующий', 'Pull up and hold to open the next one') : L('Продолжай прокручивать и держи, чтобы открыть следующий', 'Keep scrolling and hold to open the next one')}</span>
                  <button className="btn btn-sm ml-auto" onClick={next.onOpen}>
                    {L('Дальше', 'Next')} <Icon name="arrowright" size={13} />
                  </button>
                </div>
              </div>
            )}
            <div className="h-[30vh]" />
          </div>
          {!mobile && sections.length > 1 && (
            <nav className="ep-map" aria-label={L('Разделы', 'Sections')}>
              {sections.map((s) => (
                <button key={s.id} className={`ep-map-item ${activeSec === s.id ? 'ep-map-on' : ''}`} onClick={() => goSec(s.id)} title={s.label}>
                  <span className="ep-map-thumb">
                    <Icon name={s.icon || 'file'} size={14} />
                  </span>
                  <span className="ep-map-label">{s.label}</span>
                </button>
              ))}
            </nav>
          )}
        </div>
      </div>
      {mobile && <div className={`ep-prog ${showProg ? 'opacity-100' : 'opacity-0'}`} style={{ transform: `scaleY(${prog})` }} aria-hidden />}
    </div>,
    document.body,
  );
}

/** Строка мета-колонки: подпись и значение (значение проявляется из размытия). */
export function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="ep-meta-row">
      <div className="label">{label}</div>
      <div className="ep-meta-val">{children}</div>
    </div>
  );
}
