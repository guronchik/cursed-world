// Black Flash: статистика, фото прогресса (до/после), календарь посещений, библиотека упражнений и шаблоны.
import { subWeeks } from 'date-fns';
import { useEffect, useRef, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { axis, grid, tooltip } from '../../components/charts';
import { Icon } from '../../components/Icon';
import { Heatmap, MonthGrid } from '../../components/shared';
import { BlobImg, Btn, Empty, Field, FilePick, IBtn, ImagePick, Modal, Panel, Progress, Seg, Stat } from '../../components/ui';
import { db, patchSettings, type Exercise, type ExerciseKind, type Muscle, type ProgressPhoto, type WeightUnit } from '../../db/schema';
import { dayKey, fmt, fromKey, weekdayNames, weekKey, weekStart } from '../../lib/dates';
import { confirmBox, toast } from '../../lib/fx';
import { useAutosave, useLive } from '../../lib/hooks';
import { youtubeId } from '../../lib/links';
import { delBlob, putBlob, useBlobUrl } from '../../lib/media';
import { go, setQuery, useRoute } from '../../lib/router';
import { L, round1, uid } from '../../lib/runtime';
import { useSettings } from '../../lib/settings';
import { bestOf, e1rm, prCount, tonnage } from '../../lib/stats';
import { TiltGallery } from '../../components/TiltGallery';
import { openEntity } from '../../lib/entity';
import { archiveExercise, createExercise, entryName, findDuplicate, guard, KIND_LABELS, kindOf, MUSCLE_LABELS, muscleLabel, normName } from '../../lib/training';
import { askDeleteExercise, CustomTag, exerciseMenu, Group, MUSCLE_COLOR, PlanList, SwipeRow } from './train';


// ───────────── Статистика ─────────────
export function FlashStats() {
  const settings = useSettings();
  const workouts = useLive(() => db.workouts.toArray(), []) || [];
  const exercises = useLive(() => db.exercises.toArray(), []) || [];
  const bw = useLive(() => db.bodyWeights.orderBy('date').toArray(), []) || [];
  const [exId, setExId] = useState('');
  const [bwDate, setBwDate] = useState(dayKey());
  const [bwKg, setBwKg] = useState('');
  const [target, setTarget] = useState(settings.targetBodyWeight ? String(settings.targetBodyWeight) : '');
  // упражнения из журнала — в том числе удалённые из библиотеки и разовые (по снимку названия)
  const used = (() => {
    const m = new Map<string, { id: string; name: string; kind: ExerciseKind }>();
    for (const w of workouts)
      for (const en of w.entries)
        if (en.sets.length && !m.has(en.exerciseId)) {
          const live = exercises.find((e) => e.id === en.exerciseId);
          m.set(en.exerciseId, { id: en.exerciseId, name: entryName(en, exercises) + (live ? '' : ` (${en.oneOff ? L('разовое', 'one-off') : L('удалено', 'deleted')})`), kind: kindOf(live || en) });
        }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  })();
  const ex = exId && used.some((u) => u.id === exId) ? exId : used[0]?.id || '';
  const exKind = used.find((u) => u.id === ex)?.kind || 'weight';

  const total = workouts.reduce((s, w) => s + tonnage(w), 0);
  const thisWeek = workouts.filter((w) => weekKey(fromKey(w.date)) === weekKey(new Date())).reduce((s, w) => s + tonnage(w), 0);
  const prs = workouts.reduce((s, w) => s + prCount(w), 0);
  const weeks = Array.from({ length: 12 }, (_, i) => {
    const ws = weekStart(subWeeks(new Date(), 11 - i));
    const k = weekKey(ws);
    return { name: fmt(ws, 'd.MM'), t: Math.round(workouts.filter((w) => weekKey(fromKey(w.date)) === k).reduce((s, w) => s + tonnage(w), 0)) };
  });
  const progress = workouts
    .filter((w) => w.entries.some((e) => e.exerciseId === ex && e.sets.length))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((w) => {
      const sets = w.entries.filter((e) => e.exerciseId === ex).flatMap((e) => e.sets);
      // для веса — максимальный вес и 1ПМ; для остальных типов — повторы, секунды или километры
      const metric = (s: (typeof sets)[number]) => (exKind === 'time' ? s.time || 0 : exKind === 'distance' ? s.dist || 0 : exKind === 'bodyweight' && !s.weight ? s.reps : s.weight);
      return { name: fmt(fromKey(w.date), 'd.MM'), max: Math.max(...sets.map(metric)), e1rm: exKind === 'weight' ? round1(Math.max(...sets.map((s) => e1rm(s.weight, s.reps)))) : undefined };
    });
  const bwData = bw.map((b) => ({ name: fmt(fromKey(b.date), 'd.MM'), kg: b.kg }));
  const tgt = settings.targetBodyWeight;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Panel bodyClass="p-3">
          <Stat label={L('Тоннаж всего', 'Total volume')} value={`${round1(total / 1000)} t`} color="#ff4f8b" />
        </Panel>
        <Panel bodyClass="p-3">
          <Stat label={L('Тоннаж за неделю', 'This week')} value={`${Math.round(thisWeek)} kg`} />
        </Panel>
        <Panel bodyClass="p-3">
          <Stat label={L('Тренировок', 'Workouts')} value={workouts.length} />
        </Panel>
        <Panel bodyClass="p-3">
          <Stat label={L('Личных рекордов', 'PRs')} value={prs} color="#ff2744" />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={L('Тоннаж по неделям', 'Weekly volume')} kanji="量" accent="#ff2744">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={weeks} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid {...grid} />
              <XAxis dataKey="name" {...axis} />
              <YAxis {...axis} />
              <Tooltip {...tooltip} />
              <Bar dataKey="t" name="kg" fill="#b3001e" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel
          title={L('Прогресс упражнения', 'Exercise progress')}
          kanji="進"
          actions={
            <select className="inp !py-1 !w-auto !text-xs" value={ex} onChange={(e) => setExId(e.target.value)}>
              {used.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          }
        >
          {progress.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={progress} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid {...grid} />
                <XAxis dataKey="name" {...axis} />
                <YAxis {...axis} domain={['auto', 'auto']} />
                <Tooltip {...tooltip} />
                {exercises.find((e) => e.id === ex)?.targetWeight ? <ReferenceLine y={exercises.find((e) => e.id === ex)!.targetWeight} stroke="#f2c14e" strokeDasharray="5 5" /> : null}
                <Line type="monotone" dataKey="max" name={exKind === 'time' ? L('Время, сек', 'Time, s') : exKind === 'distance' ? L('Дистанция, км', 'Distance, km') : exKind === 'bodyweight' ? L('Повторы / вес', 'Reps / weight') : L('Макс. вес', 'Max weight')} stroke="#ff2744" strokeWidth={3} dot={{ r: 3 }} />
                {exKind === 'weight' && <Line type="monotone" dataKey="e1rm" name={L('1ПМ (оценка)', 'Est. 1RM')} stroke="var(--accent-1)" strokeWidth={2} dot={false} strokeDasharray="4 3" />}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <Empty text={L('Пока нет подходов', 'No sets yet')} />
          )}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr] items-start">
        <Panel title={L('Вес тела', 'Body weight')} kanji="体">
          {bwData.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={bwData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid {...grid} />
                <XAxis dataKey="name" {...axis} />
                <YAxis {...axis} domain={['dataMin - 1', tgt ? Math.max(tgt + 1, 0) : 'dataMax + 1']} />
                <Tooltip {...tooltip} />
                {tgt ? <ReferenceLine y={tgt} stroke="#3ddc97" strokeDasharray="5 5" label={{ value: `${L('цель', 'goal')} ${tgt}`, fill: '#3ddc97', fontSize: 11, position: 'insideTopRight' }} /> : null}
                <Line type="monotone" dataKey="kg" name="kg" stroke="#4dd4ff" strokeWidth={3} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <Empty text={L('Добавь первый замер', 'Add your first entry')} />
          )}
          <form
            className="flex flex-wrap gap-2 items-end mt-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const kg = Number(bwKg.replace(',', '.'));
              if (!(kg > 0)) return;
              await db.bodyWeights.put({ id: bwDate, date: bwDate, kg });
              setBwKg('');
              toast(L('Вес записан', 'Weight saved'));
            }}
          >
            <Field label={L('Дата', 'Date')}>
              <input type="date" className="inp" value={bwDate} onChange={(e) => e.target.value && setBwDate(e.target.value)} />
            </Field>
            <Field label="kg">
              <input className="inp w-24 mono" inputMode="decimal" value={bwKg} onChange={(e) => setBwKg(e.target.value)} placeholder={bw[bw.length - 1]?.kg ? String(bw[bw.length - 1].kg) : '70'} />
            </Field>
            <Btn type="submit" icon="plus">
              {L('Записать', 'Log')}
            </Btn>
            <Field label={L('Целевая масса', 'Target weight')} className="ml-auto">
              <input
                className="inp w-24 mono"
                inputMode="decimal"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                onBlur={() => {
                  const v = Number(target.replace(',', '.'));
                  void patchSettings({ targetBodyWeight: v > 0 ? v : undefined });
                }}
              />
            </Field>
          </form>
        </Panel>
        <Panel title={L('Целевые рабочие веса', 'Target working weights')} kanji="標">
          <div className="space-y-3">
            {exercises
              .filter((e) => e.targetWeight && !e.archived)
              .map((e) => {
                const b = bestOf(workouts, e.id);
                const pct = e.targetWeight ? (b.maxWeight / e.targetWeight) * 100 : 0;
                return (
                  <TargetRow key={e.id} e={e} best={b.maxWeight} pct={pct} />
                );
              })}
            {!exercises.some((e) => e.targetWeight) && <div className="text-sm text-muted">{L('Задай цели в библиотеке упражнений', 'Set targets in the exercise library')}</div>}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function TargetRow({ e, best, pct }: { e: Exercise; best: number; pct: number }) {
  const [t, setT] = useState(String(e.targetWeight || ''));
  useAutosave(t, async (v) => {
    const n = Number(v.replace(',', '.'));
    const fresh = await db.exercises.get(e.id);
    if (fresh) await db.exercises.put({ ...fresh, targetWeight: n > 0 ? n : undefined });
  }, 700);
  return (
    <div>
      <div className="flex items-center gap-2 text-sm">
        <span className="flex-1 truncate">{e.name}</span>
        <span className="mono text-muted">{best}</span>
        <span className="text-dim">/</span>
        <input className="inp !w-16 !py-0.5 mono !text-xs" value={t} onChange={(x) => setT(x.target.value)} />
        <span className="text-dim text-xs">kg</span>
      </div>
      <Progress value={pct} color={pct >= 100 ? '#3ddc97' : '#ff2744'} className="mt-1.5" />
    </div>
  );
}

// ───────────── Фото прогресса ─────────────
const ANGLES = () => [
  { id: 'front' as const, label: L('Спереди', 'Front') },
  { id: 'side' as const, label: L('Сбоку', 'Side') },
  { id: 'back' as const, label: L('Сзади', 'Back') },
];

export function Photos() {
  const photos = useLive(() => db.photos.toArray(), []) || [];
  const [date, setDate] = useState(dayKey());
  const [view, setView] = useState<ProgressPhoto | null>(null);
  const wk = weekKey(fromKey(date));
  const weeks = Array.from(new Set(photos.map((p) => p.week))).sort().reverse();
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [angle, setAngle] = useState<ProgressPhoto['angle']>('front');
  const wa = a || weeks[weeks.length - 1] || '';
  const wb = b || weeks[0] || '';
  const pa = photos.find((p) => p.week === wa && p.angle === angle);
  const pb = photos.find((p) => p.week === wb && p.angle === angle);

  return (
    <div className="space-y-4">
      <Panel title={`${L('Фото недели', 'Photos of week')} ${wk}`} kanji="写">
        <div className="flex flex-wrap items-end gap-3 mb-3">
          <Field label={L('Дата съёмки', 'Shot date')}>
            <input type="date" className="inp" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </Field>
          <p className="text-[12px] text-dim pb-2">{L('Лучше снимать в конце недели при одинаковом свете.', 'Shoot at the end of each week in the same light.')}</p>
        </div>
        <div className="grid grid-cols-3 gap-3 max-w-2xl">
          {ANGLES().map((an) => {
            const p = photos.find((x) => x.week === wk && x.angle === an.id);
            return (
              <div key={an.id}>
                <div className="label mb-1">{an.label}</div>
                <div className="aspect-[3/4] bg-void border border-line/60 relative overflow-hidden">
                  {p ? <BlobImg id={p.blobId} className="w-full h-full object-cover cursor-zoom-in" onClick={() => setView(p)} /> : <div className="absolute inset-0 grid place-items-center text-dim"><Icon name="camera" size={26} /></div>}
                </div>
                <div className="flex gap-1 mt-1">
                  <ImagePick
                    capture
                    max={1400}
                    className="btn btn-ghost btn-xs flex-1"
                    onPicked={async (blobId) => {
                      if (p) await delBlob(p.blobId);
                      await db.photos.put({ id: p?.id || uid(), week: wk, date, angle: an.id, blobId });
                    }}
                  >
                    <Icon name="upload" size={11} /> {p ? L('Заменить', 'Replace') : L('Загрузить', 'Upload')}
                  </ImagePick>
                  {p && (
                    <IBtn
                      icon="trash"
                      className="ibtn-sm"
                      onClick={async () => {
                        if (await confirmBox(L('Удалить фото?', 'Delete photo?'), { danger: true })) {
                          await delBlob(p.blobId);
                          await db.photos.delete(p.id);
                        }
                      }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      {weeks.length >= 1 && (
        <Panel title={L('До / После', 'Before / After')} kanji="比">
          <div className="flex flex-wrap gap-2 items-center mb-3">
            <select className="inp !w-auto !py-1.5" value={wa} onChange={(e) => setA(e.target.value)}>
              {weeks.map((w) => (
                <option key={w} value={w}>
                  {L('До', 'Before')}: {w}
                </option>
              ))}
            </select>
            <select className="inp !w-auto !py-1.5" value={wb} onChange={(e) => setB(e.target.value)}>
              {weeks.map((w) => (
                <option key={w} value={w}>
                  {L('После', 'After')}: {w}
                </option>
              ))}
            </select>
            <Seg options={ANGLES().map((x) => ({ v: x.id, label: x.label }))} value={angle} onChange={setAngle} />
          </div>
          {pa && pb ? <BeforeAfter a={pa.blobId} b={pb.blobId} /> : <Empty text={L('Нет фото с этим ракурсом в выбранных неделях', 'No photos for this angle in selected weeks')} icon="image" />}
        </Panel>
      )}

      <Panel title={L('Галерея', 'Gallery')} kanji="録">
        {weeks.map((w) => (
          <div key={w} className="mb-4 last:mb-0">
            <div className="label mb-1.5">{w}</div>
            <div className="grid grid-cols-3 gap-2 max-w-md">
              {ANGLES().map((an) => {
                const p = photos.find((x) => x.week === w && x.angle === an.id);
                return p ? <BlobImg key={an.id} id={p.blobId} className="aspect-[3/4] w-full object-cover cursor-zoom-in border border-line/60" onClick={() => setView(p)} /> : <div key={an.id} className="aspect-[3/4] border border-dashed border-line/60" />;
              })}
            </div>
          </div>
        ))}
        {!weeks.length && <Empty text={L('Пока нет фото', 'No photos yet')} icon="camera" />}
      </Panel>

      <Modal open={!!view} onClose={() => setView(null)} title={view ? `${view.week} · ${ANGLES().find((x) => x.id === view.angle)?.label}` : ''} wide>
        {view && <BlobImg id={view.blobId} className="w-full max-h-[75dvh] object-contain" />}
      </Modal>
    </div>
  );
}

function BeforeAfter({ a, b }: { a: string; b: string }) {
  const ua = useBlobUrl(a);
  const ub = useBlobUrl(b);
  const [pos, setPos] = useState(50);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef(false);
  const move = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    setPos(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)));
  };
  return (
    <div
      ref={box}
      className="relative w-full max-w-md mx-auto aspect-[3/4] overflow-hidden select-none bg-void cursor-ew-resize"
      style={{ touchAction: 'none' }}
      onPointerDown={(e) => {
        drag.current = true;
        (e.target as Element).setPointerCapture?.(e.pointerId);
        move(e.clientX);
      }}
      onPointerMove={(e) => drag.current && move(e.clientX)}
      onPointerUp={() => (drag.current = false)}
    >
      {ub && <img src={ub} alt="after" className="absolute inset-0 w-full h-full object-cover" draggable={false} />}
      {ua && <img src={ua} alt="before" className="absolute inset-0 w-full h-full object-cover" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }} draggable={false} />}
      <div className="absolute inset-y-0 w-0.5 bg-white" style={{ left: `${pos}%`, boxShadow: '0 0 12px var(--accent-1)' }}>
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rotate-45 bg-cursed grid place-items-center" style={{ boxShadow: '0 0 14px var(--accent-1)' }} />
      </div>
      <span className="absolute left-2 top-2 tag">{L('ДО', 'BEFORE')}</span>
      <span className="absolute right-2 top-2 tag">{L('ПОСЛЕ', 'AFTER')}</span>
    </div>
  );
}

// ───────────── Календарь тренировок ─────────────
export function FlashCalendar() {
  const workouts = useLive(() => db.workouts.toArray(), []) || [];
  const exercises = useLive(() => db.exercises.toArray(), []) || [];
  const [month, setMonth] = useState(() => new Date());
  const [day, setDay] = useState(dayKey());
  const maxT = Math.max(1, ...workouts.map(tonnage));
  const byDay = (k: string) => workouts.filter((w) => w.date === k);
  const sel = byDay(day);
  return (
    <div className="space-y-4">
      <Panel title={L('Посещения зала', 'Gym attendance')} kanji="跡" accent="#ff2744">
        <Heatmap
          weeks={26}
          color="#ff2744"
          selected={day}
          onPick={(k) => {
            setDay(k);
            setMonth(fromKey(k));
          }}
          value={(k) => {
            const ws = byDay(k);
            return ws.length ? Math.max(0.35, ws.reduce((s, w) => s + tonnage(w), 0) / maxT) : null;
          }}
        />
      </Panel>
      <div className="grid gap-4 lg:grid-cols-[1fr_360px] items-start">
        <Panel bodyClass="p-3 sm:p-4">
          <MonthGrid
            month={month}
            onMonth={setMonth}
            selected={day}
            onSelect={setDay}
            cellClass="min-h-[56px] sm:min-h-[72px]"
            renderDay={(_, k) =>
              byDay(k).map((w) => (
                <div key={w.id} className="text-[10px] leading-tight truncate px-1 mt-0.5" style={{ background: '#ff274426', borderLeft: '2px solid #ff2744' }}>
                  {w.name}
                </div>
              ))
            }
          />
        </Panel>
        <Panel title={fmt(fromKey(day), 'EEEE, d MMMM')} kanji="日">
          {sel.map((w) => (
            <div key={w.id} className="mb-4 last:mb-0">
              <button className="h-display text-lg hover:text-acc" onClick={() => go(`/taijutsu/flash/log?w=${w.id}`)}>
                {w.name} →
              </button>
              <div className="text-[11px] text-dim mb-2">
                {Math.round(tonnage(w))} kg · PR ×{prCount(w)}
              </div>
              {w.entries.map((e) => (
                <div key={e.id} className="text-[13px] py-0.5">
                  <span className="text-muted">{entryName(e, exercises)}:</span>{' '}
                  <span className="mono">{e.sets.map((s) => `${s.weight}×${s.reps}${s.pr ? ' PR' : ''}`).join(', ') || '—'}</span>
                </div>
              ))}
            </div>
          ))}
          {!sel.length && <div className="text-sm text-muted">{L('В этот день тренировки не было', 'No workout this day')}</div>}
        </Panel>
      </div>
    </div>
  );
}

// ───────────── Библиотека, планы, план по дням ─────────────
export function Library() {
  const exercises = useLive(() => db.exercises.toArray(), []) || [];
  const templates = useLive(() => db.templates.toArray(), []) || [];
  const settings = useSettings();
  const { query } = useRoute();
  const exQ = query.get('ex');
  const [muscle, setMuscle] = useState<Muscle | 'all' | 'archived'>('all');
  const [q, setQ] = useState('');
  const [newEx, setNewEx] = useState<Exercise | null>(null);
  const [libView, setLibView] = useState<'gallery' | 'grid'>('gallery');
  const M = MUSCLE_LABELS();
  const archivedCount = exercises.filter((e) => e.archived).length;
  const usedMuscles = (Object.keys(M) as Muscle[]).filter((m) => m !== 'other' || exercises.some((e) => !e.archived && e.muscle === 'other'));
  const list = exercises
    .filter((e) => (muscle === 'archived' ? e.archived : !e.archived && (muscle === 'all' || e.muscle === muscle)) && (!q.trim() || normName(e.name).includes(normName(q))))
    .sort((a, b) => a.name.localeCompare(b.name));
  const exact = q.trim() ? findDuplicate(q, exercises) : undefined;
  const opened = exercises.find((e) => e.id === exQ) || null;
  const names = weekdayNames('EEEE');
  const view = muscle === 'archived' ? 'grid' : libView;

  const createFromSearch = async () => {
    const ex = await guard(L('создать упражнение', 'create exercise'), () => createExercise({ name: q, muscle: muscle === 'all' || muscle === 'archived' ? undefined : muscle }));
    if (!ex) return;
    toast(`${L('Создано', 'Created')}: ${ex.name}`);
    setQ('');
  };

  const chips = (small = false) => (
    <>
      <button className={`chip ${small ? '!py-1' : ''} ${muscle === 'all' ? 'chip-on' : ''}`} onClick={() => setMuscle('all')}>
        {L('Все', 'All')}
      </button>
      {usedMuscles.map((m) => (
        <button key={m} className={`chip ${small ? '!py-1' : ''} ${muscle === m ? 'chip-on' : ''}`} onClick={() => setMuscle(m)}>
          {M[m]}
        </button>
      ))}
      {archivedCount > 0 && (
        <button className={`chip ${small ? '!py-1' : ''} ${muscle === 'archived' ? 'chip-on' : ''}`} onClick={() => setMuscle('archived')}>
          <Icon name="inbox" size={12} /> {L('Архив', 'Archive')} {archivedCount}
        </button>
      )}
    </>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        {chips()}
        <input
          className="inp !w-48 !py-1.5 ml-auto"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && q.trim() && !exact && void createFromSearch()}
          placeholder={L('Поиск', 'Search')}
          data-testid="lib-search"
        />
        <Btn icon="plus" onClick={() => setNewEx({ id: uid(), name: q.trim(), muscle: muscle === 'all' || muscle === 'archived' ? 'chest' : muscle, notes: '', createdAt: Date.now(), isCustom: true, archived: false, kind: 'weight', unit: 'kg' })}>
          {L('Упражнение', 'Exercise')}
        </Btn>
      </div>
      {q.trim() && !exact && (
        <button type="button" className="w-full sm:w-auto flex items-center gap-2 rounded-xl px-4 min-h-[48px] text-acc border border-dashed border-line hover:bg-panel-2" onClick={() => void createFromSearch()} data-testid="lib-create">
          <Icon name="plus" size={16} /> {L('Создать', 'Create')} «{q.trim()}»
        </button>
      )}
      {muscle !== 'archived' && <Seg options={[{ v: 'gallery' as const, label: L('Галерея', 'Gallery') }, { v: 'grid' as const, label: L('Сетка', 'Grid') }]} value={libView} onChange={setLibView} />}
      {view === 'gallery' && list.length > 0 && (
        <TiltGallery
          items={list}
          total={exercises.filter((e) => !e.archived).length}
          label={L('Библиотека упражнений', 'Exercise library')}
          getId={(e) => e.id}
          getTitle={(e) => e.name}
          getSubtitle={(e) => muscleLabel(e) + (e.isCustom ? ' · Custom' : '') + (e.targetWeight ? ` · → ${e.targetWeight} ${e.unit || 'kg'}` : '')}
          getColor={(e) => MUSCLE_COLOR[e.muscle] || '#ff9f0a'}
          getImage={(e) =>
            e.photoId ? <BlobImg id={e.photoId} className="absolute inset-0 w-full h-full object-cover" /> : youtubeId(e.videoUrl) ? `https://i.ytimg.com/vi/${youtubeId(e.videoUrl)}/hqdefault.jpg` : (
              <div className="absolute inset-0 grid place-items-center text-white/85" style={{ background: `linear-gradient(150deg, color-mix(in srgb, ${MUSCLE_COLOR[e.muscle] || '#ff9f0a'} 60%, #000), #0b0b10)` }}>
                <Icon name="dumbbell" size={64} />
              </div>
            )
          }
          renderMeta={(e) => (
            <div className="space-y-2">
              <span className="tag">{muscleLabel(e)}</span> <CustomTag ex={e} />
              {e.targetWeight ? <div className="mono text-[13px]">{L('Цель', 'Target')}: {e.targetWeight} {e.unit || 'kg'}</div> : null}
              {e.notes && <p className="text-[13px] text-muted line-clamp-4">{e.notes}</p>}
            </div>
          )}
          onOpen={(e) => openEntity('exercise', e.id, { order: list.map((x) => x.id), title: e.name })}
          filters={<div className="flex flex-wrap gap-1.5">{chips(true)}</div>}
        />
      )}
      {view === 'grid' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3" data-testid="lib-grid">
          {list.map((e) => (
            <SwipeRow key={e.id} onDelete={() => void askDeleteExercise(e)} onMenu={() => void exerciseMenu(e, { onEdit: () => setQuery('ex', e.id), onOpen: () => openEntity('exercise', e.id, { title: e.name }) })}>
              <div className="panel panel-flat overflow-hidden relative" data-ex={e.name}>
                <button className="block w-full text-left hover:brightness-125" onClick={() => setQuery('ex', e.id)}>
                  <div className="aspect-video bg-void relative">
                    {e.photoId ? (
                      <BlobImg id={e.photoId} className="w-full h-full object-cover" />
                    ) : youtubeId(e.videoUrl) ? (
                      <img src={`https://i.ytimg.com/vi/${youtubeId(e.videoUrl)}/mqdefault.jpg`} alt="" className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="absolute inset-0 grid place-items-center text-dim">
                        <Icon name="dumbbell" size={28} />
                      </div>
                    )}
                    {(e.videoUrl || e.videoBlobId) && (
                      <span className="absolute right-1.5 bottom-1.5 tag" style={{ background: '#ff2744', color: '#fff' }}>
                        <Icon name="play" size={10} />
                      </span>
                    )}
                  </div>
                  <div className="p-2.5 pr-11">
                    <div className="text-sm leading-tight">{e.name}</div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      <span className="tag">{muscleLabel(e)}</span>
                      <CustomTag ex={e} />
                      {e.archived && <span className="tag">{L('архив', 'archived')}</span>}
                      {e.targetWeight ? <span className="text-[11px] text-dim mono">→ {e.targetWeight} {e.unit || 'kg'}</span> : null}
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  className="ibtn absolute right-0.5 bottom-0.5"
                  title={L('Действия', 'Actions')}
                  aria-label={`${L('Действия', 'Actions')}: ${e.name}`}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    void exerciseMenu(e, { onEdit: () => setQuery('ex', e.id), onOpen: () => openEntity('exercise', e.id, { title: e.name }) });
                  }}
                >
                  <Icon name="more" size={17} />
                </button>
              </div>
            </SwipeRow>
          ))}
        </div>
      )}
      {!list.length && !q.trim() && <Empty text={muscle === 'archived' ? L('Архив пуст', 'Archive is empty') : L('Ничего не найдено', 'Nothing found')} icon="dumbbell" />}

      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <Panel title={L('Планы тренировок', 'Workout plans')} kanji="型">
          <PlanList />
        </Panel>
        <Panel title={L('План по дням недели', 'Weekly plan')} kanji="週">
          <div className="space-y-1.5">
            {names.map((n, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="w-32 text-sm capitalize text-muted">{n}</span>
                <select
                  className="inp !py-1.5"
                  value={settings.trainingPlan?.[String(i)] || ''}
                  onChange={(e) => patchSettings({ trainingPlan: { ...settings.trainingPlan, [String(i)]: e.target.value || undefined } })}
                >
                  <option value="">— {L('отдых', 'rest')} —</option>
                  {templates
                    .filter((t) => !t.archived || t.id === settings.trainingPlan?.[String(i)])
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                </select>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-dim mt-2">{L('План показывается в HQ и в общем календаре.', 'The plan shows up in HQ and the calendar.')}</p>
        </Panel>
      </div>

      {(opened || newEx) && <ExerciseModal key={(opened || newEx)!.id} e={(opened || newEx)!} isNew={!opened} all={exercises} onClose={() => (opened ? setQuery('ex') : setNewEx(null))} />}
    </div>
  );
}

function ExerciseModal({ e: init, isNew, all, onClose }: { e: Exercise; isNew: boolean; all: Exercise[]; onClose: () => void }) {
  const [e, setE] = useState(init);
  const set = (p: Partial<Exercise>) => setE((x) => ({ ...x, ...p }));
  const video = useBlobUrl(e.videoBlobId);
  const yt = youtubeId(e.videoUrl);
  const dup = findDuplicate(e.name, all, e.id);
  useAutosave(e, (v) => {
    if (!v.name.trim()) return;
    void guard(L('сохранить упражнение', 'save exercise'), async () => {
      // упражнение могли удалить, пока окно открыто — не «воскрешаем» его автосохранением
      if (await db.exercises.get(v.id)) await db.exercises.put({ ...v, name: v.name.trim() });
    });
  }, 400, !isNew);
  useEffect(() => setE(init), [init.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const M = MUSCLE_LABELS();
  const kind = kindOf(e);
  return (
    <Modal
      open
      onClose={onClose}
      wide
      kanji="技"
      title={isNew ? L('Новое упражнение', 'New exercise') : e.name}
      footer={
        <>
          {!isNew && (
            <>
              <Btn size="sm" variant="danger" icon="trash" className="mr-auto" onClick={() => void askDeleteExercise(e, onClose)}>
                {L('Удалить', 'Delete')}
              </Btn>
              <Btn size="sm" variant="ghost" icon={e.archived ? 'undo' : 'inbox'} onClick={() => void archiveExercise(e.id, !e.archived).then(onClose)}>
                {e.archived ? L('Из архива', 'Unarchive') : L('В архив', 'Archive')}
              </Btn>
            </>
          )}
          <Btn
            size="sm"
            icon="check"
            disabled={!e.name.trim()}
            onClick={async () => {
              const ok = await guard(L('сохранить упражнение', 'save exercise'), async () => {
                if (!isNew && !(await db.exercises.get(e.id))) throw new Error(L('упражнение уже удалено', 'exercise was deleted'));
                await db.exercises.put({ ...e, name: e.name.trim() });
                return true;
              });
              if (ok) onClose();
            }}
          >
            {isNew ? L('Создать', 'Create') : L('Готово', 'Done')}
          </Btn>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <Field label={L('Название', 'Name')}>
            <input className="inp" value={e.name} autoFocus={isNew} onChange={(x) => set({ name: x.target.value })} />
          </Field>
          {dup && (
            <div className="text-[12.5px] rounded-lg px-3 py-2" style={{ background: '#ff9f0a14', color: '#ffb340' }} role="alert">
              {L('Такое уже есть', 'Already exists')}: «{dup.name}»{dup.archived ? ` (${L('в архиве', 'archived')})` : ''}.{' '}
              <button type="button" className="underline" onClick={() => (onClose(), setQuery('ex', dup.id))}>
                {L('Открыть существующее', 'Open existing')}
              </button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Field label={L('Группа мышц', 'Muscle group')}>
              <select className="inp" value={e.muscle} onChange={(x) => set({ muscle: x.target.value as Muscle })}>
                {(Object.keys(M) as Muscle[]).map((m) => (
                  <option key={m} value={m}>
                    {m === 'other' ? L('Своя / другое', 'Custom / other') : M[m]}
                  </option>
                ))}
              </select>
            </Field>
            {e.muscle === 'other' ? (
              <Field label={L('Своя группа', 'Custom group')}>
                <input className="inp" value={e.muscleCustom || ''} onChange={(x) => set({ muscleCustom: x.target.value || undefined })} />
              </Field>
            ) : (
              <Field label={L('Оборудование', 'Equipment')}>
                <input className="inp" value={e.equipment || ''} onChange={(x) => set({ equipment: x.target.value || undefined })} />
              </Field>
            )}
          </div>
          {e.muscle === 'other' && (
            <Field label={L('Оборудование', 'Equipment')}>
              <input className="inp" value={e.equipment || ''} onChange={(x) => set({ equipment: x.target.value || undefined })} />
            </Field>
          )}
          <Group label={L('Тип', 'Type')}>
            <div className="overflow-x-auto">
              <Seg options={(Object.keys(KIND_LABELS()) as ExerciseKind[]).map((k) => ({ v: k, label: KIND_LABELS()[k] }))} value={kind} onChange={(v) => set({ kind: v })} />
            </div>
          </Group>
          {(kind === 'weight' || kind === 'bodyweight') && (
            <div className="grid grid-cols-2 gap-2">
              <Group label={L('Единицы', 'Units')}>
                <Seg options={[{ v: 'kg' as WeightUnit, label: 'kg' }, { v: 'lb' as WeightUnit, label: 'lb' }]} value={e.unit || 'kg'} onChange={(v) => set({ unit: v })} />
              </Group>
              <Field label={`${L('Цель', 'Target')}, ${e.unit || 'kg'}`}>
                <input className="inp mono" inputMode="decimal" value={e.targetWeight ?? ''} onChange={(x) => set({ targetWeight: Number(x.target.value.replace(',', '.')) || undefined })} />
              </Field>
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            <Field label={L('Подходы', 'Sets')}>
              <input className="inp mono" inputMode="numeric" value={e.defSets ?? ''} onChange={(x) => set({ defSets: Number(x.target.value) || undefined })} placeholder="3" />
            </Field>
            <Field label={kind === 'time' ? L('Секунды', 'Seconds') : L('Повторы', 'Reps')}>
              <input className="inp mono" inputMode="numeric" value={e.defReps ?? ''} onChange={(x) => set({ defReps: Number(x.target.value) || undefined })} placeholder="10" />
            </Field>
            <Field label={L('Отдых, сек', 'Rest, s')}>
              <input className="inp mono" inputMode="numeric" value={e.defRest ?? ''} onChange={(x) => set({ defRest: Number(x.target.value) || undefined })} placeholder="90" />
            </Field>
          </div>
          <Field label={L('Заметки о технике', 'Technique notes')}>
            <textarea className="inp" rows={4} value={e.notes} onChange={(x) => set({ notes: x.target.value })} />
          </Field>
        </div>
        <div className="space-y-3">
          <div>
            <div className="label mb-1">{L('Моё фото', 'My photo')}</div>
            <div className="aspect-video bg-void border border-line/60 overflow-hidden">{e.photoId ? <BlobImg id={e.photoId} className="w-full h-full object-cover" /> : <div className="w-full h-full grid place-items-center text-dim"><Icon name="camera" size={26} /></div>}</div>
            <div className="flex gap-2 mt-1">
              <ImagePick
                capture
                className="btn btn-ghost btn-xs"
                onPicked={async (id) => {
                  await delBlob(e.photoId);
                  set({ photoId: id });
                }}
              >
                <Icon name="upload" size={11} /> {L('Фото', 'Photo')}
              </ImagePick>
              {e.photoId && (
                <Btn size="xs" variant="ghost" icon="x" onClick={async () => { await delBlob(e.photoId); set({ photoId: undefined }); }}>
                  {L('Убрать', 'Remove')}
                </Btn>
              )}
            </div>
          </div>
          <Field label={L('Видеогайд (ссылка на YouTube)', 'Video guide (YouTube link)')}>
            <input className="inp" value={e.videoUrl || ''} onChange={(x) => set({ videoUrl: x.target.value || undefined })} placeholder="https://youtu.be/…" />
          </Field>
          {yt && (
            <div className="aspect-video bg-void border border-line/60">
              <iframe className="w-full h-full" src={`https://www.youtube-nocookie.com/embed/${yt}`} title="YouTube" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
            </div>
          )}
          {e.videoUrl && !yt && <div className="text-[11px] text-gold">{L('Не похоже на ссылку YouTube', "Doesn't look like a YouTube link")}</div>}
          <div>
            <div className="label mb-1">{L('Или своё видео', 'Or your own video')}</div>
            {video && <video src={video} controls className="w-full max-h-64 bg-black mb-1" />}
            <div className="flex gap-2">
              <FilePick
                accept="video/*"
                className="btn btn-ghost btn-xs"
                onFiles={async ([f]) => {
                  if (f.size > 150 * 1024 * 1024) toast(L('Видео больше 150 МБ — может не поместиться в хранилище браузера', 'Video over 150 MB may not fit browser storage'), 'warn');
                  await delBlob(e.videoBlobId);
                  set({ videoBlobId: await putBlob(f, f.name) });
                }}
              >
                <Icon name="video" size={11} /> {L('Загрузить видео', 'Upload video')}
              </FilePick>
              {e.videoBlobId && (
                <Btn size="xs" variant="ghost" icon="x" onClick={async () => { await delBlob(e.videoBlobId); set({ videoBlobId: undefined }); }}>
                  {L('Убрать', 'Remove')}
                </Btn>
              )}
            </div>
          </div>
        </div>
      </div>
      {!isNew && <div className="text-[11px] text-dim mt-3">{L('Изменения сохраняются автоматически. Переименование видно везде — в планах, журнале и статистике.', 'Changes save automatically. Renames show everywhere — plans, log and stats.')}</div>}
    </Modal>
  );
}
