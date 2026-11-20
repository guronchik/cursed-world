// Настройки семестра (даты, каникулы и праздничные недели, отсчёт числителя/знаменателя) и копирование недели.
import { addDays, startOfWeek } from 'date-fns';
import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { Btn, Field, IBtn, Modal, Seg } from '../../components/ui';
import { patchSettings, type Semester } from '../../db/schema';
import { dayKey, fmt } from '../../lib/dates';
import { copyWeek } from '../../lib/events';
import { toast } from '../../lib/fx';
import { L, uid } from '../../lib/runtime';
import { useSettings } from '../../lib/settings';

export function SemesterSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useSettings();
  const [sem, setSem] = useState<Semester>(s.semester);
  const [h, setH] = useState({ from: '', to: '', name: '' });
  const save = async (next: Semester) => {
    setSem(next);
    await patchSettings({ semester: next });
  };
  return (
    <Modal open={open} onClose={onClose} title={L('Семестр', 'Semester')} kanji="学期">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label={L('Начало', 'Start')}>
            <input type="date" className="inp" value={sem.start || ''} onChange={(e) => save({ ...sem, start: e.target.value || undefined })} />
          </Field>
          <Field label={L('Конец', 'End')}>
            <input type="date" className="inp" value={sem.end || ''} onChange={(e) => save({ ...sem, end: e.target.value || undefined })} />
          </Field>
        </div>
        <p className="text-[12px] text-dim -mt-2">{L('Занятия с повтором «Весь семестр» идут до этой даты.', 'Events repeating for the “Whole semester” run until this date.')}</p>
        <Field label={L('Числитель / знаменатель считать', 'Odd/even weeks are counted')} hint={sem.parityBase === 'semester' ? L('Первая неделя семестра — числитель (нечётная).', 'The first semester week is odd (numerator).') : L('По номеру ISO-недели года, как в v1.', 'By the ISO week number, as in v1.')}>
          <Seg
            options={[
              { v: 'iso' as const, label: L('По ISO-неделе', 'ISO week') },
              { v: 'semester' as const, label: L('От начала семестра', 'From semester start') },
            ]}
            value={sem.parityBase}
            onChange={(parityBase) => save({ ...sem, parityBase })}
          />
        </Field>
        <div>
          <div className="label mb-2 ml-1">{L('Каникулы и праздничные недели', 'Breaks and holidays')}</div>
          <p className="text-[12px] text-dim mb-2 ml-1">{L('В эти дни мои повторяющиеся занятия не показываются (события из ICS не трогаются).', 'My recurring classes are hidden on these days (ICS events are untouched).')}</p>
          <div className="space-y-1">
            {sem.holidays.map((x) => (
              <div key={x.id} className="flex items-center gap-2 rounded-xl bg-panel-2 px-3 py-2 text-[14px]">
                <Icon name="sun" size={14} className="text-gold" />
                <span className="flex-1 min-w-0 truncate">
                  {x.name || L('Каникулы', 'Break')} · {fmt(new Date(x.from + 'T12:00'), 'd MMM')}
                  {x.to && x.to !== x.from ? ` — ${fmt(new Date(x.to + 'T12:00'), 'd MMM')}` : ''}
                </span>
                <IBtn icon="trash" size={15} title={L('Удалить', 'Delete')} onClick={() => save({ ...sem, holidays: sem.holidays.filter((y) => y.id !== x.id) })} />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_1.3fr_auto] gap-2 mt-2 items-end">
            <Field label={L('С', 'From')}>
              <input type="date" className="inp" value={h.from} onChange={(e) => setH({ ...h, from: e.target.value, to: h.to && h.to >= e.target.value ? h.to : e.target.value })} />
            </Field>
            <Field label={L('По', 'To')}>
              <input type="date" className="inp" value={h.to} min={h.from} onChange={(e) => setH({ ...h, to: e.target.value })} />
            </Field>
            <Field label={L('Название', 'Name')} className="col-span-2 sm:col-span-1">
              <input className="inp" value={h.name} onChange={(e) => setH({ ...h, name: e.target.value })} placeholder={L('Наурыз', 'Spring break')} />
            </Field>
            <Btn
              icon="plus"
              disabled={!h.from}
              className="col-span-2 sm:col-span-1"
              onClick={async () => {
                await save({ ...sem, holidays: [...sem.holidays, { id: uid(), from: h.from, to: h.to || h.from, name: h.name.trim() }].sort((a, b) => a.from.localeCompare(b.from)) });
                setH({ from: '', to: '', name: '' });
              }}
            >
              {L('Добавить', 'Add')}
            </Btn>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function CopyWeekSheet({ open, onClose, anchor }: { open: boolean; onClose: () => void; anchor: Date }) {
  const from = startOfWeek(anchor, { weekStartsOn: 1 });
  const [to, setTo] = useState(dayKey(addDays(from, 7)));
  const [busy, setBusy] = useState(false);
  const target = startOfWeek(new Date(to + 'T12:00'), { weekStartsOn: 1 });
  return (
    <Modal open={open} onClose={onClose} title={L('Скопировать неделю', 'Copy week')} kanji="写">
      <div className="space-y-3">
        <p className="text-[14px]">
          {L('Из недели', 'From week')} <b>{fmt(from, 'd MMM')} — {fmt(addDays(from, 6), 'd MMM')}</b>
        </p>
        <Field label={L('В неделю (любой день)', 'To week (any day)')} hint={`${fmt(target, 'd MMM')} — ${fmt(addDays(target, 6), 'd MMM')}`}>
          <input type="date" className="inp" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} />
        </Field>
        <p className="text-[12px] text-dim">{L('Копируются мои занятия этой недели как отдельные события. Те, что уже идут в целевой неделе по повтору, не дублируются.', 'My events of this week are copied as single events. Ones already repeating into the target week are not duplicated.')}</p>
        <Btn
          icon="copy"
          disabled={busy || target.getTime() === from.getTime()}
          onClick={async () => {
            setBusy(true);
            const n = await copyWeek(from, target);
            setBusy(false);
            toast(n ? L(`Скопировано: ${n}`, `Copied: ${n}`) : L('Нечего копировать — всё уже есть', 'Nothing to copy — all already there'));
            onClose();
          }}
        >
          {L('Скопировать', 'Copy')}
        </Btn>
      </div>
    </Modal>
  );
}
