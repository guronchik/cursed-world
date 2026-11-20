// Black Flash — зал: журнал тренировок, автоматические PR с молнией BLACK FLASH.
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { Btn, Empty, Field, IBtn, Panel, Stat, Tabs } from '../../components/ui';
import { db, type Exercise, type Workout, type WorkoutEntry, type WorkoutSet } from '../../db/schema';
import { finishWorkout, startWorkout } from '../../lib/actions';
import { fmt, fromKey } from '../../lib/dates';
import { confirmBox, fx, toastUndo } from '../../lib/fx';
import { useAutosave, useLive } from '../../lib/hooks';
import { go, setQuery, useRoute } from '../../lib/router';
import { L, round1, uid } from '../../lib/runtime';
import { play } from '../../lib/sound';
import { bestOf, e1rm, prCount, tonnage } from '../../lib/stats';
import { detectPR, entryName, guard, kindOf, MUSCLE_LABELS, muscleLabel, newEntry, parseTime, setLabel, unitOf, UNDO_MS } from '../../lib/training';
import { FlashCalendar, FlashStats, Library, Photos } from './FlashMore';
import { AddExerciseSheet, PasteWorkoutSheet, PlanList } from './train';

/** Названия групп мышц (оставлено для совместимости импортов). */
export const MUSCLES = MUSCLE_LABELS;

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
  if (wid) return <WorkoutEditor id={wid} />;
  const sorted = workouts.slice().sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  const start = async (tid?: string) => {
    const id = await guard(L('начать тренировку', 'start workout'), () => startWorkout(tid));
    if (id) setQuery('w', id);
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr] items-start">
      <Panel title={L('Новая тренировка', 'New workout')} kanji="黒閃" accent="#ff2744">
        <PlanList onStart={(t) => void start(t.id)} compact />
        <button className="w-full btn btn-ghost mt-2" onClick={() => void start()}>
          <Icon name="plus" size={14} /> {L('Пустая тренировка', 'Empty workout')}
        </button>
        <p className="text-[11px] text-dim mt-3">{L('Нажми план — начнётся тренировка. «⋯», свайп влево или долгое нажатие — меню плана. Новый личный рекорд запускает BLACK FLASH.', 'Tap a plan to start. “⋯”, swipe left or long-press for plan actions. A new personal record triggers BLACK FLASH.')}</p>
      </Panel>
      <Panel title={L('История', 'History')} kanji="録">
        {sorted.map((w) => (
          <button key={w.id} onClick={() => setQuery('w', w.id)} className="w-full flex items-center gap-3 py-2.5 border-b border-line/40 last:border-0 text-left hover:bg-cursed/5 px-1 min-h-[52px]">
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
  const [sheet, setSheet] = useState(false);
  const [paste, setPaste] = useState(false);
  const [hdrKey, setHdrKey] = useState(0);
  // после вставки из заметок поле «Заметки» перечитывается, когда в базе уже новый текст
  const pendingHdr = useRef(false);
  useEffect(() => {
    if (pendingHdr.current && w) {
      pendingHdr.current = false;
      setHdrKey((k) => k + 1);
    }
  }, [w?.notes]); // eslint-disable-line react-hooks/exhaustive-deps
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

  const addSet = async (entry: WorkoutEntry, input: Omit<WorkoutSet, 'id' | 'pr'>) => {
    const ex = exOf(entry.exerciseId);
    const kind = kindOf(ex || entry);
    const unit = unitOf(ex || entry);
    const ok = kind === 'time' ? (input.time || 0) > 0 : kind === 'distance' ? (input.dist || 0) > 0 : input.reps > 0 && input.weight >= 0;
    if (!ok) return;
    await guard(L('записать подход', 'log set'), async () => {
      const fresh = (await db.workouts.get(w.id)) || w;
      const prior = bestOf(all, entry.exerciseId, w.id);
      const curSets = fresh.entries.find((e) => e.id === entry.id)?.sets || [];
      const pr = detectPR(kind, unit, prior, curSets, input);
      const set: WorkoutSet = { id: uid(), ...input, pr: pr.isPR };
      await save({ ...fresh, entries: fresh.entries.map((e) => (e.id === entry.id ? { ...e, sets: [...e.sets, set] } : e)) });
      if (pr.isPR) {
        play('flash');
        fx.emit({ type: 'blackflash', title: `${entryName(entry, exercises)} — ${setLabel(set, kind, unit)}`, sub: pr.sub });
      } else play('tick');
    });
  };

  const removeEntry = async (entry: WorkoutEntry) => {
    if (entry.sets.length && !(await confirmBox(L('Убрать упражнение из этой тренировки вместе с подходами?', 'Remove this exercise and its sets from the workout?'), { danger: true, okLabel: L('Убрать', 'Remove') }))) return;
    await guard(L('убрать из тренировки', 'remove from workout'), async () => {
      const fresh = (await db.workouts.get(w.id)) || w;
      const idx = fresh.entries.findIndex((e) => e.id === entry.id);
      await save({ ...fresh, entries: fresh.entries.filter((e) => e.id !== entry.id) });
      toastUndo(`${L('Убрано из тренировки', 'Removed from workout')}: ${entryName(entry, exercises)}`, () =>
        void guard(L('вернуть', 'restore'), async () => {
          const cur = await db.workouts.get(w.id);
          if (!cur || cur.entries.some((e) => e.id === entry.id)) return;
          const entries = cur.entries.slice();
          entries.splice(Math.max(0, Math.min(idx, entries.length)), 0, entry);
          await save({ ...cur, entries });
        }),
      UNDO_MS);
    });
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
              if (!(await confirmBox(L('Удалить тренировку?', 'Delete workout?'), { danger: true }))) return;
              const done = await guard(L('удалить тренировку', 'delete workout'), async () => {
                await db.workouts.delete(w.id);
                return true;
              });
              if (!done) return;
              setQuery('w');
              toastUndo(L('Тренировка удалена', 'Workout deleted'), () => void guard(L('вернуть тренировку', 'restore workout'), async () => void (await db.workouts.put(w))), UNDO_MS);
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

      <WorkoutHeader key={hdrKey} w={w} />

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
            const kind = kindOf(ex || entry);
            const unit = unitOf(ex || entry);
            const best = bestOf(all, entry.exerciseId, w.id);
            const plan = tpl?.items.find((i) => i.exerciseId === entry.exerciseId);
            return (
              <motion.div key={entry.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Panel
                  title={entryName(entry, exercises)}
                  accent="#ff2744"
                  actions={<IBtn icon="trash" size={15} title={L('Убрать из тренировки', 'Remove from workout')} onClick={() => void removeEntry(entry)} />}
                >
                  <div className="flex flex-wrap gap-2 text-[11px] text-muted mb-2">
                    {ex && <span className="tag">{muscleLabel(ex)}</span>}
                    {ex?.isCustom && <span className="tag">Custom</span>}
                    {entry.oneOff && <span className="tag">{L('разовое', 'one-off')}</span>}
                    {!ex && !entry.oneOff && <span className="tag">{L('удалено из библиотеки', 'deleted from library')}</span>}
                    {best.has && kind === 'weight' && (
                      <span>
                        {L('Рекорд', 'Best')}: <b className="mono text-ink">{best.maxWeight} {unit}</b> · 1ПМ ≈ <b className="mono text-ink">{round1(best.best1rm)}</b>
                      </span>
                    )}
                    {best.has && kind === 'bodyweight' && (
                      <span>
                        {L('Рекорд', 'Best')}: <b className="mono text-ink">{best.maxReps}</b> {L('повт.', 'reps')}
                      </span>
                    )}
                    {best.has && kind === 'time' && (
                      <span>
                        {L('Рекорд', 'Best')}: <b className="mono text-ink">{setLabel({ id: '', reps: 0, weight: 0, time: best.maxTime }, 'time', unit)}</b>
                      </span>
                    )}
                    {best.has && kind === 'distance' && (
                      <span>
                        {L('Рекорд', 'Best')}: <b className="mono text-ink">{best.maxDist} km</b>
                      </span>
                    )}
                    {plan && (
                      <span>
                        {L('План', 'Plan')}: {plan.sets}×{plan.reps}
                        {plan.weight ? ` · ${plan.weight} ${unit}` : ''}
                      </span>
                    )}
                    {ex?.targetWeight ? (
                      <span>
                        {L('Цель', 'Target')}: {ex.targetWeight} {unit}
                      </span>
                    ) : null}
                  </div>
                  <table className="w-full text-sm">
                    <tbody>
                      {entry.sets.map((s, i) => (
                        <tr key={s.id} className="border-t border-line/40">
                          <td className="py-1.5 w-8 mono text-dim">{i + 1}</td>
                          <td className="mono">{setLabel(s, kind, unit)}</td>
                          <td className="mono text-dim text-xs">{kind === 'weight' ? `1ПМ ${round1(e1rm(s.weight, s.reps))}` : ''}</td>
                          <td className="w-16">
                            {s.pr && (
                              <span className="tag" style={{ color: '#fff', background: 'linear-gradient(90deg,#16030a,#b3001e)' }}>
                                黒閃 PR
                              </span>
                            )}
                          </td>
                          <td className="w-8 text-right">
                            <IBtn icon="x" className="ibtn-sm" title={L('Удалить подход', 'Delete set')} onClick={() => save({ ...w, entries: w.entries.map((e) => (e.id === entry.id ? { ...e, sets: e.sets.filter((x) => x.id !== s.id) } : e)) })} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <SetForm key={entry.sets.length} entry={entry} kind={kind} unit={unit} all={all} workoutId={w.id} plan={plan} onAdd={(v) => addSet(entry, v)} />
                </Panel>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Btn variant="ghost" icon="plus" className="w-full" onClick={() => setSheet(true)}>
          {L('Добавить упражнение', 'Add exercise')}
        </Btn>
        <Btn variant="ghost" icon="note" className="w-full" onClick={() => setPaste(true)}>
          {L('Вставить из заметок', 'Paste from notes')}
        </Btn>
      </div>
      <PasteWorkoutSheet open={paste} onClose={() => setPaste(false)} workoutId={w.id} onApplied={() => (pendingHdr.current = true)} />
      <AddExerciseSheet
        open={sheet}
        onClose={() => setSheet(false)}
        context="workout"
        addedIds={w.entries.map((e) => e.exerciseId)}
        onAdd={async (ex: Exercise, oneOff: boolean) => {
          const fresh = await db.workouts.get(w.id);
          if (!fresh) throw new Error(L('Тренировка не найдена', 'Workout not found'));
          await save({ ...fresh, entries: [...fresh.entries, { ...newEntry(ex), ...(oneOff ? { oneOff: true } : {}) }] });
        }}
      />
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

const num = (v: string) => Number(String(v).replace(',', '.'));

/** Форма подхода под тип упражнения: вес × повторы, собственный вес (+отягощение), время, дистанция. */
function SetForm({ entry, kind, unit, all, workoutId, plan, onAdd }: { entry: WorkoutEntry; kind: ReturnType<typeof kindOf>; unit: ReturnType<typeof unitOf>; all: Workout[]; workoutId: string; plan?: { reps: number; weight?: number }; onAdd: (v: Omit<WorkoutSet, 'id' | 'pr'>) => void }) {
  const last = entry.sets[entry.sets.length - 1];
  const prevWorkout = all
    .filter((x) => x.id !== workoutId && x.entries.some((e) => e.exerciseId === entry.exerciseId && e.sets.length))
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const prevSets = prevWorkout?.entries.find((e) => e.exerciseId === entry.exerciseId)?.sets || [];
  const ref = last || prevSets[Math.min(entry.sets.length, prevSets.length - 1)];
  const [kg, setKg] = useState(ref ? String(ref.weight || '') : plan?.weight ? String(plan.weight) : '');
  const [reps, setReps] = useState(ref ? String(ref.reps || '') : plan?.reps ? String(plan.reps) : '');
  const [time, setTime] = useState(ref?.time ? String(ref.time) : kind === 'time' && plan?.reps ? String(plan.reps) : '');
  const [dist, setDist] = useState(ref?.dist ? String(ref.dist) : '');
  const step = unit === 'lb' ? 5 : 2.5;
  return (
    <form
      className="flex items-end gap-2 mt-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (kind === 'time') onAdd({ reps: 0, weight: 0, time: parseTime(time) });
        else if (kind === 'distance') onAdd({ reps: 0, weight: 0, dist: num(dist) || 0, time: parseTime(time) || undefined });
        else onAdd({ reps: num(reps), weight: num(kg) || 0 });
      }}
    >
      {(kind === 'weight' || kind === 'bodyweight') && (
        <>
          <label className="flex-1">
            <span className="label block mb-1">{kind === 'bodyweight' ? `+${unit}` : unit}</span>
            <input className="inp mono" inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} placeholder={kind === 'bodyweight' ? '0' : ''} />
          </label>
          <div className="flex flex-col gap-1 pb-0.5">
            <button type="button" className="chip mono !text-[11px] !px-1.5 !py-2" onClick={() => setKg(String(round1((num(kg) || 0) + step)))}>
              +{step}
            </button>
          </div>
          <label className="flex-1">
            <span className="label block mb-1">{L('повторы', 'reps')}</span>
            <input className="inp mono" inputMode="numeric" value={reps} onChange={(e) => setReps(e.target.value)} />
          </label>
        </>
      )}
      {kind === 'distance' && (
        <label className="flex-1">
          <span className="label block mb-1">km</span>
          <input className="inp mono" inputMode="decimal" value={dist} onChange={(e) => setDist(e.target.value)} />
        </label>
      )}
      {(kind === 'time' || kind === 'distance') && (
        <label className="flex-1">
          <span className="label block mb-1">{kind === 'time' ? L('время (сек или м:сс)', 'time (s or m:ss)') : L('время (необяз.)', 'time (optional)')}</span>
          <input className="inp mono" inputMode="text" value={time} onChange={(e) => setTime(e.target.value)} placeholder="1:30" />
        </label>
      )}
      <Btn type="submit" variant="flash" icon="plus">
        <span className="hidden sm:inline">{L('Подход', 'Set')}</span>
      </Btn>
    </form>
  );
}

export function exerciseName(exercises: Exercise[], id: string) {
  return exercises.find((e) => e.id === id)?.name || '—';
}
