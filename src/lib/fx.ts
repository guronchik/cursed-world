// Шина визуальных эффектов и уведомлений (exorcise, Black Flash, ранг, тосты, подтверждения).
export type FxEvent =
  | { type: 'exorcise'; x: number; y: number; xp?: number; label?: string }
  | { type: 'blackflash'; title: string; sub?: string }
  | { type: 'rankup'; rank: string }
  | { type: 'toast'; text: string; tone?: 'ok' | 'warn' | 'bad' | 'xp'; action?: { label: string; run: () => void }; ms?: number }
  | { type: 'confirm'; text: string; danger?: boolean; okLabel?: string; withNote?: boolean; resolve: (v: false | string) => void }
  | { type: 'choose'; text: string; options: ChooseOpt[]; resolve: (v: string | null) => void };

export interface ChooseOpt {
  v: string;
  label: string;
  danger?: boolean;
}

const subs = new Set<(e: FxEvent) => void>();

export const fx = {
  on(fn: (e: FxEvent) => void) {
    subs.add(fn);
    return () => {
      subs.delete(fn);
    };
  },
  emit(e: FxEvent) {
    subs.forEach((f) => f(e));
  },
};

export const toast = (text: string, tone: 'ok' | 'warn' | 'bad' | 'xp' = 'ok') => fx.emit({ type: 'toast', text, tone });
/** Тост с кнопкой «Отменить» (по умолчанию 8 секунд). */
export const toastUndo = (text: string, undo: () => void, ms = 8000, label?: string) => fx.emit({ type: 'toast', text, tone: 'ok', ms, action: { label: label || (document.documentElement.lang === 'en' ? 'Undo' : 'Отменить'), run: undo } });

/** Модальное подтверждение. Возвращает false или строку (заметку, если withNote). */
export const confirmBox = (text: string, opts: { danger?: boolean; okLabel?: string; withNote?: boolean } = {}) =>
  new Promise<false | string>((resolve) => fx.emit({ type: 'confirm', text, resolve, ...opts }));

/** Выбор из нескольких вариантов (как action sheet в iOS). Возвращает v варианта или null (отмена). */
export const chooseBox = (text: string, options: ChooseOpt[]) => new Promise<string | null>((resolve) => fx.emit({ type: 'choose', text, options, resolve }));

export function originOf(el?: Element | null) {
  const r = el?.getBoundingClientRect?.();
  return r && r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
}
