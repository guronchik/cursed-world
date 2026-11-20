// Миграция схемы v2 → v3. Ничего не удаляет: создаёт задания из «заданий-Curses» и ICS-дедлайнов,
// копирует шаблон пар в события слоя My, превращает задачи YouTube Technique в страницы-видео.
// Curses, созданные автоматически, остаются как есть — их список показывается один раз в окне проверки.
import { addDays, startOfWeek } from 'date-fns';
import { cloneBlocks, defaultVideoTemplate, escapeHtml, newBlock, blocksText } from '../lib/blocks';
import { uid } from '../lib/runtime';
import { newVideo, VSTATUSES } from '../lib/videoMeta';
import type { Assignment, Block, CalEvent, ClassSlot, Curse, Subject, Technique, Video, VStatus } from './schema';

type Tx = { table: (n: string) => { toArray(): Promise<any[]>; get(k: string): Promise<any>; put(v: any): Promise<unknown>; bulkPut(v: any[]): Promise<unknown>; delete(k: string): Promise<unknown> } };

export const REVIEW_KEY = 'v3-review';
const BYDAY = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const localTz = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

async function moveXp(tx: Tx, from: string, to: string) {
  const x = await tx.table('xp').get(from);
  if (!x) return;
  if (!(await tx.table('xp').get(to))) await tx.table('xp').put({ ...x, key: to });
  await tx.table('xp').delete(from);
}

/** Шаблон пар v1/v2 (таблица classes) → повторяющиеся события слоя My. Повторный вызов ничего не дублирует. */
export async function migrateClassSlots(tx: Tx) {
  const slots: ClassSlot[] = await tx.table('classes').toArray();
  if (!slots.length) return 0;
  const subjects: Subject[] = await tx.table('subjects').toArray();
  const monday = addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), -7 * 20);
  let n = 0;
  for (const s of slots) {
    const id = `manual|${s.id}|`;
    if (await tx.table('calEvents').get(id)) continue;
    const day = addDays(monday, s.weekday);
    const [sh, sm] = s.start.split(':').map(Number);
    const [eh, em] = s.end.split(':').map(Number);
    const st = new Date(day);
    st.setHours(sh || 0, sm || 0, 0, 0);
    const en = new Date(day);
    en.setHours(eh || 0, em || 0, 0, 0);
    const now = Date.now();
    const ev: CalEvent = {
      id,
      sourceId: 'manual',
      uid: s.id,
      title: subjects.find((x) => x.id === s.subjectId)?.name || 'Пара',
      description: '',
      location: s.room || '',
      organizer: '',
      categories: '',
      start: st.getTime(),
      end: Math.max(en.getTime(), st.getTime() + 15 * 60000),
      allDay: false,
      rrule: `FREQ=WEEKLY;BYDAY=${BYDAY[s.weekday] || 'MO'}`,
      exdates: [],
      tz: localTz(),
      kind: 'class',
      etype: 'class',
      classType: s.type,
      teacher: s.teacher || '',
      parity: s.weeks === 'all' ? undefined : s.weeks,
      subjectId: s.subjectId,
      pinId: s.pinId,
      notes: '',
      hidden: false,
      locallyEdited: false,
      createdAt: now,
      updatedAt: now,
    };
    await tx.table('calEvents').put(ev);
    n++;
  }
  return n;
}

function assignmentFromCurse(c: Curse, ev?: CalEvent): Assignment {
  const status = c.status === 'exorcised' ? 'done' : c.assignStatus === 'progress' ? 'doing' : c.assignStatus === 'done' ? 'done' : 'todo';
  return {
    id: uid(),
    title: c.title,
    subjectId: c.subjectId || ev?.subjectId,
    due: c.due,
    status,
    grade: c.score || '',
    attachments: c.attachments || [],
    links: c.links || [],
    notes: c.notes || '',
    curseId: c.id,
    importance: c.importance || 3,
    source: ev ? { kind: 'ics', eventId: ev.id, name: c.extSource || 'ICS', snap: { title: c.icsSnap?.title || c.title, due: c.icsSnap?.due ?? c.due } } : undefined,
    completedAt: c.completedAt,
    createdAt: c.createdAt || Date.now(),
    updatedAt: Date.now(),
  };
}

function stageStatus(c: Curse, stages: number): VStatus {
  if (c.status === 'exorcised') return 'published';
  const st = c.stage ?? 0;
  if (stages <= 1) return 'idea';
  const idx = Math.round((st / (stages - 1)) * 4);
  return (['idea', 'script', 'shoot', 'edit', 'scheduled'] as VStatus[])[Math.max(0, Math.min(4, idx))];
}

function videoDoc(c: Curse): Block[] {
  const blocks = cloneBlocks(defaultVideoTemplate());
  const extra: Block[] = [];
  if (c.notes?.trim()) extra.push(...c.notes.split(/\n{2,}/).map((p) => newBlock('p', escapeHtml(p).replace(/\n/g, '<br>'))));
  if (c.subtasks?.length) extra.push(...c.subtasks.map((s) => newBlock('todo', escapeHtml(s.title), { checked: s.done })));
  if (c.links?.length) extra.push(...c.links.map((u) => newBlock('bookmark', '', { url: u })));
  if (extra.length) blocks.splice(2, 0, ...extra);
  return blocks;
}

/** v2 → v3. opts.fresh — данные только что созданы демо-сидом: окно проверки не нужно. */
export async function upgradeToV3(tx: Tx, opts: { fresh?: boolean } = {}) {
  const curses: Curse[] = await tx.table('curses').toArray();
  const events: CalEvent[] = await tx.table('calEvents').toArray();
  const existingA: Assignment[] = await tx.table('assignments').toArray();
  const review: string[] = [];

  // 1) задания: каждое «задание-Curse» и каждый Curse из ICS → отдельное задание, Curse остаётся связанным
  for (const c of curses) {
    if (c.link || !(c.isAssignment || c.extSource || c.calEventId)) continue;
    if (existingA.some((a) => a.curseId === c.id)) continue;
    const ev = c.calEventId ? events.find((e) => e.id === c.calEventId) : undefined;
    const a = assignmentFromCurse(c, ev);
    await tx.table('assignments').put(a);
    await tx.table('curses').put({ ...c, link: { kind: 'assignment', id: a.id } });
    await moveXp(tx, `curse:${c.id}`, `assign:${a.id}`);
    if (ev) await tx.table('calEvents').put({ ...ev, assignmentId: a.id, curseId: undefined });
    review.push(c.id);
  }

  // 2) пары из шаблона недели → события слоя My
  await migrateClassSlots(tx);

  // 3) YouTube Technique: задачи-Curses → страницы-видео (Curse остаётся и связан с видео)
  const techs: Technique[] = await tx.table('techniques').toArray();
  const yt = techs.find((t) => t.kind === 'youtube');
  const videos: Video[] = await tx.table('videos').toArray();
  if (yt) {
    let order = videos.length;
    for (const c of curses) {
      if (c.techniqueId !== yt.id || c.link || videos.some((v) => v.curseId === c.id)) continue;
      const status = stageStatus(c, yt.stages?.length || 0);
      const v = newVideo({
        title: c.title,
        status,
        deadline: status === 'published' ? undefined : c.due,
        publishAt: status === 'published' ? c.completedAt || c.due : status === 'scheduled' ? c.due : undefined,
        publishedAt: status === 'published' ? c.completedAt || c.due : undefined,
        priority: c.importance >= 4 ? 3 : c.importance === 3 ? 2 : 1,
        curseId: c.id,
        order: order++,
        createdAt: c.createdAt || Date.now(),
      });
      const blocks = videoDoc(c);
      await tx.table('videos').put(v);
      await tx.table('docs').put({ id: v.id, blocks, text: blocksText(blocks), links: [], updatedAt: Date.now() });
      await tx.table('curses').put({ ...c, link: { kind: 'video', id: v.id } });
      await moveXp(tx, `curse:${c.id}`, `video:${v.id}`);
    }
  }

  if (!opts.fresh && review.length) await tx.table('kv').put({ key: REVIEW_KEY, value: { ids: review, done: false } });
  return { assignments: review.length, statuses: VSTATUSES.length };
}
