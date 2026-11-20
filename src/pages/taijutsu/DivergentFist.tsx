// Divergent Fist — уход за собой: утренний/вечерний квест, таблетки, стрики, соблюдение, тепловая карта.
import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { Heatmap } from '../../components/shared';
import { Btn, Field, IBtn, Modal, Panel, Ring, Toggle } from '../../components/ui';
import { db, patchSettings, type Med, type Routine } from '../../db/schema';
import { dayKey, fmt, fromKey } from '../../lib/dates';
import { confirmBox, toast } from '../../lib/fx';
import { useLive } from '../../lib/hooks';
import { daysWord, L, uid } from '../../lib/runtime';
import { useSettings } from '../../lib/settings';
import { adherence, careScore, medsDoneDates, routineDone, routineDoneDates, scheduledDoses, streak } from '../../lib/stats';
import { daysLeft, MED_DISCLAIMER, MedsToday, RoutineCard } from './care';

export function DivergentFist() {
  const today = dayKey();
  const settings = useSettings();
  const routines = useLive(() => db.routines.toArray(), []) || [];
  const rlogs = useLive(() => db.routineLogs.toArray(), []) || [];
  const meds = useLive(() => db.meds.toArray(), []) || [];
  const mlogs = useLive(() => db.medLogs.toArray(), []) || [];
  const [editR, setEditR] = useState<Routine | null>(null);
  const [editM, setEditM] = useState<Med | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const morning = routines.find((r) => r.slot === 'morning');
  const evening = routines.find((r) => r.slot === 'evening');
  const needPerm = meds.some((m) => m.reminders && m.active) && 'Notification' in window && (Notification.permission !== 'granted' || !settings.notifications);

  const newRoutine = (slot: 'morning' | 'evening'): Routine => ({ id: uid(), slot, name: slot === 'morning' ? L('Утренний уход', 'Morning care') : L('Вечерний уход', 'Evening care'), steps: [] });
  const newMed = (): Med => ({ id: uid(), name: '', dose: '', times: ['09:00'], perDose: 1, stock: 30, refillDays: 7, reminders: true, notes: '', active: true, createdAt: Date.now() });

  const week = adherence(7, routines, rlogs, meds, mlogs);
  const month = adherence(30, routines, rlogs, meds, mlogs);
  const streaks = [
    morning && { l: L('Утро', 'Morning'), v: streak(routineDoneDates(morning, rlogs)), icon: 'sun' },
    evening && { l: L('Вечер', 'Evening'), v: streak(routineDoneDates(evening, rlogs)), icon: 'moon' },
    meds.length > 0 && { l: L('Таблетки', 'Pills'), v: streak(medsDoneDates(meds, mlogs)), icon: 'pill' },
  ].filter(Boolean) as { l: string; v: number; icon: string }[];
  const picked = pick ? careScore(pick, routines, rlogs, meds, mlogs) : null;
  const firstDay = [...rlogs.map((l) => l.date), ...mlogs.map((l) => l.date), ...meds.map((m) => dayKey(m.createdAt))].sort()[0] || today;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {morning ? <RoutineCard r={morning} date={today} logs={rlogs} onEdit={() => setEditR(morning)} /> : <Panel><Btn icon="plus" onClick={() => setEditR(newRoutine('morning'))}>{L('Утренняя рутина', 'Morning routine')}</Btn></Panel>}
        {evening ? <RoutineCard r={evening} date={today} logs={rlogs} onEdit={() => setEditR(evening)} /> : <Panel><Btn icon="plus" onClick={() => setEditR(newRoutine('evening'))}>{L('Вечерняя рутина', 'Evening routine')}</Btn></Panel>}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr] items-start">
        <Panel
          title={L('Таблетки сегодня', 'Pills today')}
          kanji="薬"
          actions={
            <Btn size="xs" icon="plus" onClick={() => setEditM(newMed())}>
              {L('Таблетка', 'Pill')}
            </Btn>
          }
        >
          <MedsToday date={today} onEdit={setEditM} />
          {needPerm && (
            <button
              className="chip mt-3"
              onClick={async () => {
                const p = await Notification.requestPermission();
                await patchSettings({ notifications: p === 'granted' });
                toast(p === 'granted' ? L('Напоминания включены', 'Reminders on') : L('Браузер не разрешил уведомления', 'Notifications were blocked'), p === 'granted' ? 'ok' : 'warn');
              }}
            >
              <Icon name="bell" size={13} /> {L('Включить уведомления-напоминания', 'Enable reminder notifications')}
            </button>
          )}
          <div className="divider-glow my-4" />
          <div className="label mb-2">{L('Все препараты', 'All items')}</div>
          <div className="grid sm:grid-cols-2 gap-2">
            {meds.map((m) => {
              const left = daysLeft(m);
              const low = left <= m.refillDays;
              return (
                <button key={m.id} onClick={() => setEditM(m)} className={`text-left p-3 border ${low ? 'border-gold/60 bg-gold/5' : 'border-line/60 bg-void/40'} ${m.active ? '' : 'opacity-50'}`}>
                  <div className="flex items-center gap-2">
                    <Icon name="pill" size={14} className="text-acc" />
                    <span className="text-sm font-medium truncate flex-1">{m.name}</span>
                    {m.reminders && <Icon name="bell" size={12} className="text-dim" />}
                  </div>
                  <div className="text-[11px] text-muted mt-1">
                    {m.dose} · {m.times.join(', ')}
                  </div>
                  <div className={`text-[11px] mt-1 mono ${low ? 'text-gold' : 'text-dim'}`}>
                    {L('Остаток', 'Stock')}: {m.stock} · {L('хватит на', 'lasts')} {daysWord(left === Infinity ? 0 : left)} {low ? `· ${L('пора докупить', 'restock')}` : ''}
                  </div>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-dim mt-4 flex gap-2">
            <Icon name="shield" size={13} className="shrink-0 mt-0.5" /> {MED_DISCLAIMER()}
          </p>
        </Panel>

        <Panel title={L('Соблюдение', 'Adherence')} kanji="律">
          <div className="flex items-center gap-5 mb-4">
            <Ring value={week} size={78} color="var(--accent-1)">
              <div className="mono text-lg font-bold">{week}%</div>
              <div className="label text-[8px]">{L('неделя', 'week')}</div>
            </Ring>
            <Ring value={month} size={78} color="#4dd4ff">
              <div className="mono text-lg font-bold">{month}%</div>
              <div className="label text-[8px]">{L('месяц', 'month')}</div>
            </Ring>
            <div className="flex-1 space-y-1.5">
              {streaks.map((s) => (
                <div key={s.l} className="flex items-center gap-2 text-sm">
                  <Icon name={s.icon} size={13} className="text-muted" />
                  <span className="flex-1 text-muted">{s.l}</span>
                  <span className="mono font-bold" style={{ color: s.v >= 7 ? '#ff4f8b' : 'var(--accent-text)' }}>
                    {s.v} {s.v >= 7 && <Icon name="flame" size={12} className="inline -mt-0.5" />}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="label mb-2">{L('Тепловая карта ухода', 'Care heatmap')}</div>
          <Heatmap weeks={22} selected={pick || undefined} value={(k) => {
              if (k < firstDay) return null;
              const s = careScore(k, routines, rlogs, meds, mlogs);
              return s.total ? s.ratio : null;
            }} onPick={setPick} />
          {pick && picked && (
            <div className="mt-3 p-3 bg-void/50 border border-line/60 text-sm">
              <div className="flex items-center">
                <span className="h-display">{fmt(fromKey(pick), 'EEEE, d MMMM')}</span>
                <span className="ml-auto mono text-acc">{Math.round(picked.ratio * 100)}%</span>
              </div>
              <div className="mt-2 space-y-1 text-[13px]">
                {routines.map((r) => {
                  const ok = routineDone(r, rlogs.find((l) => l.id === `${pick}|${r.id}`));
                  return (
                    <div key={r.id} className={ok ? 'text-jade' : 'text-muted'}>
                      {ok ? '✓' : '✗'} {r.name}
                    </div>
                  );
                })}
                {scheduledDoses(meds, pick).map((d) => {
                  const st = mlogs.find((l) => l.id === d.id)?.status;
                  return (
                    <div key={d.id} className={st === 'taken' ? 'text-jade' : st === 'skipped' ? 'text-blood' : 'text-muted'}>
                      {st === 'taken' ? '✓' : st === 'skipped' ? '✗' : '·'} {d.time} {d.med.name}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Panel>
      </div>

      {editR && <RoutineEditor r={editR} onClose={() => setEditR(null)} />}
      {editM && <MedEditor m={editM} onClose={() => setEditM(null)} />}
    </div>
  );
}

function RoutineEditor({ r: init, onClose }: { r: Routine; onClose: () => void }) {
  const [r, setR] = useState(init);
  const exists = useLive(() => db.routines.get(init.id), [init.id]);
  const move = (i: number, d: number) => {
    const steps = r.steps.slice();
    const j = i + d;
    if (j < 0 || j >= steps.length) return;
    [steps[i], steps[j]] = [steps[j], steps[i]];
    setR({ ...r, steps });
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={r.name || L('Рутина', 'Routine')}
      kanji={r.slot === 'morning' ? '朝' : '夜'}
      footer={
        <>
          {exists && (
            <Btn
              size="sm"
              variant="danger"
              icon="trash"
              className="mr-auto"
              onClick={async () => {
                if (await confirmBox(L('Удалить рутину и её историю?', 'Delete routine and its history?'), { danger: true })) {
                  await db.routines.delete(r.id);
                  onClose();
                }
              }}
            >
              {L('Удалить', 'Delete')}
            </Btn>
          )}
          <Btn
            size="sm"
            icon="check"
            onClick={async () => {
              await db.routines.put({ ...r, steps: r.steps.filter((s) => s.name.trim()) });
              onClose();
            }}
          >
            {L('Сохранить', 'Save')}
          </Btn>
        </>
      }
    >
      <Field label={L('Название', 'Name')}>
        <input className="inp" value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} />
      </Field>
      <div className="label mt-4 mb-2">{L('Шаги и продукты', 'Steps and products')}</div>
      <div className="space-y-2">
        {r.steps.map((s, i) => (
          <div key={s.id} className="flex gap-2 items-center">
            <span className="mono text-xs text-dim w-5">{i + 1}</span>
            <input className="inp !py-1.5" value={s.name} placeholder={L('Шаг', 'Step')} onChange={(e) => setR({ ...r, steps: r.steps.map((x) => (x.id === s.id ? { ...x, name: e.target.value } : x)) })} />
            <input className="inp !py-1.5" value={s.product || ''} placeholder={L('Продукт', 'Product')} onChange={(e) => setR({ ...r, steps: r.steps.map((x) => (x.id === s.id ? { ...x, product: e.target.value } : x)) })} />
            <IBtn icon="up" className="ibtn-sm" onClick={() => move(i, -1)} />
            <IBtn icon="down" className="ibtn-sm" onClick={() => move(i, 1)} />
            <IBtn icon="x" className="ibtn-sm" onClick={() => setR({ ...r, steps: r.steps.filter((x) => x.id !== s.id) })} />
          </div>
        ))}
      </div>
      <Btn size="sm" variant="ghost" icon="plus" className="mt-3" onClick={() => setR({ ...r, steps: [...r.steps, { id: uid(), name: '', product: '' }] })}>
        {L('Шаг', 'Step')}
      </Btn>
    </Modal>
  );
}

function MedEditor({ m: init, onClose }: { m: Med; onClose: () => void }) {
  const [m, setM] = useState(init);
  const [pack, setPack] = useState(30);
  const exists = useLive(() => db.meds.get(init.id), [init.id]);
  const set = (p: Partial<Med>) => setM((x) => ({ ...x, ...p }));
  return (
    <Modal
      open
      onClose={onClose}
      title={exists ? m.name : L('Новая таблетка', 'New pill')}
      kanji="薬"
      footer={
        <>
          {exists && (
            <Btn
              size="sm"
              variant="danger"
              icon="trash"
              className="mr-auto"
              onClick={async () => {
                if (await confirmBox(L('Удалить из трекера? История приёмов останется.', 'Remove from tracker? Intake history stays.'), { danger: true })) {
                  await db.meds.delete(m.id);
                  onClose();
                }
              }}
            >
              {L('Удалить', 'Delete')}
            </Btn>
          )}
          <Btn
            size="sm"
            icon="check"
            disabled={!m.name.trim() || !m.times.length}
            onClick={async () => {
              await db.meds.put({ ...m, name: m.name.trim(), times: Array.from(new Set(m.times)).sort() });
              onClose();
            }}
          >
            {L('Сохранить', 'Save')}
          </Btn>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={L('Название', 'Name')} className="sm:col-span-2">
          <input className="inp" autoFocus={!exists} value={m.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label={L('Доза (как назначено)', 'Dose (as prescribed)')} className="sm:col-span-2" hint={L('Вводишь сам — приложение ничего не рекомендует.', 'You enter it — the app recommends nothing.')}>
          <input className="inp" value={m.dose} onChange={(e) => set({ dose: e.target.value })} placeholder={L('например: 1 таблетка', 'e.g. 1 tablet')} />
        </Field>
        <Field label={L('Время приёма', 'Intake times')} className="sm:col-span-2">
          <div className="flex flex-wrap gap-2 items-center">
            {m.times.map((t, i) => (
              <div key={i} className="flex items-center gap-1">
                <input type="time" className="inp !w-auto !py-1" value={t} onChange={(e) => set({ times: m.times.map((x, j) => (j === i ? e.target.value : x)) })} />
                <IBtn icon="x" className="ibtn-sm" onClick={() => set({ times: m.times.filter((_, j) => j !== i) })} />
              </div>
            ))}
            <Btn size="xs" variant="ghost" icon="plus" onClick={() => set({ times: [...m.times, '21:00'] })}>
              {L('время', 'time')}
            </Btn>
          </div>
        </Field>
        <Field label={L('Штук за приём', 'Units per intake')}>
          <input type="number" min={0} step="any" className="inp" value={m.perDose} onChange={(e) => set({ perDose: Math.max(0, Number(e.target.value)) })} />
        </Field>
        <Field label={L('Остаток в упаковке', 'Units left')}>
          <div className="flex gap-2">
            <input type="number" min={0} className="inp" value={m.stock} onChange={(e) => set({ stock: Math.max(0, Number(e.target.value)) })} />
          </div>
        </Field>
        <Field label={L('Предупредить, когда останется на (дней)', 'Warn when left for (days)')}>
          <input type="number" min={0} className="inp" value={m.refillDays} onChange={(e) => set({ refillDays: Math.max(0, Number(e.target.value)) })} />
        </Field>
        <Field label={L('Докупил упаковку', 'Bought a pack')}>
          <div className="flex gap-2">
            <input type="number" min={1} className="inp" value={pack} onChange={(e) => setPack(Math.max(1, Number(e.target.value)))} />
            <Btn size="sm" variant="ghost" icon="plus" onClick={() => set({ stock: m.stock + pack })}>
              {L('добавить', 'add')}
            </Btn>
          </div>
        </Field>
        <div className="sm:col-span-2 flex flex-wrap gap-5 py-1">
          <Toggle on={m.reminders} onChange={(v) => set({ reminders: v })} label={L('Напоминания', 'Reminders')} />
          <Toggle on={m.active} onChange={(v) => set({ active: v })} label={L('Активна', 'Active')} />
        </div>
        <Field label={L('Заметки', 'Notes')} className="sm:col-span-2">
          <textarea className="inp" rows={2} value={m.notes} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
      </div>
      <p className="text-[11px] text-dim mt-4">{MED_DISCLAIMER()}</p>
    </Modal>
  );
}
