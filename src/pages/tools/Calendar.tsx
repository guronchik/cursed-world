// Cursed Tools → Calendar: День / Неделя / Месяц / Agenda. Слои AITU / My / Assignments / Дедлайны.
// Свои занятия добавляются кнопкой «+», нажатием или долгим нажатием на пустой слот; на ПК — перетаскивание и растягивание.
import { addDays, addMonths, addWeeks, startOfDay, startOfWeek, subDays, subMonths, subWeeks } from 'date-fns';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { Monster } from '../../components/Monster';
import { MonthGrid, openCurse } from '../../components/shared';
import { Btn, Empty, Field, FilePick, IBtn, Modal, Panel, Seg, Toggle } from '../../components/ui';
import { db, type Assignment, type CalEvent, type CalSource, type Curse } from '../../db/schema';
import { applySnapshot, deleteSource, exportIcs, fetchIcs, importIcs, MANUAL, newSource, occurrences, refreshSource } from '../../lib/calendar';
import { dayKey, fmt, shortLeft, timeOf, weekdayNames } from '../../lib/dates';
import { applySeriesEdit, ETYPES, etypeOf, findOverlaps, isSeries, masterOf, type Scope } from '../../lib/events';
import { chooseBox, confirmBox, toast } from '../../lib/fx';
import { curseGrade, GRADE_COLOR } from '../../lib/grade';
import { useLive, useMedia, useNow } from '../../lib/hooks';
import { dismissedSet, pendingDeadlines, saveAssignment, syncFromCurse } from '../../lib/linked';
import { findOnMap } from '../../lib/mapLink';
import { downloadBlob } from '../../lib/media';
import { setQuery, useRoute } from '../../lib/router';
import { L } from '../../lib/runtime';
import { useSettings } from '../../lib/settings';
import { AssignmentSheet, DeadlineInbox } from './Assignments';
import { EventSheet, type EventTarget } from './EventSheet';
import { CopyWeekSheet, SemesterSheet } from './SemesterSheet';

type View = 'day' | 'week' | 'month' | 'agenda';
type Layer = 'aitu' | 'mine' | 'assign' | 'deadlines';
const LAYERS_KEY = 'cw-cal-layers';

export interface CalItem {
  key: string;
  kind: 'event' | 'curse' | 'assign';
  start: number;
  end: number;
  allDay: boolean;
  title: string;
  sub: string;
  color: string;
  ev?: CalEvent;
  curse?: Curse;
  assignment?: Assignment;
  source?: string;
  deadline: boolean;
  recurring?: boolean;
}

const HOUR = 48;

function useCalData() {
  return useLive(async () => {
    const [events, sources, subjects, curses, assignments, dismissed] = await Promise.all([db.calEvents.toArray(), db.calSources.toArray(), db.subjects.toArray(), db.curses.toArray(), db.assignments.toArray(), dismissedSet()]);
    return { events, sources, subjects, curses, assignments, pending: pendingDeadlines(events, dismissed) };
  }, []);
}
type CalData = NonNullable<ReturnType<typeof useCalData>>;

export function buildItems(d: CalData, from: number, to: number, layers: Set<Layer>, now = Date.now()): CalItem[] {
  const subj = (id?: string) => d.subjects.find((s) => s.id === id);
  const srcOn = new Map(d.sources.map((s) => [s.id, s]));
  const out: CalItem[] = [];
  const evs = d.events.filter((e) => {
    if (e.sourceId === MANUAL) return layers.has('mine');
    if (srcOn.get(e.sourceId)?.enabled === false) return false;
    if (e.kind === 'deadline') return layers.has('deadlines') && !(e.assignmentId && layers.has('assign'));
    return layers.has('aitu');
  });
  for (const o of occurrences(evs, from, to)) {
    const e = o.ev;
    const isDl = e.kind === 'deadline';
    const s = subj(e.subjectId);
    const et = etypeOf(e);
    out.push({
      key: o.key,
      kind: 'event',
      start: o.start,
      end: o.end,
      allDay: e.allDay,
      title: e.title,
      sub: [e.location, s && s.name !== e.title ? s.name : '', !isDl && et !== 'class' ? ETYPES().find((x) => x.v === et)?.label : ''].filter(Boolean).join(' · '),
      color: e.color || (isDl ? '#ff9f0a' : s?.color || srcOn.get(e.sourceId)?.color || '#0a84ff'),
      ev: e,
      source: e.sourceId === MANUAL ? 'My' : srcOn.get(e.sourceId)?.name,
      deadline: isDl,
      recurring: isSeries(e) || e.recurrenceId !== undefined,
    });
  }
  if (layers.has('assign'))
    for (const a of d.assignments) {
      if (!a.due || a.due < from || a.due >= to) continue;
      const s = subj(a.subjectId);
      out.push({ key: 'a' + a.id, kind: 'assign', start: a.due, end: a.due, allDay: false, title: a.title, sub: [s?.name, a.status === 'done' ? L('сдано', 'submitted') : ''].filter(Boolean).join(' · '), color: a.status === 'done' ? '#8e8e93' : s?.color || '#ff9f0a', assignment: a, source: 'Assignments', deadline: true });
    }
  if (layers.has('deadlines'))
    for (const c of d.curses) {
      if (c.calEventId || c.due < from || c.due >= to) continue;
      if (c.link?.kind === 'assignment' && layers.has('assign')) continue;
      const g = curseGrade(c.due, c.importance, now);
      out.push({ key: 'c' + c.id, kind: 'curse', start: c.due, end: c.due, allDay: false, title: c.title, sub: 'Curse', color: c.status === 'exorcised' ? '#8e8e93' : g.overdue ? '#ff453a' : GRADE_COLOR[g.grade], curse: c, deadline: true });
    }
  return out.sort((a, b) => a.start - b.start);
}

function loadLayers() {
  try {
    const v = JSON.parse(localStorage.getItem(LAYERS_KEY) || 'null');
    if (Array.isArray(v)) return new Set<Layer>(v);
  } catch {
    /* по умолчанию */
  }
  return new Set<Layer>(['aitu', 'mine', 'assign', 'deadlines']);
}

export function CalendarTool() {
  const d = useCalData();
  const settings = useSettings();
  const now = useNow(60_000);
  const mobile = useMedia('(max-width: 767px)');
  const { query } = useRoute();
  const parseView = (q: string | null): View | null => (q === 'slots' ? 'week' : q && ['day', 'week', 'month', 'agenda'].includes(q) ? (q as View) : null);
  const [view, setView] = useState<View>(() => parseView(query.get('view')) || (window.matchMedia('(max-width: 767px)').matches ? 'day' : 'week'));
  const [anchor, setAnchor] = useState(() => {
    const q = query.get('date');
    const t = q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? new Date(`${q}T00:00:00`) : new Date();
    return startOfDay(isNaN(t.getTime()) ? new Date() : t);
  });
  const [layers, setLayers] = useState<Set<Layer>>(loadLayers);
  const [edit, setEdit] = useState<EventTarget | null>(null);
  const [creating, setCreating] = useState<{ start: number; end: number; allDay?: boolean } | null>(null);
  const [imp, setImp] = useState(query.get('import') === '1');
  const [srcOpen, setSrcOpen] = useState(false);
  const [semOpen, setSemOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [inbox, setInbox] = useState(false);
  const [moving, setMoving] = useState<CalItem | null>(null);
  const qs = query.toString();
  useEffect(() => {
    const v = parseView(query.get('view'));
    if (v) setView(v);
    const dt = query.get('date');
    if (dt && /^\d{4}-\d{2}-\d{2}$/.test(dt)) {
      const t = new Date(`${dt}T00:00:00`);
      if (!isNaN(t.getTime())) setAnchor(startOfDay(t));
    }
    if (query.get('import') === '1') setImp(true);
    if (query.get('new') === '1') {
      const st = new Date();
      st.setMinutes(0, 0, 0);
      st.setHours(st.getHours() + 1);
      setCreating({ start: st.getTime(), end: st.getTime() + 90 * 60000 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qs]);
  useEffect(() => {
    try {
      localStorage.setItem(LAYERS_KEY, JSON.stringify([...layers]));
    } catch {
      /* хранилище недоступно — слои просто не запомнятся */
    }
  }, [layers]);

  if (!d) return null;
  const conflicts = d.events.filter((e) => e.conflict);
  const range = (() => {
    if (view === 'day') return [anchor.getTime(), addDays(anchor, 1).getTime()];
    if (view === 'week') {
      const s = startOfWeek(anchor, { weekStartsOn: 1 });
      return [s.getTime(), addDays(s, 7).getTime()];
    }
    if (view === 'month') return [subDays(new Date(anchor.getFullYear(), anchor.getMonth(), 1), 7).getTime(), addDays(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1), 7).getTime()];
    return [startOfDay(new Date()).getTime(), addDays(new Date(), 45).getTime()];
  })();
  const items = buildItems(d, range[0], range[1], layers, now);
  const step = (dir: 1 | -1) => {
    if (view === 'day') setAnchor(addDays(anchor, dir));
    else if (view === 'week') setAnchor(dir > 0 ? addWeeks(anchor, 1) : subWeeks(anchor, 1));
    else if (view === 'month') setAnchor(dir > 0 ? addMonths(anchor, 1) : subMonths(anchor, 1));
  };
  const toggleLayer = (l: Layer) =>
    setLayers((s) => {
      const n = new Set(s);
      if (n.has(l)) n.delete(l);
      else n.add(l);
      return n;
    });

  const open = (it: CalItem) => {
    if (it.kind === 'curse') openCurse(it.curse!.id);
    else if (it.kind === 'assign') setQuery('a', it.assignment!.id);
    else setEdit({ ev: it.ev!, start: it.start, end: it.end, source: it.source });
  };

  /** Перенос/растягивание: повторяющееся занятие — спросить «только это / это и следующие / все». */
  const moveItem = async (it: CalItem, newStart: number, newEnd?: number) => {
    const end = newEnd ?? newStart + (it.end - it.start);
    if (newStart === it.start && end === it.end) return;
    if (it.kind === 'event' && it.ev) {
      const ev = it.ev;
      const next: CalEvent = { ...ev, start: newStart, end };
      if (it.recurring) {
        const master = await masterOf(ev);
        if (!master) return;
        const scope = (await chooseBox(L('Повторяющееся занятие. Перенести:', 'Recurring event. Move:'), [
          { v: 'this', label: L('Только это занятие', 'This event only') },
          { v: 'following', label: L('Это и следующие', 'This and following') },
          { v: 'all', label: L('Все занятия серии', 'All events') },
        ])) as Scope | null;
        if (!scope) return;
        await applySeriesEdit(master, ev.recurrenceId ?? it.start, next, scope);
      } else {
        const cur = (await db.calEvents.get(ev.id)) || ev;
        await db.calEvents.put({ ...cur, start: newStart, end, locallyEdited: cur.sourceId !== MANUAL || cur.locallyEdited, updatedAt: Date.now() });
      }
      const all = (await db.calEvents.toArray()).filter((x) => !x.hidden);
      const ov = findOverlaps({ ...ev, rrule: undefined, start: newStart, end }, all, newStart);
      toast(ov.length ? L(`Перенесено · пересекается с «${ov[0].title}»`, `Moved · overlaps “${ov[0].title}”`) : L('Перенесено', 'Moved'), ov.length ? 'warn' : 'ok');
    } else if (it.kind === 'curse' && it.curse) {
      const c = { ...it.curse, due: newStart };
      await db.curses.put(c);
      await syncFromCurse(c);
      toast(L('Срок перенесён', 'Deadline moved'));
    } else if (it.kind === 'assign' && it.assignment) {
      await saveAssignment({ ...it.assignment, due: newStart });
      toast(L('Срок перенесён', 'Deadline moved'));
    }
  };

  const title = view === 'month' ? fmt(anchor, 'LLLL yyyy') : view === 'week' ? `${fmt(startOfWeek(anchor, { weekStartsOn: 1 }), 'd MMM')} — ${fmt(addDays(startOfWeek(anchor, { weekStartsOn: 1 }), 6), 'd MMM')}` : view === 'day' ? fmt(anchor, 'EEEE, d MMMM') : L('Ближайшие 45 дней', 'Next 45 days');
  const newAt = (start: number, allDay = false) => setCreating({ start, end: start + 90 * 60000, allDay });
  const quickNew = () => {
    const st = new Date(anchor);
    const h = new Date().getHours() + 1;
    st.setHours(Math.min(20, Math.max(8, h)), 0, 0, 0);
    newAt(st.getTime());
  };

  return (
    <div className="space-y-3">
      <NextClassCard d={d} now={now} onOpen={open} />

      <div className="flex flex-wrap items-center gap-2">
        <Seg
          options={[
            { v: 'day' as View, label: L('День', 'Day') },
            { v: 'week' as View, label: L('Неделя', 'Week') },
            { v: 'month' as View, label: L('Месяц', 'Month') },
            { v: 'agenda' as View, label: 'Agenda' },
          ]}
          value={view}
          onChange={setView}
        />
        <div className="ml-auto flex items-center gap-0.5 flex-wrap">
          <IBtn icon="plus" title={L('Новое занятие', 'New event')} onClick={quickNew} />
          <button className="ibtn relative" title={L('Inbox дедлайнов', 'Deadline inbox')} aria-label={L('Inbox дедлайнов', 'Deadline inbox')} onClick={() => setInbox(true)}>
            <Icon name="inbox" size={18} />
            {d.pending.length > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-blood text-white text-[10px] font-bold grid place-items-center">{d.pending.length}</span>}
          </button>
          <IBtn icon="grad" title={L('Семестр и каникулы', 'Semester & breaks')} onClick={() => setSemOpen(true)} />
          <IBtn icon="copy" title={L('Скопировать неделю', 'Copy week')} onClick={() => setCopyOpen(true)} />
          <IBtn icon="download" title={L('Импорт ICS', 'Import ICS')} onClick={() => setImp(true)} />
          <IBtn icon="layers" title={L('Источники', 'Sources')} onClick={() => setSrcOpen(true)} />
          <IBtn
            icon="upload"
            title={L('Экспорт .ics', 'Export .ics')}
            onClick={async () => {
              downloadBlob(await exportIcs(), `cursed-world-${dayKey()}.ics`);
              toast(L('Календарь экспортирован', 'Calendar exported'));
            }}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {view !== 'agenda' && (
          <div className="flex items-center gap-1">
            <IBtn icon="left" onClick={() => step(-1)} title={L('Назад', 'Back')} />
            <button className="chip" onClick={() => setAnchor(startOfDay(new Date()))}>
              {L('Сегодня', 'Today')}
            </button>
            <IBtn icon="right" onClick={() => step(1)} title={L('Вперёд', 'Next')} />
          </div>
        )}
        <div className="text-[17px] font-semibold capitalize">{title}</div>
        <div className="ml-auto flex flex-wrap gap-1.5" role="group" aria-label={L('Слои', 'Layers')}>
          {(
            [
              ['aitu', 'AITU'],
              ['mine', 'My'],
              ['assign', 'Assignments'],
              ['deadlines', L('Дедлайны', 'Deadlines')],
            ] as [Layer, string][]
          ).map(([l, n]) => (
            <button key={l} className={`chip ${layers.has(l) ? 'chip-on' : ''}`} aria-pressed={layers.has(l)} onClick={() => toggleLayer(l)}>
              {n}
            </button>
          ))}
        </div>
      </div>

      {d.pending.length > 0 && layers.has('deadlines') && (
        <button className="w-full panel !rounded-2xl px-4 py-2.5 flex items-center gap-3 text-left" onClick={() => setInbox(true)}>
          <Icon name="inbox" size={17} className="text-acc" />
          <span className="text-[14px] flex-1">{L(`В ICS найдено дедлайнов: ${d.pending.length} — выбери, что добавить в Assignments`, `${d.pending.length} deadlines found in ICS — choose what to add to Assignments`)}</span>
          <Icon name="right" size={16} className="text-dim" />
        </button>
      )}
      {conflicts.length > 0 && (
        <button className="w-full panel !rounded-2xl px-4 py-3 flex items-center gap-3 text-left" onClick={() => setSrcOpen(true)}>
          <Icon name="alert" size={18} className="text-gold" />
          <span className="text-[14px]">{L(`Конфликтов: ${conflicts.length} — в ICS изменились события, которые ты правил`, `${conflicts.length} conflicts — events you edited changed in ICS`)}</span>
          <Icon name="right" size={16} className="ml-auto text-dim" />
        </button>
      )}
      {moving && (
        <div className="panel !rounded-2xl px-4 py-3 flex items-center gap-3">
          <Icon name="grip" size={16} />
          <span className="text-[14px] flex-1">{L(`Нажми на новое время для «${moving.title}»`, `Tap a new time for “${moving.title}”`)}</span>
          <Btn size="xs" variant="ghost" onClick={() => setMoving(null)}>
            {L('Отмена', 'Cancel')}
          </Btn>
        </div>
      )}

      {!d.events.length && !d.sources.length && (
        <Panel bodyClass="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="app-icon w-12 h-12">
              <Icon name="calendar" size={22} />
            </span>
            <div className="flex-1 min-w-[12rem]">
              <div className="font-semibold">{L('Добавь свои занятия или подключи AITU', 'Add your classes or connect AITU')}</div>
              <div className="text-[13px] text-muted">{L('Нажми «+» или на пустой слот. ICS из Moodle — необязательный слой.', 'Tap “+” or an empty slot. Moodle ICS is an optional layer.')}</div>
            </div>
            <Btn icon="plus" onClick={quickNew}>
              {L('Занятие', 'Event')}
            </Btn>
            <Btn variant="ghost" icon="download" onClick={() => setImp(true)}>
              ICS
            </Btn>
          </div>
        </Panel>
      )}

      {(view === 'day' || view === 'week') && (
        <Panel bodyClass="p-2 sm:p-3">
          {view === 'day' && <DayStrip anchor={anchor} onPick={setAnchor} d={d} layers={layers} />}
          <Timeline
            days={view === 'day' ? [anchor] : Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor, { weekStartsOn: 1 }), i))}
            items={items}
            now={now}
            compact={mobile && view === 'week'}
            moving={moving}
            onOpen={open}
            onCreate={(start) => newAt(start)}
            onCreateAllDay={(day) => newAt(startOfDay(day).getTime(), true)}
            onLongPress={(it) => setMoving(it)}
            onDrop={async (it, start) => {
              setMoving(null);
              await moveItem(it, start);
            }}
            onResize={(it, end) => moveItem(it, it.start, end)}
          />
        </Panel>
      )}

      {view === 'month' && (
        <Panel bodyClass="p-2 sm:p-4">
          <MonthGrid
            month={anchor}
            onMonth={setAnchor}
            onSelect={(k) => {
              setAnchor(startOfDay(new Date(k + 'T00:00')));
              setView('day');
            }}
            renderDay={(_, k) => {
              const list = items.filter((i) => dayKey(i.start) === k);
              return (
                <>
                  <div className="space-y-0.5 hidden sm:block">
                    {list.slice(0, 3).map((i) => (
                      <div key={i.key} className="text-[10px] leading-tight truncate px-1 rounded" style={{ background: `color-mix(in srgb, ${i.color} 22%, transparent)` }}>
                        {i.kind === 'assign' ? '◆ ' : ''}
                        {i.title}
                      </div>
                    ))}
                    {list.length > 3 && <div className="text-[9px] text-dim">+{list.length - 3}</div>}
                  </div>
                  <div className="flex flex-wrap gap-0.5 sm:hidden">
                    {list.slice(0, 6).map((i) => (
                      <span key={i.key} className={`w-1.5 h-1.5 ${i.deadline ? 'rotate-45' : 'rounded-full'}`} style={{ background: i.color }} />
                    ))}
                  </div>
                </>
              );
            }}
          />
        </Panel>
      )}

      {view === 'agenda' && <Agenda items={items} onOpen={open} />}

      {(edit || creating) && (
        <EventSheet
          key={edit ? `${edit.ev.id}@${edit.start}` : `new@${creating!.start}`}
          target={edit}
          preset={creating || undefined}
          onClose={() => {
            setEdit(null);
            setCreating(null);
          }}
          onOpen={(t) => {
            setCreating(null);
            setEdit(t);
          }}
        />
      )}
      <ImportSheet
        open={imp}
        onClose={() => {
          setImp(false);
          setQuery('import');
        }}
        sources={d.sources}
      />
      <SourcesSheet open={srcOpen} onClose={() => setSrcOpen(false)} sources={d.sources} events={d.events} settingsTz={settings.tz} />
      {semOpen && <SemesterSheet open onClose={() => setSemOpen(false)} />}
      {copyOpen && <CopyWeekSheet open onClose={() => setCopyOpen(false)} anchor={anchor} />}
      <DeadlineInbox open={inbox} onClose={() => setInbox(false)} />
      {query.get('a') && <AssignmentSheet key={query.get('a')!} id={query.get('a')!} onClose={() => setQuery('a')} />}
    </div>
  );
}

/** «Следующая пара»: время до начала, аудитория и «Найти на карте». Берёт оба слоя (My + AITU). */
function NextClassCard({ d, now, onOpen }: { d: CalData; now: number; onOpen: (i: CalItem) => void }) {
  const list = buildItems(d, now - 4 * 36e5, now + 14 * 864e5, new Set<Layer>(['aitu', 'mine']), now).filter((i) => i.kind === 'event' && !i.allDay && !i.deadline && i.ev && i.ev.kind === 'class' && i.end > now);
  const n = list[0];
  if (!n) return null;
  const ongoing = n.start <= now;
  const room = n.ev?.location;
  return (
    <Panel bodyClass="p-3 sm:p-4">
      <div className="flex items-center gap-3">
        <span className="w-1.5 self-stretch rounded-full" style={{ background: n.color }} />
        <button className="min-w-0 flex-1 text-left" onClick={() => onOpen(n)}>
          <div className="label" style={{ color: 'var(--accent-text)' }}>
            {ongoing ? L('Идёт сейчас', 'Now') : L('Следующая пара', 'Next class')}
          </div>
          <div className="text-[17px] font-semibold truncate">{n.title}</div>
          <div className="text-[13px] text-muted truncate">
            {fmt(n.start, 'EEE d MMM')} · {timeOf(n.start)}–{timeOf(n.end)}
            {room ? ` · ${room}` : ''}
            {n.ev?.teacher ? ` · ${n.ev.teacher}` : ''}
          </div>
        </button>
        <div className="text-right shrink-0">
          <div className="label">{ongoing ? L('до конца', 'ends in') : L('до начала', 'starts in')}</div>
          <div className="mono text-[20px] font-bold grad-text">{shortLeft((ongoing ? n.end : n.start) - now)}</div>
        </div>
        {(room || n.ev?.pinId) && (
          <Btn size="sm" variant="ghost" icon="pin" className="shrink-0 hidden sm:inline-flex" onClick={() => findOnMap(room, n.ev?.pinId)}>
            {L('Найти на карте', 'Find on map')}
          </Btn>
        )}
        {(room || n.ev?.pinId) && <IBtn icon="pin" className="sm:hidden" title={L('Найти на карте', 'Find on map')} onClick={() => findOnMap(room, n.ev?.pinId)} />}
      </div>
    </Panel>
  );
}

function DayStrip({ anchor, onPick, d, layers }: { anchor: Date; onPick: (x: Date) => void; d: CalData; layers: Set<Layer> }) {
  const start = startOfWeek(anchor, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const names = weekdayNames();
  const busy = new Set(buildItems(d, start.getTime(), addDays(start, 7).getTime(), layers).map((i) => dayKey(i.start)));
  const today = dayKey();
  return (
    <div className="grid grid-cols-7 gap-1 mb-2">
      {days.map((x, i) => {
        const k = dayKey(x);
        const on = k === dayKey(anchor);
        return (
          <button key={k} onClick={() => onPick(x)} className="flex flex-col items-center gap-0.5 py-1 rounded-xl min-h-[52px]">
            <span className={`text-[11px] ${k === today ? 'text-acc font-semibold' : 'text-muted'}`}>{names[i]}</span>
            <span className={`w-8 h-8 grid place-items-center rounded-full text-[15px] mono ${on ? 'font-bold' : ''}`} style={on ? { background: 'var(--accent-grad)', color: 'var(--on-accent)' } : undefined}>
              {x.getDate()}
            </span>
            <span className={`w-1 h-1 rounded-full ${busy.has(k) ? 'bg-cursed' : 'bg-transparent'}`} />
          </button>
        );
      })}
    </div>
  );
}

function Timeline({
  days,
  items,
  now,
  compact,
  moving,
  onOpen,
  onCreate,
  onCreateAllDay,
  onLongPress,
  onDrop,
  onResize,
}: {
  days: Date[];
  items: CalItem[];
  now: number;
  compact?: boolean;
  moving: CalItem | null;
  onOpen: (i: CalItem) => void;
  onCreate: (start: number) => void;
  onCreateAllDay: (day: Date) => void;
  onLongPress: (i: CalItem) => void;
  onDrop: (i: CalItem, start: number) => void;
  onResize: (i: CalItem, end: number) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const cols = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ it: CalItem; dy: number; dx: number; x0: number; y0: number; started: boolean } | null>(null);
  const [resize, setResize] = useState<{ it: CalItem; y0: number; dy: number } | null>(null);
  const press = useRef<number | null>(null);
  const emptyPress = useRef<{ t: number; x: number; y: number; fired: boolean } | null>(null);
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 7.5 * HOUR - 8;
  }, []);
  const colW = () => (cols.current ? cols.current.clientWidth / days.length : 1);
  const snap = (ms: number) => Math.round(ms / (15 * 60000)) * 15 * 60000;
  const posToTime = (clientX: number, clientY: number, floor = false) => {
    const r = cols.current!.getBoundingClientRect();
    const di = Math.max(0, Math.min(days.length - 1, Math.floor((clientX - r.left) / colW())));
    const mins = ((clientY - r.top) / HOUR) * 60;
    const ms = startOfDay(days[di]).getTime() + mins * 60000;
    return floor ? Math.floor(ms / (30 * 60000)) * 30 * 60000 : snap(ms);
  };
  const allDay = items.filter((i) => i.allDay);
  return (
    <div>
      {days.length > 1 && (
        <div className="grid ml-11" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0,1fr))` }}>
          {days.map((x) => (
            <div key={x.toISOString()} className={`text-center pb-1 text-[12px] ${dayKey(x) === dayKey() ? 'text-acc font-semibold' : 'text-muted'}`}>
              {fmt(x, compact ? 'EEEEEE' : 'EEE')} <span className="mono">{x.getDate()}</span>
            </div>
          ))}
        </div>
      )}
      <div className="grid ml-11 gap-1 mb-1" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0,1fr))` }}>
        {days.map((x) => {
          const list = allDay.filter((i) => dayKey(i.start) === dayKey(x));
          return (
            <div key={x.toISOString()} className="space-y-0.5 min-w-0 min-h-[10px]" onDoubleClick={() => onCreateAllDay(x)}>
              {list.map((i) => (
                <button key={i.key} onClick={() => onOpen(i)} className="block w-full text-left text-[11px] truncate px-1.5 py-0.5 rounded-md" style={{ background: `color-mix(in srgb, ${i.color} 28%, transparent)` }}>
                  {i.title}
                </button>
              ))}
            </div>
          );
        })}
      </div>
      <div ref={scroller} className="relative overflow-y-auto max-h-[64dvh] overscroll-contain">
        <div className="relative flex" style={{ height: 24 * HOUR }}>
          <div className="w-11 shrink-0 relative">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="absolute right-2 text-[10px] mono text-dim -translate-y-1/2" style={{ top: h * HOUR }}>
                {h ? `${String(h).padStart(2, '0')}:00` : ''}
              </div>
            ))}
          </div>
          <div
            ref={cols}
            className="relative flex-1 grid cursor-cell"
            data-testid="timeline"
            style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0,1fr))` }}
            onPointerDown={(e) => {
              if (e.pointerType !== 'touch' || moving) return;
              const st = { t: 0, x: e.clientX, y: e.clientY, fired: false };
              st.t = window.setTimeout(() => {
                st.fired = true;
                navigator.vibrate?.(12);
                onCreate(posToTime(st.x, st.y, true));
              }, 450);
              emptyPress.current = st;
            }}
            onPointerMove={(e) => {
              const p = emptyPress.current;
              if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) {
                window.clearTimeout(p.t);
                emptyPress.current = null;
              }
            }}
            onPointerUp={() => emptyPress.current && window.clearTimeout(emptyPress.current.t)}
            onPointerCancel={() => {
              if (emptyPress.current) window.clearTimeout(emptyPress.current.t);
              emptyPress.current = null;
            }}
            onClick={(e) => {
              if (moving) {
                onDrop(moving, posToTime(e.clientX, e.clientY));
                return;
              }
              if (emptyPress.current?.fired) {
                emptyPress.current = null;
                return;
              }
              emptyPress.current = null;
              onCreate(posToTime(e.clientX, e.clientY, true));
            }}
          >
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="absolute inset-x-0 border-t border-line pointer-events-none" style={{ top: h * HOUR }} />
            ))}
            {days.map((x) => {
              const from = startOfDay(x).getTime();
              const to = from + 864e5;
              const list = items.filter((i) => !i.allDay && i.start < to && Math.max(i.end, i.start + 20 * 60000) > from);
              const lanes: number[] = [];
              const lane = new Map<string, number>();
              for (const i of list) {
                const en = Math.max(i.end, i.start + 25 * 60000);
                let l = lanes.findIndex((v) => v <= i.start);
                if (l < 0) {
                  l = lanes.length;
                  lanes.push(en);
                } else lanes[l] = en;
                lane.set(i.key, l);
              }
              const nL = Math.max(1, lanes.length);
              return (
                <div key={x.toISOString()} className={`relative border-l border-line ${dayKey(x) === dayKey() ? 'bg-[color-mix(in_srgb,var(--accent-1)_5%,transparent)]' : ''}`}>
                  {dayKey(x) === dayKey(now) && (
                    <div className="absolute inset-x-0 z-20 h-0.5 bg-blood pointer-events-none" style={{ top: ((now - from) / 36e5) * HOUR }}>
                      <span className="absolute -left-1 -top-1 w-2.5 h-2.5 rounded-full bg-blood" />
                    </div>
                  )}
                  {list.map((i) => {
                    const st = Math.max(i.start, from);
                    const top = ((st - from) / 36e5) * HOUR;
                    const rz = resize?.it.key === i.key ? resize.dy : 0;
                    const h = Math.max(i.deadline ? 24 : 26, ((Math.min(i.end, to) - st) / 36e5) * HOUR - 2 + rz);
                    const l = lane.get(i.key) || 0;
                    const isDrag = drag?.it.key === i.key && drag.started;
                    const resizable = i.kind === 'event' && !i.deadline && i.end > i.start;
                    return (
                      <div
                        key={i.key}
                        role="button"
                        tabIndex={0}
                        data-key={i.key}
                        className={`absolute text-left rounded-lg px-1.5 py-1 overflow-hidden text-[11.5px] leading-tight cursor-pointer select-none ${moving?.key === i.key ? 'ring-2 ring-white' : ''} ${isDrag || rz ? 'z-30 shadow-2xl opacity-90' : 'z-10'}`}
                        style={{
                          top: top + (isDrag ? drag.dy : 0),
                          height: h,
                          left: `calc(${(l / nL) * 100}% + 2px)`,
                          width: `calc(${100 / nL}% - 4px)`,
                          transform: isDrag ? `translateX(${drag.dx}px)` : undefined,
                          background: `color-mix(in srgb, ${i.color} ${i.deadline ? 34 : 24}%, var(--panel-solid))`,
                          borderLeft: `3px ${i.kind === 'assign' ? 'dashed' : 'solid'} ${i.color}`,
                          touchAction: 'pan-y',
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && onOpen(i)}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          if (e.pointerType === 'touch') {
                            press.current = window.setTimeout(() => {
                              navigator.vibrate?.(12);
                              onLongPress(i);
                            }, 420);
                            return;
                          }
                          (e.currentTarget as Element).setPointerCapture(e.pointerId);
                          setDrag({ it: i, dy: 0, dx: 0, x0: e.clientX, y0: e.clientY, started: false });
                        }}
                        onPointerMove={(e) => {
                          if (press.current) {
                            window.clearTimeout(press.current);
                            press.current = null;
                          }
                          if (!drag || drag.it.key !== i.key) return;
                          const dy = e.clientY - drag.y0;
                          const dx = e.clientX - drag.x0;
                          if (!drag.started && Math.hypot(dx, dy) < 6) return;
                          setDrag({ ...drag, dy, dx: days.length > 1 ? dx : 0, started: true });
                        }}
                        onPointerUp={(e) => {
                          if (press.current) {
                            window.clearTimeout(press.current);
                            press.current = null;
                          }
                          if (drag?.it.key === i.key) {
                            const dd = drag;
                            setDrag(null);
                            if (dd.started) {
                              const dayShift = days.length > 1 ? Math.round(dd.dx / colW()) : 0;
                              const mins = Math.round(((dd.dy / HOUR) * 60) / 15) * 15;
                              e.stopPropagation();
                              (e.currentTarget as HTMLElement).dataset.dragged = '1';
                              onDrop(i, snap(i.start + dayShift * 864e5 + mins * 60000));
                            }
                          }
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          const el = e.currentTarget as HTMLElement;
                          if (el.dataset.dragged) {
                            delete el.dataset.dragged;
                            return;
                          }
                          if (moving) return;
                          onOpen(i);
                        }}
                      >
                        <span className="block font-semibold truncate">
                          {i.deadline && <Icon name={i.kind === 'assign' ? 'grad' : 'hourglass'} size={10} className="inline mr-0.5 -mt-0.5" />}
                          {i.recurring && <Icon name="refresh" size={9} className="inline mr-0.5 -mt-0.5 opacity-60" />}
                          {i.title}
                        </span>
                        {h > 34 && (
                          <span className="block text-muted truncate">
                            {timeOf(i.start)}
                            {i.end > i.start ? `–${timeOf(i.end + (rz ? Math.round(((rz / HOUR) * 60) / 15) * 15 * 60000 : 0))}` : ''}
                            {i.sub ? ` · ${i.sub}` : ''}
                          </span>
                        )}
                        {resizable && (
                          <span
                            className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize hidden [@media(pointer:fine)]:block"
                            aria-label={L('Растянуть', 'Resize')}
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              (e.currentTarget as Element).setPointerCapture(e.pointerId);
                              setResize({ it: i, y0: e.clientY, dy: 0 });
                            }}
                            onPointerMove={(e) => {
                              if (resize?.it.key !== i.key) return;
                              setResize({ ...resize, dy: Math.max(-((i.end - i.start) / 36e5) * HOUR + 12, e.clientY - resize.y0) });
                            }}
                            onPointerUp={(e) => {
                              e.stopPropagation();
                              if (resize?.it.key !== i.key) return;
                              const mins = Math.round(((resize.dy / HOUR) * 60) / 15) * 15;
                              setResize(null);
                              const host = (e.currentTarget as HTMLElement).parentElement;
                              if (host) host.dataset.dragged = '1';
                              if (mins) onResize(i, Math.max(i.start + 15 * 60000, i.end + mins * 60000));
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="text-[11px] text-dim mt-2 ml-1">
        {L('Нажми на пустое место — новое занятие. ПК: тащи событие или его нижний край. Телефон: удерживай событие, потом нажми на новое время.', 'Tap an empty slot to add. Desktop: drag an event or its bottom edge. Phone: long-press an event, then tap a new time.')}
      </div>
    </div>
  );
}

function Agenda({ items, onOpen }: { items: CalItem[]; onOpen: (i: CalItem) => void }) {
  const [limit, setLimit] = useState(60);
  const groups = new Map<string, CalItem[]>();
  for (const i of items.slice(0, limit)) {
    const k = dayKey(i.start);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(i);
  }
  if (!items.length)
    return (
      <Panel>
        <Empty text={L('В ближайшие 45 дней событий нет', 'No events in the next 45 days')} icon="calendar" />
      </Panel>
    );
  return (
    <Panel bodyClass="p-2">
      {[...groups.entries()].map(([k, list]) => (
        <div key={k} className="cv-auto">
          <div className="sticky top-0 z-10 px-2 py-1.5 text-[13px] font-semibold capitalize bg-[var(--panel-solid)] rounded-lg">{fmt(new Date(k + 'T12:00'), 'EEEE, d MMMM')}</div>
          {list.map((i) => (
            <button key={i.key} onClick={() => onOpen(i)} className="w-full flex items-center gap-3 px-2 py-2 text-left rounded-xl hover:bg-panel-2 min-h-[48px]">
              <span className="w-1 self-stretch rounded-full" style={{ background: i.color }} />
              <span className="mono text-[12px] text-muted w-12 shrink-0">{i.allDay ? L('весь день', 'all day') : timeOf(i.start)}</span>
              {i.curse && <Monster grade={curseGrade(i.curse.due, i.curse.importance).grade} size={26} />}
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] truncate">{i.title}</span>
                <span className="block text-[11.5px] text-dim truncate">{[i.sub, i.source].filter(Boolean).join(' · ')}</span>
              </span>
              {i.deadline && <span className="tag">{i.kind === 'assign' ? L('задание', 'assignment') : L('дедлайн', 'deadline')}</span>}
            </button>
          ))}
        </div>
      ))}
      {items.length > limit && (
        <div className="p-2">
          <Btn size="sm" variant="ghost" onClick={() => setLimit(limit + 60)}>
            {L('Показать ещё', 'Show more')}
          </Btn>
        </div>
      )}
    </Panel>
  );
}

function ImportSheet({ open, onClose, sources }: { open: boolean; onClose: () => void; sources: CalSource[] }) {
  const settings = useSettings();
  const [mode, setMode] = useState<'file' | 'url' | 'text'>('file');
  const [name, setName] = useState('AITU');
  const [url, setUrl] = useState('');
  const [hours, setHours] = useState(6);
  const [txt, setTxt] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const run = async (kind: CalSource['kind'], content: () => Promise<string>, extra: Partial<CalSource> = {}) => {
    setBusy(true);
    setErr('');
    try {
      const text = await content();
      const existing = sources.find((s) => (kind === 'url' ? s.url === extra.url : s.name === (name.trim() || 'ICS') && s.kind !== 'url'));
      const src = existing ? { ...existing, ...extra } : newSource({ name: name.trim() || 'ICS', kind, ...extra }, sources.length);
      await db.calSources.put(src);
      const st = await importIcs(src, text, settings);
      toast(L(`Готово: +${st.added}, обновлено ${st.updated}${st.curses ? `, дедлайнов найдено: ${st.curses} (Inbox)` : ''}${st.conflicts ? `, конфликтов ${st.conflicts}` : ''}`, `Done: +${st.added}, updated ${st.updated}${st.curses ? `, deadlines found: ${st.curses} (Inbox)` : ''}${st.conflicts ? `, conflicts ${st.conflicts}` : ''}`));
      onClose();
    } catch (e) {
      setErr(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={L('Импорт календаря (ICS)', 'Import calendar (ICS)')} kanji="暦">
      <div className="space-y-4">
        <Seg
          options={[
            { v: 'file' as const, label: L('Файл', 'File') },
            { v: 'url' as const, label: L('Ссылка', 'Link') },
            { v: 'text' as const, label: L('Текст', 'Text') },
          ]}
          value={mode}
          onChange={(m) => {
            setMode(m);
            setErr('');
          }}
        />
        <Field label={L('Название источника', 'Source name')}>
          <input className="inp" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        {mode === 'file' && (
          <div className="flex flex-wrap gap-2">
            <FilePick accept=".ics,text/calendar" className="btn" onFiles={([f]) => run('file', () => f.text())}>
              <Icon name="upload" size={16} /> {L('Выбрать .ics', 'Choose .ics')}
            </FilePick>
            <Btn variant="ghost" icon="sparkle" onClick={() => run('file', async () => (await fetch(`${import.meta.env.BASE_URL}samples/aitu.ics`)).text())}>
              {L('Тестовый AITU.ics', 'Sample AITU.ics')}
            </Btn>
          </div>
        )}
        {mode === 'url' && (
          <>
            <Field label={L('Ссылка-подписка (https:// или webcal://)', 'Subscription link (https:// or webcal://)')} hint={L('Moodle: Календарь → Экспорт календаря → Получить URL календаря.', 'Moodle: Calendar → Export calendar → Get calendar URL.')}>
              <input className="inp" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://lms.astanait.edu.kz/calendar/export_execute.php?…" />
            </Field>
            <Field label={L('Обновлять при открытии не чаще чем раз в', 'Refresh on open at most every')}>
              <Seg options={[1, 3, 6, 12, 24].map((h) => ({ v: h, label: `${h} ${L('ч', 'h')}` }))} value={hours} onChange={setHours} />
            </Field>
            <Btn icon="download" disabled={busy || !/^(https?|webcal):\/\//i.test(url.trim())} onClick={() => run('url', () => fetchIcs(url, settings.icsProxy), { url: url.trim(), refreshHours: hours })}>
              {L('Подписаться', 'Subscribe')}
            </Btn>
          </>
        )}
        {mode === 'text' && (
          <>
            <textarea className="inp mono !text-[12px]" rows={8} value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="BEGIN:VCALENDAR…" />
            <Btn icon="check" disabled={busy || !txt.includes('BEGIN:VCALENDAR')} onClick={() => run('text', async () => txt)}>
              {L('Импортировать', 'Import')}
            </Btn>
          </>
        )}
        {busy && <div className="text-[13px] text-muted">{L('Импортирую…', 'Importing…')}</div>}
        {err && (
          <div className="rounded-2xl p-3 bg-[color-mix(in_srgb,#ff453a_14%,transparent)] text-[13.5px]">
            <div className="font-semibold flex items-center gap-2">
              <Icon name="alert" size={15} /> {L('Не получилось', 'Failed')}
            </div>
            <p className="mt-1">{err}</p>
            {mode === 'url' && (
              <div className="flex gap-2 mt-2">
                <Btn size="xs" variant="ghost" onClick={() => setMode('file')}>
                  {L('Загрузить файл', 'Upload file')}
                </Btn>
                <Btn size="xs" variant="ghost" onClick={() => setMode('text')}>
                  {L('Вставить текст', 'Paste text')}
                </Btn>
              </div>
            )}
          </div>
        )}
        <p className="text-[12px] text-dim">
          {L('Повторный импорт того же источника не создаёт дубликатов: события обновляются по UID. Твои правки сохраняются, при конфликте спросим. Дедлайны (по ключевым словам из настроек) сами ничего не создают: они попадают в слой «Дедлайны» и в Inbox, откуда ты выбираешь, что добавить в Assignments.', 'Re-importing the same source never duplicates: events update by UID. Your edits are kept; conflicts are asked. Deadlines (by keywords in settings) create nothing by themselves: they go to the Deadlines layer and the Inbox, where you choose what to add to Assignments.')}
        </p>
      </div>
    </Modal>
  );
}

function SourcesSheet({ open, onClose, sources, events, settingsTz }: { open: boolean; onClose: () => void; sources: CalSource[]; events: CalEvent[]; settingsTz: string }) {
  const settings = useSettings();
  const [busy, setBusy] = useState<string | null>(null);
  const hidden = events.filter((e) => e.hidden && e.sourceId !== MANUAL);
  const conflicts = events.filter((e) => e.conflict);
  return (
    <Modal open={open} onClose={onClose} title={L('Источники календаря', 'Calendar sources')} kanji="源" wide>
      <div className="space-y-4">
        {sources.map((s) => {
          const n = events.filter((e) => e.sourceId === s.id).length;
          return (
            <div key={s.id} className="rounded-2xl bg-panel-2 p-3">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ background: s.color }} />
                <span className="font-semibold">{s.name}</span>
                <span className="tag">{s.kind === 'url' ? L('подписка', 'subscription') : s.kind === 'file' ? L('файл', 'file') : L('текст', 'text')}</span>
                <span className="text-[12px] text-dim ml-auto">{n} {L('событий', 'events')}</span>
              </div>
              {s.url && <div className="text-[11.5px] text-dim truncate mt-1">{s.url}</div>}
              <div className="text-[12px] text-muted mt-1">
                {s.lastFetched ? `${L('обновлено', 'updated')} ${fmt(s.lastFetched, 'd MMM HH:mm')}` : ''}
                {s.kind === 'url' ? ` · ${L('каждые', 'every')} ${s.refreshHours} ${L('ч', 'h')}` : ''}
              </div>
              {s.lastError && <div className="text-[12px] text-[#ff6961] mt-1">{s.lastError}</div>}
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <Toggle on={s.enabled} onChange={(enabled) => db.calSources.put({ ...s, enabled })} label={<span className="text-[13px]">{L('Показывать', 'Show')}</span>} />
                {s.kind === 'url' ? (
                  <Btn
                    size="xs"
                    variant="ghost"
                    icon="refresh"
                    disabled={busy === s.id}
                    onClick={async () => {
                      setBusy(s.id);
                      try {
                        const st = await refreshSource(s, settings);
                        toast(L(`Обновлено: +${st.added}, ${st.updated} изм.`, `Refreshed: +${st.added}, ${st.updated} changed`));
                      } catch (e) {
                        toast(String((e as Error).message || e), 'bad');
                      }
                      setBusy(null);
                    }}
                  >
                    {L('Обновить', 'Refresh')}
                  </Btn>
                ) : (
                  <FilePick accept=".ics,text/calendar" className="btn btn-ghost btn-xs" onFiles={async ([f]) => { const st = await importIcs(s, await f.text(), settings); toast(L(`Обновлено: +${st.added}, ${st.updated} изм.`, `Updated: +${st.added}, ${st.updated} changed`)); }}>
                    <Icon name="upload" size={12} /> {L('Новая версия файла', 'New file version')}
                  </FilePick>
                )}
                <Btn
                  size="xs"
                  variant="danger"
                  icon="trash"
                  className="ml-auto"
                  onClick={async () => {
                    if (await confirmBox(L(`Удалить источник «${s.name}» и его события? Задания, добавленные из него, останутся.`, `Delete “${s.name}” and its events? Assignments added from it stay.`), { danger: true })) await deleteSource(s.id);
                  }}
                >
                  {L('Удалить', 'Delete')}
                </Btn>
              </div>
            </div>
          );
        })}
        {!sources.length && <div className="text-sm text-muted">{L('Источников пока нет', 'No sources yet')}</div>}
        {conflicts.length > 0 && (
          <div>
            <div className="label mb-1.5 ml-1">{L('Конфликты', 'Conflicts')}</div>
            {conflicts.map((e) => (
              <div key={e.id} className="flex flex-wrap items-center gap-2 py-1.5">
                <span className="text-[14px] flex-1 min-w-0 truncate">
                  {e.title} → <span className="text-muted">{e.conflict!.title} · {fmt(e.conflict!.start, 'd MMM HH:mm')}</span>
                </span>
                <Btn size="xs" variant="ghost" onClick={() => db.calEvents.put({ ...e, ics: e.conflict, conflict: undefined })}>
                  {L('Оставить моё', 'Keep mine')}
                </Btn>
                <Btn size="xs" onClick={() => db.calEvents.put(applySnapshot(e, e.conflict!))}>
                  {L('Взять из ICS', 'Use ICS')}
                </Btn>
              </div>
            ))}
          </div>
        )}
        {hidden.length > 0 && (
          <div>
            <div className="label mb-1.5 ml-1">{L('Скрытые события', 'Hidden events')} · {hidden.length}</div>
            {hidden.slice(0, 50).map((e) => (
              <div key={e.id} className="flex items-center gap-2 py-1">
                <span className="text-[13.5px] flex-1 truncate text-muted">{e.title} · {fmt(e.start, 'd MMM')}</span>
                <Btn size="xs" variant="ghost" icon="eye" onClick={() => db.calEvents.put({ ...e, hidden: false })}>
                  {L('Вернуть', 'Restore')}
                </Btn>
              </div>
            ))}
          </div>
        )}
        <p className="text-[12px] text-dim">
          {L('Часовой пояс для событий без пояса', 'Timezone for floating times')}: <b>{settingsTz}</b> · {L('меняется в Settings → Календарь.', 'change in Settings → Calendar.')}
        </p>
      </div>
    </Modal>
  );
}
