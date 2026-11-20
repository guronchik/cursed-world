// Редактор занятия/события (bottom sheet): тип, предмет, время, повторы (дни недели, каждые N недель, до даты,
// весь семестр, числитель/знаменатель), аудитория, преподаватель, цвет, заметки. Правка повтора — «только это / это и следующие / все».
import { useMemo, useState } from 'react';
import { Icon } from '../../components/Icon';
import { SubjectPicker } from '../../components/SubjectPicker';
import { Btn, ColorPick, Field, IBtn, Modal, Seg, Toggle } from '../../components/ui';
import { db, type CalEvent, type EventType } from '../../db/schema';
import { applySnapshot, getSemester, isOddWeekNo, MANUAL } from '../../lib/calendar';
import { dayKey, fmt, weekdayNames } from '../../lib/dates';
import { applySeriesEdit, duplicateOccurrence, ETYPES, etypeOf, findOverlaps, isSeries, kindForEtype, masterOf, newMyEvent, removeEvent, removeSeries, repeatFields, repeatOf, skipOccurrence, type Repeat, type Scope } from '../../lib/events';
import { chooseBox, confirmBox, toast } from '../../lib/fx';
import { useLive } from '../../lib/hooks';
import { assignmentFromEvent, dismissDeadlines } from '../../lib/linked';
import { findOnMap } from '../../lib/mapLink';
import { go } from '../../lib/router';
import { L } from '../../lib/runtime';

export interface EventTarget {
  ev: CalEvent;
  start: number; // начало этого повтора
  end: number;
  source?: string;
}

const hhmm = (ms: number) => fmt(ms, 'HH:mm');
const at = (day: string, t: string) => new Date(`${day}T${t || '00:00'}`).getTime();

export function EventSheet({ target, preset, onClose, onOpen }: { target: EventTarget | null; preset?: { start: number; end: number; allDay?: boolean }; onClose: () => void; onOpen?: (t: EventTarget) => void }) {
  const base = useMemo<CalEvent>(() => {
    if (target) return { ...target.ev, start: target.start, end: target.end };
    return newMyEvent({ start: preset?.start ?? Date.now(), end: preset?.end ?? (preset?.start ?? Date.now()) + 90 * 60000, allDay: !!preset?.allDay });
  }, [target, preset]);
  const [e, setE] = useState<CalEvent>(base);
  const [rep, setRep] = useState<Repeat>(() => repeatOf(target?.ev || base));
  const [day, setDay] = useState(dayKey(base.start));
  const [st, setSt] = useState(hhmm(base.start));
  const [en, setEn] = useState(hhmm(base.end));
  const [onlyThis, setOnlyThis] = useState(false);
  const [showDesc, setShowDesc] = useState(false);
  const pins = useLive(() => db.pins.toArray(), []) || [];
  const set = (p: Partial<CalEvent>) => setE((x) => ({ ...x, ...p }));
  const isNew = !target;
  const fromIcs = e.sourceId !== MANUAL;
  const series = !!target && (isSeries(target.ev) || target.ev.recurrenceId !== undefined);
  const wd = weekdayNames('EEEEEE');
  const sem = getSemester();

  const startMs = e.allDay ? at(day, '00:00') : at(day, st);
  const endMs = e.allDay ? at(day, '00:00') + 864e5 : at(day, en);
  const valid = (e.title.trim() || e.subjectId) && endMs > startMs;

  // ── ICS-дедлайн: отдельный короткий вид с действиями Inbox ──
  if (fromIcs && e.kind === 'deadline' && target)
    return (
      <Modal open onClose={onClose} title={L('Дедлайн из AITU', 'AITU deadline')} kanji="限">
        <div className="space-y-3">
          <div>
            <div className="text-[17px] font-semibold">{e.title}</div>
            <div className="text-[13px] text-muted mt-0.5">
              {fmt(target.start, e.allDay ? 'EEEE, d MMMM' : 'EEEE, d MMMM, HH:mm')} · {target.source || 'ICS'}
            </div>
          </div>
          {e.assignmentId ? (
            <Btn variant="ghost" icon="grad" onClick={() => go(`/tools/assignments?a=${e.assignmentId}`)}>
              {L('Открыть задание', 'Open assignment')}
            </Btn>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Btn
                icon="plus"
                onClick={async () => {
                  await assignmentFromEvent(e);
                  toast(L('Добавлено в Assignments', 'Added to Assignments'));
                  onClose();
                }}
              >
                {L('Добавить в Assignments', 'Add to Assignments')}
              </Btn>
              <Btn
                variant="ghost"
                icon="skull"
                onClick={async () => {
                  await assignmentFromEvent(e, true);
                  onClose();
                }}
              >
                {L('Сделать Curse', 'Make Curse')}
              </Btn>
              <Btn
                variant="ghost"
                size="sm"
                onClick={async () => {
                  await dismissDeadlines([e]);
                  toast(L('Отклонено — при реимпорте не предложим снова', 'Dismissed — will not be suggested again'));
                  onClose();
                }}
              >
                {L('Отклонить', 'Dismiss')}
              </Btn>
            </div>
          )}
          <button
            className="chip"
            onClick={async () => {
              await db.calEvents.put({ ...target.ev, kind: 'class', etype: 'class', kindManual: true, locallyEdited: true, updatedAt: Date.now() });
              onClose();
            }}
          >
            {L('Это не дедлайн — сделать занятием', 'Not a deadline — make it a class')}
          </button>
          {e.description && <pre className="text-[12.5px] whitespace-pre-wrap font-sans text-muted max-h-60 overflow-y-auto p-3 rounded-xl bg-panel-2">{e.description}</pre>}
        </div>
      </Modal>
    );

  const candidate = (): CalEvent => {
    const title = e.title.trim() || '';
    const rf = fromIcs ? { rrule: e.rrule, parity: e.parity, semesterBound: e.semesterBound } : repeatFields(rep, startMs);
    return { ...e, title, ...rf, start: startMs, end: endMs, kind: e.kind === 'deadline' ? 'deadline' : kindForEtype(etypeOf(e)), updatedAt: Date.now() };
  };

  const checkOverlaps = async (c: CalEvent) => {
    if (c.allDay || c.kind === 'deadline') return true;
    const all = (await db.calEvents.toArray()).filter((x) => !x.hidden);
    const sources = await db.calSources.toArray();
    const off = new Set(sources.filter((x) => !x.enabled).map((x) => x.id));
    const ov = findOverlaps(c, all.filter((x) => !off.has(x.sourceId)), c.start);
    if (!ov.length) return true;
    const list = ov
      .slice(0, 4)
      .map((o) => `• ${o.title} — ${fmt(o.start, 'EEE d MMM, HH:mm')}–${hhmm(o.end)}`)
      .join('\n');
    return !!(await confirmBox(`${L('Пересекается по времени:', 'Overlaps with:')}\n${list}${ov.length > 4 ? `\n… +${ov.length - 4}` : ''}`, { okLabel: L('Сохранить всё равно', 'Save anyway') }));
  };

  const save = async () => {
    if (!valid) return;
    const c = candidate();
    if (!c.title) {
      const s = c.subjectId ? await db.subjects.get(c.subjectId) : undefined;
      c.title = s?.name || L('Занятие', 'Class');
    }
    if (!(await checkOverlaps(c))) return;
    if (fromIcs && c.ics) {
      const t = target!;
      const changed =
        c.title !== t.ev.title || c.location !== t.ev.location || c.allDay !== t.ev.allDay || startMs !== t.start || endMs !== t.end || c.color !== t.ev.color || c.notes !== t.ev.notes || (c.teacher || '') !== (t.ev.teacher || '') || c.subjectId !== t.ev.subjectId || c.kind !== t.ev.kind;
      c.locallyEdited = t.ev.locallyEdited || changed;
    }
    if (isNew) {
      await db.calEvents.put(c);
      toast(c.rrule ? L('Повторяющееся занятие добавлено', 'Recurring class added') : L('Добавлено', 'Added'));
      onClose();
      return;
    }
    if (!series) {
      await db.calEvents.put({ ...target!.ev, ...c, id: target!.ev.id });
      onClose();
      return;
    }
    const master = await masterOf(target!.ev);
    if (!master) {
      await db.calEvents.put({ ...target!.ev, ...c });
      onClose();
      return;
    }
    const occStart = target!.ev.recurrenceId ?? target!.start;
    const ruleChanged = !fromIcs && (repeatFields(rep, startMs).rrule !== master.rrule || rep.parity !== master.parity || !!rep.semester !== !!master.semesterBound);
    let scope: Scope | null = onlyThis ? 'this' : null;
    if (!scope) {
      const opts = [
        ...(ruleChanged ? [] : [{ v: 'this', label: L('Только это занятие', 'This event only') }]),
        { v: 'following', label: L('Это и следующие', 'This and following') },
        { v: 'all', label: L('Все занятия серии', 'All events') },
      ];
      scope = (await chooseBox(L('Это повторяющееся занятие. Что изменить?', 'This is a recurring event. What to change?'), opts)) as Scope | null;
      if (!scope) return;
    }
    await applySeriesEdit(master, occStart, c, scope, fromIcs ? undefined : rep);
    toast(L('Сохранено', 'Saved'));
    onClose();
  };

  const del = async () => {
    if (!target) return;
    if (series) {
      const v = await chooseBox(fromIcs ? L('Скрыть занятие из AITU?', 'Hide AITU event?') : L('Удалить повторяющееся занятие?', 'Delete recurring event?'), [
        { v: 'this', label: fromIcs ? L('Скрыть только это', 'Hide this one') : L('Удалить только это', 'Delete this one'), danger: true },
        { v: 'all', label: fromIcs ? L('Скрыть всю серию', 'Hide the series') : L('Удалить всю серию', 'Delete the series'), danger: true },
      ]);
      if (!v) return;
      if (v === 'this') await skipOccurrence(target.ev, target.ev.recurrenceId ?? target.start);
      else await removeSeries(target.ev);
    } else {
      if (!(await confirmBox(fromIcs ? L('Скрыть событие? При реимпорте не вернётся — вернуть можно в «Источниках».', 'Hide this event? It will not return on re-import — restore it in Sources.') : L('Удалить событие?', 'Delete event?'), { danger: true }))) return;
      await removeEvent(target.ev);
    }
    onClose();
  };

  const types: { v: EventType | 'deadline'; label: string }[] = [...ETYPES().map((t) => ({ v: t.v, label: t.label })), ...(fromIcs ? [{ v: 'deadline' as const, label: L('Дедлайн', 'Deadline') }] : [])];

  return (
    <Modal
      open
      onClose={onClose}
      wide
      kanji="暦"
      title={isNew ? L('Новое занятие', 'New event') : series ? L('Повторяющееся занятие', 'Recurring event') : L('Занятие', 'Event')}
      footer={
        <>
          {!isNew && (
            <Btn size="sm" variant="danger" icon={fromIcs ? 'eyeoff' : 'trash'} onClick={del}>
              {fromIcs ? L('Скрыть', 'Hide') : L('Удалить', 'Delete')}
            </Btn>
          )}
          {!isNew && series && (
            <Btn
              size="sm"
              variant="ghost"
              icon="x"
              onClick={async () => {
                await skipOccurrence(target!.ev, target!.ev.recurrenceId ?? target!.start);
                toast(L(`Пропущено: ${fmt(target!.start, 'EEE d MMM')}`, `Skipped: ${fmt(target!.start, 'EEE d MMM')}`));
                onClose();
              }}
            >
              {L('Пропустить', 'Skip')}
            </Btn>
          )}
          {!isNew && (
            <Btn
              size="sm"
              variant="ghost"
              icon="copy"
              className="mr-auto"
              onClick={async () => {
                const copy = await duplicateOccurrence(candidate(), startMs, endMs);
                toast(L('Копия создана', 'Duplicated'));
                onOpen?.({ ev: copy, start: copy.start, end: copy.end });
              }}
            >
              {L('Дублировать', 'Duplicate')}
            </Btn>
          )}
          <Btn size="sm" icon="check" onClick={save} disabled={!valid}>
            {L('Сохранить', 'Save')}
          </Btn>
        </>
      }
    >
      {e.conflict && (
        <div className="rounded-2xl p-3 mb-3 bg-[color-mix(in_srgb,#ffcc00_14%,transparent)]">
          <div className="text-[14px] font-semibold flex items-center gap-2">
            <Icon name="alert" size={16} /> {L('В ICS новая версия этого события', 'ICS has a new version of this event')}
          </div>
          <div className="text-[12.5px] text-muted mt-1">
            {e.conflict.title} · {fmt(e.conflict.start, 'd MMM HH:mm')}
            {e.conflict.location ? ` · ${e.conflict.location}` : ''}
          </div>
          <div className="flex gap-2 mt-2">
            <Btn
              size="xs"
              variant="ghost"
              onClick={async () => {
                const n = { ...target!.ev, ics: e.conflict, conflict: undefined };
                await db.calEvents.put(n);
                setE({ ...e, ics: e.conflict, conflict: undefined });
              }}
            >
              {L('Оставить моё', 'Keep mine')}
            </Btn>
            <Btn
              size="xs"
              onClick={async () => {
                const n = applySnapshot(target!.ev, e.conflict!);
                await db.calEvents.put(n);
                onClose();
              }}
            >
              {L('Взять из ICS', 'Use ICS')}
            </Btn>
          </div>
        </div>
      )}
      {fromIcs && (
        <div className="flex flex-wrap items-center gap-2 mb-3 text-[12px] text-muted">
          <span className="tag" style={{ background: '#0a84ff22', color: '#64d2ff' }}>
            {target?.source || 'ICS'}
          </span>
          {e.locallyEdited ? L('изменено вручную — реимпорт не затрёт', 'edited locally — re-import keeps it') : L('как в ICS', 'as in ICS')}
          {e.locallyEdited && e.ics && (
            <button
              className="chip !min-h-[28px] ml-auto"
              onClick={async () => {
                await db.calEvents.put(applySnapshot(target!.ev, e.ics!));
                onClose();
              }}
            >
              <Icon name="undo" size={12} /> {L('Вернуть версию AITU', 'Restore AITU version')}
            </button>
          )}
        </div>
      )}
      {series && (
        <div className="flex flex-wrap items-center gap-2 mb-3 text-[12.5px] text-muted">
          <Icon name="refresh" size={13} />
          {fmt(target!.start, 'EEEE, d MMMM')}
          <button className={`chip !min-h-[28px] ${onlyThis ? 'chip-on' : ''}`} onClick={() => setOnlyThis(!onlyThis)}>
            {L('Перенести только это', 'Move this one only')}
          </button>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={L('Тип', 'Type')} className="sm:col-span-2">
          <div className="overflow-x-auto -mx-1 px-1">
            <Seg
              options={types}
              value={(e.kind === 'deadline' ? 'deadline' : etypeOf(e)) as EventType | 'deadline'}
              onChange={(v) => (v === 'deadline' ? set({ kind: 'deadline', kindManual: true }) : set({ etype: v, kind: kindForEtype(v), kindManual: fromIcs ? true : e.kindManual }))}
            />
          </div>
        </Field>
        <Field label={L('Предмет', 'Subject')}>
          <SubjectPicker
            value={e.subjectId}
            onChange={(subjectId, s) => {
              const title = !e.title.trim() && s ? s.name : e.title;
              set({ subjectId, title });
            }}
          />
        </Field>
        <Field label={L('Название', 'Title')}>
          <input className="inp" value={e.title} autoFocus={isNew} onChange={(x) => set({ title: x.target.value })} placeholder={L('по умолчанию — предмет', 'defaults to subject')} />
        </Field>
        <div className="sm:col-span-2">
          <Toggle on={e.allDay} onChange={(allDay) => set({ allDay })} label={L('Весь день', 'All day')} />
        </div>
        <Field label={L('День', 'Day')}>
          <input type="date" className="inp" value={day} onChange={(x) => x.target.value && setDay(x.target.value)} />
        </Field>
        {!e.allDay && (
          <div className="grid grid-cols-2 gap-2">
            <Field label={L('Начало', 'Start')}>
              <input
                type="time"
                className="inp"
                value={st}
                step={300}
                onChange={(x) => {
                  const v = x.target.value;
                  if (!v) return;
                  const dur = at(day, en) - at(day, st);
                  setSt(v);
                  if (dur > 0) setEn(hhmm(at(day, v) + dur));
                }}
              />
            </Field>
            <Field label={L('Конец', 'End')}>
              <input type="time" className="inp" value={en} step={300} onChange={(x) => x.target.value && setEn(x.target.value)} />
            </Field>
          </div>
        )}
        {endMs <= startMs && <div className="sm:col-span-2 text-[12px] text-blood">{L('Конец должен быть позже начала', 'End must be after start')}</div>}

        {!fromIcs && (
          <div className="sm:col-span-2 rounded-2xl bg-panel-2 p-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="label">{L('Повтор', 'Repeat')}</span>
              <Seg
                options={[
                  { v: 'none' as const, label: L('Без повтора', 'None') },
                  { v: 'weekly' as const, label: L('По неделям', 'Weekly') },
                ]}
                value={rep.mode}
                onChange={(mode) => setRep({ ...rep, mode, days: rep.days.length ? rep.days : [(new Date(startMs).getDay() + 6) % 7] })}
              />
            </div>
            {rep.mode === 'weekly' && (
              <>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label={L('Дни недели', 'Weekdays')}>
                  {wd.map((n, i) => {
                    const on = rep.days.includes(i);
                    return (
                      <button
                        key={i}
                        className={`w-10 h-10 rounded-full text-[13px] font-semibold ${on ? '' : 'bg-panel text-muted'}`}
                        style={on ? { background: 'var(--accent-grad)', color: 'var(--on-accent)' } : undefined}
                        aria-pressed={on}
                        onClick={() => setRep({ ...rep, days: on ? rep.days.filter((x) => x !== i) : [...rep.days, i] })}
                      >
                        {n}
                      </button>
                    );
                  })}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[13.5px]">
                  <span className="text-muted">{L('Каждые', 'Every')}</span>
                  <select className="inp !w-auto !py-1.5" value={rep.interval} onChange={(x) => setRep({ ...rep, interval: Number(x.target.value) })}>
                    {[1, 2, 3, 4].map((n) => (
                      <option key={n} value={n}>
                        {n === 1 ? L('1 неделю', '1 week') : L(`${n} недели`, `${n} weeks`)}
                      </option>
                    ))}
                  </select>
                </div>
                <Field label={L('Неделя', 'Week')}>
                  <Seg
                    options={[
                      { v: 'all' as const, label: L('Каждая', 'Every') },
                      { v: 'odd' as const, label: L('Числитель (нечётная)', 'Odd (numerator)') },
                      { v: 'even' as const, label: L('Знаменатель (чётная)', 'Even (denominator)') },
                    ]}
                    value={rep.parity || 'all'}
                    onChange={(v) => setRep({ ...rep, parity: v === 'all' ? undefined : v })}
                  />
                </Field>
                <Field label={L('До', 'Until')} hint={rep.semester && !sem.end ? L('Конец семестра не задан — укажи его в «Семестре» (иконка шапочки над календарём).', 'Semester end is not set — set it in “Semester”.') : rep.parity ? L(`Сейчас ${sem.parityBase === 'semester' && sem.start ? 'отсчёт от начала семестра' : 'ISO-неделя'}: эта неделя — ${isOddWeekNo(startMs) ? L('числитель', 'odd') : L('знаменатель', 'even')}.`, '') : undefined}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Seg
                      options={[
                        { v: 'forever' as const, label: L('Без конца', 'Forever') },
                        { v: 'date' as const, label: L('До даты', 'Until date') },
                        { v: 'semester' as const, label: L('Весь семестр', 'Whole semester') },
                      ]}
                      value={rep.semester ? 'semester' : rep.until ? 'date' : 'forever'}
                      onChange={(v) => setRep({ ...rep, semester: v === 'semester', until: v === 'date' ? rep.until || sem.end || dayKey(startMs + 90 * 864e5) : undefined })}
                    />
                    {!rep.semester && rep.until && <input type="date" className="inp !w-auto" value={rep.until} onChange={(x) => setRep({ ...rep, until: x.target.value || undefined })} />}
                  </div>
                </Field>
              </>
            )}
          </div>
        )}
        {fromIcs && e.rrule && <div className="sm:col-span-2 text-[12px] text-dim">{L('Повтор задан в ICS. Отдельные занятия можно перенести или пропустить.', 'The repeat comes from ICS. Single events can be moved or skipped.')}</div>}

        <Field label={L('Аудитория', 'Room')}>
          <div className="flex gap-2">
            <input className="inp" value={e.location} onChange={(x) => set({ location: x.target.value })} placeholder="C1.3.237" />
            {(e.location || e.pinId) && <IBtn icon="pin" title={L('Найти на карте', 'Find on map')} onClick={() => findOnMap(e.location, e.pinId)} />}
          </div>
        </Field>
        <Field label={L('Преподаватель', 'Teacher')}>
          <input className="inp" value={e.teacher || ''} onChange={(x) => set({ teacher: x.target.value })} />
        </Field>
        {pins.length > 0 && (
          <Field label={L('Пин на моей карте', 'Pin on my map')}>
            <select className="inp" value={e.pinId || ''} onChange={(x) => set({ pinId: x.target.value || undefined })}>
              <option value="">—</option>
              {pins.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label={L('Цвет', 'Color')} className="sm:col-span-2">
          <div className="flex items-center gap-3 flex-wrap">
            <ColorPick value={e.color || '#0a84ff'} onChange={(color) => set({ color })} />
            {e.color && (
              <button className="chip" onClick={() => set({ color: undefined })}>
                {L('Цвет предмета', 'Subject color')}
              </button>
            )}
          </div>
        </Field>
        <Field label={L('Заметки', 'Notes')} className="sm:col-span-2">
          <textarea className="inp" rows={2} value={e.notes} onChange={(x) => set({ notes: x.target.value })} />
        </Field>
      </div>
      {e.description && (
        <div className="mt-3">
          <button className="chip" onClick={() => setShowDesc(!showDesc)}>
            <Icon name={showDesc ? 'up' : 'down'} size={12} /> {L('Описание из ICS', 'ICS description')}
          </button>
          {showDesc && <pre className="mt-2 text-[12.5px] whitespace-pre-wrap font-sans text-muted max-h-72 overflow-y-auto p-3 rounded-xl bg-panel-2">{e.description}</pre>}
        </div>
      )}
    </Modal>
  );
}
