// Black Flash — зал: журнал тренировок, автоматические PR с молнией BLACK FLASH.
import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { Btn, Empty, Field, IBtn, Panel, Stat, Tabs } from '../../components/ui';
import { db, type Exercise, type Workout, type WorkoutEntry } from '../../db/schema';
import { finishWorkout, startWorkout } from '../../lib/actions';
import { fmt, fromKey } from '../../lib/dates';
import { confirmBox, fx } from '../../lib/fx';
import { useAutosave, useLive } from '../../lib/hooks';
import { go, setQuery, useRoute } from '../../lib/router';
import { L, round1, uid } from '../../lib/runtime';
import { play } from '../../lib/sound';
import { bestOf, e1rm, prCount, tonnage } from '../../lib/stats';
import { FlashCalendar, FlashStats, Library, Photos } from './FlashMore';

export const MUSCLES = () => ({
  chest: L('Грудь', 'Chest'),
  back: L('Спина', 'Back'),
  legs: L('Ноги', 'Legs'),
  shoulders: L('Плечи', 'Shoulders'),
  arms: L('Руки', 'Arms'),
  core: L('Кор', 'Core'),
  full: L('Всё тело', 'Full body'),
});

type Sub = 'log' | 'stats' | 'photos' | 'calendar' | 'library';

export function BlackFlash() {
  const { parts } = useRoute();
  const sub = (['log', 'stats', 'photos', 'calendar', 'library'].includes(parts[2]) ? parts[2] : 'log') as Sub;
  return (
    <div>
      <Tabs
        className="mb-4"
        tabs={[
          { id: 'log' as Sub, label: L('Журнал', 'Log') },
          { id: 'stats' as Sub, label: L('Статистика', 'Stats') },
          { id: 'photos' as Sub, label: L('Фото', 'Photos') },
          { id: 'calendar' as Sub, label: L('Календарь', 'Calendar') },
          { id: 'library' as Sub, label: L('Библиотека', 'Library') },
        ]}
        value={sub}
        onChange={(s) => go(`/taijutsu/flash/${s}`)}
      />
      {sub === 'log' && <Log />}
      {sub === 'stats' && <FlashStats />}
      {sub === 'photos' && <Photos />}
      {sub === 'calendar' && <FlashCalendar />}
      {sub === 'library' && <Library />}
    </div>
  );
}

function Log() {
  const { query } = useRoute();
  const wid = query.get('w');
  const workouts = useLive(() => db.workouts.toArray(), []) || [];
  const templates = useLive(() => db.templates.toArray(), []) || [];
  if (wid) return <WorkoutEditor id={wid} />;
  const sorted = workouts.slice().sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  const start = async (tid?: string) => {
    const id = await startWorkout(tid);
    setQuery('w', id);
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr] items-start">
      <Panel title={L('Новая тренировка', 'New workout')} kanji="黒閃" accent="#ff2744">
        <div className="space-y-2">
          {templates.map((t) => (
            <button key={t.id} className="w-full btn btn-flash justify-between" onClick={() => start(t.id)}>
              <span>{t.name}</span>
              <span className="text-[10px] opacity-70 normal-case tracking-normal">
                {t.items.length} {L('упр.', 'ex.')}
              </span>
            </button>
          ))}
          <button className="w-full btn btn-ghost" onClick={() => start()}>
            <Icon name="plus" size={14} /> {L('Пустая тренировка', 'Empty workout')}
          </button>
        </div>
        <p className="text-[11px] text-dim mt-3">{L('Новый личный рекорд запускает BLACK FLASH.', 'A new personal record triggers BLACK FLASH.')}</p>
      </Panel>
      <Panel title={L('История', 'History')} kanji="録">
        {sorted.map((w) => (
          <button key={w.id} onClick={() => setQuery('w', w.id)} className="w-full flex items-center gap-3 py-2.5 border-b border-line/40 last:border-0 text-left hover:bg-cursed/5 px-1">
            <div className="w-12 text-center shrink-0">
              <div className="mono text-lg leading-none">{fmt(fromKey(w.date), 'd')}</div>
              <div className="label text-[9px]">{fmt(fromKey(w.date), 'LLL')}</div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm">
                {w.name} {!w.finished && <span className="tag ml-1">{L('в процессе', 'in progress')}</span>}
              </div>
              <div className="text-[11px] text-dim truncate">{w.entries.length} {L('упражнений', 'exercises')} · {Math.round(tonnage(w))} kg</div>
            </div>
            {prCount(w) > 0 && (
              <span className="tag" style={{ color: '#ff2744', background: '#ff274422' }}>
                <Icon name="bolt" size={11} /> PR ×{prCount(w)}
              </span>
            )}
          </button>
        ))}
        {!sorted.length && <Empty text={L('Ещё нет тренировок', 'No workouts yet')} icon="dumbbell" />}
      </Panel>
    </div>
  );
}

function WorkoutEditor({ id }: { id: string }) {
  const w = useLive(async () => (await db.workouts.get(id)) ?? null, [id]);
  const all = useLive(() => db.workouts.toArray(), []) || [];
  const exercises = useLive(() => db.exercises.toArray(), []) || [];
  const templates = useLive(() => db.templates.toArray(), []) || [];
  const [addEx, setAddEx] = useState('');
  if (w === undefined) return null;
  if (!w)
    return (
      <Panel>
        <Empty text={L('Тренировка не найдена', 'Workout not found')} action={<Btn size="sm" onClick={() => setQuery('w')}>{L('Назад', 'Back')}</Btn>} />
      </Panel>
    );
  const exOf = (eid: string) => exercises.find((e) => e.id === eid);
  const tpl = templates.find((t) => t.id === w.templateId);
  const save = (next: Workout) => db.workouts.put(next);

  const addSet = async (entry: WorkoutEntry, reps: number, weight: number) => {
    if (!(reps > 0) || weight < 0) return;
    const fresh = (await db.workouts.get(w.id)) || w;
    const prior = bestOf(all, entry.exerciseId, w.id);
    const curSets = fresh.entries.find((e) => e.id === entry.id)?.sets || [];
    const prevMax = Math.max(prior.maxWeight, ...curSets.map((s) => s.weight), 0);
    const prev1rm = Math.max(prior.best1rm, ...curSets.map((s) => e1rm(s.weight, s.reps)), 0);
    const hasHistory = prior.has || curSets.length > 0;
    const isPR = hasHistory && weight > 0 && (weight > prevMax || e1rm(weight, reps) > prev1rm + 0.01);
    const set = { id: uid(), reps, weight, pr: isPR };
    await save({ ...fresh, entries: fresh.entries.map((e) => (e.id === entry.id ? { ...e, sets: [...e.sets, set] } : e)) });
    if (isPR) {
      play('flash');
      const ex = exOf(entry.exerciseId);
      fx.emit({
        type: 'blackflash',
        title: `${ex?.name || ''} — ${weight} kg × ${reps}`,
        sub: weight > prevMax ? `${L('Новый рекорд веса! Было', 'New weight PR! Was')} ${prevMax} kg` : `${L('Новый рекорд 1ПМ', 'New est. 1RM PR')}: ${round1(e1rm(weight, reps))} kg`,
      });
    } else play('tick');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Btn size="sm" variant="ghost" icon="left" onClick={() => setQuery('w')}>
          {L('Журнал', 'Log')}
        </Btn>
        <div className="ml-auto flex gap-2">
          <Btn
            size="sm"
            variant="danger"
            icon="trash"
            onClick={async () => {
              if (await confirmBox(L('Удалить тренировку?', 'Delete workout?'), { danger: true })) {
                await db.workouts.delete(w.id);
                setQuery('w');
              }
            }}
          >
            {L('Удалить', 'Delete')}
          </Btn>
          {w.finished ? (
            <span className="chip" style={{ borderColor: '#3ddc97', color: '#3ddc97' }}>
              <Icon name="check" size={13} /> {L('Завершена', 'Finished')}
            </span>
          ) : (
            <Btn size="sm" variant="flash" icon="check" onClick={() => finishWorkout(w.id)}>
              {L('Завершить', 'Finish')}
            </Btn>
          )}
        </div>
      </div>

      <WorkoutHeader w={w} />

      <div className="grid grid-cols-3 gap-3">
        <Panel bodyClass="p-3">
          <Stat label={L('Тоннаж', 'Volume')} value={`${Math.round(tonnage(w))}`} sub="kg" />
        </Panel>
        <Panel bodyClass="p-3">
          <Stat label={L('Подходов', 'Sets')} value={w.entries.reduce((s, e) => s + e.sets.length, 0)} />
        </Panel>
        <Panel bodyClass="p-3">
          <Stat label="PR" value={prCount(w)} color="#ff2744" />
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2 items-start">
        <AnimatePresence initial={false}>
          {w.entries.map((entry) => {
            const ex = exOf(entry.exerciseId);
            const best = bestOf(all, entry.exerciseId, w.id);
            const plan = tpl?.items.find((i) => i.exerciseId === entry.exerciseId);
            return (
              <motion.div key={entry.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Panel
                  title={ex?.name || L('Удалённое упражнение', 'Deleted exercise')}
                  accent="#ff2744"
                  actions={
                    <IBtn
                      icon="trash"
                      size={15}
                      onClick={async () => {
                        if (entry.sets.length && !(await confirmBox(L('Убрать упражнение со всеми подходами?', 'Remove exercise with all sets?'), { danger: true }))) return;
                        await save({ ...w, entries: w.entries.filter((e) => e.id !== entry.id) });
                      }}
                    />
                  }
                >
                  <div className="flex flex-wrap gap-2 text-[11px] text-muted mb-2">
                    {ex && <span className="tag">{MUSCLES()[ex.muscle]}</span>}
                    {best.has && (
                      <span>
                        {L('Рекорд', 'Best')}: <b className="mono text-ink">{best.maxWeight} kg</b> · 1ПМ ≈ <b className="mono text-ink">{round1(best.best1rm)}</b>
                      </span>
                    )}
                    {plan && (
                      <span>
                        {L('План', 'Plan')}: {plan.sets}×{plan.reps}
                      </span>
                    )}
                    {ex?.targetWeight ? (
                      <span>
                        {L('Цель', 'Target')}: {ex.targetWeight} kg
                      </span>
                    ) : null}
                  </div>
                  <table className="w-full text-sm">
                    <tbody>
                      {entry.sets.map((s, i) => (
                        <tr key={s.id} className="border-t border-line/40">
                          <td className="py-1.5 w-8 mono text-dim">{i + 1}</td>
                          <td className="mono">
                            {s.weight} kg × {s.reps}
                          </td>
                          <td className="mono text-dim text-xs">1ПМ {round1(e1rm(s.weight, s.reps))}</td>
                          <td className="w-16">
                            {s.pr && (
                              <span className="tag" style={{ color: '#fff', background: 'linear-gradient(90deg,#16030a,#b3001e)' }}>
                                黒閃 PR
                              </span>
                            )}
                          </td>
                          <td className="w-8 text-right">
                            <IBtn icon="x" className="ibtn-sm" onClick={() => save({ ...w, entries: w.entries.map((e) => (e.id === entry.id ? { ...e, sets: e.sets.filter((x) => x.id !== s.id) } : e)) })} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <SetForm key={entry.sets.length} entry={entry} all={all} workoutId={w.id} planReps={plan?.reps} onAdd={(r, kg) => addSet(entry, r, kg)} />
                </Panel>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      <Panel title={L('Добавить упражнение', 'Add exercise')}>
        <div className="flex gap-2">
          <select className="inp" value={addEx} onChange={(e) => setAddEx(e.target.value)}>
            <option value="">— {L('выбери из библиотеки', 'pick from library')} —</option>
            {Object.entries(MUSCLES()).map(([m, label]) => {
              const list = exercises.filter((e) => e.muscle === m);
              if (!list.length) return null;
              return (
                <optgroup key={m} label={label}>
                  {list.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
          <Btn
            icon="plus"
            disabled={!addEx}
            onClick={async () => {
              await save({ ...w, entries: [...w.entries, { id: uid(), exerciseId: addEx, sets: [] }] });
              setAddEx('');
            }}
          >
            <span className="hidden sm:inline">{L('Добавить', 'Add')}</span>
          </Btn>
        </div>
        <button className="text-[12px] text-acc mt-2 hover:underline" onClick={() => go('/taijutsu/flash/library')}>
          {L('Нет нужного? Создай в библиотеке →', 'Missing one? Create it in the library →')}
        </button>
      </Panel>
    </div>
  );
}

function WorkoutHeader({ w }: { w: Workout }) {
  const [v, setV] = useState({ name: w.name, date: w.date, notes: w.notes });
  useAutosave(v, async (x) => {
    const fresh = await db.workouts.get(w.id);
    if (fresh) await db.workouts.put({ ...fresh, ...x });
  });
  return (
    <Panel bodyClass="p-4 grid gap-3 sm:grid-cols-[1fr_180px]">
      <Field label={L('Название', 'Name')}>
        <input className="inp text-lg h-display" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
      </Field>
      <Field label={L('Дата', 'Date')}>
        <input type="date" className="inp" value={v.date} onChange={(e) => e.target.value && setV({ ...v, date: e.target.value })} />
      </Field>
      <Field label={L('Заметки', 'Notes')} className="sm:col-span-2">
        <input className="inp" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} placeholder={L('самочувствие, сон, техника…', 'how you felt, sleep, technique…')} />
      </Field>
    </Panel>
  );
}

function SetForm({ entry, all, workoutId, planReps, onAdd }: { entry: WorkoutEntry; all: Workout[]; workoutId: string; planReps?: number; onAdd: (reps: number, kg: number) => void }) {
  const last = entry.sets[entry.sets.length - 1];
  const prevWorkout = all
    .filter((x) => x.id !== workoutId && x.entries.some((e) => e.exerciseId === entry.exerciseId && e.sets.length))
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const prevSets = prevWorkout?.entries.find((e) => e.exerciseId === entry.exerciseId)?.sets || [];
  const ref = last || prevSets[Math.min(entry.sets.length, prevSets.length - 1)];
  const [kg, setKg] = useState(ref ? String(ref.weight) : '');
  const [reps, setReps] = useState(ref ? String(ref.reps) : planReps ? String(planReps) : '');
  return (
    <form
      className="flex items-end gap-2 mt-3"
      onSubmit={(e) => {
        e.preventDefault();
        onAdd(Number(reps), Number(String(kg).replace(',', '.')));
      }}
    >
      <label className="flex-1">
        <span className="label block mb-1">kg</span>
        <input className="inp mono" inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} />
      </label>
      <div className="flex flex-col gap-1 pb-0.5">
        <button type="button" className="chip mono !text-[11px] !px-1.5 !py-2" onClick={() => setKg(String(round1((Number(String(kg).replace(',', '.')) || 0) + 2.5)))}>
          +2.5
        </button>
      </div>
      <label className="flex-1">
        <span className="label block mb-1">{L('повторы', 'reps')}</span>
        <input className="inp mono" inputMode="numeric" value={reps} onChange={(e) => setReps(e.target.value)} />
      </label>
      <Btn type="submit" variant="flash" icon="plus">
        <span className="hidden sm:inline">{L('Подход', 'Set')}</span>
      </Btn>
    </form>
  );
}

export function exerciseName(exercises: Exercise[], id: string) {
  return exercises.find((e) => e.id === id)?.name || '—';
}
