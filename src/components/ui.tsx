import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { useMedia } from '../lib/hooks';
import { createPortal } from 'react-dom';
import { putImage, useBlobUrl } from '../lib/media';
import { L } from '../lib/runtime';
import { Icon } from './Icon';

export function Panel({
  title,
  kanji,
  actions,
  children,
  className = '',
  hot,
  accent,
  bodyClass = 'p-4',
  style,
}: {
  title?: ReactNode;
  kanji?: string;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  hot?: boolean;
  accent?: string;
  bodyClass?: string;
  style?: CSSProperties;
}) {
  return (
    <section className={`panel ${hot ? 'panel-hot' : ''} ${className}`} style={{ ...(accent ? { ['--mc' as string]: accent } : {}), ...style }}>
      {(title || actions) && (
        <header className="flex items-center gap-2 px-4 pt-3.5 pb-1 min-h-[44px]">
          {accent && <span className="w-1.5 h-4 rounded-full shrink-0" style={{ background: accent }} />}
          {title && <h3 className="text-[15px] font-semibold truncate">{title}</h3>}
          {kanji && <span className="kanji text-acc text-[11px] opacity-60 shrink-0">{kanji}</span>}
          <div className="ml-auto flex items-center gap-1">{actions}</div>
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

export function PageTitle({ title, kanji, sub, right }: { title: string; kanji?: string; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end gap-3 mb-5">
      <div className="min-w-0">
        <h1 className="large-title grad-text glitch" data-text={title} data-large-title="">
          {title}
        </h1>
        {(sub || kanji) && (
          <div className="text-[15px] text-muted mt-1.5 flex items-baseline gap-2">
            {kanji && <span className="kanji text-acc text-sm opacity-80 shrink-0">{kanji}</span>}
            <span className="min-w-0">{sub}</span>
          </div>
        )}
      </div>
      {right && <div className="ml-auto flex flex-wrap items-center gap-2">{right}</div>}
    </div>
  );
}

type BtnProps = {
  children?: ReactNode;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  variant?: 'primary' | 'ghost' | 'danger' | 'flash' | 'jade';
  size?: 'md' | 'sm' | 'xs';
  icon?: string;
  className?: string;
  type?: 'button' | 'submit';
  disabled?: boolean;
  title?: string;
};

export function Btn({ children, onClick, variant = 'primary', size = 'md', icon, className = '', type = 'button', disabled, title }: BtnProps) {
  const v = variant === 'primary' ? '' : `btn-${variant}`;
  const s = size === 'md' ? '' : `btn-${size}`;
  return (
    <button type={type} className={`btn ${v} ${s} ${className}`} onClick={onClick} disabled={disabled} title={title} aria-label={!children ? title : undefined}>
      {icon && <Icon name={icon} size={size === 'md' ? 17 : 14} />}
      {children}
    </button>
  );
}

export function IBtn({ icon, onClick, title, className = '', size = 18, active }: { icon: string; onClick?: (e: MouseEvent<HTMLButtonElement>) => void; title?: string; className?: string; size?: number; active?: boolean }) {
  return (
    <button type="button" className={`ibtn ${active ? 'text-acc' : ''} ${className}`} onClick={onClick} title={title} aria-label={title}>
      <Icon name={icon} size={size} />
    </button>
  );
}

export function Field({ label, children, className = '', hint }: { label: string; children: ReactNode; className?: string; hint?: ReactNode }) {
  return (
    <label className={`block ${className}`}>
      <span className="label block mb-1.5 ml-1">{label}</span>
      {children}
      {hint && <span className="block text-[12px] text-dim mt-1 ml-1">{hint}</span>}
    </label>
  );
}

/** Переключатель как в iOS. */
export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: ReactNode }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="inline-flex items-center gap-3 text-[15px] select-none text-left min-h-[44px]">
      <span className={`switch ${on ? 'switch-on' : ''}`}>
        <i />
      </span>
      {label}
    </button>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, className = '' }: { tabs: { id: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={`tabs ${className}`} role="tablist">
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={value === t.id} className={`tab ${value === t.id ? 'tab-on' : ''}`} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** Segmented control. */
export function Seg<T extends string | number>({ options, value, onChange }: { options: { v: T; label: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="radiogroup">
      {options.map((o) => (
        <button key={String(o.v)} type="button" role="radio" aria-checked={value === o.v} className={`seg-btn ${value === o.v ? 'seg-on' : ''}`} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Progress({ value, color, className = '', height }: { value: number; color?: string; className?: string; height?: number }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={`bar ${className}`} style={{ ...(height ? { height } : {}), ...(color ? { ['--bar' as string]: color } : {}) }}>
      <i style={{ width: `${v}%` }} />
    </div>
  );
}

export function Ring({ value, size = 64, color = 'var(--accent-1)', children, stroke = 6 }: { value: number; size?: number; color?: string; children?: ReactNode; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="relative inline-grid place-items-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90 absolute inset-0">
        <circle cx={size / 2} cy={size / 2} r={r} style={{ stroke: 'var(--panel-2)' }} strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} style={{ stroke: color, transition: 'stroke-dashoffset .6s' }} strokeWidth={stroke} fill="none" strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} strokeLinecap="round" />
      </svg>
      <div className="relative text-center leading-none">{children}</div>
    </div>
  );
}

export function Stat({ label, value, sub, color }: { label: string; value: ReactNode; sub?: ReactNode; color?: string }) {
  return (
    <div className="min-w-0">
      <div className="label truncate">{label}</div>
      <div className="text-2xl font-bold mono mt-0.5 truncate" style={color ? { color } : undefined}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-dim mt-0.5">{sub}</div>}
    </div>
  );
}

export function Empty({ text, icon = 'sparkle', action }: { text: ReactNode; icon?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-8 px-4 text-muted gap-3">
      <span className="app-icon w-12 h-12">
        <Icon name={icon} size={22} />
      </span>
      <div className="text-sm max-w-xs">{text}</div>
      {action}
    </div>
  );
}

/** На телефоне — bottom sheet (свайп вниз закрывает), на ПК — стеклянное окно. */
const modalStack: symbol[] = [];

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
  kanji,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  wide?: boolean | 'xl';
  kanji?: string;
}) {
  const ref = useRef(onClose);
  ref.current = onClose;
  const mobile = useMedia('(max-width: 639px)');
  const [dy, setDy] = useState(0);
  const drag = useRef<{ y: number; t: number; last: number } | null>(null);
  useEffect(() => {
    if (!open) return;
    setDy(0);
    // Esc закрывает только верхнее окно (лист «Добавить упражнение» поверх редактора плана)
    const me = Symbol('modal');
    modalStack.push(me);
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && modalStack[modalStack.length - 1] === me) ref.current();
    };
    window.addEventListener('keydown', fn);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', fn);
      document.body.style.overflow = prev;
      const i = modalStack.indexOf(me);
      if (i >= 0) modalStack.splice(i, 1);
    };
  }, [open]);
  const maxW = wide === 'xl' ? 'sm:max-w-5xl' : wide ? 'sm:max-w-3xl' : 'sm:max-w-lg';
  const dragProps = mobile
    ? {
        onPointerDown: (e: PointerEvent<HTMLElement>) => {
          if ((e.target as HTMLElement).closest('button')) return;
          drag.current = { y: e.clientY, t: Date.now(), last: e.clientY };
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        },
        onPointerMove: (e: PointerEvent<HTMLElement>) => {
          if (!drag.current) return;
          drag.current.last = e.clientY;
          setDy(Math.max(0, e.clientY - drag.current.y));
        },
        onPointerUp: () => {
          const d = drag.current;
          drag.current = null;
          if (!d) return;
          const dist = d.last - d.y;
          const v = dist / Math.max(1, Date.now() - d.t);
          if (dist > 110 || v > 0.7) ref.current();
          else setDy(0);
        },
      }
    : {};
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[95] flex items-end sm:items-center justify-center sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/45" style={{ opacity: mobile ? Math.max(0.2, 1 - dy / 500) : 1 }} onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal="true"
            className={`relative w-full ${maxW}`}
            initial={mobile ? { y: '100%' } : { y: 24, opacity: 0, scale: 0.97 }}
            animate={mobile ? { y: 0 } : { y: 0, opacity: 1, scale: 1 }}
            exit={mobile ? { y: '100%' } : { y: 16, opacity: 0, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 420, damping: 38 }}
          >
            <div
              className="sheet flex flex-col max-h-[92dvh] rounded-t-[28px] sm:rounded-[28px]"
              style={{ transform: dy ? `translateY(${dy}px)` : undefined, transition: drag.current ? 'none' : 'transform .25s cubic-bezier(.2,.9,.3,1)' }}
              onFocusCapture={(e) => {
                const t = e.target as HTMLElement;
                if (mobile && /INPUT|TEXTAREA|SELECT/.test(t.tagName)) window.setTimeout(() => t.scrollIntoView({ block: 'center', behavior: 'smooth' }), 320);
              }}
            >
              <header className="px-5 pt-2 pb-2 shrink-0 touch-none sm:touch-auto select-none" {...dragProps}>
                <div className="sm:hidden mx-auto mb-2 w-10 h-[5px] rounded-full bg-[var(--dim)]" />
                <div className="flex items-center gap-2 sm:pt-2">
                  <h2 className="text-[17px] font-semibold truncate">{title}</h2>
                  {kanji && <span className="kanji text-acc text-xs opacity-60">{kanji}</span>}
                  <IBtn icon="x" onClick={onClose} className="ml-auto" title={L('Закрыть', 'Close')} />
                </div>
              </header>
              <div className="px-5 pb-4 overflow-y-auto overscroll-contain flex-1 min-h-0">{children}</div>
              {footer && <footer className="px-5 py-3 border-t border-line flex flex-wrap items-center gap-2 justify-end safe-bottom shrink-0">{footer}</footer>}
              {!footer && <div className="safe-bottom" />}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function BlobImg({ id, className = '', alt = '', style, onClick }: { id?: string; className?: string; alt?: string; style?: CSSProperties; onClick?: () => void }) {
  const url = useBlobUrl(id);
  if (!url) return <div className={`bg-panel-2 grid place-items-center text-dim ${className}`} style={style} onClick={onClick}><Icon name="image" /></div>;
  return <img src={url} alt={alt} className={className} style={style} onClick={onClick} loading="lazy" />;
}

/** Кнопка выбора картинки: сжимает и сохраняет blob, возвращает id. */
export function ImagePick({ onPicked, children, className = '', max = 1600, capture }: { onPicked: (blobId: string) => void; children?: ReactNode; className?: string; max?: number; capture?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        {...(capture ? { capture: 'environment' as const } : {})}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          onPicked(await putImage(f, f.name, max));
        }}
      />
      <button type="button" className={className || 'btn btn-ghost btn-sm'} onClick={() => ref.current?.click()}>
        {children ?? (
          <>
            <Icon name="image" size={14} /> {L('Фото', 'Photo')}
          </>
        )}
      </button>
    </>
  );
}

export function FilePick({ onFiles, accept, multiple, children, className = '' }: { onFiles: (f: File[]) => void; accept?: string; multiple?: boolean; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          const fs: File[] = Array.from(e.target.files || []);
          e.target.value = '';
          if (fs.length) onFiles(fs);
        }}
      />
      <button type="button" className={className || 'btn btn-ghost btn-sm'} onClick={() => ref.current?.click()}>
        {children}
      </button>
    </>
  );
}

export function ColorPick({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const colors = ['#7c5cff', '#5b8cff', '#4dd4ff', '#3ddc97', '#f2c14e', '#ff7a59', '#ff3d5a', '#ff4f8b', '#c9a2ff', '#e8e3ff'];
  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className="w-7 h-7"
          style={{ background: c, borderRadius: 999, boxShadow: value === c ? `0 0 0 2px var(--bg), 0 0 0 4px ${c}` : 'none' }}
          aria-label={c}
        />
      ))}
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="w-7 h-7 bg-transparent cursor-pointer" />
    </div>
  );
}

export function TagInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  return (
    <div className="inp flex flex-wrap gap-1 items-center py-1.5">
      {value.map((t) => (
        <span key={t} className="tag">
          #{t}
          <button type="button" onClick={() => onChange(value.filter((x) => x !== t))} aria-label="remove">
            <Icon name="x" size={10} />
          </button>
        </span>
      ))}
      <input
        className="bg-transparent outline-none flex-1 min-w-[6rem] text-sm"
        placeholder={placeholder ?? L('тег + Enter', 'tag + Enter')}
        onKeyDown={(e) => {
          const el = e.currentTarget;
          if ((e.key === 'Enter' || e.key === ',') && el.value.trim()) {
            e.preventDefault();
            const t = el.value.trim().replace(/^#/, '').toLowerCase();
            if (!value.includes(t)) onChange([...value, t]);
            el.value = '';
          } else if (e.key === 'Backspace' && !el.value && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={(e) => {
          const t = e.currentTarget.value.trim().replace(/^#/, '').toLowerCase();
          if (t && !value.includes(t)) onChange([...value, t]);
          e.currentTarget.value = '';
        }}
      />
    </div>
  );
}
