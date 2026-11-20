// Maximum Technique — план на месяц: цели-проклятия Grade 1+, связанные задачи, прогресс, итоги месяца.
import { addMonths, endOfMonth, subMonths } from 'date-fns';
import { AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { Monster } from '../../components/Monster';
import { CurseRow, newCurse } from '../../components/shared';
import { Btn, Empty, IBtn, Panel, Progress, Ring, Stat } from '../../components/ui';
import { db, type Goal } from '../../db/schema';
import { fromKey, monthKey } from '../../lib/dates';
import { useAutosave, useLive } from '../../lib/hooks';
import { go, setQuery, useRoute } from '../../lib/router';
import { L } from '../../lib/runtime';
import { monthGoalProgress, tonnage } from '../../lib/stats';
import { blankGoal, GoalEditor, LinkTasks, monthTitle } from './goals';

export function MaximumTechnique() {
  const { query } = useRoute();
  const mk = query.get('month') || monthKey();
  const d = useLive(async () => {
    const [goals, curses, techs, workouts, practice, xp, review, vows] = await Promise.all([
      db.goals.toArray(),
      db.curses.toArray(),
      db.techniques.toArray(),
      db.workouts.toArray(),
      db.practice.toArray(),
      db.xp.toArray(),
      db.reviews.get('M:' + mk),
      db.vows.toArray(),
    ]);
    return { goals, curses, techs, workouts, practice, xp, review, vows };
  }, [mk]);
  const [edit, setEdit] = useState<Goal | null>(null);
  const [link, setLink] = useState<Goal | null>(null);
  if (!d) return null;
  const monthGoals = d.goals.filter((g) => g.level === 'month' && g.month === mk);
  const years = d.goals.filter((g) => g.level === 'year');
  const overall = monthGoals.length ? Math.round(monthGoals.reduce((s, g) => s + monthGoalProgress(g.id, d.curses).pct, 0) / monthGoals.length) : 0;
  const start = fromKey(mk + '-01').getTime();
  const end = endOfMonth(fromKey(mk + '-01')).getTime();
  const daysLeft = Math.max(0, Math.ceil((end - Date.now()) / 864e5));
  const inMonth = (t?: number) => !!t && t >= start && t <= end;
  const stats = {
    exorcised: d.curses.filter((c) => c.status === 'exorcised' && inMonth(c.completedAt)).length,
    burned: d.curses.filter((c) => c.status === 'active' && inMonth(c.due) && c.due < Date.now()).length,
    workouts: d.workouts.filter((w) => w.date.startsWith(mk)).length,
    tonnage: Math.round(d.workouts.filter((w) => w.date.startsWith(mk)).reduce((s, w) => s + tonnage(w), 0)),
    practice: d.practice.filter((p) => p.date.startsWith(mk)).reduce((s, p) => s + p.minutes, 0),
    xp: d.xp.filter((x) => inMonth(x.at)).reduce((s, x) => s + x.amount, 0),
    vowsKept: d.vows.filter((v) => v.history.some((h) => h.type === 'fulfilled' && inMonth(h.at))).length,
    vowsBroken: d.vows.filter((v) => v.history.some((h) => h.type === 'broken' && inMonth(h.at))).length,
  };
  const prevMk = monthKey(subMonths(fromKey(mk + '-01'), 1));
  const nextMk = monthKey(addMonths(fromKey(mk + '-01'), 1));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <IBtn icon="left" onClick={() => setQuery('month', prevMk)} />
        <div className="h-display text-xl capitalize min-w-[11rem] text-center">{monthTitle(mk)}</div>
        <IBtn icon="right" onClick={() => setQuery('month', nextMk)} />
        {mk !== monthKey() && (
          <Btn size="xs" variant="ghost" onClick={() => setQuery('month')}>
            {L('Текущий', 'Current')}
          </Btn>
        )}
        <Btn className="ml-auto" icon="plus" onClick={() => setEdit(blankGoal('month', { month: mk }))}>
          {L('Цель месяца', 'Month goal')}
        </Btn>
      </div>

      <Panel bodyClass="p-4">
        <div className="flex flex-wrap items-center gap-5">
          <Ring value={overall} size={92} color="#ff4f8b" stroke={7}>
            <div className="mono text-xl font-bold">{overall}%</div>
            <div className="label text-[8px]">{L('месяц', 'month')}</div>
          </Ring>
          <div className="min-w-0 flex-1">
            <div className="h-display text-2xl glitch" data-text="MAXIMUM TECHNIQUE">
              MAXIMUM TECHNIQUE
            </div>
            <div className="text-sm text-muted">
              {monthGoals.length} {L('сильных проклятий месяца', 'strong curses of the month')} · {mk === monthKey() ? `${L('осталось дней', 'days left')}: ${daysLeft}` : ''}
            </div>
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2 items-start">
        {monthGoals.map((g) => {
          const p = monthGoalProgress(g.id, d.curses);
          const grade = g.huge || (mk === monthKey() && daysLeft < 5 && p.pct < 70) ? 0 : 1;
          const parent = years.find((y) => y.id === g.parentId);
          const tasks = d.curses.filter((c) => c.goalId === g.id).sort((a, b) => (a.status === b.status ? a.due - b.due : a.status === 'active' ? -1 : 1));
          const done = p.pct === 100 && p.total > 0;
          return (
            <Panel key={g.id} accent={g.color} hot={grade === 0 && !done} bodyClass="p-4">
              <div className="flex items-start gap-4">
                {done ? <span className="w-[76px] h-[76px] grid place-items-center kanji text-3xl text-jade border border-jade/50" style={{ clipPath: 'polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)' }}>祓</span> : <Monster grade={grade} size={76} />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="label" style={{ color: g.color }}>
                        {grade === 0 ? 'Special Grade' : 'Grade 1'} · Maximum Technique
                      </div>
                      <div className="text-lg leading-tight mt-0.5">{g.title}</div>
                    </div>
                    <IBtn icon="edit" size={15} onClick={() => setEdit(g)} />
                  </div>
                  {parent && (
                    <button className="tag mt-1.5" style={{ color: parent.color, background: `color-mix(in srgb, ${parent.color} 10%, transparent)` }} onClick={() => go(`/energy/domain?year=${parent.year}`)}>
                      領域 {parent.title}
                    </button>
                  )}
                  {g.description && <p className="text-[12.5px] text-muted mt-1">{g.description}</p>}
                  <div className="flex items-center gap-2 mt-3">
                    <Progress value={p.pct} color={done ? '#3ddc97' : g.color} className="flex-1" height={8} />
                    <span className="mono text-sm w-24 text-right">
                      {p.pct}% · {p.done}/{p.total}
                    </span>
                  </div>
                </div>
              </div>
              <div className="mt-3">
                <AnimatePresence initial={false}>
                  {tasks.map((c) => (
                    <CurseRow key={c.id} c={c} tech={d.techs.find((t) => t.id === c.techniqueId)} compact />
                  ))}
                </AnimatePresence>
                {!tasks.length && <div className="text-sm text-dim py-2">{L('Привяжи задачи из Cursed Technique — прогресс посчитается сам', 'Link tasks from Cursed Technique — progress is automatic')}</div>}
              </div>
              <div className="flex gap-2 mt-2">
                <Btn size="xs" variant="ghost" icon="plus" onClick={() => newCurse({ goalId: g.id, due: Math.min(end, Date.now() + 3 * 864e5) })}>
                  {L('Задача', 'Task')}
                </Btn>
                <Btn size="xs" variant="ghost" icon="link" onClick={() => setLink(g)}>
                  {L('Привязать', 'Link')}
                </Btn>
              </div>
            </Panel>
          );
        })}
        {!monthGoals.length && (
          <Panel className="lg:col-span-2">
            <Empty text={L('В этом месяце целей нет. Призови сильное проклятие.', 'No goals this month. Summon a strong curse.')} icon="target" action={<Btn size="sm" icon="plus" onClick={() => setEdit(blankGoal('month', { month: mk }))}>{L('Цель месяца', 'Month goal')}</Btn>} />
          </Panel>
        )}
      </div>

      <Panel title={L('Итоги месяца', 'Month summary')} kanji="総">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-4">
          <Stat label={L('Изгнано', 'Exorcised')} value={stats.exorcised} color="#3ddc97" />
          <Stat label={L('Сгорело', 'Burned')} value={stats.burned} color={stats.burned ? '#ff2744' : undefined} />
          <Stat label={L('Тренировок', 'Workouts')} value={stats.workouts} />
          <Stat label={L('Тоннаж, кг', 'Volume, kg')} value={stats.tonnage} />
          <Stat label={L('Практика, мин', 'Practice, min')} value={stats.practice} />
          <Stat label="XP" value={stats.xp} color="var(--accent-text)" />
          <Stat label={L('Обетов исполнено', 'Vows kept')} value={stats.vowsKept} />
          <Stat label={L('Нарушено', 'Broken')} value={stats.vowsBroken} color={stats.vowsBroken ? '#ff2744' : undefined} />
        </div>
        <MonthNotes key={mk} mk={mk} initial={d.review?.wins || ''} />
      </Panel>

      {edit && <GoalEditor g={edit} years={years} onClose={() => setEdit(null)} />}
      {link && <LinkTasks goal={link} curses={d.curses} onClose={() => setLink(null)} />}
    </div>
  );
}

function MonthNotes({ mk, initial }: { mk: string; initial: string }) {
  const [text, setText] = useState(initial);
  useAutosave(text, async (v) => {
    const r = await db.reviews.get('M:' + mk);
    await db.reviews.put({ id: 'M:' + mk, wins: v, fails: r?.fails || '', next: r?.next || [], done: r?.done || false, at: Date.now() });
  });
  return (
    <label className="block">
      <span className="label block mb-1">{L('Рефлексия месяца (сохраняется сама)', 'Month reflection (autosaved)')}</span>
      <textarea className="inp" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={L('Что сработало, что нет, что меняю в следующем месяце…', 'What worked, what did not, what changes next month…')} />
    </label>
  );
}
