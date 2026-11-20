// Чистые функции подсчёта: стрики, соблюдение, тоннаж, рекорды, прогресс целей.
import { addDays, subDays } from 'date-fns';
import type { Curse, Goal, Med, MedLog, PracticeLog, Routine, RoutineLog, Vow, Workout } from '../db/schema';
import { dayKey, fromKey } from './dates';

/** Серия дней подряд. Если сегодня ещё не отмечено — серия считается от вчера (ещё не сгорела). */
export function streak(dates: Set<string>, today = dayKey()) {
  let d = fromKey(today);
  if (!dates.has(today)) d = subDays(d, 1);
  let n = 0;
  while (dates.has(dayKey(d))) {
    n++;
    d = subDays(d, 1);
  }
  return n;
}

export function routineDone(r: Routine, log?: RoutineLog) {
  if (!log || !r.steps.length) return false;
  return r.steps.every((s) => log.done.includes(s.id));
}

export function routineDoneDates(r: Routine, logs: RoutineLog[]) {
  return new Set(logs.filter((l) => l.routineId === r.id && routineDone(r, l)).map((l) => l.date));
}

/** Приёмы, запланированные на дату (с учётом даты добавления таблетки). */
export function scheduledDoses(meds: Med[], date: string) {
  const end = fromKey(date).getTime() + 864e5;
  return meds
    .filter((m) => m.active && m.createdAt < end)
    .flatMap((m) => m.times.map((t) => ({ med: m, time: t, id: `${date}|${m.id}|${t}` })));
}

export function medsDoneDates(meds: Med[], logs: MedLog[], days = 120) {
  const byId = new Map(logs.map((l) => [l.id, l]));
  const out = new Set<string>();
  for (let i = 0; i < days; i++) {
    const k = dayKey(subDays(new Date(), i));
    const doses = scheduledDoses(meds, k);
    if (doses.length && doses.every((d) => byId.get(d.id)?.status === 'taken')) out.add(k);
  }
  return out;
}

/** Соблюдение ухода за день: шаги рутин + приёмы таблеток. */
export function careScore(date: string, routines: Routine[], rlogs: RoutineLog[], meds: Med[], mlogs: MedLog[]) {
  let total = 0;
  let done = 0;
  for (const r of routines) {
    total += 1;
    const l = rlogs.find((x) => x.id === `${date}|${r.id}`);
    if (routineDone(r, l)) done += 1;
  }
  const byId = new Map(mlogs.map((l) => [l.id, l]));
  for (const d of scheduledDoses(meds, date)) {
    total += 1;
    if (byId.get(d.id)?.status === 'taken') done += 1;
  }
  return { done, total, ratio: total ? done / total : 0 };
}

export function adherence(days: number, routines: Routine[], rlogs: RoutineLog[], meds: Med[], mlogs: MedLog[]) {
  let done = 0;
  let total = 0;
  for (let i = 0; i < days; i++) {
    const s = careScore(dayKey(subDays(new Date(), i)), routines, rlogs, meds, mlogs);
    done += s.done;
    total += s.total;
  }
  return total ? Math.round((done / total) * 100) : 0;
}

export const e1rm = (w: number, r: number) => (r <= 1 ? w : w * (1 + r / 30));

export function tonnage(w: Workout) {
  return w.entries.reduce((s, e) => s + e.sets.reduce((a, x) => a + x.weight * x.reps, 0), 0);
}

export function prCount(w: Workout) {
  return w.entries.reduce((s, e) => s + e.sets.filter((x) => x.pr).length, 0);
}

/** Лучшие показатели по упражнению (по всем тренировкам, кроме исключённой). */
export function bestOf(workouts: Workout[], exerciseId: string, excludeId?: string) {
  let maxWeight = 0;
  let best1rm = 0;
  let has = false;
  for (const w of workouts) {
    if (w.id === excludeId) continue;
    for (const e of w.entries) {
      if (e.exerciseId !== exerciseId) continue;
      for (const s of e.sets) {
        has = true;
        maxWeight = Math.max(maxWeight, s.weight);
        best1rm = Math.max(best1rm, e1rm(s.weight, s.reps));
      }
    }
  }
  return { maxWeight, best1rm, has };
}

export function practiceDates(logs: PracticeLog[], techniqueId: string) {
  return new Set(logs.filter((l) => l.techniqueId === techniqueId && l.minutes > 0).map((l) => l.date));
}

export function monthGoalProgress(goalId: string, curses: Curse[]) {
  const linked = curses.filter((c) => c.goalId === goalId);
  const done = linked.filter((c) => c.status === 'exorcised').length;
  return { done, total: linked.length, pct: linked.length ? Math.round((done / linked.length) * 100) : 0 };
}

export function yearGoalProgress(goal: Goal, goals: Goal[], curses: Curse[]) {
  const months = goals.filter((g) => g.level === 'month' && g.parentId === goal.id);
  if (!months.length) return { pct: 0, months };
  const pct = Math.round(months.reduce((s, m) => s + monthGoalProgress(m.id, curses).pct, 0) / months.length);
  return { pct, months };
}

export function vowDurationDays(v: Vow) {
  return Math.max(1, Math.round((v.endDate - v.startDate) / 864e5));
}

/** Vow Power: чем строже и дольше ограничение, тем сильнее обет (и больше XP). */
export function vowPower(v: Pick<Vow, 'strictness' | 'startDate' | 'endDate' | 'kind'>) {
  const d = Math.max(1, Math.round((v.endDate - v.startDate) / 864e5));
  return Math.round(Math.pow(v.strictness, 1.5) * 6 * Math.sqrt(d) * (v.kind === 'restriction' ? 1.5 : 1));
}

export function powerTier(p: number) {
  if (p < 80) return { color: '#5b8cff', label: 'Weak', ru: 'Слабый', level: 1 };
  if (p < 200) return { color: '#8b6bff', label: 'Firm', ru: 'Крепкий', level: 2 };
  if (p < 450) return { color: '#ff4f8b', label: 'Mighty', ru: 'Мощный', level: 3 };
  return { color: '#ff2744', label: 'Absolute', ru: 'Абсолютный', level: 4 };
}

export function vowKeptDays(v: Vow, now = Date.now()) {
  const end = v.status === 'active' ? now : v.history.filter((h) => h.type === 'broken' || h.type === 'fulfilled').slice(-1)[0]?.at ?? now;
  return Math.max(0, Math.floor((Math.min(end, v.endDate) - v.startDate) / 864e5));
}

export function daysRange(from: Date, count: number) {
  return Array.from({ length: count }, (_, i) => addDays(from, i));
}
