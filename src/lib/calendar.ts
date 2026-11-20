// Календарь: импорт ICS без дубликатов, автоклассификация, дедлайны → Inbox (сами ничего не создают), повторения, семестр, экспорт.
import { addDays } from 'date-fns';
import { getISOWeek, startOfWeek } from 'date-fns';
import { db, type CalEvent, type CalSource, type IcsSnapshot, type Semester, type Settings, type Subject } from '../db/schema';
import { refreshAssignmentFromEvent } from './linked';
import { dayKey } from './dates';
import { escapeText, expandRRule, foldLine, icsDate, icsUtc, parseDuration, parseIcs, parseRRule, parseTime, prop, props, text, tzResolver, type IcsComp } from './ics';
import { L, uid } from './runtime';

export const MANUAL = 'manual';
const PALETTE = ['#0a84ff', '#30d5c8', '#ff9f0a', '#bf5af2', '#ff375f', '#34c759', '#5e5ce6', '#ffd60a', '#64d2ff', '#ff6482'];

const hashOf = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
};

export function classify(title: string, isTodo: boolean, hasDue: boolean, keywords: string[]): CalEvent['kind'] {
  if (isTodo || hasDue) return 'deadline';
  const t = title.toLowerCase();
  return keywords.some((k) => k.trim() && new RegExp(`(^|[^\\p{L}])${k.trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'u').test(t)) ? 'deadline' : 'class';
}

/** Предмет и преподаватель: Moodle кладёт «Курс | Преподаватель» в CATEGORIES, расписания — в SUMMARY/ORGANIZER. */
export function subjectInfo(ev: { title: string; categories: string; organizer: string; kind: CalEvent['kind'] }) {
  if (ev.categories) {
    const [name, teacher] = ev.categories.split('|').map((x) => x.trim());
    if (name) return { name, teacher: teacher || ev.organizer || undefined };
  }
  if (ev.kind === 'class' && ev.title) {
    const name = ev.title.replace(/\s*[([].*?[)\]]\s*/g, ' ').replace(/\s+[-–—]\s+(лекция|практика|семинар|лаб.*|lecture|practice|seminar|lab.*)$/i, '').trim();
    return { name, teacher: ev.organizer || undefined };
  }
  return null;
}

interface Parsed {
  uid: string;
  recurrenceId?: number;
  snap: IcsSnapshot;
  isTodo: boolean;
  hasDue: boolean;
  cancelled: boolean;
}

export function parseEvents(textIcs: string, defaultTz: string): Parsed[] {
  const cal = parseIcs(textIcs);
  const resolve = tzResolver(cal, defaultTz);
  const out: Parsed[] = [];
  for (const c of cal.comps.filter((x) => x.type === 'VEVENT' || x.type === 'VTODO')) {
    const isTodo = c.type === 'VTODO';
    const st = prop(c, 'DTSTART');
    const dueP = prop(c, 'DUE');
    const startT = st ? parseTime(st.value, st.params, resolve) : dueP ? parseTime(dueP.value, dueP.params, resolve) : null;
    if (!startT) continue;
    let end = startT.ms;
    const en = prop(c, 'DTEND') || (isTodo ? dueP : undefined);
    const dur = prop(c, 'DURATION');
    if (en) end = parseTime(en.value, en.params, resolve)?.ms ?? end;
    else if (dur) end = startT.ms + parseDuration(dur.value);
    else if (startT.allDay) end = addDays(startT.ms, 1).getTime();
    const rid = prop(c, 'RECURRENCE-ID');
    const exdates = props(c, 'EXDATE').flatMap((p) => p.value.split(',').map((v) => parseTime(v, p.params, resolve)?.ms).filter((x): x is number => x !== undefined));
    const org = prop(c, 'ORGANIZER');
    const snapBase = {
      title: text(c, 'SUMMARY') || L('Без названия', 'Untitled'),
      description: text(c, 'DESCRIPTION'),
      location: text(c, 'LOCATION'),
      organizer: org ? org.params.CN || org.value.replace(/^mailto:/i, '') : '',
      categories: text(c, 'CATEGORIES'),
      start: startT.ms,
      end: Math.max(end, startT.ms),
      allDay: startT.allDay,
      rrule: prop(c, 'RRULE')?.value,
      exdates,
      tz: startT.tz,
    };
    out.push({
      uid: prop(c, 'UID')?.value || hashOf(snapBase.title + snapBase.start),
      recurrenceId: rid ? parseTime(rid.value, rid.params, resolve)?.ms : undefined,
      snap: { ...snapBase, hash: hashOf(JSON.stringify(snapBase)) },
      isTodo,
      hasDue: !!dueP,
      cancelled: (prop(c, 'STATUS')?.value || '').toUpperCase() === 'CANCELLED',
    });
  }
  return out;
}

async function subjectFor(info: { name: string; teacher?: string } | null, subjects: Subject[]) {
  if (!info?.name) return undefined;
  const found = subjects.find((s) => s.name.toLowerCase() === info.name.toLowerCase());
  if (found) return found.id;
  const s: Subject = { id: uid(), name: info.name, color: PALETTE[subjects.length % PALETTE.length], teacher: info.teacher };
  await db.subjects.put(s);
  subjects.push(s);
  return s.id;
}

export interface ImportStats {
  added: number;
  updated: number;
  conflicts: number;
  removed: number;
  curses: number; // найдено дедлайнов (попадают в Inbox, ничего не создают)
  total: number;
}

export async function importIcs(source: CalSource, icsText: string, settings: Pick<Settings, 'tz' | 'icsKeywords'>): Promise<ImportStats> {
  const parsed = parseEvents(icsText, settings.tz || 'Asia/Almaty');
  const subjects = await db.subjects.toArray();
  const existing = new Map((await db.calEvents.where('sourceId').equals(source.id).toArray()).map((e) => [e.id, e]));
  const seen = new Set<string>();
  const stats: ImportStats = { added: 0, updated: 0, conflicts: 0, removed: 0, curses: 0, total: parsed.length };
  const now = Date.now();
  for (const p of parsed) {
    const id = `${source.id}|${p.uid}|${p.recurrenceId ?? ''}`;
    seen.add(id);
    const old = existing.get(id);
    const kind = old?.kindManual ? old.kind : classify(p.snap.title, p.isTodo, p.hasDue, settings.icsKeywords);
    if (!old) {
      const subjectId = await subjectFor(subjectInfo({ ...p.snap, kind }), subjects);
      const ev: CalEvent = { id, sourceId: source.id, uid: p.uid, recurrenceId: p.recurrenceId, ...p.snap, kind, subjectId, notes: '', hidden: p.cancelled, locallyEdited: false, ics: p.snap, createdAt: now, updatedAt: now };
      if (kind === 'deadline' && !p.cancelled) stats.curses++; // найден дедлайн → Inbox
      await db.calEvents.put(ev);
      stats.added++;
      continue;
    }
    if (old.ics?.hash === p.snap.hash && old.kind === kind) continue;
    if (old.locallyEdited) {
      if (old.ics?.hash !== p.snap.hash) {
        await db.calEvents.put({ ...old, conflict: p.snap, updatedAt: now });
        stats.conflicts++;
      }
      continue;
    }
    const subjectId = old.subjectId || (await subjectFor(subjectInfo({ ...p.snap, kind }), subjects));
    const ev: CalEvent = { ...old, ...p.snap, kind, subjectId, ics: p.snap, conflict: undefined, hidden: old.hidden || p.cancelled, updatedAt: now };
    await db.calEvents.put(ev);
    if (ev.assignmentId) await refreshAssignmentFromEvent(ev);
    stats.updated++;
  }
  // будущие события, исчезнувшие из ICS, удаляем (если я их не правил и не скрывал); прошлые оставляем как историю
  for (const [id, ev] of existing) {
    if (seen.has(id) || ev.locallyEdited || ev.hidden || ev.end < now || ev.rrule || ev.assignmentId) continue;
    await db.calEvents.delete(id);
    stats.removed++;
  }
  await db.calSources.put({ ...source, lastFetched: now, lastError: undefined });
  return stats;
}

/** Загрузка подписки: напрямую или через свой прокси (если сайт не отдаёт CORS-заголовки). */
export async function fetchIcs(url: string, proxy?: string) {
  const tryFetch = async (u: string) => {
    const r = await fetch(u, { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const t = await r.text();
    if (!/BEGIN:VCALENDAR/i.test(t)) throw new Error(L('Ответ не похож на ICS', 'Response is not an ICS file'));
    return t;
  };
  const clean = url.trim().replace(/^webcal:\/\//i, 'https://');
  try {
    return await tryFetch(clean);
  } catch (e) {
    if (proxy) return tryFetch(proxy.includes('{url}') ? proxy.replace('{url}', encodeURIComponent(clean)) : proxy + encodeURIComponent(clean));
    const isCors = e instanceof TypeError;
    throw new Error(
      isCors
        ? L(
            'Браузер не смог загрузить ссылку: сайт не разрешает запросы с других сайтов (CORS). Скачай .ics и загрузи файлом, вставь текст ICS или укажи свой прокси в настройках календаря.',
            'The browser could not load this link: the site blocks cross-site requests (CORS). Download the .ics and upload it, paste the ICS text, or set a proxy in calendar settings.',
          )
        : String((e as Error).message || e),
    );
  }
}

export async function refreshSource(src: CalSource, settings: Settings) {
  if (src.kind !== 'url' || !src.url) throw new Error('not a subscription');
  try {
    const t = await fetchIcs(src.url, settings.icsProxy);
    return await importIcs(src, t, settings);
  } catch (e) {
    await db.calSources.put({ ...src, lastError: String((e as Error).message || e), lastFetched: Date.now() });
    throw e;
  }
}

/** Автообновление подписок при открытии приложения (не чаще раза в N часов). */
export async function autoRefresh(settings: Settings) {
  if (!navigator.onLine) return;
  for (const s of await db.calSources.toArray()) {
    if (s.kind !== 'url' || !s.enabled || !s.url) continue;
    if (s.lastFetched && Date.now() - s.lastFetched < Math.max(1, s.refreshHours) * 36e5) continue;
    try {
      await refreshSource(s, settings);
    } catch {
      /* ошибка сохранится в источнике и будет показана в UI */
    }
  }
}

// ───── Повторения и элементы календаря ─────
export interface Occ {
  key: string;
  ev: CalEvent;
  start: number;
  end: number;
}

// ───── Семестр: чётность недель, каникулы, «до конца семестра» ─────
let SEM: Semester = { holidays: [], parityBase: 'iso' };
export const setSemester = (s?: Semester) => {
  SEM = s ? { holidays: s.holidays || [], parityBase: s.parityBase || 'iso', start: s.start, end: s.end } : { holidays: [], parityBase: 'iso' };
};
export const getSemester = () => SEM;

/** Номер недели для чётности: ISO или от начала семестра (1-я неделя семестра — числитель). */
export function weekNo(ms: number, sem: Semester = SEM) {
  if (sem.parityBase === 'semester' && sem.start) {
    const w0 = startOfWeek(new Date(sem.start + 'T00:00'), { weekStartsOn: 1 }).getTime();
    return Math.floor((startOfWeek(ms, { weekStartsOn: 1 }).getTime() - w0) / (7 * 864e5) + 0.5) + 1;
  }
  return getISOWeek(ms);
}
export const isOddWeekNo = (ms: number) => weekNo(ms) % 2 !== 0;

const CLASSY = new Set(['class', 'exam', 'office', 'study']);
export function inHoliday(ms: number, sem: Semester = SEM) {
  const k = dayKey(ms);
  return sem.holidays.find((h) => k >= h.from && k <= (h.to || h.from));
}
/** Мои повторяющиеся занятия не показываются в каникулы и вне чётной/нечётной недели. */
function occAllowed(e: CalEvent, st: number) {
  if (e.parity && (weekNo(st) % 2 !== 0) !== (e.parity === 'odd')) return false;
  if (e.sourceId === MANUAL && (CLASSY.has(e.etype || '') || (!e.etype && e.kind === 'class')) && inHoliday(st)) return false;
  return true;
}
const semesterEnd = () => (SEM.end ? new Date(SEM.end + 'T23:59:59').getTime() : undefined);

export function occurrences(events: CalEvent[], from: number, to: number): Occ[] {
  const out: Occ[] = [];
  const overrides = new Map<string, Set<number>>();
  for (const e of events) if (e.recurrenceId !== undefined) {
    const k = `${e.sourceId}|${e.uid}`;
    if (!overrides.has(k)) overrides.set(k, new Set());
    overrides.get(k)!.add(Math.round(e.recurrenceId / 60000));
  }
  for (const e of events) {
    if (e.hidden) continue;
    const dur = Math.max(0, e.end - e.start);
    if (e.rrule && e.recurrenceId === undefined) {
      const rule = parseRRule(e.rrule);
      if (!rule) continue;
      const skip = overrides.get(`${e.sourceId}|${e.uid}`);
      const semEnd = e.semesterBound ? semesterEnd() : undefined;
      const upto = semEnd !== undefined ? Math.min(to, semEnd) : to;
      if (upto <= from - dur) continue;
      for (const st of expandRRule(e.start, e.tz || 'UTC', rule, from - dur, upto, e.exdates, e.allDay)) {
        if (skip?.has(Math.round(st / 60000))) continue;
        if (!occAllowed(e, st)) continue;
        out.push({ key: `${e.id}@${st}`, ev: e, start: st, end: st + dur });
      }
    } else if (e.end >= from && e.start < to) out.push({ key: e.id, ev: e, start: e.start, end: e.end });
  }
  return out.sort((a, b) => a.start - b.start);
}

// ───── Экспорт .ics ─────
export async function exportIcs() {
  const [events, assignments, curses] = await Promise.all([db.calEvents.toArray(), db.assignments.toArray(), db.curses.toArray()]);
  const L1: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CURSED WORLD//Calendar//RU', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:CURSED WORLD'];
  const stamp = icsUtc(Date.now());
  const ev = (lines: string[]) => L1.push('BEGIN:VEVENT', ...lines, `DTSTAMP:${stamp}`, 'END:VEVENT');
  for (const e of events.filter((x) => !x.hidden)) {
    let rrule = e.rrule;
    if (rrule && e.semesterBound && SEM.end && !/UNTIL=|COUNT=/.test(rrule)) rrule += `;UNTIL=${icsUtc(new Date(SEM.end + 'T23:59:59').getTime())}`;
    if (rrule && e.parity && /FREQ=WEEKLY/.test(rrule) && !/INTERVAL=/.test(rrule)) rrule += ';INTERVAL=2';
    ev([
      `UID:${escapeText(e.uid)}`,
      ...(e.recurrenceId !== undefined ? [`RECURRENCE-ID:${icsUtc(e.recurrenceId)}`] : []),
      e.allDay ? `DTSTART;VALUE=DATE:${icsDate(e.start)}` : `DTSTART:${icsUtc(e.start)}`,
      e.allDay ? `DTEND;VALUE=DATE:${icsDate(e.end)}` : `DTEND:${icsUtc(e.end)}`,
      `SUMMARY:${escapeText(e.title)}`,
      ...(e.description || e.notes ? [`DESCRIPTION:${escapeText([e.description, e.notes].filter(Boolean).join('\n\n'))}`] : []),
      ...(e.location ? [`LOCATION:${escapeText(e.location)}`] : []),
      ...(rrule ? [`RRULE:${rrule}`] : []),
      ...(e.exdates.length ? [`EXDATE:${e.exdates.map(icsUtc).join(',')}`] : []),
      `CATEGORIES:${e.kind === 'deadline' ? 'DEADLINE' : (e.etype || e.kind).toUpperCase()}`,
    ]);
  }
  for (const a of assignments.filter((x) => x.due && x.status !== 'done')) {
    ev([`UID:assignment-${a.id}@cursed-world`, `DTSTART:${icsUtc(a.due!)}`, `DTEND:${icsUtc(a.due!)}`, `SUMMARY:${escapeText(a.title)}`, 'CATEGORIES:ASSIGNMENT']);
  }
  for (const c of curses.filter((x) => x.status === 'active' && !x.link && !x.calEventId)) {
    ev([`UID:curse-${c.id}@cursed-world`, `DTSTART:${icsUtc(c.due)}`, `DTEND:${icsUtc(c.due)}`, `SUMMARY:${escapeText(c.title)}`, 'CATEGORIES:DEADLINE']);
  }
  L1.push('END:VCALENDAR');
  return new Blob([L1.map(foldLine).join('\r\n') + '\r\n'], { type: 'text/calendar' });
}

export function newSource(p: Partial<CalSource>, count: number): CalSource {
  return { id: uid(), name: 'AITU', kind: 'file', color: PALETTE[count % PALETTE.length], enabled: true, refreshHours: 6, createdAt: Date.now(), ...p };
}

export type { IcsComp };

/** Применить версию из ICS (кнопка «Вернуть версию AITU» / «Взять из ICS»). */
export function applySnapshot(ev: CalEvent, snap: IcsSnapshot): CalEvent {
  const { hash: _h, ...f } = snap;
  void _h;
  return { ...ev, ...f, ics: snap, conflict: undefined, locallyEdited: false, updatedAt: Date.now() };
}

export async function deleteSource(id: string) {
  const evs = await db.calEvents.where('sourceId').equals(id).toArray();
  // задания, добавленные из этого источника, остаются (они уже мои)
  await db.calEvents.bulkDelete(evs.map((e) => e.id));
  await db.calSources.delete(id);
}
