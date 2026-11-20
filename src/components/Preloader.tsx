// Прелоадер холодного старта (B1): раз за сессию, тап пропускает. Экран цвета темы, огромный wordmark
// с градиентом акцента HQ, под ним панель-прогресс, которую толкает маленький оригинальный человечек (3 кадра шага).
// Прогресс — реальные этапы загрузки (база, шрифт, обои, первые картинки), но не короче 1.2 с и не длиннее 2.5 с
// (из PWA-иконки — до 1 с). Приложение грузится под прелоадером и его не ждёт. Финал — занавес уезжает вверх.
import { useEffect, useRef, useState } from 'react';
import { db } from '../db/schema';
import { bootProgress, markBoot, onBoot, setRevealed } from '../lib/boot';
import { CSS_EASE_IN_OUT } from '../lib/motion';

type Boot = { dark?: boolean; level?: string; accent?: [string, string] | null };

function readBoot(): Boot {
  try {
    return JSON.parse(localStorage.getItem('cw-boot') || '{}') as Boot;
  } catch {
    return {};
  }
}

export function shouldPreload() {
  try {
    if (sessionStorage.getItem('cw-preloaded')) return false;
  } catch {
    return false;
  }
  const b = readBoot();
  if (b.level === 'off' || b.level === 'minimal') return false;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  return true;
}

/** Оригинальный силуэт: наклонился вперёд и толкает панель. Три кадра шага. */
function Runner({ frame }: { frame: number }) {
  const legs = [
    ['M18 30 L13 40 L9 47', 'M18 30 L22 39 L24 47'],
    ['M18 30 L16 40 L14 47', 'M18 30 L19 39 L19 47'],
    ['M18 30 L21 40 L23 47', 'M18 30 L14 39 L10 46'],
  ][frame % 3];
  return (
    <svg viewBox="0 0 36 48" width="36" height="48" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="25" cy="8" r="5" fill="currentColor" stroke="none" />
      <path d="M23 14 L18 30" />
      <path d="M22 17 L30 21 L35 20" />
      <path d="M21 20 L28 25 L35 24" />
      <path d={legs[0]} />
      <path d={legs[1]} />
    </svg>
  );
}

export function Preloader() {
  const [show, setShow] = useState(() => shouldPreload());
  const [p, setP] = useState(0);
  const [frame, setFrame] = useState(0);
  const [img, setImg] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const leaving = useRef(false);
  const boot = readBoot();
  const short = window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone || boot.level === 'smooth';
  const MIN = short ? 600 : 1200;
  const MAX = short ? 1000 : 2500;

  useEffect(() => {
    if (!show) {
      setRevealed();
      return;
    }
    document.documentElement.classList.add('preloading');
    try {
      sessionStorage.setItem('cw-preloaded', '1');
    } catch {
      /* приватный режим */
    }
    const t0 = performance.now();
    let raf = 0;
    let shown = 0;
    let imagesStarted = false;
    // первые картинки: после открытия базы ждём пару кадров и декодируем
    const off = onBoot(() => {
      if (bootProgress() >= 0.25 && !imagesStarted) {
        imagesStarted = true;
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const imgs = Array.from(document.images).slice(0, 8);
            void Promise.allSettled(imgs.map((i) => i.decode())).then(() => markBoot('images'));
          }),
        );
      }
    });
    void db.open().then(async () => {
      const s = await db.settings.get('app');
      if (s?.pusherBlobId) {
        const b = await db.blobs.get(s.pusherBlobId);
        if (b) setImg(URL.createObjectURL(b.blob));
      }
    }).catch(() => {});
    const step = () => {
      const el = performance.now() - t0;
      const real = bootProgress();
      // реальный прогресс, но не быстрее MIN; по времени полоса всё равно ползёт, чтобы к MAX дойти до конца
      const target = el >= MAX ? 1 : Math.max(Math.min(real, el / MIN), (el / MAX) * 0.9);
      shown = Math.max(shown, shown + (target - shown) * 0.14);
      if (el >= MAX || (real >= 1 && el >= MIN && shown > 0.97)) shown = 1;
      setP(shown);
      setFrame(Math.floor(el / 140));
      if (shown >= 1) return finish();
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    const finish = () => {
      if (leaving.current) return;
      leaving.current = true;
      const el = root.current;
      const done = () => {
        document.documentElement.classList.remove('preloading');
        setShow(false);
        setRevealed();
      };
      if (!el || typeof el.animate !== 'function') return done();
      const a = el.animate([{ transform: 'translate3d(0,0,0)' }, { transform: 'translate3d(0,-100%,0)' }], { duration: short ? 500 : 800, easing: CSS_EASE_IN_OUT, fill: 'forwards' });
      window.setTimeout(() => setRevealed(), short ? 150 : 250); // каскад главной начинается, пока занавес уходит
      a.finished.then(done, done);
    };
    (window as unknown as { __skipPreloader?: () => void }).__skipPreloader = () => {
      cancelAnimationFrame(raf);
      finish();
    };
    return () => {
      cancelAnimationFrame(raf);
      off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!show) return null;
  const [a, b] = boot.accent || ['#5ac8fa', '#0a84ff'];
  const dark = boot.dark !== false;
  return (
    <div
      ref={root}
      className={`preloader ${dark ? 'preloader-dark' : 'preloader-light'}`}
      role="progressbar"
      aria-label="CURSED WORLD"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(p * 100)}
      onPointerDown={() => (window as unknown as { __skipPreloader?: () => void }).__skipPreloader?.()}
    >
      <div className="preloader-word" style={{ backgroundImage: `linear-gradient(135deg, ${a}, ${b})` }}>
        CURSED
        <br />
        WORLD
      </div>
      <div className="preloader-track">
        <div className="preloader-fill" style={{ transform: `scaleX(${p})`, background: `linear-gradient(90deg, ${a}, ${b})` }} />
        <div className="preloader-panel" style={{ left: `calc(${p * 100}% - ${p * 46}px)` }}>
          <span className="preloader-runner" style={{ transform: `translateY(${frame % 2 ? -1.5 : 0}px) rotate(${frame % 2 ? -2 : 1}deg)` }}>
            {img ? <img src={img} alt="" className="w-9 h-12 object-contain" /> : <Runner frame={frame} />}
          </span>
          <span className="preloader-block" />
        </div>
      </div>
      <div className="preloader-hint">{Math.round(p * 100)}% · tap to skip</div>
    </div>
  );
}
