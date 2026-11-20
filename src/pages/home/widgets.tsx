// Виджеты главной: реестр, данные, компоненты. Каждый окрашен в цвет своего раздела.
import { addDays, endOfMonth, startOfMonth, startOfWeek, subDays } from 'date-fns';
import { createContext, useContext, useState, type MouseEvent, type ReactNode } from 'react';
import { Icon } from '../../components/Icon';
import { GradeBadge, Monster } from '../../components/Monster';
import { Countdown, openCurse } from '../../components/shared';
import { Progress, Ring } from '../../components/ui';
import { db, type Assignment, type CalEvent, type Curse, type Goal, type Med, type MedLog, type Note, type PracticeLog, type Review, type Routine, type RoutineLog, type Settings, type Subject, type Technique, type Vow, type Workout, type BodyWeight, type Template } from '../../db/schema';
import { exorcise, quickSave, setMedLog, startWorkout, toggleRoutineStep } from '../../lib/actions';
import { occurrences } from '../../lib/calendar';
import { findOnMap } from '../../lib/mapLink';
import { dayKey, fmt, shortLeft, timeOf, weekdayIdx, weekdayNames, weekKey } from '../../lib/dates';
import { curseGrade, GRADE_COLOR, GRADES } from '../../lib/grade';
import { useAutosave } from '../../lib/hooks';
import { go } from '../../lib/router';
import { L, uid } from '../../lib/runtime';
import { medsDoneDates, monthGoalProgress, practiceDates, routineDone, routineDoneDates, scheduledDoses, streak, tonnage, yearGoalProgress } from '../../lib/stats';
import type { SectionId } from '../../lib/theme';
import { rankOf } from '../../lib/xp';

export type WSize = 'S' | 'M' | 'L' | 'XL';
export interface WidgetItem {
  id: string;
  type: string;
  size: WSize;
  config?: Record<string, string | undefined>;
}

export interface HomeData {
  now: number;
  curses: Curse[];
  techs: Technique[];
  assignments: Assignment[];
  subjects: Subject[];
  calEvents: CalEvent[];
  routines: Routine[];
  rlogs: RoutineLog[];
  meds: Med[];
  mlogs: MedLog[];
  workouts: Workout[];
  templates: Template[];
  settings: Settings;
  vows: Vow[];
  practice: PracticeLog[];
  reviews: Review[];
  goals: Goal[];
  notes: Note[];
  bodyWeights: BodyWeight[];
  xp: number;
}

export const HomeCtx = createContext<HomeData | null>(null);
const useHome = () => useContext(HomeCtx)!;

// ───── Общие куски ─────
const Big = ({ children, className = '' }: { children: ReactNode; className?: string }) => <div className={`text-[28px] leading-none font-bold mono ${className}`}>{children}</div>;
const Sub = ({ children }: { children: ReactNode }) => <div className="text-[12px] text-muted truncate">{children}</div>;
const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

/** Занятия на день из обоих слоёв (My + AITU), события и дедлайны (Curses, задания, найденные в ICS). */
function dayAgenda(d: HomeData, day: Date) {
  const from = new Date(day).setHours(0, 0, 0, 0);
  const to = from + 864e5;
  const sub = (id?: string) => d.subjects.find((s) => s.id === id);
  const items: { key: string; start: number; end: number; title: string; meta: string; color: string; kind: 'class' | 'deadline' | 'event'; room?: string; pinId?: string }[] = [];
  for (const o of occurrences(d.calEvents, from, to)) {
    if (o.ev.kind === 'deadline' && o.ev.assignmentId) continue; // уже показано как задание
    const s = sub(o.ev.subjectId);
    items.push({ key: o.key, start: o.start, end: o.end, title: o.ev.title, meta: [o.ev.location, s && s.name !== o.ev.title ? s.name : ''].filter(Boolean).join(' · '), color: o.ev.color || s?.color || '#30d5c8', kind: o.ev.kind, room: o.ev.location, pinId: o.ev.pinId });
  }
  for (const c of d.curses) if (c.status === 'active' && c.link?.kind !== 'assignment' && !c.calEventId && c.due >= from && c.due < to) items.push({ key: c.id, start: c.due, end: c.due, title: c.title, meta: L('дедлайн', 'deadline'), color: GRADE_COLOR[curseGrade(c.due, c.importance, d.now).grade], kind: 'deadline' });
  for (const a of d.assignments) if (a.status !== 'done' && a.due && a.due >= from && a.due < to) items.push({ key: 'a' + a.id, start: a.due, end: a.due, title: a.title, meta: sub(a.subjectId)?.name || L('задание', 'assignment'), color: sub(a.subjectId)?.color || '#ff9f0a', kind: 'deadline' });
  return items.sort((a, b) => a.start - b.start);
}

function nextClassAny(d: HomeData) {
  for (let i = 0; i < 14; i++) {
    const it = dayAgenda(d, addDays(new Date(d.now), i)).find((x) => x.kind === 'class' && x.end > d.now);
    if (it) return it;
  }
  return null;
}

// ───── Виджеты ─────
function NextClass({ size }: { size: WSize }) {
  const d = useHome();
  const n = nextClassAny(d);
  if (!n) return <Sub>{L('Пар нет', 'No classes')}</Sub>;
  const ongoing = n.start <= d.now;
  return (
    <div className="flex flex-col h-full">
      <div className="label" style={{ color: 'var(--accent-text)' }}>{ongoing ? L('Идёт сейчас', 'Now') : L('Следующая', 'Next')}</div>
      <div className={`font-semibold leading-tight mt-1 ${size === 'S' ? 'text-[15px] line-clamp-2' : 'text-[17px] truncate'}`}>{n.title}</div>
      <Sub>{fmt(n.start, 'EEE')} {timeOf(n.start)}{n.meta ? ` · ${n.meta}` : ''}</Sub>
      <div className="mt-auto flex items-end gap-2">
        <div className="mono text-[22px] font-bold grad-text">{shortLeft((ongoing ? n.end : n.start) - d.now)}</div>
        {(n.room || n.pinId) && (
          <button
            className="ml-auto ibtn ibtn-sm"
            title={L('Найти на карте', 'Find on map')}
            aria-label={L('Найти на карте', 'Find on map')}
            onClick={(e) => {
              stop(e);
              void findOnMap(n.room, n.pinId);
            }}
          >
            <Icon name="pin" size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

function TodaySchedule({ size }: { size: WSize }) {
  const d = useHome();
  const items = dayAgenda(d, new Date(d.now));
  const lim = size === 'M' ? 2 : size === 'L' ? 6 : 8;
  return (
    <div className="space-y-1.5">
      {items.slice(0, lim).map((i) => (
        <div key={i.key} className={`flex items-center gap-2 ${i.end < d.now && i.kind !== 'deadline' ? 'opacity-45' : ''}`}>
          <span className="w-1 self-stretch rounded-full" style={{ background: i.color }} />
          <span className="mono text-[12px] text-muted w-11 shrink-0">{timeOf(i.start)}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] truncate">{i.title}</span>
            {size !== 'M' && i.meta && <span className="block text-[11px] text-dim truncate">{i.meta}</span>}
          </span>
        </div>
      ))}
      {!items.length && <Sub>{L('Сегодня свободно', 'Free today')}</Sub>}
      {items.length > lim && <div className="text-[11px] text-dim">+{items.length - lim}</div>}
    </div>
  );
}

function NearestDeadline({ size, config }: { size: WSize; config?: WidgetItem['config'] }) {
  const d = useHome();
  const list = d.curses.filter((c) => c.status === 'active' && (!config?.techniqueId || c.techniqueId === config.techniqueId)).sort((a, b) => a.due - b.due);
  const c = list.find((x) => x.due >= d.now) || list[0];
  if (!c) return <Sub>{L('Проклятий нет', 'No curses')}</Sub>;
  const g = curseGrade(c.due, c.importance, d.now);
  if (size === 'S')
    return (
      <div className="flex flex-col h-full items-start">
        <Monster grade={g.grade} overdue={g.overdue} size={44} />
        <div className="text-[13px] font-semibold leading-tight mt-1 line-clamp-2">{c.title}</div>
        <div className="mt-auto mono text-[18px] font-bold" style={{ color: g.overdue ? '#ff6961' : 'var(--accent-text)' }}>{shortLeft(c.due - d.now)}</div>
      </div>
    );
  if (size === 'M')
    return (
      <div className="flex gap-3 h-full items-center">
        <Monster grade={g.grade} overdue={g.overdue} size={60} />
        <div className="min-w-0 flex-1">
          <div className="text-[14.5px] font-semibold leading-tight line-clamp-2">{c.title}</div>
          <div className="flex items-baseline gap-2 mt-1.5 min-w-0">
            <span className="mono text-[19px] font-bold grad-text shrink-0">{shortLeft(c.due - d.now)}</span>
            <span className="text-[12px] text-muted truncate">{fmt(c.due, 'EEE d MMM, HH:mm')}</span>
          </div>
        </div>
      </div>
    );
  return (
    <div className="flex gap-3 h-full items-center">
      <Monster grade={g.grade} overdue={g.overdue} size={96} />
      <div className="min-w-0 flex-1">
        <GradeBadge grade={g.grade} overdue={g.overdue} />
        <div className="text-[15px] font-semibold leading-tight mt-1 line-clamp-2">{c.title}</div>
        <Sub>{fmt(c.due, 'EEE d MMM, HH:mm')}</Sub>
        <div className="mt-1.5">
          <Countdown to={c.due} />
        </div>
        <button className="btn btn-sm mt-2" onClick={(e) => { stop(e); void exorcise(c.id, e.currentTarget); }}>
          <Icon name="bolt" size={13} /> Exorcise
        </button>
      </div>
    </div>
  );
}

function CursesByGrade({ size }: { size: WSize }) {
  const d = useHome();
  const act = d.curses.filter((c) => c.status === 'active');
  return (
    <div className="grid grid-cols-5 gap-1 h-full items-center">
      {GRADES.map((g) => {
        const n = act.filter((c) => curseGrade(c.due, c.importance, d.now).grade === g).length;
        return (
          <div key={g} className="flex flex-col items-center gap-1">
            <Monster grade={g} size={size === 'M' ? 30 : 44} />
            <span className="mono text-[17px] font-bold" style={{ color: GRADE_COLOR[g] }}>{n}</span>
            {size !== 'M' && <span className="text-[10px] text-dim">{g === 0 ? 'Special' : `Grade ${g}`}</span>}
          </div>
        );
      })}
    </div>
  );
}

function TodayMissions({ size }: { size: WSize }) {
  const d = useHome();
  const today = dayKey(d.now);
  const curses = d.curses.filter((c) => c.status === 'active' && (dayKey(c.due) === today || c.due < d.now)).sort((a, b) => a.due - b.due);
  const agenda = dayAgenda(d, new Date(d.now)).filter((i) => i.kind === 'class');
  const routines = d.routines.map((r) => ({ r, done: routineDone(r, d.rlogs.find((l) => l.id === `${today}|${r.id}`)) }));
  const doses = scheduledDoses(d.meds, today);
  const taken = doses.filter((x) => d.mlogs.find((l) => l.id === x.id)?.status === 'taken').length;
  const plan = d.templates.find((t) => t.id === d.settings.trainingPlan?.[String(weekdayIdx(d.now))]);
  const trained = d.workouts.some((w) => w.date === today);
  const rows: { icon: string; text: string; done: boolean; onClick?: (e: MouseEvent) => void }[] = [
    ...curses.slice(0, size === 'M' ? 2 : 4).map((c) => ({ icon: 'skull', text: c.title, done: false, onClick: (e: MouseEvent) => { stop(e); openCurse(c.id); } })),
    { icon: 'grad', text: `${L('Пар', 'Classes')}: ${agenda.length}`, done: agenda.every((a) => a.end < d.now) && agenda.length > 0 },
    ...routines.map((x) => ({ icon: x.r.slot === 'morning' ? 'sun' : 'moon', text: x.r.name, done: x.done })),
    { icon: 'pill', text: `${L('Таблетки', 'Pills')} ${taken}/${doses.length}`, done: doses.length > 0 && taken === doses.length },
    { icon: 'dumbbell', text: trained ? L('Тренировка сделана', 'Workout done') : plan ? plan.name : L('День отдыха', 'Rest day'), done: trained },
  ];
  return (
    <div className="space-y-1.5">
      {rows.slice(0, size === 'M' ? 3 : 9).map((r, i) => (
        <button key={i} className="w-full flex items-center gap-2 text-left" onClick={r.onClick}>
          <span className={`w-5 h-5 rounded-full grid place-items-center shrink-0 ${r.done ? '' : 'bg-panel-2'}`} style={r.done ? { background: 'var(--accent-grad)', color: 'var(--on-accent)' } : undefined}>
            <Icon name={r.done ? 'check' : r.icon} size={11} stroke={2.4} />
          </span>
          <span className={`text-[13.5px] truncate ${r.done ? 'text-muted line-through' : ''}`}>{r.text}</span>
        </button>
      ))}
    </div>
  );
}

function FistQuests({ size }: { size: WSize }) {
  const d = useHome();
  const today = dayKey(d.now);
  return (
    <div className={`grid ${size === 'L' || size === 'XL' ? 'grid-cols-1' : 'grid-cols-2'} gap-2 h-full`}>
      {d.routines.map((r) => {
        const log = d.rlogs.find((l) => l.id === `${today}|${r.id}`);
        const n = r.steps.filter((s) => log?.done.includes(s.id)).length;
        return (
          <div key={r.id} className="min-w-0">
            <div className="flex items-center gap-2">
              <Ring value={r.steps.length ? (n / r.steps.length) * 100 : 0} size={30} stroke={4}>
                <Icon name={r.slot === 'morning' ? 'sun' : 'moon'} size={12} />
              </Ring>
              <span className="text-[13px] font-semibold truncate">{r.name}</span>
            </div>
            {size === 'M' ? (
              <div className="text-[12px] text-muted mt-1">{n}/{r.steps.length}</div>
            ) : (
              <div className="mt-1.5 space-y-1">
                {r.steps.map((s) => (
                  <button key={s.id} className="flex items-center gap-2 w-full text-left" onClick={(e) => { stop(e); void toggleRoutineStep(r, today, s.id, e.currentTarget); }}>
                    <span className={`chk ${log?.done.includes(s.id) ? 'chk-on' : ''}`} />
                    <span className={`text-[13px] truncate ${log?.done.includes(s.id) ? 'line-through text-muted' : ''}`}>{s.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Pills({ size }: { size: WSize }) {
  const d = useHome();
  const today = dayKey(d.now);
  const doses = scheduledDoses(d.meds, today).sort((a, b) => a.time.localeCompare(b.time));
  return (
    <div className="space-y-1">
      {doses.slice(0, size === 'M' ? 2 : 7).map((x) => {
        const st = d.mlogs.find((l) => l.id === x.id)?.status;
        return (
          <div key={x.id} className="flex items-center gap-2">
            <span className="mono text-[12px] text-muted w-11">{x.time}</span>
            <span className={`text-[13.5px] truncate flex-1 ${st === 'taken' ? 'line-through text-muted' : ''}`}>{x.med.name}</span>
            <button className={`ibtn ibtn-sm ${st === 'taken' ? 'chip-on' : 'bg-panel-2'}`} onClick={(e) => { stop(e); void setMedLog(x.med, today, x.time, st === 'taken' ? null : 'taken'); }} aria-label={L('Принял', 'Taken')}>
              <Icon name="check" size={14} stroke={2.4} />
            </button>
          </div>
        );
      })}
      {!doses.length && <Sub>{L('Сегодня приёмов нет', 'No doses today')}</Sub>}
    </div>
  );
}

function Gym({ size }: { size: WSize }) {
  const d = useHome();
  const today = dayKey(d.now);
  const tw = d.workouts.find((w) => w.date === today);
  const last = d.workouts.slice().sort((a, b) => b.date.localeCompare(a.date))[0];
  const plan = d.templates.find((t) => t.id === d.settings.trainingPlan?.[String(weekdayIdx(d.now))]);
  return (
    <div className="flex flex-col h-full">
      <div className="label">{tw ? L('Сегодня', 'Today') : plan ? L('По плану', 'Planned') : L('Отдых', 'Rest')}</div>
      <div className="text-[18px] font-bold leading-tight mt-0.5 truncate" style={{ fontFamily: 'var(--font-head)' }}>{tw?.name || plan?.name || L('Восстановление', 'Recovery')}</div>
      {last && <Sub>{L('Последняя', 'Last')}: {last.name} · {Math.round(tonnage(last))} kg</Sub>}
      {!tw && (
        <button
          className={`btn btn-sm mt-auto ${size === 'S' ? 'w-full' : 'self-start'}`}
          onClick={async (e) => {
            stop(e);
            const id = await startWorkout(plan?.id);
            go(`/taijutsu/flash/log?w=${id}`);
          }}
        >
          <Icon name="bolt" size={13} /> {L('Начать', 'Start')}
        </button>
      )}
    </div>
  );
}

function BlackFlashW() {
  const d = useHome();
  const best = ((): { w: Workout; name: string; kg: number; reps: number } | null => {
    for (const w of d.workouts.slice().sort((a, b) => b.date.localeCompare(a.date)))
      for (const e of w.entries) for (const s of e.sets) if (s.pr) return { w, name: e.exerciseId, kg: s.weight, reps: s.reps };
    return null;
  })();
  return (
    <div className="flex flex-col h-full">
      <div className="kanji text-[22px] leading-none" style={{ color: '#ff453a' }}>黒閃</div>
      {best ? (
        <>
          <Big className="mt-auto">{best.kg}<span className="text-[13px] text-muted"> kg×{best.reps}</span></Big>
          <Sub>{fmt(new Date(best.w.date + 'T12:00'), 'd MMM')} · {best.w.name}</Sub>
        </>
      ) : (
        <Sub>{L('Рекордов пока нет', 'No PRs yet')}</Sub>
      )}
    </div>
  );
}

function WeightChart({ size }: { size: WSize }) {
  const d = useHome();
  const pts = d.bodyWeights.slice().sort((a, b) => a.date.localeCompare(b.date)).slice(-20);
  if (pts.length < 2) return <Sub>{L('Добавь пару замеров', 'Add a couple of entries')}</Sub>;
  const tgt = d.settings.targetBodyWeight;
  const vals = pts.map((p) => p.kg).concat(tgt ? [tgt] : []);
  const min = Math.min(...vals) - 0.5;
  const max = Math.max(...vals) + 0.5;
  const W = 300;
  const H = size === 'M' ? 60 : 170;
  const x = (i: number) => (i / (pts.length - 1)) * W;
  const y = (v: number) => H - ((v - min) / (max - min)) * H;
  const line = pts.map((p, i) => `${x(i).toFixed(1)},${y(p.kg).toFixed(1)}`).join(' ');
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-baseline gap-2">
        <Big>{pts[pts.length - 1].kg}</Big>
        <span className="text-[12px] text-muted">kg{tgt ? ` → ${tgt}` : ''}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full flex-1 mt-2 overflow-visible">
        <defs>
          <linearGradient id="wg" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--accent-1)', stopOpacity: 0.35 }} />
            <stop offset="1" style={{ stopColor: 'var(--accent-1)', stopOpacity: 0 }} />
          </linearGradient>
        </defs>
        {tgt && <line x1={0} x2={W} y1={y(tgt)} y2={y(tgt)} style={{ stroke: '#30d158' }} strokeDasharray="4 4" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />}
        <polygon points={`0,${H} ${line} ${W},${H}`} fill="url(#wg)" />
        <polyline points={line} fill="none" style={{ stroke: 'var(--accent-1)' }} strokeWidth={2.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function Streaks({ size }: { size: WSize }) {
  const d = useHome();
  const m = d.routines.find((r) => r.slot === 'morning');
  const e = d.routines.find((r) => r.slot === 'evening');
  const p = d.techs.find((t) => t.trackMinutes);
  const list = [
    m && { l: L('Утро', 'Morning'), v: streak(routineDoneDates(m, d.rlogs)), i: 'sun' },
    e && { l: L('Вечер', 'Evening'), v: streak(routineDoneDates(e, d.rlogs)), i: 'moon' },
    d.meds.length > 0 && { l: L('Таблетки', 'Pills'), v: streak(medsDoneDates(d.meds, d.mlogs)), i: 'pill' },
    p && { l: p.name, v: streak(practiceDates(d.practice, p.id)), i: 'music' },
  ].filter(Boolean) as { l: string; v: number; i: string }[];
  return (
    <div className={`grid ${size === 'M' ? 'grid-cols-4' : 'grid-cols-2'} gap-2 h-full`}>
      {list.map((s) => (
        <div key={s.l} className="min-w-0 rounded-2xl bg-panel-2 p-2 flex flex-col justify-between">
          <Icon name={s.i} size={14} className="text-muted" />
          <div>
            <div className="mono text-[22px] font-bold leading-none" style={{ color: s.v >= 7 ? 'var(--accent-text)' : undefined }}>{s.v}</div>
            <div className="text-[10.5px] text-dim truncate">{s.l}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function XpRank({ size }: { size: WSize }) {
  const d = useHome();
  const r = rankOf(d.xp);
  return (
    <div className="flex flex-col h-full">
      <div className="kanji text-[26px] leading-none grad-text">{r.kanji}</div>
      <div className="text-[16px] font-bold mt-1 truncate" style={{ fontFamily: 'var(--font-head)' }}>{r.name}</div>
      <Sub>{d.xp} XP</Sub>
      <Progress value={r.progress * 100} className="mt-auto" height={7} />
      {size !== 'S' && <div className="text-[11px] text-dim mt-1">{r.next ? `${r.toNext} → ${r.next}` : 'MAX'}</div>}
    </div>
  );
}

function MonthProgress({ size }: { size: WSize }) {
  const d = useHome();
  const mk = fmt(d.now, 'yyyy-MM');
  const gs = d.goals.filter((g) => g.level === 'month' && g.month === mk);
  const pct = gs.length ? Math.round(gs.reduce((s, g) => s + monthGoalProgress(g.id, d.curses).pct, 0) / gs.length) : 0;
  return (
    <div className={`flex ${size === 'S' ? 'flex-col items-start' : 'items-center'} gap-3 h-full`}>
      <Ring value={pct} size={size === 'S' ? 62 : 78} stroke={7}>
        <span className="mono text-[15px] font-bold">{pct}%</span>
      </Ring>
      {size === 'S' ? (
        <Sub>{fmt(d.now, 'LLLL')}</Sub>
      ) : (
        <div className="min-w-0 flex-1 space-y-1.5">
          {gs.slice(0, size === 'M' ? 2 : 6).map((g) => (
            <div key={g.id}>
              <div className="text-[12.5px] truncate">{g.title}</div>
              <Progress value={monthGoalProgress(g.id, d.curses).pct} color={g.color} />
            </div>
          ))}
          {!gs.length && <Sub>{L('Целей месяца нет', 'No month goals')}</Sub>}
        </div>
      )}
    </div>
  );
}

function YearProgress({ size }: { size: WSize }) {
  const d = useHome();
  const y = new Date(d.now).getFullYear();
  const gs = d.goals.filter((g) => g.level === 'year' && g.year === y);
  const pct = gs.length ? Math.round(gs.reduce((s, g) => s + yearGoalProgress(g, d.goals, d.curses).pct, 0) / gs.length) : 0;
  const dayOfYear = Math.floor((d.now - new Date(y, 0, 1).getTime()) / 864e5);
  return (
    <div className={`flex ${size === 'S' ? 'flex-col items-start' : 'items-center'} gap-3 h-full`}>
      <Ring value={pct} size={size === 'S' ? 62 : 78} stroke={7}>
        <span className="mono text-[15px] font-bold">{pct}%</span>
      </Ring>
      <div className="min-w-0 flex-1 space-y-1.5">
        <Sub>{L('Год прошёл на', 'Year elapsed')} {Math.round((dayOfYear / 365) * 100)}%</Sub>
        {size !== 'S' &&
          gs.slice(0, size === 'M' ? 2 : 5).map((g) => (
            <div key={g.id}>
              <div className="text-[12.5px] truncate">{g.title}</div>
              <Progress value={yearGoalProgress(g, d.goals, d.curses).pct} color={g.color} />
            </div>
          ))}
      </div>
    </div>
  );
}

function Vows({ size }: { size: WSize }) {
  const d = useHome();
  const act = d.vows.filter((v) => v.status === 'active').sort((a, b) => a.endDate - b.endDate);
  return (
    <div className="space-y-2">
      {act.slice(0, size === 'M' ? 2 : 5).map((v) => (
        <div key={v.id} className="flex items-center gap-2">
          <Icon name={v.kind === 'restriction' ? 'shield' : 'chain'} size={15} className="text-acc shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] truncate">{v.sacrifice} → {v.forWhat}</div>
            <div className="text-[11px] text-dim mono">{shortLeft(v.endDate - d.now)}</div>
          </div>
        </div>
      ))}
      {!act.length && <Sub>{L('Нет активных обетов', 'No active vows')}</Sub>}
    </div>
  );
}

function QuickNote({ config, onConfig }: { config?: WidgetItem['config']; onConfig?: (c: WidgetItem['config']) => void }) {
  const d = useHome();
  const note = d.notes.find((n) => n.id === config?.noteId);
  const [text, setText] = useState(note?.body ?? '');
  useAutosave(text, async (v) => {
    if (note) await db.notes.put({ ...note, body: v, updatedAt: Date.now() });
    else if (v.trim()) {
      const id = uid();
      await db.notes.put({ id, title: L('Быстрая заметка', 'Quick note'), body: v, pinned: false, createdAt: Date.now(), updatedAt: Date.now() });
      onConfig?.({ ...config, noteId: id });
    }
  }, 600);
  return (
    <textarea
      className="w-full h-full bg-transparent outline-none resize-none text-[14px] leading-relaxed placeholder:text-dim"
      value={text}
      onClick={stop}
      onPointerDown={stop}
      onChange={(e) => setText(e.target.value)}
      placeholder={L('Пиши — сохранится в Simple Domain…', 'Type — it saves to Simple Domain…')}
    />
  );
}

function QuickCapture() {
  const [t, setT] = useState('');
  return (
    <form
      className="flex gap-2 h-full items-end"
      onClick={stop}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!t.trim()) return;
        await quickSave(t);
        setT('');
      }}
    >
      <input className="inp" value={t} onChange={(e) => setT(e.target.value)} onPointerDown={stop} placeholder={L('Мысль или ссылка…', 'Thought or link…')} />
      <button type="submit" className="btn !px-3" aria-label={L('Сохранить', 'Save')}>
        <Icon name="plus" size={18} />
      </button>
    </form>
  );
}

function MiniCalendar() {
  const d = useHome();
  const now = new Date(d.now);
  const start = startOfWeek(startOfMonth(now), { weekStartsOn: 1 });
  const end = endOfMonth(now);
  const marks = new Set<string>();
  for (const c of d.curses) if (c.status === 'active') marks.add(dayKey(c.due));
  for (const o of occurrences(d.calEvents, start.getTime(), end.getTime() + 864e5)) marks.add(dayKey(o.start));
  const days: Date[] = [];
  for (let x = start; x <= end || days.length % 7; x = addDays(x, 1)) days.push(x);
  const today = dayKey(d.now);
  return (
    <div className="h-full flex flex-col">
      <div className="text-[14px] font-semibold capitalize mb-1">{fmt(now, 'LLLL')}</div>
      <div className="grid grid-cols-7 gap-y-0.5 text-center flex-1 content-start">
        {weekdayNames().map((n) => (
          <div key={n} className="text-[10px] text-dim">{n}</div>
        ))}
        {days.map((x) => {
          const k = dayKey(x);
          const inM = x.getMonth() === now.getMonth();
          return (
            <div key={k} className={`relative text-[12px] mono leading-6 ${inM ? '' : 'opacity-30'}`}>
              <span className={`inline-grid place-items-center w-6 h-6 rounded-full ${k === today ? 'font-bold' : ''}`} style={k === today ? { background: 'var(--accent-grad)', color: 'var(--on-accent)' } : undefined}>{x.getDate()}</span>
              {marks.has(k) && k !== today && <span className="absolute left-1/2 -translate-x-1/2 bottom-0 w-1 h-1 rounded-full bg-cursed" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CampusMapW({ size }: { size: WSize }) {
  return (
    <div className="h-full flex flex-col justify-between">
      <div className="app-icon w-11 h-11">
        <Icon name="map" size={22} />
      </div>
      <div>
        <div className="text-[15px] font-semibold">AITU Map</div>
        {size !== 'S' && <Sub>{L('Найти аудиторию и корпус', 'Find a room and building')}</Sub>}
      </div>
    </div>
  );
}

function AssignmentsDue({ size, config }: { size: WSize; config?: WidgetItem['config'] }) {
  const d = useHome();
  const list = d.assignments.filter((a) => a.status !== 'done' && (!config?.subjectId || a.subjectId === config.subjectId)).sort((a, b) => (a.due ?? Infinity) - (b.due ?? Infinity));
  return (
    <div className="space-y-1.5">
      {list.slice(0, size === 'M' ? 2 : 6).map((a) => {
        const s = d.subjects.find((x) => x.id === a.subjectId);
        const over = !!a.due && a.due < d.now;
        return (
          <button key={a.id} className="w-full flex items-center gap-2 text-left" onClick={(e) => { stop(e); go(`/tools/assignments?a=${a.id}`); }}>
            <span className="w-[26px] h-[26px] grid place-items-center rounded-lg shrink-0" style={{ background: `color-mix(in srgb, ${s?.color || '#ff9f0a'} 18%, transparent)`, color: s?.color || '#ff9f0a' }}>
              <Icon name="grad" size={14} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] truncate">{a.title}</span>
              <span className="block text-[11px] text-dim truncate" style={over ? { color: '#ff453a' } : undefined}>
                {[s?.name, a.due ? shortLeft(a.due - d.now) : L('без срока', 'no deadline')].filter(Boolean).join(' · ')}
              </span>
            </span>
          </button>
        );
      })}
      {!list.length && <Sub>{L('Всё сдано', 'All submitted')}</Sub>}
    </div>
  );
}

function WeeklyReviewW() {
  const d = useHome();
  const wd = weekdayIdx(d.now);
  const wk = weekKey(wd === 0 ? subDays(d.now, 1) : d.now);
  const done = d.reviews.some((r) => r.id === `W:${wk}` && r.done);
  return (
    <div className="flex flex-col h-full">
      <div className="label">{wk}</div>
      <div className="text-[15px] font-semibold mt-1 leading-tight">{done ? L('Ревью готово', 'Review done') : wd >= 5 || wd === 0 ? L('Пора подвести итоги', 'Time to review') : L('Неделя в процессе', 'Week in progress')}</div>
      <div className="mt-auto">
        <span className="tag">{done ? '✓' : `${7 - wd} ${L('дн. до воскресенья', 'days to Sunday')}`}</span>
      </div>
    </div>
  );
}

// ───── Реестр ─────
export interface WidgetDef {
  type: string;
  title: () => string;
  section: SectionId;
  icon: string;
  sizes: WSize[];
  def: WSize;
  route: string | ((cfg?: WidgetItem['config']) => string);
  render: (p: { size: WSize; config?: WidgetItem['config']; onConfig?: (c: WidgetItem['config']) => void }) => ReactNode;
  config?: 'technique' | 'subject';
}

export const WIDGETS: WidgetDef[] = [
  { type: 'nextClass', title: () => 'Next Class', section: 'tools', icon: 'grad', sizes: ['S', 'M'], def: 'S', route: '/tools/calendar', render: (p) => <NextClass {...p} /> },
  { type: 'todaySchedule', title: () => L('Расписание дня', "Today's Schedule"), section: 'calendar', icon: 'calendar', sizes: ['M', 'L', 'XL'], def: 'L', route: '/tools/calendar', render: (p) => <TodaySchedule {...p} /> },
  { type: 'nearestDeadline', title: () => 'Nearest Deadline', section: 'curses', icon: 'hourglass', sizes: ['S', 'M', 'L'], def: 'M', route: '/curses', render: (p) => <NearestDeadline {...p} />, config: 'technique' },
  { type: 'cursesByGrade', title: () => 'Curses by Grade', section: 'curses', icon: 'skull', sizes: ['M', 'L'], def: 'M', route: '/curses', render: (p) => <CursesByGrade {...p} /> },
  { type: 'todayMissions', title: () => L('Миссии на сегодня', "Today's Missions"), section: 'hq', icon: 'target', sizes: ['M', 'L', 'XL'], def: 'L', route: '/curses', render: (p) => <TodayMissions {...p} /> },
  { type: 'fistQuests', title: () => 'Divergent Fist', section: 'taijutsu', icon: 'droplet', sizes: ['M', 'L'], def: 'M', route: '/taijutsu/fist', render: (p) => <FistQuests {...p} /> },
  { type: 'pills', title: () => L('Таблетки', 'Pills'), section: 'taijutsu', icon: 'pill', sizes: ['M', 'L'], def: 'M', route: '/taijutsu/fist', render: (p) => <Pills {...p} /> },
  { type: 'gym', title: () => L('Зал', 'Gym'), section: 'taijutsu', icon: 'dumbbell', sizes: ['S', 'M'], def: 'S', route: '/taijutsu/flash/log', render: (p) => <Gym {...p} /> },
  { type: 'blackFlash', title: () => 'Black Flash', section: 'taijutsu', icon: 'zap', sizes: ['S', 'M'], def: 'S', route: '/taijutsu/flash/stats', render: () => <BlackFlashW /> },
  { type: 'weightChart', title: () => L('Вес тела', 'Weight'), section: 'taijutsu', icon: 'chart', sizes: ['M', 'L'], def: 'M', route: '/taijutsu/flash/stats', render: (p) => <WeightChart {...p} /> },
  { type: 'streaks', title: () => L('Стрики', 'Streaks'), section: 'hq', icon: 'flame', sizes: ['M', 'L'], def: 'M', route: '/taijutsu/fist', render: (p) => <Streaks {...p} /> },
  { type: 'xpRank', title: () => 'XP & Rank', section: 'hq', icon: 'trophy', sizes: ['S', 'M'], def: 'S', route: '/review', render: (p) => <XpRank {...p} /> },
  { type: 'monthProgress', title: () => 'Maximum Technique', section: 'energy', icon: 'target', sizes: ['S', 'M', 'L'], def: 'S', route: '/energy/maximum', render: (p) => <MonthProgress {...p} /> },
  { type: 'yearProgress', title: () => 'Domain Expansion', section: 'energy', icon: 'domain', sizes: ['S', 'M', 'L'], def: 'S', route: '/energy/domain', render: (p) => <YearProgress {...p} /> },
  { type: 'vows', title: () => 'Binding Vows', section: 'vows', icon: 'chain', sizes: ['M', 'L'], def: 'M', route: '/vows/contracts', render: (p) => <Vows {...p} /> },
  { type: 'quickNote', title: () => 'Quick Note', section: 'energy', icon: 'note', sizes: ['M', 'L'], def: 'M', route: '/energy/simple', render: (p) => <QuickNote {...p} /> },
  { type: 'quickCapture', title: () => 'Quick Capture', section: 'energy', icon: 'sparkle', sizes: ['M'], def: 'M', route: '/energy/rct', render: () => <QuickCapture /> },
  { type: 'miniCalendar', title: () => L('Календарь', 'Mini Calendar'), section: 'calendar', icon: 'calendar', sizes: ['L'], def: 'L', route: '/calendar', render: () => <MiniCalendar /> },
  { type: 'campusMap', title: () => 'Campus Map', section: 'tools', icon: 'map', sizes: ['S', 'M'], def: 'S', route: '/tools/map', render: (p) => <CampusMapW {...p} /> },
  { type: 'assignmentsDue', title: () => 'Assignments Due', section: 'tools', icon: 'file', sizes: ['M', 'L'], def: 'M', route: '/tools/assignments', render: (p) => <AssignmentsDue {...p} />, config: 'subject' },
  { type: 'weeklyReview', title: () => 'Weekly Review', section: 'review', icon: 'chart', sizes: ['S', 'M'], def: 'S', route: '/review', render: () => <WeeklyReviewW /> },
];

const w = (type: string, size: WSize, config?: WidgetItem['config']): WidgetItem => ({ id: uid(), type, size, config });

export const PRESETS = () => [
  {
    id: 'default',
    name: L('По умолчанию', 'Default'),
    items: () => [w('nearestDeadline', 'M'), w('nextClass', 'S'), w('xpRank', 'S'), w('todayMissions', 'L'), w('todaySchedule', 'L'), w('fistQuests', 'M'), w('pills', 'M'), w('cursesByGrade', 'M'), w('gym', 'S'), w('blackFlash', 'S'), w('quickCapture', 'M'), w('streaks', 'M'), w('monthProgress', 'S'), w('yearProgress', 'S'), w('vows', 'M'), w('miniCalendar', 'L'), w('assignmentsDue', 'M'), w('campusMap', 'S'), w('weeklyReview', 'S')],
  },
  {
    id: 'study',
    name: 'Study day',
    items: () => [w('nextClass', 'M'), w('todaySchedule', 'L'), w('assignmentsDue', 'L'), w('nearestDeadline', 'M'), w('miniCalendar', 'L'), w('quickNote', 'M'), w('campusMap', 'S'), w('xpRank', 'S'), w('monthProgress', 'M')],
  },
  {
    id: 'gym',
    name: 'Gym day',
    items: () => [w('gym', 'M'), w('blackFlash', 'M'), w('weightChart', 'L'), w('fistQuests', 'L'), w('pills', 'M'), w('streaks', 'M'), w('xpRank', 'S'), w('nextClass', 'S'), w('quickCapture', 'M')],
  },
];
