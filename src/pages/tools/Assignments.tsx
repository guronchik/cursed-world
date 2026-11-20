// Assignments: отдельный список заданий (не Curses). «Сделать Curse» — по желанию, с синхронизацией.
// Inbox найденных в ICS дедлайнов: выбрать пачкой, что добавить, отклонённые больше не предлагаются.
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../../components/Icon';
import { Monster } from '../../components/Monster';
import { SubjectPicker } from '../../components/SubjectPicker';
import { Btn, Empty, Field, FilePick, IBtn, Modal, Panel, Seg, Stat, Toggle } from '../../components/ui';
import { db, type Assignment, type AssignStatus, type Attachment, type CalEvent } from '../../db/schema';
import { endOfDayTs, fmt, fromLocalInput, shortLeft, toLocalInput } from '../../lib/dates';
import { confirmBox, toast } from '../../lib/fx';
import { curseGrade, IMPORTANCE } from '../../lib/grade';
import { useLive, useNow } from '../../lib/hooks';
import { ASTATUS, ASTATUS_COLOR, assignmentFromEvent, deleteAssignment, dismissDeadlines, dismissedSet, newAssignment, pendingDeadlines, saveAssignment, setAssignmentCurse, setAssignmentStatus } from '../../lib/linked';
import { hostOf } from '../../lib/links';
import { blobUrl, compressImage, delBlob, fileSize, putBlob } from '../../lib/media';
import { setQuery, useRoute } from '../../lib/router';
import { L, uid } from '../../lib/runtime';

type F = 'active' | 'all' | AssignStatus;

export function Assignments() {
  const now = useNow(60_000);
  const { query } = useRoute();
  const [f, setF] = useState<F>('active');
  const [subj, setSubj] = useState('');
  const [inbox, setInbox] = useState(false);
  const all = useLive(() => db.assignments.toArray(), []) || [];
  const subjects = useLive(() => db.subjects.toArray(), []) || [];
  const pending = useLive(async () => pendingDeadlines(await db.calEvents.where('kind').equals('deadline').toArray(), await dismissedSet()), []) || [];
  const openId = query.get('a');
  const S = ASTATUS();
  const list = all
    .filter((a) => (f === 'all' ? true : f === 'active' ? a.status !== 'done' : a.status === f) && (!subj || a.subjectId === subj))
    .sort((a, b) => ((a.status === 'done') === (b.status === 'done') ? (a.due ?? Infinity) - (b.due ?? Infinity) : a.status === 'done' ? 1 : -1));
  const count = (k: AssignStatus) => all.filter((a) => a.status === k).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Panel bodyClass="p-3">
          <Stat label={L('Всего', 'Total')} value={all.length} />
        </Panel>
        {(['todo', 'doing', 'done'] as AssignStatus[]).map((k) => (
          <Panel key={k} bodyClass="p-3">
            <Stat label={S[k]} value={count(k)} color={ASTATUS_COLOR[k]} />
          </Panel>
        ))}
      </div>

      {pending.length > 0 && (
        <button className="w-full panel !rounded-2xl px-4 py-3 flex items-center gap-3 text-left" onClick={() => setInbox(true)}>
          <span className="app-icon w-9 h-9 !rounded-[10px]">
            <Icon name="inbox" size={17} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[14.5px] font-semibold">{L(`Inbox найденных дедлайнов: ${pending.length}`, `Found deadlines inbox: ${pending.length}`)}</span>
            <span className="block text-[12.5px] text-muted truncate">{L('Из календаря AITU. Сами ничего не создают — выбери, что добавить в Assignments.', 'From the AITU calendar. Nothing is created automatically — choose what to add.')}</span>
          </span>
          <Icon name="right" size={16} className="text-dim" />
        </button>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        {(['active', 'todo', 'doing', 'done', 'all'] as F[]).map((k) => (
          <button key={k} className={`chip ${f === k ? 'chip-on' : ''}`} onClick={() => setF(k)}>
            {k === 'all' ? L('Все', 'All') : k === 'active' ? L('Активные', 'Active') : S[k]}
          </button>
        ))}
        <select className="inp !w-auto !py-1.5" value={subj} onChange={(e) => setSubj(e.target.value)}>
          <option value="">{L('Все предметы', 'All subjects')}</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <Btn className="ml-auto" icon="plus" onClick={() => setQuery('a', 'new')}>
          {L('Задание', 'Assignment')}
        </Btn>
      </div>

      <Panel bodyClass="p-2 sm:p-3">
        <AnimatePresence initial={false}>
          {list.map((a) => {
            const s = subjects.find((x) => x.id === a.subjectId);
            const g = a.due ? curseGrade(a.due, a.importance, now) : null;
            const done = a.status === 'done';
            return (
              <motion.div key={a.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, x: 30 }} className={`flex flex-wrap sm:flex-nowrap items-center gap-3 p-2 border-b border-line/40 last:border-0 cv-auto ${done ? 'opacity-60' : ''}`}>
                <button className="flex items-center gap-3 min-w-0 flex-1 text-left min-h-[44px]" onClick={() => setQuery('a', a.id)}>
                  <span className="w-10 h-10 grid place-items-center shrink-0 rounded-xl" style={{ background: `color-mix(in srgb, ${s?.color || '#8e8e93'} 16%, transparent)`, color: s?.color || 'var(--muted)' }}>
                    <Icon name={done ? 'check' : 'grad'} size={18} />
                  </span>
                  <span className="min-w-0">
                    <span className={`block text-[14.5px] truncate ${done ? 'line-through' : ''}`}>{a.title || L('Без названия', 'Untitled')}</span>
                    <span className="flex flex-wrap items-center gap-2 text-[11.5px] text-dim mt-0.5">
                      {s && (
                        <span className="tag" style={{ color: s.color, background: `color-mix(in srgb, ${s.color} 12%, transparent)` }}>
                          {s.name}
                        </span>
                      )}
                      {a.due ? <span className="mono">{fmt(a.due, 'd MMM HH:mm')}</span> : <span>{L('без дедлайна', 'no deadline')}</span>}
                      {!done && a.due && (
                        <span className="mono" style={{ color: g?.overdue ? '#ff453a' : undefined }}>
                          {shortLeft(a.due - now)}
                        </span>
                      )}
                      {a.curseId && (
                        <span className="tag" style={{ background: 'color-mix(in srgb, var(--accent-1) 16%, transparent)', color: 'var(--accent-text)' }}>
                          Curse
                        </span>
                      )}
                      {a.source && <span className="tag">{a.source.name}</span>}
                      {a.attachments.length > 0 && (
                        <span className="inline-flex items-center gap-0.5">
                          <Icon name="file" size={11} />
                          {a.attachments.length}
                        </span>
                      )}
                      {a.links.length > 0 && (
                        <span className="inline-flex items-center gap-0.5">
                          <Icon name="link" size={11} />
                          {a.links.length}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
                <div className="flex items-center gap-2 ml-auto">
                  {a.grade && <span className="tag !text-[12px] mono" style={{ color: '#30d158', background: '#30d15822' }}>{a.grade}</span>}
                  <select className="inp !w-auto !py-1 !text-xs" aria-label={L('Статус', 'Status')} value={a.status} style={{ color: ASTATUS_COLOR[a.status] }} onChange={(e) => setAssignmentStatus(a.id, e.target.value as AssignStatus, e.currentTarget)}>
                    <option value="todo">{S.todo}</option>
                    <option value="doing">{S.doing}</option>
                    <option value="done">{S.done}</option>
                  </select>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        {!list.length && <Empty text={L('Заданий нет', 'No assignments')} icon="grad" action={<Btn size="sm" icon="plus" onClick={() => setQuery('a', 'new')}>{L('Добавить', 'Add')}</Btn>} />}
      </Panel>
      <div className="text-[11.5px] text-dim">{L('Задания не попадают в Curses сами. Включи «Сделать Curse» в задании — и оно появится в Curses с грейдом по дедлайну; срок, статус и выполнение синхронизируются, XP начисляется один раз.', 'Assignments do not go to Curses by themselves. Turn on “Make Curse” in an assignment to add it to Curses; deadline, status and completion stay in sync and XP is awarded once.')}</div>

      {openId && <AssignmentSheet key={openId} id={openId} onClose={() => setQuery('a')} defaultSubject={subj || undefined} />}
      <DeadlineInbox open={inbox} onClose={() => setInbox(false)} />
    </div>
  );
}

/** Редактор задания (bottom sheet на телефоне). id = 'new' — новое. */
export function AssignmentSheet({ id, onClose, defaultSubject, preset }: { id: string; onClose: () => void; defaultSubject?: string; preset?: Partial<Assignment> }) {
  const live = useLive(() => (id === 'new' ? undefined : db.assignments.get(id)), [id]);
  const [a, setA] = useState<Assignment | null>(() => (id === 'new' ? newAssignment({ subjectId: defaultSubject, due: endOfDayTs(new Date(Date.now() + 3 * 864e5)), ...preset }) : null));
  const [link, setLink] = useState('');
  const isNew = id === 'new';
  useEffect(() => {
    if (live && (!a || a.id !== live.id)) setA(live);
    // статус и Curse могут поменяться извне (изгнание в Curses)
    if (live && a && a.id === live.id && (live.status !== a.status || live.curseId !== a.curseId || live.due !== a.due)) setA((x) => (x ? { ...x, status: live.status, curseId: live.curseId, due: live.due, completedAt: live.completedAt } : x));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);
  const persist = useMemo(() => {
    let t = 0;
    return (v: Assignment) => {
      window.clearTimeout(t);
      t = window.setTimeout(() => void saveAssignment(v), 400);
    };
  }, []);
  if (!a) return null;
  const set = (p: Partial<Assignment>) => {
    const next = { ...a, ...p };
    setA(next);
    if (!isNew) persist(next);
  };
  const addFiles = async (files: File[]) => {
    const atts: Attachment[] = [];
    for (const f of files) {
      const blob = f.type.startsWith('image/') ? await compressImage(f) : f;
      atts.push({ id: uid(), blobId: await putBlob(blob, f.name), name: f.name, type: blob.type, size: blob.size });
    }
    set({ attachments: [...a.attachments, ...atts] });
  };
  const create = async () => {
    if (!a.title.trim()) return;
    await saveAssignment({ ...a, title: a.title.trim() });
    toast(L('Задание добавлено', 'Assignment added'));
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      wide
      kanji="課"
      title={isNew ? L('Новое задание', 'New assignment') : L('Задание', 'Assignment')}
      footer={
        isNew ? (
          <Btn icon="check" disabled={!a.title.trim()} onClick={create}>
            {L('Добавить', 'Add')}
          </Btn>
        ) : (
          <>
            <Btn
              size="sm"
              variant="danger"
              icon="trash"
              className="mr-auto"
              onClick={async () => {
                if (!(await confirmBox(a.curseId ? L('Удалить задание? Связанный Curse тоже удалится.', 'Delete the assignment? The linked Curse is deleted too.') : L('Удалить задание?', 'Delete the assignment?'), { danger: true }))) return;
                await deleteAssignment(a.id);
                onClose();
              }}
            >
              {L('Удалить', 'Delete')}
            </Btn>
            <Btn size="sm" icon="check" onClick={onClose}>
              {L('Готово', 'Done')}
            </Btn>
          </>
        )
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={L('Название', 'Title')} className="sm:col-span-2">
          <input className="inp" autoFocus={isNew} value={a.title} onChange={(e) => set({ title: e.target.value })} placeholder={L('Лабораторная №4', 'Lab #4')} />
        </Field>
        <Field label={L('Предмет', 'Subject')}>
          <SubjectPicker value={a.subjectId} onChange={(subjectId) => set({ subjectId })} />
        </Field>
        <Field label={L('Дедлайн', 'Deadline')}>
          <div className="flex gap-2">
            <input type="datetime-local" className="inp" value={a.due ? toLocalInput(a.due) : ''} onChange={(e) => set({ due: e.target.value ? fromLocalInput(e.target.value) : undefined })} />
            {a.due && !a.curseId && <IBtn icon="x" title={L('Без дедлайна', 'No deadline')} onClick={() => set({ due: undefined })} />}
          </div>
        </Field>
        <Field label={L('Статус', 'Status')} className="sm:col-span-2">
          <Seg
            options={(['todo', 'doing', 'done'] as AssignStatus[]).map((v) => ({ v, label: ASTATUS()[v] }))}
            value={a.status}
            onChange={async (status) => {
              if (isNew) set({ status, completedAt: status === 'done' ? Date.now() : undefined });
              else {
                await saveAssignment(a);
                await setAssignmentStatus(a.id, status);
              }
            }}
          />
        </Field>
        <Field label={L('Оценка', 'Grade')}>
          <input className="inp" value={a.grade} onChange={(e) => set({ grade: e.target.value })} placeholder="10/10" />
        </Field>
        <Field label={L('Важность (для грейда Curse)', 'Importance (Curse grade)')}>
          <select className="inp" value={a.importance} onChange={(e) => set({ importance: Number(e.target.value) })}>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n} · {IMPORTANCE()[n - 1].label}
              </option>
            ))}
          </select>
        </Field>
        <div className="sm:col-span-2 rounded-2xl bg-panel-2 px-3 py-1">
          <Toggle
            on={!!a.curseId}
            onChange={async (on) => {
              if (isNew) {
                if (!a.title.trim()) {
                  toast(L('Сначала название', 'Title first'), 'warn');
                  return;
                }
                await saveAssignment({ ...a, title: a.title.trim() });
              } else await saveAssignment(a);
              if (!on && !(await confirmBox(L('Убрать из Curses? Задание останется.', 'Remove from Curses? The assignment stays.')))) return;
              await setAssignmentCurse(a.id, on);
              const fresh = await db.assignments.get(a.id);
              if (fresh) setA(fresh);
              if (isNew) onClose();
            }}
            label={
              <span>
                {L('Сделать Curse', 'Make Curse')}
                <span className="block text-[12px] text-dim">{L('Появится в Curses, грейд — по дедлайну', 'Shows up in Curses, graded by deadline')}</span>
              </span>
            }
          />
          {a.curseId && <CursePreview curseId={a.curseId} />}
        </div>
        <Field label={L('Заметки', 'Notes')} className="sm:col-span-2">
          <textarea className="inp" rows={3} value={a.notes} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
        <Field label={L('Ссылки', 'Links')} className="sm:col-span-2">
          <div className="space-y-1.5">
            {a.links.map((u, i) => (
              <div key={i} className="flex items-center gap-2 text-[13.5px]">
                <Icon name="link" size={14} className="text-dim shrink-0" />
                <a href={u} target="_blank" rel="noopener noreferrer" className="text-acc truncate flex-1">
                  {hostOf(u)} <span className="text-dim">{u.replace(/^https?:\/\/[^/]+/, '').slice(0, 60)}</span>
                </a>
                <IBtn icon="x" size={14} title={L('Убрать', 'Remove')} onClick={() => set({ links: a.links.filter((_, j) => j !== i) })} />
              </div>
            ))}
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const u = link.trim();
                if (!u) return;
                set({ links: [...a.links, /^https?:\/\//i.test(u) ? u : `https://${u}`] });
                setLink('');
              }}
            >
              <input className="inp" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://moodle…" inputMode="url" />
              <button type="submit" className="ibtn" title={L('Добавить ссылку', 'Add link')} aria-label={L('Добавить ссылку', 'Add link')}>
                <Icon name="plus" size={18} />
              </button>
            </form>
          </div>
        </Field>
        <Field label={L('Файлы', 'Files')} className="sm:col-span-2">
          <div className="space-y-1.5">
            {a.attachments.map((f) => (
              <div key={f.id} className="flex items-center gap-2 text-[13.5px]">
                <Icon name={f.type.startsWith('image/') ? 'image' : 'file'} size={14} className="text-dim shrink-0" />
                <button
                  className="truncate flex-1 text-left"
                  onClick={async () => {
                    const u = await blobUrl(f.blobId);
                    if (u) window.open(u, '_blank');
                  }}
                >
                  {f.name} <span className="text-dim text-[12px]">{fileSize(f.size)}</span>
                </button>
                <IBtn
                  icon="trash"
                  size={14}
                  title={L('Удалить файл', 'Delete file')}
                  onClick={async () => {
                    await delBlob(f.blobId);
                    set({ attachments: a.attachments.filter((x) => x.id !== f.id) });
                  }}
                />
              </div>
            ))}
            <FilePick multiple onFiles={addFiles} className="chip">
              <Icon name="upload" size={13} /> {L('Прикрепить', 'Attach')}
            </FilePick>
          </div>
        </Field>
        {a.source && (
          <div className="sm:col-span-2 text-[12px] text-dim flex items-center gap-1.5">
            <Icon name="calendar" size={12} /> {L('Добавлено из', 'Added from')} {a.source.name}. {L('Пока ты не менял название и срок, они обновляются при реимпорте ICS.', 'Title and deadline follow ICS re-imports until you change them.')}
          </div>
        )}
      </div>
    </Modal>
  );
}

function CursePreview({ curseId }: { curseId: string }) {
  const c = useLive(() => db.curses.get(curseId), [curseId]);
  if (!c) return null;
  const g = curseGrade(c.due, c.importance);
  return (
    <button className="flex items-center gap-2 pb-2 text-left" onClick={() => setQuery('curse', c.id)}>
      <Monster grade={g.grade} overdue={g.overdue} size={30} />
      <span className="text-[12.5px] text-muted">{c.status === 'exorcised' ? L('Curse изгнан', 'Curse exorcised') : L('Открыть Curse', 'Open Curse')}</span>
    </button>
  );
}

/** Inbox найденных в ICS дедлайнов: чекбоксы, пачкой в Assignments (и в Curses), отклонить. */
export function DeadlineInbox({ open, onClose }: { open: boolean; onClose: () => void }) {
  const data = useLive(async () => {
    const [events, dismissed, subjects] = await Promise.all([db.calEvents.where('kind').equals('deadline').toArray(), dismissedSet(), db.subjects.toArray()]);
    return { list: pendingDeadlines(events, dismissed), subjects };
  }, []);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [withCurse, setWithCurse] = useState(false);
  const [busy, setBusy] = useState(false);
  const list = data?.list || [];
  useEffect(() => {
    if (open) setSel(new Set(list.map((e) => e.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, list.length]);
  const chosen = list.filter((e) => sel.has(e.id));
  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const add = async (evs: CalEvent[]) => {
    setBusy(true);
    for (const e of evs) await assignmentFromEvent(e, withCurse);
    setBusy(false);
    toast(L(`Добавлено в Assignments: ${evs.length}`, `Added to Assignments: ${evs.length}`));
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      kanji="箱"
      title={L('Inbox найденных дедлайнов', 'Found deadlines')}
      footer={
        list.length ? (
          <>
            <Btn
              size="sm"
              variant="ghost"
              className="mr-auto"
              disabled={!chosen.length || busy}
              onClick={async () => {
                await dismissDeadlines(chosen);
                toast(L(`Отклонено: ${chosen.length}. При реимпорте не вернутся.`, `Dismissed: ${chosen.length}. They won't come back on re-import.`));
              }}
            >
              {L('Отклонить', 'Dismiss')} {chosen.length || ''}
            </Btn>
            <Btn size="sm" icon="plus" disabled={!chosen.length || busy} onClick={() => add(chosen)}>
              {L('В Assignments', 'To Assignments')} {chosen.length || ''}
            </Btn>
          </>
        ) : undefined
      }
    >
      {!list.length ? (
        <Empty text={L('Новых дедлайнов нет. Отклонённые и уже добавленные сюда не попадают.', 'No new deadlines. Dismissed and added ones do not appear here.')} icon="inbox" />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <button className="chip" onClick={() => setSel(sel.size === list.length ? new Set() : new Set(list.map((e) => e.id)))}>
              {sel.size === list.length ? L('Снять все', 'Select none') : L('Выбрать все', 'Select all')}
            </button>
            <Toggle on={withCurse} onChange={setWithCurse} label={<span className="text-[13.5px]">{L('И сразу сделать Curse', 'Also make Curses')}</span>} />
          </div>
          <div className="space-y-0.5">
            {list.map((e) => {
              const s = data?.subjects.find((x) => x.id === e.subjectId);
              const on = sel.has(e.id);
              return (
                <div key={e.id} className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-panel-2 min-h-[48px]">
                  <button role="checkbox" aria-checked={on} aria-label={e.title} className={`chk shrink-0 ${on ? 'chk-on' : ''}`} onClick={() => toggle(e.id)} />
                  <button className="min-w-0 flex-1 text-left" onClick={() => toggle(e.id)}>
                    <span className="block text-[14px] truncate">{e.title}</span>
                    <span className="block text-[12px] text-dim truncate">{[s?.name, fmt(e.start, e.allDay ? 'EEE d MMM' : 'EEE d MMM, HH:mm')].filter(Boolean).join(' · ')}</span>
                  </button>
                  <Btn size="xs" variant="ghost" onClick={() => add([e])}>
                    {L('Добавить', 'Add')}
                  </Btn>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Modal>
  );
}
