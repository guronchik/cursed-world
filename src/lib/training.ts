// Black Flash: логика упражнений и планов — свои упражнения, удаление с отменой, архив, снимки названий в журнале.
import { db, DEMO_EXERCISE_IDS, DEMO_PLAN_IDS, type Exercise, type ExerciseKind, type Muscle, type Template, type TemplateItem, type WeightUnit, type Workout, type WorkoutEntry, type WorkoutSet } from '../db/schema';
import { demoTraining } from '../db/seed';
import { toast, toastUndo } from './fx';
import { L, uid } from './runtime';
import { delBlob } from './media';

export const UNDO_MS = 8000;

export const MUSCLE_LABELS = (): Record<Muscle, string> => ({
  chest: L('Грудь', 'Chest'),
  back: L('Спина', 'Back'),
  legs: L('Ноги', 'Legs'),
  shoulders: L('Плечи', 'Shoulders'),
  arms: L('Руки', 'Arms'),
  core: L('Кор', 'Core'),
  full: L('Всё тело', 'Full body'),
  other: L('Другое', 'Other'),
});

export const KIND_LABELS = (): Record<ExerciseKind, string> => ({
  weight: L('Вес × повторы', 'Weight × reps'),
  bodyweight: L('Собственный вес', 'Bodyweight'),
  time: L('Время', 'Time'),
  distance: L('Дистанция', 'Distance'),
});

export const PLAN_COLORS = ['#ff453a', '#ff9f0a', '#ffd60a', '#30d158', '#64d2ff', '#0a84ff', '#bf5af2', '#ff2d92'];
export const PLAN_ICONS = ['dumbbell', 'bolt', 'flame', 'fist', 'heart', 'target', 'trophy', 'zap'];

export const muscleLabel = (e: Pick<Exercise, 'muscle' | 'muscleCustom'>) => (e.muscle === 'other' && e.muscleCustom?.trim() ? e.muscleCustom.trim() : MUSCLE_LABELS()[e.muscle] || e.muscle);
export const kindOf = (x?: { kind?: ExerciseKind }) => x?.kind || 'weight';
export const unitOf = (x?: { unit?: WeightUnit }) => x?.unit || 'kg';
export const normName = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/** Название записи журнала: текущее имя упражнения (переименование видно везде), иначе снимок. */
export function entryName(entry: WorkoutEntry, exercises: Exercise[]) {
  return exercises.find((e) => e.id === entry.exerciseId)?.name || entry.name || L('Удалённое упражнение', 'Deleted exercise');
}

/** Снимок упражнения для записи журнала. */
export function snapshot(ex: Exercise): Pick<WorkoutEntry, 'name' | 'kind' | 'unit'> {
  return { name: ex.name, kind: kindOf(ex), unit: unitOf(ex) };
}

export const newEntry = (ex: Exercise): WorkoutEntry => ({ id: uid(), exerciseId: ex.id, sets: [], ...snapshot(ex) });

/** Активные (не в архиве) упражнения, по алфавиту. */
export const activeExercises = (list: Exercise[]) => list.filter((e) => !e.archived).sort((a, b) => a.name.localeCompare(b.name));

export function findDuplicate(name: string, list: Exercise[], exceptId?: string) {
  const n = normName(name);
  return n ? list.find((e) => e.id !== exceptId && normName(e.name) === n) : undefined;
}

export interface ExerciseDraft {
  name: string;
  muscle?: Muscle;
  muscleCustom?: string;
  equipment?: string;
  kind?: ExerciseKind;
  unit?: WeightUnit;
  notes?: string;
  videoUrl?: string;
  videoBlobId?: string;
  photoId?: string;
  defSets?: number;
  defReps?: number;
  defRest?: number;
}

/** Собрать упражнение из черновика. Достаточно названия — остальное можно заполнить потом. */
export function buildExercise(d: ExerciseDraft): Exercise {
  return {
    id: uid(),
    name: d.name.trim().replace(/\s+/g, ' '),
    muscle: d.muscle || 'other',
    muscleCustom: d.muscle === 'other' || !d.muscle ? d.muscleCustom?.trim() || undefined : undefined,
    equipment: d.equipment?.trim() || undefined,
    kind: d.kind || 'weight',
    unit: d.unit || 'kg',
    notes: d.notes || '',
    videoUrl: d.videoUrl?.trim() || undefined,
    videoBlobId: d.videoBlobId,
    photoId: d.photoId,
    defSets: d.defSets || undefined,
    defReps: d.defReps || undefined,
    defRest: d.defRest || undefined,
    createdAt: Date.now(),
    isCustom: true,
    archived: false,
  };
}

export async function createExercise(d: ExerciseDraft) {
  const ex = buildExercise(d);
  if (!ex.name) throw new Error(L('Нужно название', 'Name required'));
  await db.exercises.put(ex);
  return ex;
}

/** Обёртка для действий с базой: ошибка не глотается — видна в консоли и тостом. */
export async function guard<T>(what: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    console.error(`[black-flash] ${what}`, e);
    toast(`${L('Не получилось', 'Failed')}: ${what} — ${(e as Error)?.message || e}`, 'bad');
    return undefined;
  }
}

// ───────────── Планы ─────────────

export const planItem = (ex: Exercise, over: Partial<TemplateItem> = {}): TemplateItem => ({
  id: uid(),
  exerciseId: ex.id,
  sets: ex.defSets || 3,
  reps: ex.defReps || (kindOf(ex) === 'time' ? 60 : 10),
  ...over,
});

export async function nextPlanOrder() {
  const all = await db.templates.toArray();
  return all.reduce((m, t) => Math.max(m, t.order ?? 0), -1) + 1;
}

export function newPlan(name = ''): Template {
  return { id: uid(), name, items: [], color: PLAN_COLORS[Math.floor(Math.random() * PLAN_COLORS.length)], icon: 'dumbbell', archived: false, createdAt: Date.now() };
}

export const sortPlans = (list: Template[]) => list.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.createdAt ?? 0) - (b.createdAt ?? 0) || a.name.localeCompare(b.name));

/** Дни недели плана (0 = пн) — хранятся в settings.trainingPlan. */
export async function planDays(planId: string) {
  const s = await db.settings.get('app');
  return Object.entries(s?.trainingPlan || {})
    .filter(([, v]) => v === planId)
    .map(([k]) => Number(k));
}

export async function setPlanDays(planId: string, days: number[]) {
  const s = await db.settings.get('app');
  if (!s) return;
  const tp = { ...(s.trainingPlan || {}) };
  for (const k of Object.keys(tp)) if (tp[k] === planId && !days.includes(Number(k))) delete tp[k];
  for (const d of days) tp[String(d)] = planId;
  await db.settings.put({ ...s, trainingPlan: tp });
}

async function detachPlanDays(planId: string) {
  const s = await db.settings.get('app');
  if (!s) return [] as string[];
  const tp = { ...(s.trainingPlan || {}) };
  const days = Object.keys(tp).filter((k) => tp[k] === planId);
  for (const k of days) delete tp[k];
  if (days.length) await db.settings.put({ ...s, trainingPlan: tp });
  return days;
}

/** Удалить план. Прошлые тренировки по нему остаются (в них свой снимок). Отмена — 8 секунд. */
export async function deletePlan(planId: string) {
  return guard(L('удалить план', 'delete plan'), async () => {
    const t = await db.templates.get(planId);
    if (!t) throw new Error(L('План не найден', 'Plan not found'));
    let days: string[] = [];
    await db.transaction('rw', db.templates, db.settings, async () => {
      days = await detachPlanDays(planId);
      await db.templates.delete(planId);
    });
    if (await db.templates.get(planId)) throw new Error(L('запись осталась в базе', 'record still in the database'));
    toastUndo(`${L('План удалён', 'Plan deleted')}: ${t.name}`, () =>
      void guard(L('вернуть план', 'restore plan'), async () => {
        await db.transaction('rw', db.templates, db.settings, async () => {
          await db.templates.put(t);
          const s = await db.settings.get('app');
          if (s && days.length) await db.settings.put({ ...s, trainingPlan: { ...s.trainingPlan, ...Object.fromEntries(days.map((d) => [d, planId])) } });
        });
      }),
    UNDO_MS);
    return true;
  });
}

export async function archivePlan(planId: string, archived: boolean) {
  return guard(L('архивировать план', 'archive plan'), async () => {
    const t = await db.templates.get(planId);
    if (!t) return;
    await db.templates.put({ ...t, archived });
    if (archived) {
      const days = await detachPlanDays(planId);
      toastUndo(`${L('План в архиве', 'Plan archived')}: ${t.name}`, () =>
        void guard(L('вернуть план', 'restore plan'), async () => {
          await db.templates.put({ ...t, archived: false });
          const s = await db.settings.get('app');
          if (s && days.length) await db.settings.put({ ...s, trainingPlan: { ...s.trainingPlan, ...Object.fromEntries(days.map((d) => [d, planId])) } });
        }),
      UNDO_MS);
    } else toast(L('План возвращён из архива', 'Plan restored'));
  });
}

export async function duplicatePlan(planId: string) {
  return guard(L('дублировать план', 'duplicate plan'), async () => {
    const t = await db.templates.get(planId);
    if (!t) return;
    const copy: Template = { ...t, id: uid(), name: `${t.name} ${L('(копия)', '(copy)')}`, archived: false, createdAt: Date.now(), order: await nextPlanOrder(), items: t.items.map((i) => ({ ...i, id: uid() })) };
    await db.templates.put(copy);
    toast(L('План скопирован', 'Plan duplicated'));
    return copy;
  });
}

export async function renamePlan(planId: string, name: string) {
  const n = name.trim();
  if (!n) return;
  return guard(L('переименовать план', 'rename plan'), async () => {
    const t = await db.templates.get(planId);
    if (t) await db.templates.put({ ...t, name: n });
  });
}

/** «Убрать из плана» — только из этого плана. Библиотека и история не затрагиваются. */
export async function removeFromPlan(planId: string, itemId: string) {
  return guard(L('убрать из плана', 'remove from plan'), async () => {
    const t = await db.templates.get(planId);
    if (!t) return;
    const idx = t.items.findIndex((i) => i.id === itemId);
    if (idx < 0) return;
    const item = t.items[idx];
    await db.templates.put({ ...t, items: t.items.filter((i) => i.id !== itemId) });
    const ex = await db.exercises.get(item.exerciseId);
    toastUndo(`${L('Убрано из плана', 'Removed from plan')}: ${ex?.name || '—'}`, () =>
      void guard(L('вернуть в план', 'restore to plan'), async () => {
        const cur = await db.templates.get(planId);
        if (!cur || cur.items.some((i) => i.id === itemId)) return;
        const items = cur.items.slice();
        items.splice(Math.min(idx, items.length), 0, item);
        await db.templates.put({ ...cur, items });
      }),
    UNDO_MS);
  });
}

export async function addToPlan(planId: string, ex: Exercise) {
  const t = await db.templates.get(planId);
  if (!t) return;
  await db.templates.put({ ...t, items: [...t.items, planItem(ex)] });
}

// ───────────── Упражнения ─────────────

export async function exerciseUsage(id: string) {
  const [plans, workouts] = await Promise.all([db.templates.toArray(), db.workouts.toArray()]);
  return {
    plans: plans.filter((t) => t.items.some((i) => i.exerciseId === id)),
    workouts: workouts.filter((w) => w.entries.some((e) => e.exerciseId === id)).length,
  };
}

export async function archiveExercise(id: string, archived: boolean) {
  return guard(L('архивировать упражнение', 'archive exercise'), async () => {
    const ex = await db.exercises.get(id);
    if (!ex) return;
    await db.exercises.put({ ...ex, archived });
    if (archived) toastUndo(`${L('В архиве', 'Archived')}: ${ex.name}`, () => void guard(L('вернуть', 'restore'), async () => void (await db.exercises.put({ ...ex, archived: false }))), UNDO_MS);
    else toast(L('Упражнение возвращено из архива', 'Exercise restored'));
  });
}

/**
 * Удалить упражнение из библиотеки и из всех планов. История остаётся: в записях журнала есть снимок названия.
 * Фото и видео стираются только после окна отмены.
 */
export async function deleteExercise(id: string) {
  return guard(L('удалить упражнение', 'delete exercise'), async () => {
    const ex = await db.exercises.get(id);
    if (!ex) throw new Error(L('Упражнение не найдено', 'Exercise not found'));
    const before: Template[] = [];
    await db.transaction('rw', db.exercises, db.templates, db.workouts, async () => {
      // снимок названия во всех записях журнала
      await db.workouts.toCollection().modify((w: Workout) => {
        w.entries = w.entries.map((en) => (en.exerciseId === id ? { ...en, ...snapshot(ex) } : en));
      });
      for (const t of await db.templates.toArray()) {
        if (!t.items.some((i) => i.exerciseId === id)) continue;
        before.push(t);
        await db.templates.put({ ...t, items: t.items.filter((i) => i.exerciseId !== id) });
      }
      await db.exercises.delete(id);
    });
    if (await db.exercises.get(id)) throw new Error(L('запись осталась в базе', 'record still in the database'));
    let undone = false;
    toastUndo(`${L('Удалено', 'Deleted')}: ${ex.name}`, () => {
      undone = true;
      void guard(L('вернуть упражнение', 'restore exercise'), async () => {
        await db.transaction('rw', db.exercises, db.templates, async () => {
          await db.exercises.put(ex);
          for (const t of before) {
            const cur = await db.templates.get(t.id);
            if (!cur) continue;
            const ids = new Set(cur.items.map((i) => i.id));
            const restored = t.items.filter((i) => i.exerciseId === id && !ids.has(i.id));
            const items = cur.items.slice();
            for (const r of restored) items.splice(Math.min(t.items.indexOf(r), items.length), 0, r);
            await db.templates.put({ ...cur, items });
          }
        });
      });
    }, UNDO_MS);
    window.setTimeout(() => {
      if (undone) return;
      void db.exercises.get(id).then(async (back) => {
        if (back) return;
        await delBlob(ex.photoId);
        await delBlob(ex.videoBlobId);
      });
    }, UNDO_MS + 1500);
    return true;
  });
}

/** Вернуть демо-упражнения и демо-планы, которых сейчас нет (свои записи и изменения не трогаются). */
export async function restoreDemoTraining() {
  return guard(L('восстановить демо', 'restore demo'), async () => {
    const demo = demoTraining(Date.now());
    let added = 0;
    await db.transaction('rw', db.exercises, db.templates, db.settings, async () => {
      for (const e of demo.exercises) {
        const cur = await db.exercises.get(e.id);
        if (!cur) {
          await db.exercises.put(e);
          added++;
        } else if (cur.archived) {
          await db.exercises.put({ ...cur, archived: false });
          added++;
        }
      }
      let order = await nextPlanOrder();
      for (const t of demo.templates) {
        const cur = await db.templates.get(t.id);
        if (!cur) {
          await db.templates.put({ ...t, order: order++ });
          added++;
        } else if (cur.archived) {
          await db.templates.put({ ...cur, archived: false });
          added++;
        }
      }
    });
    toast(added ? `${L('Восстановлено демо-записей', 'Demo records restored')}: ${added}` : L('Все демо-записи уже на месте', 'All demo records are already here'));
    return added;
  });
}

export const isDemoExercise = (id: string) => DEMO_EXERCISE_IDS.includes(id);
export const isDemoPlan = (id: string) => DEMO_PLAN_IDS.includes(id);

// ───────────── Подходы и рекорды ─────────────

export const toKg = (w: number, unit?: WeightUnit) => (unit === 'lb' ? w * 0.45359237 : w);

export function fmtTime(sec?: number) {
  const s = Math.max(0, Math.round(sec || 0));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/** Ввод времени: «90», «1:30», «1.5» (мин) → секунды. */
export function parseTime(v: string) {
  const t = v.trim().replace(',', '.');
  if (!t) return 0;
  if (t.includes(':')) {
    const [m, s] = t.split(':');
    return (Number(m) || 0) * 60 + (Number(s) || 0);
  }
  return Number(t) || 0;
}

export function setLabel(s: WorkoutSet, kind: ExerciseKind, unit: WeightUnit) {
  if (kind === 'time') return fmtTime(s.time);
  if (kind === 'distance') return `${s.dist ?? 0} km${s.time ? ` · ${fmtTime(s.time)}` : ''}`;
  if (kind === 'bodyweight') return s.weight ? `+${s.weight} ${unit} × ${s.reps}` : `× ${s.reps}`;
  return `${s.weight} ${unit} × ${s.reps}`;
}

export interface PRCheck {
  isPR: boolean;
  sub?: string;
}

/**
 * Новый личный рекорд? Нужна история (прошлые тренировки или подходы в этой же тренировке).
 * Вес × повторы — рекорд веса или расчётного 1ПМ; собственный вес — повторы (или вес отягощения);
 * время — дольше; дистанция — дальше.
 */
export function detectPR(kind: ExerciseKind, unit: WeightUnit, prior: { has: boolean; maxWeight: number; best1rm: number; maxReps: number; maxTime: number; maxDist: number }, cur: WorkoutSet[], s: Omit<WorkoutSet, 'id' | 'pr'>): PRCheck {
  const hasHistory = prior.has || cur.length > 0;
  if (!hasHistory) return { isPR: false };
  const mx = (f: (x: WorkoutSet) => number, base: number) => Math.max(base, ...cur.map(f), 0);
  const e = (w: number, r: number) => (r <= 1 ? w : w * (1 + r / 30));
  if (kind === 'time') {
    const prev = mx((x) => x.time || 0, prior.maxTime);
    return (s.time || 0) > prev ? { isPR: true, sub: `${L('Новый рекорд времени! Было', 'New time PR! Was')} ${fmtTime(prev)}` } : { isPR: false };
  }
  if (kind === 'distance') {
    const prev = mx((x) => x.dist || 0, prior.maxDist);
    return (s.dist || 0) > prev ? { isPR: true, sub: `${L('Новый рекорд дистанции! Было', 'New distance PR! Was')} ${prev} km` } : { isPR: false };
  }
  const prevMax = mx((x) => x.weight || 0, prior.maxWeight);
  if (kind === 'bodyweight' && !(s.weight > 0)) {
    const prevReps = mx((x) => (x.weight ? 0 : x.reps || 0), prior.maxReps);
    return s.reps > prevReps ? { isPR: true, sub: `${L('Новый рекорд повторов! Было', 'New reps PR! Was')} ${prevReps}` } : { isPR: false };
  }
  const prev1rm = mx((x) => e(x.weight || 0, x.reps || 0), prior.best1rm);
  if (!(s.weight > 0)) return { isPR: false };
  if (s.weight > prevMax) return { isPR: true, sub: `${L('Новый рекорд веса! Было', 'New weight PR! Was')} ${prevMax} ${unit}` };
  if (e(s.weight, s.reps) > prev1rm + 0.01) return { isPR: true, sub: `${L('Новый рекорд 1ПМ', 'New est. 1RM PR')}: ${Math.round(e(s.weight, s.reps) * 10) / 10} ${unit}` };
  return { isPR: false };
}
