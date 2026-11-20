// Движковая система анимаций (v4): токены, уровни, FPS-сторож, плавный скролл на десктопе.
// Анимируем только transform, opacity, clip-path и ненадолго filter: blur; will-change — только на время анимации.
import type { AnimLevel } from '../db/schema';

export const EASE_OUT = [0.16, 1, 0.3, 1] as const;
export const EASE_IN_OUT = [0.76, 0, 0.24, 1] as const;
export const CSS_EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';
export const CSS_EASE_IN_OUT = 'cubic-bezier(0.76, 0, 0.24, 1)';
export const SPRING = { type: 'spring' as const, stiffness: 260, damping: 28 };
export const DUR = { fast: 0.25, base: 0.6, slow: 1.0 };

type State = { level: AnimLevel; blur: boolean; touch: boolean; reduce: boolean };
export const motionState: State = { level: 'cinematic', blur: true, touch: false, reduce: false };
const subs = new Set<() => void>();
export function setMotionState(p: Partial<State>) {
  Object.assign(motionState, p);
  subs.forEach((f) => f());
}
export function onMotionChange(f: () => void) {
  subs.add(f);
  return () => void subs.delete(f);
}

/** Эффективный уровень: системный reduced-motion автоматически даёт Minimal (если не выбран Off). */
export function effectiveLevel(chosen: AnimLevel, sysReduce: boolean): AnimLevel {
  if (chosen === 'off') return 'off';
  if (sysReduce) return 'minimal';
  return chosen;
}

/** Длительность в мс с учётом уровня и телефона (на touch сценарии короче). */
export function ms(sec: number) {
  const l = motionState.level;
  if (l === 'off') return 0;
  if (l === 'minimal') return Math.min(150, sec * 1000);
  if (l === 'smooth') return Math.min(350, sec * 1000);
  return Math.round(sec * 1000 * (motionState.touch ? 0.6 : 1));
}
/** Максимальное размытие: на телефоне не больше 6px, без blur-эффектов — 0. */
export function blurPx(px: number) {
  if (!motionState.blur || motionState.level === 'off' || motionState.level === 'minimal') return 0;
  return motionState.touch ? Math.min(6, px) : px;
}
export const cinematic = () => motionState.level === 'cinematic';
export const animOn = () => motionState.level !== 'off';

/** WAAPI-обёртка: will-change на время анимации, Off — сразу конечное состояние. */
export function play(el: Element | null | undefined, frames: Keyframe[], opts: KeyframeAnimationOptions & { duration: number; clear?: boolean }): Promise<void> {
  if (!el) return Promise.resolve();
  const h = el as HTMLElement;
  if (!opts.duration || motionState.level === 'off' || typeof h.animate !== 'function') {
    const last = frames[frames.length - 1] as Record<string, string>;
    for (const [k, v] of Object.entries(last)) if (k !== 'offset' && k !== 'easing') (h.style as unknown as Record<string, string>)[k] = String(v);
    return Promise.resolve();
  }
  h.style.willChange = 'transform, opacity';
  const { clear, ...o } = opts;
  const a = h.animate(frames, { fill: 'forwards', ...o });
  return a.finished.then(
    () => {
      h.style.willChange = '';
      // конечное состояние совпадает с обычным — снимаем анимацию, чтобы transform/filter не держались на элементе
      if (clear) a.cancel();
    },
    () => {
      h.style.willChange = '';
    },
  );
}

// ───── FPS-сторож ─────
// Пока идут анимации (beginAnim/endAnim), меряем средний FPS. Ниже 45 две секунды подряд — уровень снижается на ступень.
let active = 0;
let raf = 0;
let frames: number[] = [];
let lowSince = 0;
let onDrop: ((to: AnimLevel) => void) | null = null;
const NEXT: Record<AnimLevel, AnimLevel | null> = { cinematic: 'smooth', smooth: 'minimal', minimal: 'off', off: null };

export function setFpsDropHandler(f: (to: AnimLevel) => void) {
  onDrop = f;
}
function tick(t: number) {
  frames.push(t);
  while (frames.length && t - frames[0] > 1000) frames.shift();
  if (frames.length > 5) {
    const fps = (frames.length - 1) / ((frames[frames.length - 1] - frames[0]) / 1000);
    if (fps < 45) {
      if (!lowSince) lowSince = t;
      if (t - lowSince > 2000) {
        lowSince = 0;
        frames = [];
        const to = NEXT[motionState.level];
        if (to && onDrop) onDrop(to);
      }
    } else lowSince = 0;
  }
  raf = active > 0 && document.visibilityState === 'visible' ? requestAnimationFrame(tick) : 0;
}
export function beginAnim() {
  active++;
  if (!raf) raf = requestAnimationFrame(tick);
}
export function endAnim() {
  active = Math.max(0, active - 1);
  if (!active) {
    frames = [];
    lowSince = 0;
  }
}
/** Отметить период анимации (мс). */
export function animWindow(msLen: number) {
  beginAnim();
  window.setTimeout(endAnim, msLen);
}

// ───── плавный скролл (только pointer: fine, без скролл-джекинга: прокручивается сам документ) ─────
let smoothOn = false;
export function enableSmoothScroll(on: boolean) {
  if (on === smoothOn) return;
  smoothOn = on;
  if (on) window.addEventListener('wheel', onWheel, { passive: false });
  else window.removeEventListener('wheel', onWheel);
}
let target = 0;
let animating = false;
function scrollableParent(el: Element | null): boolean {
  for (let n = el; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
    const s = getComputedStyle(n);
    if (/(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight + 1) return true;
    if (s.position === 'fixed') return true;
  }
  return false;
}
function onWheel(e: WheelEvent) {
  if (e.ctrlKey || e.defaultPrevented || Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.deltaMode !== 0) return;
  if (scrollableParent(e.target as Element) || document.documentElement.classList.contains('modal-open')) return;
  e.preventDefault();
  if (!animating) target = window.scrollY;
  const max = document.documentElement.scrollHeight - window.innerHeight;
  target = Math.max(0, Math.min(max, target + e.deltaY));
  if (!animating) {
    animating = true;
    const step = () => {
      const cur = window.scrollY;
      const next = cur + (target - cur) * 0.14;
      if (Math.abs(target - next) < 0.5) {
        window.scrollTo(0, target);
        animating = false;
        return;
      }
      window.scrollTo(0, next);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}

export const sleep = (msLen: number) => new Promise<void>((r) => window.setTimeout(r, msLen));
export const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
