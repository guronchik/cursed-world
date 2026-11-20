// Кинематографичный переход между разделами верхнего уровня (B2) и при открытии крупной сущности.
// Cinematic: страница уходит вверх, снизу поднимается тёмный занавес, по центру название раздела (из размытия, со свечением),
// занавес уходит вверх, новая страница проявляется из blur, огромный заголовок въезжает снизу-справа, контент каскадом.
// Smooth — быстрые slide+fade 0.35 с, Minimal — fade 0.15 с, Off — мгновенно. Нажали другой раздел во время перехода — выполняется последний.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { CSS_EASE_IN_OUT, CSS_EASE_OUT, animWindow, blurPx, motionState, nextFrame, play, sleep } from '../lib/motion';
import { FrozenRoute } from '../lib/router';
import { play as sound } from '../lib/sound';
import { onCurtain } from '../lib/transition';

type Shown = { routeId: string; section: string; hash: string };

export function PageStage({ routeId, section, title, accent, preload, children }: { routeId: string; section: string; title: (section: string) => string; accent: (section: string) => string; preload: (section: string) => Promise<unknown> | undefined; children: (section: string) => ReactNode }) {
  const [shown, setShown] = useState<Shown>({ routeId, section, hash: window.location.hash });
  const [curtain, setCurtain] = useState<{ title: string; color: string } | null>(null);
  const [big, setBig] = useState<{ text: string; key: number } | null>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const curtainRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const bigRef = useRef<HTMLDivElement>(null);
  const token = useRef(0);
  const running = useRef(false);
  const target = useRef<Shown>(shown);

  const run = async (label: string, color: string, swap: () => void, sec?: string) => {
    const my = ++token.current;
    const level = motionState.level;
    const page = pageRef.current;
    const k = motionState.touch ? 0.55 : 1; // телефон: весь сценарий не дольше 0.7 с
    if (level === 'off' || !page) return swap();
    sound('whoosh');
    if (level === 'minimal') {
      animWindow(300);
      await play(page, [{ opacity: 1 }, { opacity: 0 }], { duration: 70 });
      if (my !== token.current) return;
      swap();
      await nextFrame();
      await play(page, [{ opacity: 0 }, { opacity: 1 }], { duration: 150, clear: true });
      return;
    }
    if (level === 'smooth') {
      animWindow(600);
      await play(page, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translate3d(0,-14px,0)' }], { duration: 140, easing: CSS_EASE_IN_OUT });
      if (my !== token.current) return;
      swap();
      await nextFrame();
      await play(page, [{ opacity: 0, transform: 'translate3d(0,18px,0)' }, { opacity: 1, transform: 'none' }], { duration: 350, easing: CSS_EASE_OUT, clear: true });
      return;
    }
    // ── Cinematic ──
    animWindow(1500);
    const wasRunning = running.current;
    running.current = true;
    setCurtain({ title: label, color });
    await nextFrame();
    const c = curtainRef.current;
    if (!wasRunning) {
      // (1) 0–0.35 с: страница уходит вверх, занавес поднимается снизу
      await Promise.all([
        play(page, [{ transform: 'none', opacity: 1 }, { transform: 'translate3d(0,-6%,0) scale(0.98)', opacity: 0.35 }], { duration: 350 * k, easing: CSS_EASE_IN_OUT }),
        play(c, [{ clipPath: 'inset(100% 0 0 0)' }, { clipPath: 'inset(0% 0 0 0)' }], { duration: 350 * k, easing: CSS_EASE_IN_OUT }),
      ]);
    } else play(c, [{ clipPath: 'inset(0% 0 0 0)' }, { clipPath: 'inset(0% 0 0 0)' }], { duration: 1 });
    if (my !== token.current) return;
    // (2) 0.35–0.8 с: название раздела из размытия; новая страница монтируется под занавесом и грузит данные
    swap();
    const loading = sec ? preload(sec) : undefined;
    page.getAnimations().forEach((a) => a.cancel());
    page.style.opacity = '0';
    const b = blurPx(12);
    void play(titleRef.current, [{ opacity: 0, filter: `blur(${b}px)`, transform: 'translate3d(0,12px,0) scale(0.97)' }, { opacity: 1, filter: 'blur(0px)', transform: 'none' }], { duration: 420 * k, easing: CSS_EASE_OUT });
    await Promise.race([Promise.all([sleep(450 * k), loading]), sleep(1100)]);
    if (my !== token.current) return;
    // (3) 0.8–1.3 с: занавес уходит вверх, страница проявляется из blur(16px), огромный заголовок въезжает снизу-справа
    page.style.opacity = '';
    const pb = blurPx(16);
    setBig({ text: label, key: my });
    const cascade = Array.from(page.querySelectorAll<HTMLElement>('[data-cascade] > *, .panel')).slice(0, 10);
    await Promise.all([
      play(c, [{ clipPath: 'inset(0 0 0% 0)' }, { clipPath: 'inset(0 0 100% 0)' }], { duration: 500 * k, easing: CSS_EASE_IN_OUT }),
      play(page, [{ opacity: 0, filter: `blur(${pb}px)`, transform: 'scale(1.015)' }, { opacity: 1, filter: 'blur(0px)', transform: 'none' }], { duration: 500 * k, easing: CSS_EASE_OUT, clear: true }),
      ...cascade.map((el, i) => play(el, [{ opacity: 0, transform: 'translate3d(0,24px,0)' }, { opacity: 1, transform: 'none' }], { duration: 500 * k, delay: 80 + i * 60, easing: CSS_EASE_OUT, clear: true })),
    ]);
    if (my !== token.current) return;
    running.current = false;
    setCurtain(null);
  };

  // огромный заголовок: въезжает снизу-справа, потом остаётся у нижнего края полупрозрачным
  useLayoutEffect(() => {
    if (!big || !bigRef.current) return;
    const k = motionState.touch ? 0.6 : 1;
    const b = blurPx(12);
    void play(bigRef.current, [
      { opacity: 0, transform: 'translate3d(10vw, 22vh, 0)', filter: `blur(${b}px)` },
      { opacity: 1, transform: 'none', filter: 'blur(0px)', offset: 0.55 },
      { opacity: motionState.touch ? 0 : 0.1, transform: 'none', filter: 'blur(0px)' },
    ], { duration: 1500 * k, easing: CSS_EASE_OUT });
  }, [big]);

  // смена раздела верхнего уровня
  useEffect(() => {
    const next = { routeId, section, hash: window.location.hash };
    target.current = next;
    if (section === shown.section) {
      if (routeId !== shown.routeId || next.hash !== shown.hash) setShown(next);
      return;
    }
    void preload(section);
    void run(title(section), accent(section), () => setShown(target.current), section);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId, section]);

  // запросы занавеса от страниц (открытие крупной сущности)
  useEffect(
    () =>
      onCurtain((r) => {
        void run(r.title, accent(r.section || shown.section), r.swap);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shown.section],
  );

  const frozen = shown.section !== section ? shown.hash : null;
  return (
    <div className="relative" style={{ overflowX: 'clip' }}>
      <div ref={pageRef} className="page-stage">
        <FrozenRoute.Provider value={frozen}>{children(shown.section)}</FrozenRoute.Provider>
      </div>
      {big && (
        <div ref={bigRef} key={big.key} className="big-title" aria-hidden>
          {big.text}
        </div>
      )}
      {curtain && (
        <div ref={curtainRef} className="curtain" style={{ clipPath: 'inset(100% 0 0 0)', ['--glow' as string]: curtain.color }} aria-hidden>
          <div ref={titleRef} className="curtain-title">
            {curtain.title}
          </div>
        </div>
      )}
    </div>
  );
}
