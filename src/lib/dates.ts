import {
  addDays,
  differenceInCalendarDays,
  endOfWeek,
  format,
  getISOWeek,
  getISOWeekYear,
  parseISO,
  startOfWeek,
} from 'date-fns';
import { enUS, ru } from 'date-fns/locale';
import { L, rt } from './runtime';

export const loc = () => (rt.lang === 'ru' ? ru : enUS);

/** format с текущей локалью */
export const fmt = (d: Date | number, pattern: string) => format(d, pattern, { locale: loc() });

export const dayKey = (d: Date | number = new Date()) => format(d, 'yyyy-MM-dd');
export const monthKey = (d: Date | number = new Date()) => format(d, 'yyyy-MM');
export const fromKey = (k: string) => parseISO(k);

export const weekStart = (d: Date | number) => startOfWeek(d, { weekStartsOn: 1 });
export const weekEnd = (d: Date | number) => endOfWeek(d, { weekStartsOn: 1 });
export const weekKey = (d: Date | number) => `${getISOWeekYear(d)}-W${String(getISOWeek(d)).padStart(2, '0')}`;

/** 0 = понедельник … 6 = воскресенье */
export const weekdayIdx = (d: Date | number) => (new Date(d).getDay() + 6) % 7;
export const isOddWeek = (d: Date | number) => getISOWeek(d) % 2 === 1;

export const hm = (s: string) => {
  const [h, m] = s.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

export function atTime(d: Date | number, hhmm: string) {
  const x = new Date(d);
  const [h, m] = hhmm.split(':').map(Number);
  x.setHours(h || 0, m || 0, 0, 0);
  return x;
}

export function endOfDayTs(d: Date | number) {
  const x = new Date(d);
  x.setHours(23, 59, 0, 0);
  return x.getTime();
}

export function leftParts(ms: number) {
  const s = Math.max(0, Math.floor(Math.abs(ms) / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

/** «2д 4ч», «3ч 12м», «просрочено 5ч» */
export function shortLeft(ms: number) {
  const p = leftParts(ms);
  const D = L('д', 'd');
  const H = L('ч', 'h');
  const M = L('м', 'm');
  const out = p.d > 0 ? `${p.d}${D} ${p.h}${H}` : p.h > 0 ? `${p.h}${H} ${p.m}${M}` : `${p.m}${M}`;
  return ms < 0 ? L(`просрочено ${out}`, `${out} overdue`) : out;
}

export const pad2 = (n: number) => String(n).padStart(2, '0');

/** короткие названия дней недели, начиная с понедельника */
export function weekdayNames(style: 'EEEEEE' | 'EEE' | 'EEEE' = 'EEEEEE') {
  const base = weekStart(new Date(2024, 0, 3));
  return Array.from({ length: 7 }, (_, i) => fmt(addDays(base, i), style));
}

export const toLocalInput = (ms: number) => format(ms, "yyyy-MM-dd'T'HH:mm");
export const fromLocalInput = (s: string) => new Date(s).getTime();

export function relDay(ts: number) {
  const diff = differenceInCalendarDays(ts, new Date());
  if (diff === 0) return L('сегодня', 'today');
  if (diff === 1) return L('завтра', 'tomorrow');
  if (diff === -1) return L('вчера', 'yesterday');
  return fmt(ts, 'd MMM');
}

export const timeOf = (ts: number) => format(ts, 'HH:mm');
