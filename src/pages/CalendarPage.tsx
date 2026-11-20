// Единый календарь: дедлайны, пары (шаблон + ICS), события календаря, тренировки, сроки Binding Vow.
import { useState } from 'react';
import { Icon } from '../components/Icon';
import { Monster } from '../components/Monster';
import { MonthGrid, newCurse, openCurse } from '../components/shared';
import { Btn, PageTitle, Panel } from '../components/ui';
import { db } from '../db/schema';
import { dayKey, endOfDayTs, fmt, fromKey, timeOf, weekdayIdx } from '../lib/dates';
import { curseGrade, GRADE_COLOR, type Grade } from '../lib/grade';
import { useLive } from '../lib/hooks';
import { go } from '../lib/router';
import { L } from '../lib/runtime';
import { tonnage } from '../lib/stats';
import { occurrences } from '../lib/calendar';

type Kind = 'curse' | 'assign' | 'class' | 'event' | 'workout' | 'plan' | 'vow';
type Item = { id: string; kind: Kind; time?: string; title: string; sub?: string; color: string; done?: boolean; grade?: { grade: Grade; overdue: boolean }; onClick: () => void };

const KIND_META = () => ({
  curse: { label: L('Дедлайны', 'Deadlines'), color: '#8b6bff', icon: 'skull' },
  assign: { label: 'Assignments', color: '#ff9f0a', icon: 'grad' },
  class: { label: L('Занятия', 'Classes'), color: '#4dd4ff', icon: 'grad' },
  event: { label: L('События', 'Events'), color: '#5ac8fa', icon: 'calendar' },
  workout: { label: L('Тренировки', 'Workouts'), color: '#ff2744', icon: 'dumbbell' },
  plan: { label: L('План зала', 'Gym plan'), color: '#ff7a8a', icon: 'bolt' },
  vow: { label: 'Binding Vow', color: '#f2c14e', icon: 'chain' },
});

export function CalendarPage() {
  const [month, setMonth] = useState(() => new Date());
  const [day, setDay] = useState(() => dayKey());
  const [hidden, setHidden] = useState<Set<Kind>>(new Set());
  const d = useLive(async () => {
    const [curses, assignments, subjects, workouts, templates, vows, settings, events, sources] = await Promise.all([
      db.curses.toArray(),
      db.assignments.toArray(),
      db.subjects.toArray(),
      db.workouts.toArray(),
      db.templates.toArray(),
      db.vows.toArray(),
      db.settings.get('app'),
      db.calEvents.toArray(),
      db.calSources.toArray(),
    ]);
    const off = new Set(sources.filter((x) => !x.enabled).map((x) => x.id));
    return { curses, assignments, subjects, workouts, templates, vows, settings, events: events.filter((e) => !off.has(e.sourceId)) };
  }, []);
  if (!d) return null;
  const meta = KIND_META();
  const today = dayKey();

  const itemsOn = (k: string): Item[] => {
    const date = fromKey(k);
    const out: Item[] = [];
    for (const c of d.curses) {
      if (dayKey(c.due) !== k || c.link?.kind === 'assignment') continue;
      const g = curseGrade(c.due, c.importance);
      out.push({ id: c.id, kind: 'curse', time: timeOf(c.due), title: c.title, color: c.status === 'exorcised' ? '#5d5888' : g.overdue ? '#ff1a3c' : GRADE_COLOR[g.grade], done: c.status === 'exorcised', grade: c.status === 'active' ? g : undefined, onClick: () => openCurse(c.id) });
    }
    for (const a of d.assignments) {
      if (!a.due || dayKey(a.due) !== k) continue;
      const sj = d.subjects.find((x) => x.id === a.subjectId);
      out.push({ id: 'a' + a.id, kind: 'assign', time: timeOf(a.due), title: a.title, sub: sj?.name, color: sj?.color || meta.assign.color, done: a.status === 'done', onClick: () => go(`/tools/assignments?a=${a.id}`) });
    }
    // события ICS и свои: дедлайны со связанным Curse уже показаны выше
    const from = date.getTime();
    for (const o of occurrences(d.events, from, from + 864e5)) {
      if (o.ev.kind === 'deadline' && o.ev.assignmentId) continue; // уже есть как задание
      if (dayKey(o.start) !== k && !o.ev.allDay) continue;
      const kind: Kind = o.ev.kind === 'class' ? 'class' : o.ev.kind === 'deadline' ? 'curse' : 'event';
      const subj = d.subjects.find((x) => x.id === o.ev.subjectId);
      out.push({
        id: o.key,
        kind,
        time: o.ev.allDay ? undefined : timeOf(o.start),
        title: o.ev.title,
        sub: [o.ev.allDay ? L('весь день', 'all day') : `${timeOf(o.start)}–${timeOf(o.end)}`, o.ev.location].filter(Boolean).join(' · '),
        color: o.ev.color || subj?.color || meta[kind].color,
        onClick: () => go(`/tools/calendar?view=day&date=${k}`),
      });
    }
    const ws = d.workouts.filter((w) => w.date === k);
    for (const w of ws) out.push({ id: w.id, kind: 'workout', title: (w.finished ? '✓ ' : '') + w.name, sub: `${Math.round(tonnage(w))} kg`, color: meta.workout.color, onClick: () => go(`/taijutsu/flash/log?w=${w.id}`) });
    const plan = d.settings?.trainingPlan?.[String(weekdayIdx(date))];
    const tpl = d.templates.find((t) => t.id === plan);
    if (tpl && !ws.length && k >= today) out.push({ id: 'plan' + k, kind: 'plan', title: `${L('План', 'Plan')}: ${tpl.name}`, color: meta.plan.color, onClick: () => go('/taijutsu/flash/log') });
    for (const v of d.vows) {
      if (v.status === 'active' && dayKey(v.endDate) === k) out.push({ id: v.id + 'e', kind: 'vow', time: timeOf(v.endDate), title: `${L('Конец обета', 'Vow ends')}: ${v.sacrifice}`, color: meta.vow.color, onClick: () => go('/vows/contracts') });
      if (v.deadline && v.status === 'active' && dayKey(v.deadline) === k) out.push({ id: v.id + 'd', kind: 'vow', time: timeOf(v.deadline), title: `${L('Дедлайн', 'Deadline')}: ${v.forWhat}`, color: meta.vow.color, onClick: () => go('/vows/contracts') });
    }
    return out.filter((i) => !hidden.has(i.kind)).sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
  };

  const sel = itemsOn(day);
  return (
    <div>
      <PageTitle title="Calendar" kanji="暦" sub={L('Всё в одном: дедлайны, задания, занятия (мои и AITU), тренировки и сроки обетов.', 'Everything in one place: deadlines, assignments, classes (mine and AITU), workouts and vow terms.')} />
      <div className="flex flex-wrap gap-2 mb-4">
        {(Object.keys(meta) as Kind[]).map((k) => (
          <button
            key={k}
            className={`chip ${hidden.has(k) ? '' : 'chip-on'}`}
            style={hidden.has(k) ? undefined : { borderColor: meta[k].color, background: `color-mix(in srgb, ${meta[k].color} 13%, transparent)` }}
            onClick={() =>
              setHidden((h) => {
                const n = new Set(h);
                if (n.has(k)) n.delete(k);
                else n.add(k);
                return n;
              })
            }
          >
            <Icon name={meta[k].icon} size={12} style={{ color: meta[k].color }} /> {meta[k].label}
          </button>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <Panel bodyClass="p-3 sm:p-4">
          <MonthGrid
            month={month}
            onMonth={setMonth}
            selected={day}
            onSelect={setDay}
            renderDay={(_, k) => {
              const items = itemsOn(k);
              return (
                <>
                  <div className="space-y-0.5 hidden sm:block">
                    {items.slice(0, 4).map((i) => (
                      <div key={i.id} className={`text-[10px] leading-tight truncate px-1 ${i.done ? 'line-through opacity-60' : ''}`} style={{ background: i.kind === 'plan' ? 'transparent' : `color-mix(in srgb, ${i.color} 15%, transparent)`, borderLeft: `2px solid ${i.color}`, outline: i.kind === 'plan' ? `1px dashed color-mix(in srgb, ${i.color} 40%, transparent)` : 'none' }}>
                        {i.time && i.kind !== 'class' ? `${i.time} ` : ''}
                        {i.title}
                      </div>
                    ))}
                    {items.length > 4 && <div className="text-[9px] text-dim">+{items.length - 4}</div>}
                  </div>
                  <div className="flex flex-wrap gap-0.5 sm:hidden">
                    {items.slice(0, 6).map((i) => (
                      <span key={i.id} className="w-1.5 h-1.5" style={{ background: i.color }} />
                    ))}
                  </div>
                </>
              );
            }}
          />
        </Panel>
        <Panel
          title={fmt(fromKey(day), 'EEEE, d MMMM')}
          kanji="日"
          actions={
            <Btn size="xs" variant="ghost" icon="plus" onClick={() => newCurse({ due: endOfDayTs(fromKey(day)) })}>
              Curse
            </Btn>
          }
        >
          {sel.length ? (
            <div className="space-y-1">
              {sel.map((i) => (
                <button key={i.id} onClick={i.onClick} className="w-full flex items-center gap-3 py-2 px-2 -mx-2 text-left hover:bg-cursed/5">
                  {i.grade ? <Monster grade={i.grade.grade} overdue={i.grade.overdue} size={32} /> : <span className="w-8 h-8 grid place-items-center shrink-0" style={{ color: i.color, background: `color-mix(in srgb, ${i.color} 10%, transparent)` }}><Icon name={meta[i.kind].icon} size={15} /></span>}
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm truncate ${i.done ? 'line-through text-muted' : ''}`}>{i.title}</span>
                    <span className="block text-[11px] text-dim">
                      {meta[i.kind].label}
                      {i.sub ? ` · ${i.sub}` : i.time ? ` · ${i.time}` : ''}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted py-4">{L('Пустой день. Можно призвать что-нибудь.', 'Empty day.')}</div>
          )}
        </Panel>
      </div>
    </div>
  );
}
