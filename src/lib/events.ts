// Свои занятия (слой My): создание, повторы, правка «только это / это и следующие / все»,
// пропуск, дублирование, пересечения, копирование недели. Работает и для событий из ICS (правки не затираются реимпортом).
import { addDays, startOfDay, startOfWeek } from 'date-fns';
import { db, type CalEvent, type EventType } from '../db/schema';
import { MANUAL, occurrences, type Occ } from './calendar';
import { dayKey } from './dates';
import { icsUtc, parseRRule } from './ics';
import { L, uid } from './runtime';

export const LOCAL_TZ = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
})();

export const ETYPES = (): { v: EventType; label: string; icon: string }[] => [
  { v: 'class', label: L('Пара', 'Class'), icon: 'grad' },
  { v: 'exam', label: L('Экзамен', 'Exam'), icon: 'alert' },
  { v: 'office', label: 'Office hours', icon: 'user' },
  { v: 'study', label: L('Самоподготовка', 'Self-study'), icon: 'book' },
  { v: 'event', label: L('Событие', 'Event'), icon: 'calendar' },
];
export const etypeOf = (e: Pick<CalEvent, 'etype' | 'kind'>): EventType => e.etype || (e.kind === 'class' ? 'class' : 'event');
export const kindForEtype = (t: EventType): CalEvent['kind'] => (t === 'event' ? 'event' : 'class');

export function newMyEvent(p: Partial<CalEvent> = {}): CalEvent {
  const now = Date.now();
  const u = uid();
  const st = p.start ?? now;
  return {
    id: `${MANUAL}|${u}|`,
    sourceId: MANUAL,
    uid: u,
    title: '',
    description: '',
    location: '',
    organizer: '',
    categories: '',
    start: st,
    end: st + 90 * 60000,
    allDay: false,
    exdates: [],
    tz: LOCAL_TZ,
    kind: 'class',
    etype: 'class',
    teacher: '',
    notes: '',
    hidden: false,
    locallyEdited: false,
    createdAt: now,
    updatedAt: now,
    ...p,
  };
}

// ───── повторы ─────
export interface Repeat {
  mode: 'none' | 'weekly';
  days: number[]; // 0 = пн
  interval: number; // каждые N недель
  until?: string; // yyyy-MM-dd
  semester: boolean; // на весь семестр (до конца семестра из настроек)
  parity?: 'odd' | 'even';
}
const WD = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
export const wdOf = (ms: number) => (new Date(ms).getDay() + 6) % 7;

export function repeatOf(e: CalEvent): Repeat {
  const r = e.rrule ? parseRRule(e.rrule) : null;
  if (!r) return { mode: 'none', days: [wdOf(e.start)], interval: 1, semester: false, parity: e.parity };
  return {
    mode: 'weekly',
    days: r.byday?.length ? r.byday.map((d) => d.wd) : [wdOf(e.start)],
    interval: r.interval || 1,
    until: r.until ? dayKey(r.until) : undefined,
    semester: !!e.semesterBound,
    parity: e.parity,
  };
}

/** Repeat → поля события (rrule, parity, semesterBound). */
export function repeatFields(rep: Repeat, start: number): Pick<CalEvent, 'rrule' | 'parity' | 'semesterBound'> {
  if (rep.mode === 'none') return { rrule: undefined, parity: undefined, semesterBound: undefined };
  const days = (rep.days.length ? rep.days : [wdOf(start)]).slice().sort((a, b) => a - b);
  let rr = `FREQ=WEEKLY${rep.interval > 1 ? `;INTERVAL=${rep.interval}` : ''};BYDAY=${days.map((d) => WD[d]).join(',')}`;
  if (rep.until && /^\d{4}-\d{2}-\d{2}$/.test(rep.until) && !rep.semester) rr += `;UNTIL=${icsUtc(new Date(rep.until + 'T23:59:59').getTime())}`;
  return { rrule: rr, parity: rep.parity, semesterBound: rep.semester || undefined };
}

export const isSeries = (e: CalEvent) => !!e.rrule && e.recurrenceId === undefined;

/** Мастер серии для события или его переопределения. */
export async function masterOf(e: CalEvent) {
  if (isSeries(e)) return e;
  if (e.recurrenceId === undefined) return null;
  return (await db.calEvents.get(`${e.sourceId}|${e.uid}|`)) || null;
}

export type Scope = 'this' | 'following' | 'all';

/** Поля, которые переносятся при правке (всё, кроме идентичности и времени). */
const CONTENT = ['title', 'location', 'teacher', 'subjectId', 'color', 'notes', 'etype', 'kind', 'kindManual', 'pinId', 'classType', 'allDay', 'description'] as const;
const pick = (e: CalEvent) => Object.fromEntries(CONTENT.map((k) => [k, e[k]])) as Partial<CalEvent>;

const stripUntilCount = (rr: string) =>
  rr
    .split(';')
    .filter((p) => !/^(UNTIL|COUNT)=/i.test(p))
    .join(';');

async function overridesOf(m: CalEvent) {
  return (await db.calEvents.where('uid').equals(m.uid).toArray()).filter((x) => x.sourceId === m.sourceId && x.recurrenceId !== undefined);
}

/**
 * Применить правку к повтору серии.
 * occStart — исходное начало редактируемого повтора, next — отредактированные поля (start/end — новое время этого повтора).
 */
export async function applySeriesEdit(master: CalEvent, occStart: number, next: CalEvent, scope: Scope, rep?: Repeat) {
  const now = Date.now();
  const edited = master.sourceId !== MANUAL;
  const delta = next.start - occStart;
  const dur = Math.max(0, next.end - next.start);
  if (scope === 'this') {
    const id = `${master.sourceId}|${master.uid}|${occStart}`;
    const prev = await db.calEvents.get(id);
    await db.calEvents.put({
      ...master,
      ...(prev || {}),
      ...pick(next),
      id,
      recurrenceId: occStart,
      rrule: undefined,
      exdates: [],
      semesterBound: undefined,
      parity: undefined,
      start: next.start,
      end: next.end,
      hidden: false,
      locallyEdited: edited || !!prev?.locallyEdited,
      ics: prev?.ics,
      createdAt: prev?.createdAt || now,
      updatedAt: now,
    });
    return;
  }
  const repFields = rep ? repeatFields(rep, master.start + delta) : { rrule: master.rrule, parity: master.parity, semesterBound: master.semesterBound };
  const first = occurrences([{ ...master, hidden: false }], master.start - 1, master.start + 400 * 864e5)[0]?.start ?? master.start;
  if (scope === 'all' || occStart <= first) {
    const shifted = master.exdates.map((x) => x + delta);
    await db.calEvents.put({ ...master, ...pick(next), ...repFields, start: master.start + delta, end: master.start + delta + dur, exdates: shifted, locallyEdited: edited || master.locallyEdited, updatedAt: now });
    if (delta)
      for (const o of await overridesOf(master)) {
        await db.calEvents.delete(o.id);
        const rid = o.recurrenceId! + delta;
        await db.calEvents.put({ ...o, id: `${o.sourceId}|${o.uid}|${rid}`, recurrenceId: rid, updatedAt: now });
      }
    return;
  }
  // «это и следующие»: старая серия заканчивается перед этим повтором, с него начинается новая
  const until = occStart - 1000;
  await db.calEvents.put({ ...master, rrule: `${stripUntilCount(master.rrule!)};UNTIL=${icsUtc(until)}`, semesterBound: undefined, locallyEdited: edited || master.locallyEdited, updatedAt: now });
  const nu = uid();
  let rr = repFields.rrule;
  if (rr && !rep) {
    rr = stripUntilCount(rr);
    const origUntil = parseRRule(master.rrule!)?.until;
    if (origUntil && origUntil > occStart) rr += `;UNTIL=${icsUtc(origUntil)}`;
  }
  const nm: CalEvent = {
    ...master,
    ...pick(next),
    ...repFields,
    rrule: rr,
    id: `${master.sourceId}|${nu}|`,
    uid: nu,
    start: next.start,
    end: next.start + dur,
    exdates: master.exdates.filter((x) => x > occStart).map((x) => x + delta),
    ics: undefined,
    conflict: undefined,
    locallyEdited: edited,
    createdAt: now,
    updatedAt: now,
  };
  await db.calEvents.put(nm);
  for (const o of await overridesOf(master)) {
    if ((o.recurrenceId ?? 0) < occStart) continue;
    await db.calEvents.delete(o.id);
    const rid = o.recurrenceId! + delta;
    await db.calEvents.put({ ...o, uid: nu, id: `${o.sourceId}|${nu}|${rid}`, recurrenceId: rid, locallyEdited: true, updatedAt: now });
  }
}

/** Пропустить (отменить) один повтор. */
export async function skipOccurrence(e: CalEvent, occStart: number) {
  const m = await masterOf(e);
  if (!m) {
    await removeEvent(e);
    return;
  }
  const ov = await db.calEvents.get(`${m.sourceId}|${m.uid}|${occStart}`);
  if (ov) await db.calEvents.put({ ...ov, hidden: true, updatedAt: Date.now() });
  await db.calEvents.put({ ...m, exdates: [...new Set([...m.exdates, occStart])], locallyEdited: m.sourceId !== MANUAL || m.locallyEdited, updatedAt: Date.now() });
}

/** Удалить: своё — удаляется, из ICS — скрывается (иначе реимпорт вернёт его). */
export async function removeEvent(e: CalEvent) {
  if (e.sourceId !== MANUAL) {
    await db.calEvents.put({ ...e, hidden: true, updatedAt: Date.now() });
    return;
  }
  const m = isSeries(e) ? e : null;
  if (m) for (const o of await overridesOf(m)) await db.calEvents.delete(o.id);
  await db.calEvents.delete(e.id);
}

export async function removeSeries(e: CalEvent) {
  const m = (await masterOf(e)) || e;
  if (m.sourceId !== MANUAL) {
    await db.calEvents.put({ ...m, hidden: true, updatedAt: Date.now() });
    for (const o of await overridesOf(m)) await db.calEvents.put({ ...o, hidden: true, updatedAt: Date.now() });
    return;
  }
  for (const o of await overridesOf(m)) await db.calEvents.delete(o.id);
  await db.calEvents.delete(m.id);
}

/** Дублировать один повтор как отдельное событие слоя My. */
export async function duplicateOccurrence(e: CalEvent, start: number, end: number) {
  const copy = newMyEvent({ ...pick(e), title: e.title, start, end, subjectId: e.subjectId, color: e.color, tz: LOCAL_TZ });
  await db.calEvents.put(copy);
  return copy;
}

/** Пересечения по времени с другими занятиями/событиями (на 10 недель вперёд для повторов). */
export function findOverlaps(cand: CalEvent, all: CalEvent[], from = cand.start) {
  if (cand.allDay) return [];
  const horizon = from + (cand.rrule ? 10 * 7 * 864e5 : 864e5 + (cand.end - cand.start));
  const mine = occurrences([{ ...cand, hidden: false }], from - 1, horizon);
  const others = occurrences(
    all.filter((x) => x.uid !== cand.uid && x.kind !== 'deadline' && !x.hidden && !x.allDay),
    from - 864e5,
    horizon,
  );
  const out: { title: string; start: number; end: number }[] = [];
  for (const a of mine)
    for (const b of others) {
      if (b.ev.allDay) continue;
      if (a.start < b.end && b.start < a.end) out.push({ title: b.ev.title, start: b.start, end: b.end });
    }
  const seen = new Set<string>();
  return out.filter((o) => {
    const k = `${o.title}|${o.start}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Скопировать неделю: все занятия слоя My этой недели появятся в целевой неделе (кроме тех, что уже там идут по повтору). */
export async function copyWeek(fromDay: Date, toDay: Date) {
  const f0 = startOfWeek(fromDay, { weekStartsOn: 1 });
  const t0 = startOfWeek(toDay, { weekStartsOn: 1 });
  const shift = Math.round((t0.getTime() - f0.getTime()) / 864e5);
  if (!shift) return 0;
  const mine = (await db.calEvents.where('sourceId').equals(MANUAL).toArray()).filter((e) => !e.hidden);
  const src = occurrences(mine, f0.getTime(), addDays(f0, 7).getTime());
  const dst = occurrences(mine, t0.getTime(), addDays(t0, 7).getTime());
  let n = 0;
  for (const o of src) {
    const st = addDays(new Date(o.start), shift).getTime();
    const en = st + (o.end - o.start);
    if (dst.some((d: Occ) => d.ev.title === o.ev.title && Math.abs(d.start - st) < 60000)) continue;
    await db.calEvents.put(newMyEvent({ ...pick(o.ev), start: st, end: en, subjectId: o.ev.subjectId, color: o.ev.color, tz: LOCAL_TZ }));
    n++;
  }
  return n;
}

export const sameDay = (a: number, b: number) => startOfDay(a).getTime() === startOfDay(b).getTime();
