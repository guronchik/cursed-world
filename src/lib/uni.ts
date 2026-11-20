import { addDays, startOfDay } from 'date-fns';
import type { ClassSlot } from '../db/schema';
import { atTime, isOddWeek, weekdayIdx } from './dates';
import { L } from './runtime';

export const CLASS_TYPES = () => ({
  lecture: L('Лекция', 'Lecture'),
  seminar: L('Семинар', 'Seminar'),
  lab: L('Лабораторная', 'Lab'),
  other: L('Другое', 'Other'),
});

export function classRuns(c: ClassSlot, day: Date | number) {
  if (c.weekday !== weekdayIdx(day)) return false;
  if (c.weeks === 'all') return true;
  return c.weeks === 'odd' ? isOddWeek(day) : !isOddWeek(day);
}

export function classesOn(classes: ClassSlot[], day: Date | number) {
  return classes.filter((c) => classRuns(c, day)).sort((a, b) => a.start.localeCompare(b.start));
}

/** Следующая (или идущая сейчас) пара в ближайшие 14 дней. */
export function nextClass(classes: ClassSlot[], now = Date.now()) {
  const today = startOfDay(now);
  for (let i = 0; i < 14; i++) {
    const day = addDays(today, i);
    for (const c of classesOn(classes, day)) {
      const start = atTime(day, c.start).getTime();
      const end = atTime(day, c.end).getTime();
      if (end > now) return { cls: c, start, end, ongoing: start <= now };
    }
  }
  return null;
}
