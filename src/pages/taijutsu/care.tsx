// Общие блоки ухода: чек-лист рутины и приёмы таблеток на день (используются в HQ и Divergent Fist).
import { Icon } from '../../components/Icon';
import { IBtn, Panel, Ring } from '../../components/ui';
import { db, type Med, type Routine, type RoutineLog } from '../../db/schema';
import { setMedLog, toggleRoutineStep } from '../../lib/actions';
import { useLive } from '../../lib/hooks';
import { L } from '../../lib/runtime';
import { scheduledDoses } from '../../lib/stats';

export function RoutineCard({ r, date, logs, onEdit, compact }: { r: Routine; date: string; logs: RoutineLog[]; onEdit?: () => void; compact?: boolean }) {
  const log = logs.find((l) => l.id === `${date}|${r.id}`);
  const done = log?.done ?? [];
  const n = r.steps.filter((s) => done.includes(s.id)).length;
  const pct = r.steps.length ? (n / r.steps.length) * 100 : 0;
  const complete = r.steps.length > 0 && n === r.steps.length;
  return (
    <Panel
      title={r.name}
      kanji={r.slot === 'morning' ? '朝' : '夜'}
      accent={complete ? '#3ddc97' : undefined}
      actions={
        <>
          {onEdit && <IBtn icon="edit" size={15} onClick={onEdit} title={L('Изменить шаги', 'Edit steps')} />}
          <Ring value={pct} size={34} stroke={4} color={complete ? '#3ddc97' : 'var(--accent-1)'}>
            <span className="mono text-[10px]">{n}/{r.steps.length}</span>
          </Ring>
        </>
      }
      bodyClass={compact ? 'px-4 pb-3 pt-1' : 'px-4 pb-4 pt-1'}
    >
      <div className="space-y-1">
        {r.steps.map((s) => {
          const on = done.includes(s.id);
          return (
            <button key={s.id} className="w-full flex items-center gap-3 py-1.5 text-left group" onClick={(e) => toggleRoutineStep(r, date, s.id, e.currentTarget)}>
              <span className={`chk pointer-events-none ${on ? 'chk-on' : ''}`} />
              <span className="min-w-0 flex-1">
                <span className={`block text-sm ${on ? 'line-through text-muted' : ''}`}>{s.name}</span>
                {s.product && !compact && <span className="block text-[11px] text-dim truncate">{s.product}</span>}
              </span>
            </button>
          );
        })}
        {!r.steps.length && <div className="text-sm text-muted">{L('Добавь шаги рутины', 'Add routine steps')}</div>}
      </div>
    </Panel>
  );
}

export function daysLeft(m: Med) {
  const perDay = m.perDose * Math.max(1, m.times.length);
  return perDay ? Math.floor(m.stock / perDay) : Infinity;
}

export function MedsToday({ date, onEdit }: { date: string; onEdit?: (m: Med) => void }) {
  const meds = useLive(() => db.meds.toArray(), []) || [];
  const logs = useLive(() => db.medLogs.where('date').equals(date).toArray(), [date]) || [];
  const doses = scheduledDoses(meds, date).sort((a, b) => a.time.localeCompare(b.time));
  if (!doses.length) return <div className="text-sm text-muted py-2">{L('На сегодня приёмов нет', 'No doses today')}</div>;
  return (
    <div className="divide-y divide-line/50">
      {doses.map((d) => {
        const st = logs.find((l) => l.id === d.id)?.status;
        const left = daysLeft(d.med);
        return (
          <div key={d.id} className="flex items-center gap-3 py-2">
            <span className="mono text-sm text-acc w-12 shrink-0">{d.time}</span>
            <button className="min-w-0 flex-1 text-left" onClick={() => onEdit?.(d.med)}>
              <span className={`block text-sm truncate ${st === 'taken' ? 'text-muted line-through' : ''}`}>{d.med.name}</span>
              <span className="block text-[11px] text-dim truncate">
                {d.med.dose}
                {left <= d.med.refillDays && (
                  <span className="text-gold ml-2">
                    <Icon name="alert" size={11} className="inline -mt-0.5" /> {L('осталось на', 'left for')} {left} {L('дн.', 'd')}
                  </span>
                )}
              </span>
            </button>
            <button className={`chip ${st === 'taken' ? 'chip-on' : ''}`} style={st === 'taken' ? { borderColor: '#3ddc97', background: '#3ddc9722' } : undefined} onClick={() => setMedLog(d.med, date, d.time, st === 'taken' ? null : 'taken')}>
              <Icon name="check" size={12} /> <span className="hidden sm:inline">{L('Принял', 'Taken')}</span>
            </button>
            <button className={`chip ${st === 'skipped' ? 'chip-on' : ''}`} style={st === 'skipped' ? { borderColor: '#ff2744', background: '#ff274422' } : undefined} onClick={() => setMedLog(d.med, date, d.time, st === 'skipped' ? null : 'skipped')}>
              <Icon name="x" size={12} /> <span className="hidden sm:inline">{L('Пропустил', 'Skipped')}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

export const MED_DISCLAIMER = () =>
  L(
    'Приложение — только трекер приёма. Оно не даёт медицинских советов: дозировку и схему определяет врач.',
    'This app is only an intake tracker and gives no medical advice: dosage and schedule are up to your doctor.',
  );
