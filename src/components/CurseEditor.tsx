// Редактор Curse: дедлайн, категория, важность, подзадачи, заметки, вложения, ссылки, цель, задание.
import { addDays } from 'date-fns';
import { useEffect, useState } from 'react';
import { db, type Attachment, type Curse } from '../db/schema';
import { exorcise, removeCurse, revive } from '../lib/actions';
import { syncFromCurse } from '../lib/linked';
import { endOfDayTs, fmt, fromLocalInput, toLocalInput } from '../lib/dates';
import { confirmBox } from '../lib/fx';
import { curseGrade, gradeHint, gradeName, IMPORTANCE } from '../lib/grade';
import { useAutosave, useLive } from '../lib/hooks';
import { blobUrl, compressImage, delBlob, fileSize, putBlob } from '../lib/media';
import { go, setQuery, useRoute } from '../lib/router';
import { L, uid } from '../lib/runtime';
import { Icon } from './Icon';
import { Monster } from './Monster';
import { cursePreset } from './shared';
import { Btn, Field, FilePick, IBtn, Modal, Seg } from './ui';

export function blankCurse(p: Partial<Curse> = {}): Curse {
  return {
    id: uid(),
    title: '',
    due: endOfDayTs(addDays(new Date(), 1)),
    techniqueId: 't-pers',
    importance: 3,
    subtasks: [],
    notes: '',
    attachments: [],
    links: [],
    status: 'active',
    createdAt: Date.now(),
    ...p,
  };
}

export function CurseEditorHost() {
  const { query } = useRoute();
  const id = query.get('curse');
  const [draft, setDraft] = useState<Curse | null>(null);
  const [isNew, setIsNew] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!id) {
      setDraft(null);
      return;
    }
    if (id === 'new') {
      setIsNew(true);
      setDraft(blankCurse(cursePreset.current));
      cursePreset.current = {};
      return;
    }
    setIsNew(false);
    db.curses.get(id).then((c) => alive && setDraft(c || null));
    return () => {
      alive = false;
    };
  }, [id]);

  const close = () => setQuery('curse');
  if (!id || !draft) return null;
  return <CurseEditor key={draft.id} initial={draft} isNew={isNew} onClose={close} />;
}

function CurseEditor({ initial, isNew, onClose }: { initial: Curse; isNew: boolean; onClose: () => void }) {
  const [c, setC] = useState<Curse>(initial);
  const [sub, setSub] = useState('');
  const [link, setLink] = useState('');
  const techs = useLive(() => db.techniques.orderBy('order').toArray(), []) || [];
  const goals = useLive(() => db.goals.where('level').equals('month').toArray(), []) || [];
  const live = useLive(() => (isNew ? undefined : db.curses.get(initial.id)), [initial.id]);
  const tech = techs.find((t) => t.id === c.techniqueId);
  const set = (p: Partial<Curse>) => setC((x) => ({ ...x, ...p }));

  // статус может меняться извне (кнопка exorcise) — подтягиваем
  useEffect(() => {
    if (live && live.status !== c.status) setC((x) => ({ ...x, status: live.status, completedAt: live.completedAt }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live?.status]);

  useAutosave(
    c,
    async (v) => {
      if (!v.title.trim()) return;
      const next = { ...v, title: v.title.trim() };
      await db.curses.put(next);
      await syncFromCurse(next);
    },
    400,
    !isNew,
  );

  const { grade, overdue } = curseGrade(c.due, c.importance);
  const save = async () => {
    if (!c.title.trim()) return;
    const next = { ...c, title: c.title.trim() };
    await db.curses.put(next);
    await syncFromCurse(next);
    onClose();
  };

  const addFiles = async (files: File[]) => {
    const atts: Attachment[] = [];
    for (const f of files) {
      const blob = f.type.startsWith('image/') ? await compressImage(f) : f;
      const blobId = await putBlob(blob, f.name);
      atts.push({ id: uid(), blobId, name: f.name, type: blob.type, size: blob.size });
    }
    set({ attachments: [...c.attachments, ...atts] });
  };

  const presets = [
    { l: L('Сегодня', 'Today'), v: endOfDayTs(new Date()) },
    { l: L('Завтра', 'Tomorrow'), v: endOfDayTs(addDays(new Date(), 1)) },
    { l: L('+3 дня', '+3 days'), v: endOfDayTs(addDays(new Date(), 3)) },
    { l: L('+неделя', '+week'), v: endOfDayTs(addDays(new Date(), 7)) },
    { l: L('+2 недели', '+2 weeks'), v: endOfDayTs(addDays(new Date(), 14)) },
  ];

  return (
    <Modal
      open
      onClose={onClose}
      wide
      kanji="呪"
      title={isNew ? L('Новое проклятие', 'New curse') : L('Проклятие', 'Curse')}
      footer={
        <>
          {!isNew && (
            <Btn
              variant="danger"
              size="sm"
              icon="trash"
              className="mr-auto"
              onClick={async () => {
                if (await confirmBox(L('Удалить проклятие навсегда?', 'Delete this curse forever?'), { danger: true, okLabel: L('Удалить', 'Delete') })) {
                  await removeCurse(c.id);
                  onClose();
                }
              }}
            >
              {L('Удалить', 'Delete')}
            </Btn>
          )}
          {!isNew &&
            (c.status === 'active' ? (
              <Btn
                size="sm"
                variant="flash"
                icon="bolt"
                onClick={async (e) => {
                  await db.curses.put({ ...c, title: c.title.trim() || initial.title });
                  await exorcise(c.id, e.currentTarget);
                  onClose();
                }}
              >
                Exorcise
              </Btn>
            ) : (
              <Btn size="sm" variant="ghost" icon="refresh" onClick={() => revive(c.id)}>
                {L('Вернуть', 'Revive')}
              </Btn>
            ))}
          <Btn size="sm" icon="check" onClick={isNew ? save : onClose} disabled={!c.title.trim()}>
            {isNew ? L('Призвать', 'Create') : L('Готово', 'Done')}
          </Btn>
        </>
      }
    >
      <div className="flex items-center gap-4 mb-4 p-3 bg-void/60 border border-line/60">
        <Monster grade={grade} overdue={overdue} size={72} />
        <div className="min-w-0">
          <div className="h-display text-xl">{gradeName(grade)}</div>
          <div className="text-xs text-muted">
            {overdue ? L('Просрочено — красная аура', 'Overdue — red aura') : gradeHint(grade)}
            {c.status === 'exorcised' && ` · ${L('изгнано', 'exorcised')} ${c.completedAt ? fmt(c.completedAt, 'd MMM HH:mm') : ''}`}
          </div>
          {!isNew && <div className="text-[11px] text-dim mt-1">{L('Изменения сохраняются автоматически', 'Changes are saved automatically')}</div>}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={L('Название', 'Title')} className="sm:col-span-2">
          <input className="inp text-base" autoFocus={isNew} value={c.title} onChange={(e) => set({ title: e.target.value })} placeholder={L('Что нужно изгнать?', 'What must be exorcised?')} onKeyDown={(e) => e.key === 'Enter' && isNew && save()} />
        </Field>
        <Field label={L('Дедлайн', 'Deadline')}>
          <input type="datetime-local" className="inp" value={toLocalInput(c.due)} onChange={(e) => e.target.value && set({ due: fromLocalInput(e.target.value) })} />
          <div className="flex flex-wrap gap-1 mt-1.5">
            {presets.map((p) => (
              <button key={p.l} type="button" className="chip !text-[11px] !py-0.5" onClick={() => set({ due: p.v })}>
                {p.l}
              </button>
            ))}
          </div>
        </Field>
        <Field label={L('Категория / техника', 'Category / technique')}>
          <select className="inp" value={c.techniqueId} onChange={(e) => set({ techniqueId: e.target.value, stage: undefined })}>
            {techs.map((t) => (
              <option key={t.id} value={t.id}>
                {t.icon} {t.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={L('Важность', 'Importance')} className="sm:col-span-2">
          <Seg options={IMPORTANCE().map((i) => ({ v: i.v, label: i.label }))} value={c.importance} onChange={(v) => set({ importance: v })} />
        </Field>
        {tech?.stages?.length ? (
          <Field label={L('Этап', 'Stage')} className="sm:col-span-2">
            <Seg options={tech.stages.map((s, i) => ({ v: i, label: s }))} value={c.stage ?? 0} onChange={(v) => set({ stage: v })} />
          </Field>
        ) : null}
        <Field label="Maximum Technique" hint={L('Связь с месячной целью — прогресс посчитается сам', 'Link to a monthly goal — progress is automatic')}>
          <select className="inp" value={c.goalId || ''} onChange={(e) => set({ goalId: e.target.value || undefined })}>
            <option value="">— {L('без цели', 'no goal')} —</option>
            {goals
              .slice()
              .sort((a, b) => (b.month || '').localeCompare(a.month || ''))
              .map((g) => (
                <option key={g.id} value={g.id}>
                  {g.month} · {g.title}
                </option>
              ))}
          </select>
        </Field>
        {c.link && <LinkedInfo c={c} />}
      </div>

      <div className="mt-5">
        <div className="label mb-2">
          {L('Подзадачи', 'Subtasks')} {c.subtasks.length ? `· ${c.subtasks.filter((s) => s.done).length}/${c.subtasks.length}` : ''}
        </div>
        <div className="space-y-1.5">
          {c.subtasks.map((s) => (
            <div key={s.id} className="flex items-center gap-2">
              <input type="checkbox" className="chk" checked={s.done} onChange={() => set({ subtasks: c.subtasks.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)) })} />
              <input className={`inp !py-1 ${s.done ? 'line-through text-muted' : ''}`} value={s.title} onChange={(e) => set({ subtasks: c.subtasks.map((x) => (x.id === s.id ? { ...x, title: e.target.value } : x)) })} />
              <IBtn icon="x" className="ibtn-sm" onClick={() => set({ subtasks: c.subtasks.filter((x) => x.id !== s.id) })} />
            </div>
          ))}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!sub.trim()) return;
              set({ subtasks: [...c.subtasks, { id: uid(), title: sub.trim(), done: false }] });
              setSub('');
            }}
          >
            <input className="inp !py-1" value={sub} onChange={(e) => setSub(e.target.value)} placeholder={L('+ подзадача', '+ subtask')} />
            <Btn type="submit" size="sm" variant="ghost" icon="plus" />
          </form>
        </div>
      </div>

      <Field label={L('Заметки', 'Notes')} className="mt-4">
        <textarea className="inp" rows={3} value={c.notes} onChange={(e) => set({ notes: e.target.value })} />
      </Field>

      <div className="grid sm:grid-cols-2 gap-4 mt-4">
        <div>
          <div className="label mb-2">{L('Ссылки', 'Links')}</div>
          <div className="space-y-1">
            {c.links.map((l, i) => (
              <div key={i} className="flex items-center gap-1 text-sm">
                <Icon name="link" size={13} className="text-muted shrink-0" />
                <a href={l} target="_blank" rel="noopener noreferrer" className="truncate text-acc hover:underline flex-1">
                  {l}
                </a>
                <IBtn icon="x" className="ibtn-sm" onClick={() => set({ links: c.links.filter((_, j) => j !== i) })} />
              </div>
            ))}
          </div>
          <form
            className="flex gap-2 mt-1"
            onSubmit={(e) => {
              e.preventDefault();
              const v = link.trim();
              if (!v) return;
              set({ links: [...c.links, /^https?:\/\//.test(v) ? v : `https://${v}`] });
              setLink('');
            }}
          >
            <input className="inp !py-1" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" />
            <Btn type="submit" size="sm" variant="ghost" icon="plus" />
          </form>
        </div>
        <div>
          <div className="label mb-2">{L('Вложения', 'Attachments')}</div>
          <div className="space-y-1">
            {c.attachments.map((a) => (
              <div key={a.id} className="flex items-center gap-2 text-sm">
                <Icon name={a.type.startsWith('image/') ? 'image' : 'file'} size={13} className="text-muted shrink-0" />
                <button
                  type="button"
                  className="truncate text-left flex-1 hover:text-acc"
                  onClick={async () => {
                    const u = await blobUrl(a.blobId);
                    if (u) window.open(u, '_blank');
                  }}
                >
                  {a.name}
                </button>
                <span className="text-[11px] text-dim mono">{fileSize(a.size)}</span>
                <IBtn
                  icon="x"
                  className="ibtn-sm"
                  onClick={async () => {
                    await delBlob(a.blobId);
                    set({ attachments: c.attachments.filter((x) => x.id !== a.id) });
                  }}
                />
              </div>
            ))}
          </div>
          <FilePick multiple onFiles={addFiles} className="btn btn-ghost btn-sm mt-1">
            <Icon name="upload" size={13} /> {L('Файл', 'File')}
          </FilePick>
        </div>
      </div>
    </Modal>
  );
}

/** Curse включён из задания или видео: показываем источник и ведём туда. */
function LinkedInfo({ c }: { c: Curse }) {
  const target = useLive(async () => (c.link?.kind === 'assignment' ? db.assignments.get(c.link.id) : c.link ? db.videos.get(c.link.id) : undefined), [c.link?.id]);
  if (!c.link) return null;
  const isA = c.link.kind === 'assignment';
  return (
    <Field label={isA ? L('Связано с заданием', 'Linked assignment') : L('Связано с видео', 'Linked video')} className="sm:col-span-2">
      <button
        className="w-full flex items-center gap-2 rounded-xl bg-panel-2 px-3 py-2.5 text-left text-[14px]"
        onClick={() => go(isA ? `/tools/assignments?a=${c.link!.id}` : `/energy/technique?t=yt&video=${c.link!.id}`)}
      >
        <Icon name={isA ? 'grad' : 'youtube'} size={16} />
        <span className="flex-1 truncate">{target?.title || '…'}</span>
        <span className="text-[12px] text-dim">{L('дедлайн, статус и выполнение синхронизируются', 'deadline, status and completion stay in sync')}</span>
        <Icon name="right" size={14} className="text-dim" />
      </button>
    </Field>
  );
}
