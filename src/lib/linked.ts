// Связь Curse ↔ задание / видео (переключатель «Сделать Curse»), статусы заданий, Inbox дедлайнов из ICS.
// XP за выполнение начисляется один раз по ключу assign:<id> / video:<id> — и из задания, и из связанного Curse.
import { db, type Assignment, type AssignStatus, type CalEvent, type Curse, type Video } from '../db/schema';
import { atTime } from './dates';
import { fx, originOf, toast } from './fx';
import { curseGrade, exorciseXp } from './grade';
import { delBlob } from './media';
import { L, uid } from './runtime';
import { play } from './sound';
import { award, revoke } from './xp';
import { isDoneIn, sortCols } from './videoMeta';

export const ASTATUS = () => ({ todo: L('Не начато', 'Not started'), doing: L('В процессе', 'In progress'), done: L('Сдано', 'Submitted') });
export const ASTATUS_COLOR: Record<AssignStatus, string> = { todo: '#8e8e93', doing: '#ff9f0a', done: '#30d158' };

/** Ключ XP для Curse: связанные с заданием/видео делят ключ с ними. */
export const xpKeyOf = (c: Pick<Curse, 'id' | 'link'>) => (c.link ? `${c.link.kind === 'assignment' ? 'assign' : 'video'}:${c.link.id}` : `curse:${c.id}`);

async function uniTechId() {
  const techs = await db.techniques.toArray();
  return techs.find((t) => t.kind === 'university')?.id || techs[0]?.id || 't-uni';
}
async function ytTechId() {
  const techs = await db.techniques.toArray();
  return techs.find((t) => t.kind === 'youtube')?.id || techs[0]?.id || 't-yt';
}

export function newAssignment(p: Partial<Assignment> = {}): Assignment {
  const now = Date.now();
  return { id: uid(), title: '', status: 'todo', grade: '', attachments: [], links: [], notes: '', importance: 3, createdAt: now, updatedAt: now, ...p };
}

// ───────── задания ─────────

/** Сохранить задание и синхронизировать связанный Curse (название, дедлайн, предмет, статус). */
export async function saveAssignment(a: Assignment) {
  const next = { ...a, updatedAt: Date.now() };
  await db.assignments.put(next);
  if (next.curseId) {
    const c = await db.curses.get(next.curseId);
    if (c) {
      const done = next.status === 'done';
      await db.curses.put({
        ...c,
        title: next.title || c.title,
        due: next.due ?? c.due,
        subjectId: next.subjectId,
        importance: next.importance || c.importance,
        status: done ? 'exorcised' : 'active',
        completedAt: done ? c.completedAt || next.completedAt || Date.now() : undefined,
        link: { kind: 'assignment', id: next.id },
      });
    }
  }
  return next;
}

export async function setAssignmentStatus(id: string, status: AssignStatus, el?: Element | null) {
  const a = await db.assignments.get(id);
  if (!a || a.status === status) return;
  const wasDone = a.status === 'done';
  const next: Assignment = { ...a, status, completedAt: status === 'done' ? Date.now() : undefined };
  await saveAssignment(next);
  if (status === 'done') {
    const g = a.due ? curseGrade(a.due, a.importance) : null;
    const xp = g ? exorciseXp(g.grade, g.overdue) : 20;
    const o = originOf(el);
    fx.emit({ type: 'exorcise', x: o.x, y: o.y, xp, label: a.title });
    play('exorcise');
    await award(`assign:${id}`, xp, L('Задание сдано: ', 'Submitted: ') + a.title, 'assignment', true);
  } else if (wasDone) {
    await revoke(`assign:${id}`);
  }
}

/** Переключатель «Сделать Curse»: включить — создать связанный Curse, выключить — убрать Curse (задание остаётся). */
export async function setAssignmentCurse(id: string, on: boolean) {
  const a = await db.assignments.get(id);
  if (!a) return;
  if (on) {
    if (a.curseId && (await db.curses.get(a.curseId))) return;
    if (!a.due) {
      toast(L('Сначала укажи дедлайн — по нему считается грейд', 'Set a deadline first — the grade depends on it'), 'warn');
      return;
    }
    const c: Curse = {
      id: uid(),
      title: a.title || L('Задание', 'Assignment'),
      due: a.due,
      techniqueId: await uniTechId(),
      importance: a.importance || 3,
      subtasks: [],
      notes: '',
      attachments: [],
      links: [],
      status: a.status === 'done' ? 'exorcised' : 'active',
      completedAt: a.status === 'done' ? a.completedAt || Date.now() : undefined,
      createdAt: Date.now(),
      subjectId: a.subjectId,
      link: { kind: 'assignment', id: a.id },
    };
    await db.curses.put(c);
    await db.assignments.put({ ...a, curseId: c.id, updatedAt: Date.now() });
    toast(L('Задание теперь и в Curses', 'The assignment is now in Curses too'));
  } else {
    if (a.curseId) await db.curses.delete(a.curseId);
    await db.assignments.put({ ...a, curseId: undefined, updatedAt: Date.now() });
  }
}

export async function deleteAssignment(id: string) {
  const a = await db.assignments.get(id);
  if (!a) return;
  if (a.curseId) await db.curses.delete(a.curseId);
  for (const f of a.attachments) await delBlob(f.blobId);
  await revoke(`assign:${id}`);
  const evs = await db.calEvents.where('assignmentId').equals(id).toArray();
  for (const e of evs) await db.calEvents.put({ ...e, assignmentId: undefined });
  await db.assignments.delete(id);
}

// ───────── видео ─────────

export async function setVideoCurse(id: string, on: boolean) {
  const v = await db.videos.get(id);
  if (!v) return;
  if (on) {
    if (v.curseId && (await db.curses.get(v.curseId))) return;
    const due = v.deadline ?? v.publishAt;
    if (!due) {
      toast(L('Сначала укажи дедлайн или дату публикации', 'Set a deadline or publish date first'), 'warn');
      return;
    }
    const done = isDoneIn(v, await db.videoStatuses.toArray());
    const c: Curse = {
      id: uid(),
      title: v.title || L('Видео', 'Video'),
      due,
      techniqueId: await ytTechId(),
      importance: Math.max(1, Math.min(5, (v.priority || 1) + 2)),
      subtasks: [],
      notes: '',
      attachments: [],
      links: v.url ? [v.url] : [],
      status: done ? 'exorcised' : 'active',
      completedAt: done ? v.publishedAt || Date.now() : undefined,
      createdAt: Date.now(),
      link: { kind: 'video', id: v.id },
    };
    await db.curses.put(c);
    await db.videos.put({ ...v, curseId: c.id, updatedAt: Date.now() });
    toast(L('Видео теперь и в Curses', 'The video is now in Curses too'));
  } else {
    if (v.curseId) await db.curses.delete(v.curseId);
    await db.videos.put({ ...v, curseId: undefined, updatedAt: Date.now() });
  }
}

/** После сохранения видео: обновить связанный Curse и XP за публикацию (перенос в Done-колонку). XP — один раз по ключу video:<id>. */
export async function afterVideoSave(wasDone: boolean, done: boolean, v: Video) {
  if (v.curseId) {
    const c = await db.curses.get(v.curseId);
    if (c) {
      const due = v.deadline ?? v.publishAt ?? c.due;
      if (c.title !== v.title || c.due !== due || (c.status === 'exorcised') !== done)
        await db.curses.put({ ...c, title: v.title || c.title, due, status: done ? 'exorcised' : 'active', completedAt: done ? c.completedAt || Date.now() : undefined });
    }
  }
  if (!wasDone && done) {
    play('exorcise');
    await award(`video:${v.id}`, 50, L('Видео опубликовано: ', 'Video published: ') + (v.title || ''), 'video');
  } else if (wasDone && !done) await revoke(`video:${v.id}`);
}

// ───────── Curse → связанное ─────────

/** Вызывается после изменения Curse (редактор, изгнание, возврат): переносит срок, название и выполнение. */
export async function syncFromCurse(c: Curse) {
  if (!c.link) return;
  if (c.link.kind === 'assignment') {
    const a = await db.assignments.get(c.link.id);
    if (!a) return;
    const done = c.status === 'exorcised';
    const status: AssignStatus = done ? 'done' : a.status === 'done' ? 'doing' : a.status;
    if (a.title !== c.title || a.due !== c.due || a.status !== status || a.importance !== c.importance)
      await db.assignments.put({ ...a, title: c.title, due: c.due, importance: c.importance, status, completedAt: done ? a.completedAt || c.completedAt || Date.now() : undefined, updatedAt: Date.now() });
  } else {
    const v = await db.videos.get(c.link.id);
    if (!v) return;
    const done = c.status === 'exorcised';
    const cols = sortCols(await db.videoStatuses.toArray());
    const isDone = isDoneIn(v, cols);
    let statusId = v.statusId;
    if (done && !isDone) statusId = (cols.find((x) => x.isDone) || cols[cols.length - 1])?.id || v.statusId;
    if (!done && isDone) statusId = [...cols].reverse().find((x) => !x.isDone)?.id || v.statusId;
    const patch: Partial<Video> = { title: c.title, statusId };
    if (v.deadline !== undefined || v.publishAt === undefined) patch.deadline = c.due;
    else patch.publishAt = c.due;
    if (done && !v.publishedAt) patch.publishedAt = c.completedAt || Date.now();
    if (!done) patch.publishedAt = undefined;
    await db.videos.put({ ...v, ...patch, updatedAt: Date.now() });
  }
}

/** Curse удалён в разделе Curses — задание/видео остаётся, переключатель выключается. */
export async function unlinkCurse(c: Curse) {
  if (!c.link) return;
  if (c.link.kind === 'assignment') {
    const a = await db.assignments.get(c.link.id);
    if (a?.curseId === c.id) await db.assignments.put({ ...a, curseId: undefined, updatedAt: Date.now() });
  } else {
    const v = await db.videos.get(c.link.id);
    if (v?.curseId === c.id) await db.videos.put({ ...v, curseId: undefined, updatedAt: Date.now() });
  }
}

// ───────── Inbox дедлайнов из ICS ─────────

export const DISMISSED_KEY = 'ics-dismissed';
const dismissKey = (e: Pick<CalEvent, 'sourceId' | 'uid' | 'recurrenceId'>) => `${e.sourceId}|${e.uid}|${e.recurrenceId ?? ''}`;

export async function dismissedSet() {
  const v = (await db.kv.get(DISMISSED_KEY))?.value as string[] | undefined;
  return new Set(v || []);
}

/** Найденные в ICS дедлайны, по которым ещё не принято решение. */
export function pendingDeadlines(events: CalEvent[], dismissed: Set<string>, now = Date.now()) {
  return events
    .filter((e) => e.kind === 'deadline' && e.sourceId !== 'manual' && !e.hidden && !e.assignmentId && !dismissed.has(dismissKey(e)) && e.start > now - 14 * 864e5)
    .sort((a, b) => a.start - b.start);
}

export async function dismissDeadlines(evs: CalEvent[]) {
  const s = await dismissedSet();
  for (const e of evs) s.add(dismissKey(e));
  await db.kv.put({ key: DISMISSED_KEY, value: [...s] });
}

export const isDismissed = (e: CalEvent, s: Set<string>) => s.has(dismissKey(e));

/** Дедлайн из ICS → задание (и, по желанию, Curse). */
export async function assignmentFromEvent(ev: CalEvent, withCurse = false) {
  const fresh = (await db.calEvents.get(ev.id)) || ev;
  if (fresh.assignmentId && (await db.assignments.get(fresh.assignmentId))) {
    if (withCurse) await setAssignmentCurse(fresh.assignmentId, true);
    return fresh.assignmentId;
  }
  const src = await db.calSources.get(ev.sourceId);
  const due = ev.allDay ? atTime(ev.start, '23:59').getTime() : ev.start;
  const a = newAssignment({
    title: ev.title,
    subjectId: ev.subjectId,
    due,
    notes: ev.description.slice(0, 4000),
    importance: /exam|final|экзамен|midterm|endterm/i.test(ev.title) ? 4 : 3,
    source: { kind: 'ics', eventId: ev.id, name: src?.name || 'ICS', snap: { title: ev.title, due } },
  });
  await db.assignments.put(a);
  await db.calEvents.put({ ...fresh, assignmentId: a.id, updatedAt: Date.now() });
  if (withCurse) await setAssignmentCurse(a.id, true);
  return a.id;
}

/** Реимпорт ICS: обновить задание, если я его не менял после добавления. */
export async function refreshAssignmentFromEvent(ev: CalEvent) {
  if (!ev.assignmentId) return;
  const a = await db.assignments.get(ev.assignmentId);
  if (!a || !a.source) return;
  const due = ev.allDay ? atTime(ev.start, '23:59').getTime() : ev.start;
  const next = { ...a };
  if (a.source.snap.title === a.title) next.title = ev.title;
  if (a.source.snap.due === a.due) next.due = due;
  next.source = { ...a.source, snap: { title: ev.title, due } };
  if (next.title !== a.title || next.due !== a.due || a.source.snap.title !== ev.title || a.source.snap.due !== due) await saveAssignment(next);
}
