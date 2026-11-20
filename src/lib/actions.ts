// Доменные операции: изгнание проклятий, квесты, таблетки, тренировки, обеты.
import { db, type Curse, type Med, type Routine, type SaveItem, type Vow } from '../db/schema';
import { dayKey } from './dates';
import { fx, originOf, toast } from './fx';
import { curseGrade, exorciseXp } from './grade';
import { fetchPreview, hostOf } from './links';
import { delBlob } from './media';
import { L, uid } from './runtime';
import { play } from './sound';
import { monthGoalProgress, prCount, routineDone, scheduledDoses, vowDurationDays, vowPower, yearGoalProgress } from './stats';
import { award, revoke } from './xp';
import { syncFromCurse, unlinkCurse, xpKeyOf } from './linked';

export async function exorcise(id: string, el?: Element | null) {
  const c = await db.curses.get(id);
  if (!c || c.status === 'exorcised') return;
  const { grade, overdue } = curseGrade(c.due, c.importance);
  const xp = exorciseXp(grade, overdue);
  const next: Curse = { ...c, status: 'exorcised', completedAt: Date.now() };
  await db.curses.put(next);
  const o = originOf(el);
  fx.emit({ type: 'exorcise', x: o.x, y: o.y, xp, label: c.title });
  play('exorcise');
  // связанный с заданием/видео Curse делит с ним ключ XP — двойного начисления нет
  await award(xpKeyOf(c), c.link?.kind === 'video' ? 50 : xp, L('Изгнание: ', 'Exorcised: ') + c.title, c.link ? (c.link.kind === 'assignment' ? 'assignment' : 'video') : 'curse', true);
  await syncFromCurse(next);
  await checkGoals(c);
}

async function checkGoals(c: Curse) {
  if (!c.goalId) return;
  const goal = await db.goals.get(c.goalId);
  if (!goal) return;
  const curses = await db.curses.toArray();
  if (goal.level === 'month' && monthGoalProgress(goal.id, curses).pct === 100) {
    if (await award(`goal:${goal.id}`, 100, `Maximum Technique: ${goal.title}`, 'goal')) play('rank');
    if (goal.parentId) {
      const year = await db.goals.get(goal.parentId);
      const goals = await db.goals.toArray();
      if (year && yearGoalProgress(year, goals, curses).pct === 100) {
        await award(`goal:${year.id}`, 300, `Domain Expansion: ${year.title}`, 'goal');
      }
    }
  }
}

export async function revive(id: string) {
  const c = await db.curses.get(id);
  if (!c) return;
  const next: Curse = { ...c, status: 'active', completedAt: undefined };
  await db.curses.put(next);
  await revoke(xpKeyOf(c));
  await syncFromCurse(next);
  toast(L('Проклятие вернулось', 'The curse is back'), 'warn');
}

export async function removeCurse(id: string) {
  const c = await db.curses.get(id);
  if (!c) return;
  for (const a of c.attachments) await delBlob(a.blobId);
  await db.curses.delete(id);
  await unlinkCurse(c);
}

export async function toggleRoutineStep(r: Routine, date: string, stepId: string, el?: Element | null) {
  const id = `${date}|${r.id}`;
  const log = (await db.routineLogs.get(id)) || { id, date, routineId: r.id, done: [] as string[] };
  const done = log.done.includes(stepId) ? log.done.filter((s) => s !== stepId) : [...log.done, stepId];
  const next = { ...log, done };
  await db.routineLogs.put(next);
  const key = `routine:${date}:${r.id}`;
  if (routineDone(r, next)) {
    const o = originOf(el);
    fx.emit({ type: 'exorcise', x: o.x, y: o.y, xp: 10, label: r.name });
    play('exorcise');
    await award(key, 10, L('Квест: ', 'Quest: ') + r.name, 'quest', true);
  } else {
    play('tick');
    await revoke(key);
  }
}

export async function setMedLog(med: Med, date: string, time: string, status: 'taken' | 'skipped' | null) {
  const id = `${date}|${med.id}|${time}`;
  const prev = await db.medLogs.get(id);
  const wasTaken = prev?.status === 'taken';
  if (status) await db.medLogs.put({ id, date, medId: med.id, time, status, at: Date.now() });
  else await db.medLogs.delete(id);
  const nowTaken = status === 'taken';
  const fresh = await db.meds.get(med.id);
  if (fresh && wasTaken !== nowTaken) {
    const stock = Math.max(0, fresh.stock + (nowTaken ? -fresh.perDose : fresh.perDose));
    await db.meds.put({ ...fresh, stock });
  }
  play(nowTaken ? 'tick' : 'warn');
  const meds = await db.meds.toArray();
  const logs = await db.medLogs.where('date').equals(date).toArray();
  const doses = scheduledDoses(meds, date);
  const all = doses.length > 0 && doses.every((d) => logs.find((l) => l.id === d.id)?.status === 'taken');
  if (all) await award(`meds:${date}`, 10, L('Все приёмы за день', 'All doses today'), 'quest');
  else await revoke(`meds:${date}`);
}

export async function startWorkout(templateId?: string, date = dayKey()) {
  const t = templateId ? await db.templates.get(templateId) : undefined;
  const id = uid();
  await db.workouts.put({
    id,
    date,
    name: t?.name || L('Тренировка', 'Workout'),
    templateId: t?.id,
    entries: (t?.items || []).map((i) => ({ id: uid(), exerciseId: i.exerciseId, sets: [] })),
    notes: '',
    finished: false,
    createdAt: Date.now(),
  });
  return id;
}

export async function finishWorkout(id: string) {
  const w = await db.workouts.get(id);
  if (!w) return;
  await db.workouts.put({ ...w, finished: true });
  const prs = prCount(w);
  await award(`workout:${id}`, 30 + prs * 15, L('Тренировка', 'Workout') + (prs ? ` · PR ×${prs}` : ''), 'workout');
}

export async function addPractice(techniqueId: string, minutes: number, note = '', pieceId?: string, date = dayKey()) {
  const id = uid();
  await db.practice.put({ id, techniqueId, date, minutes, note, pieceId });
  await award(`practice:${id}`, Math.min(40, Math.max(5, Math.round(minutes / 3))), L('Практика ', 'Practice ') + `${minutes} min`, 'practice');
}

/** Быстрый ввод «с головы» в Reversed Cursed Technique: ссылка или заметка, #теги распознаются. */
export async function quickSave(raw: string, folderId?: string) {
  const text = raw.trim();
  if (!text) return;
  const url = /https?:\/\/\S+/.exec(text)?.[0];
  const rest = url ? text.replace(url, '').trim() : text;
  const tags = Array.from(new Set((rest.match(/#[\p{L}\d_-]+/gu) || []).map((t) => t.slice(1).toLowerCase())));
  const clean = rest.replace(/#[\p{L}\d_-]+/gu, '').trim();
  const lines = clean.split('\n');
  const id = uid();
  const title = url ? lines[0] || hostOf(url) : lines[0].slice(0, 140) || L('Заметка', 'Note');
  const item: SaveItem = {
    id,
    folderId,
    kind: url ? 'link' : 'note',
    title,
    url,
    text: url ? lines.slice(1).join('\n') : lines.slice(1).join('\n'),
    tags,
    favorite: false,
    done: false,
    createdAt: Date.now(),
    preview: url ? { site: hostOf(url) } : undefined,
  };
  await db.saves.put(item);
  toast(L('Сохранено в Reversed Cursed Technique', 'Saved to Reversed Cursed Technique'));
  const s = await db.settings.get('app');
  if (url && s?.linkPreviews !== false) {
    void fetchPreview(url).then(async (p) => {
      const cur = await db.saves.get(id);
      if (!cur) return;
      await db.saves.put({ ...cur, preview: { ...cur.preview, ...p }, title: cur.title === hostOf(url) && p.title ? p.title : cur.title });
    });
  }
  return id;
}

// ───────── Обеты ─────────

export async function checkVows() {
  const vows = await db.vows.where('status').equals('active').toArray();
  const now = Date.now();
  for (const v of vows) {
    if (now >= v.endDate) {
      await db.vows.put({ ...v, status: 'fulfilled', history: [...v.history, { at: now, type: 'fulfilled' }] });
      play('vow');
      await award(`vow:${v.id}:${v.startDate}`, vowPower(v), L('Обет исполнен: ', 'Vow fulfilled: ') + v.sacrifice, 'vow');
    }
  }
}

export async function breakVow(v: Vow, note?: string) {
  const now = Date.now();
  await db.vows.put({ ...v, status: 'broken', history: [...v.history, { at: now, type: 'broken', note }] });
  play('warn');
  await award(`vowbreak:${v.id}:${now}`, -25, L('Обет нарушен: ', 'Vow broken: ') + v.sacrifice, 'vow');
}

export async function fulfillVow(v: Vow) {
  const now = Date.now();
  const share = Math.min(1, Math.max(0.1, (now - v.startDate) / Math.max(1, v.endDate - v.startDate)));
  await db.vows.put({ ...v, status: 'fulfilled', history: [...v.history, { at: now, type: 'fulfilled' }] });
  play('vow');
  await award(`vow:${v.id}:${v.startDate}`, Math.round(vowPower(v) * share), L('Обет исполнен: ', 'Vow fulfilled: ') + v.sacrifice, 'vow');
}

export async function renewVow(v: Vow) {
  const now = Date.now();
  const len = vowDurationDays(v) * 864e5;
  await db.vows.put({ ...v, status: 'active', startDate: now, endDate: now + len, history: [...v.history, { at: now, type: 'renewed' }] });
  play('vow');
  toast(L('Обет перезаключён', 'Vow renewed'), 'ok');
}
