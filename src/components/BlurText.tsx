// BlurText: текст проявляется из размытия по словам (или строкам) со stagger 40 мс, один раз при появлении в viewport.
// На телефоне blur не больше 6px и размываются не больше 6 кусков одновременно; при Minimal/Off — без размытия.
import { createElement, useEffect, useRef, useState, type CSSProperties } from 'react';
import { blurPx, motionState } from '../lib/motion';

export function BlurText({ text, as = 'span', by = 'words', className = '', style, delay = 0, blur = 10 }: { text: string; as?: string; by?: 'words' | 'lines'; className?: string; style?: CSSProperties; delay?: number; blur?: number }) {
  const ref = useRef<HTMLElement>(null);
  const [on, setOn] = useState(motionState.level === 'off');
  useEffect(() => {
    const el = ref.current;
    if (!el || on) return;
    if (typeof IntersectionObserver === 'undefined') return setOn(true);
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          setOn(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [on]);
  const parts = by === 'lines' ? text.split('\n') : text.split(/(\s+)/).filter((p) => p !== '');
  const b = blurPx(blur);
  let k = 0;
  return createElement(
    as,
    { ref, className: `bt ${on ? 'bt-in' : ''} ${className}`, style, 'aria-label': text },
    parts.map((p, i) => {
      if (/^\s+$/.test(p)) return p;
      const idx = k++;
      const blurred = motionState.touch ? idx < 6 : true;
      return (
        <span key={i} aria-hidden className={by === 'lines' ? 'bt-w block' : 'bt-w'} style={{ ['--i' as string]: idx, ['--d' as string]: `${delay}ms`, ['--bt-blur' as string]: blurred ? `${b}px` : '0px' }}>
          {p}
        </span>
      );
    }),
  );
}
