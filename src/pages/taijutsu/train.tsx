// Black Flash: общие элементы — лист «Добавить упражнение» (библиотека / своё), меню и удаление планов и упражнений,
// свайп влево и долгое нажатие на телефоне, редактор плана с перетаскиванием.
import { useEffect, useMemo, useRef, useState, type ReactNode, type PointerEvent as RPointerEvent } from 'react';
import { Icon } from '../../components/Icon';
import { BlobImg, Btn, Field, FilePick, IBtn, ImagePick, Modal, Seg, Tabs, Toggle } from '../../components/ui';
import { db, type Exercise, type ExerciseKind, type Muscle, type Template, type WeightUnit } from '../../db/schema';
import { weekdayNames } from '../../lib/dates';
import { chooseBox, confirmBox, fx, toast } from '../../lib/fx';
import { useAutosave, useLive, useMedia } from '../../lib/hooks';
import { youtubeId } from '../../lib/links';
import { delBlob, putBlob } from '../../lib/media';
import { L, uid } from '../../lib/runtime';
import { play } from '../../lib/sound';
import { bestOf } from '../../lib/stats';
import {
  activeExercises,
  archiveExercise,
  archivePlan,
  buildExercise,
  createExercise,
  deleteExercise,
  deletePlan,
  detectPR,
  duplicatePlan,
  exerciseUsage,
  findDuplicate,
  guard,
  KIND_LABELS,
  kindOf,
  MUSCLE_LABELS,
  muscleLabel,
  nextPlanOrder,
  newPlan,
  newEntry,
  normName,
  parseWorkoutText,
  PLAN_COLORS,
  PLAN_ICONS,
  planDays,
  planItem,
  removeFromPlan,
  renamePlan,
  setLabel,
  setPlanDays,
  sortPlans,
  unitOf,
  type ExerciseDraft,
} from '../../lib/training';

export const MUSCLE_COLOR: Record<string, string> = { chest: '#ff453a', back: '#0a84ff', legs: '#30d158', shoulders: '#ff9f0a', arms: '#bf5af2', core: '#ffd60a', full: '#64d2ff', other: '#8e8e93' };

/** Подпись для группы кнопок. Не <label>: иначе клик по пустому месту нажимал бы первую кнопку группы. */
export function Group({ label, children, hint, className = '' }: { label: string; children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <div className={`block ${className}`} role="group" aria-label={label}>
      <span className="label block mb-1.5 ml-1">{label}</span>
      {children}
      {hint && <span className="block text-[12px] text-dim mt-1 ml-1">{hint}</span>}
    </div>
  );
}

// ───────────── Свайп влево и долгое нажатие ─────────────

/**
 * Строка списка: на телефоне свайп влево открывает «Удалить», долгое нажатие — меню.
 * Правый клик на компьютере тоже открывает меню. Вертикальная прокрутка не блокируется (touch-action: pan-y).
 */
export function SwipeRow({ children, onDelete, onMenu, deleteLabel, className = '' }: { children: ReactNode; onDelete: () => void; onMenu?: () => void; deleteLabel?: string; className?: string }) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const st = useRef<{ x: number; y: number; base: number; lock?: 'h' | 'v'; lp: number; fired: boolean } | null>(null);
  const suppress = useRef(false);
  const W = 96;
  const reset = () => setDx(0);
  const down = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') return;
    const s = { x: e.clientX, y: e.clientY, base: dx, lp: 0, fired: false };
    if (onMenu)
      s.lp = window.setTimeout(() => {
        s.fired = true;
        suppress.current = true;
        navigator.vibrate?.(12);
        reset();
        // клик после отпускания пальца попал бы в фон открытого меню и сразу закрыл его — гасим один клик
        const block = (ev: Event) => {
          ev.preventDefault();
          ev.stopPropagation();
          window.removeEventListener('click', block, true);
        };
        window.addEventListener('click', block, true);
        window.setTimeout(() => window.removeEventListener('click', block, true), 1500);
        onMenu();
      }, 520);
    st.current = s;
  };
  const move = (e: RPointerEvent<HTMLDivElement>) => {
    const s = st.current;
    if (!s) return;
    const ddx = e.clientX - s.x;
    const ddy = e.clientY - s.y;
    if (Math.abs(ddx) > 8 || Math.abs(ddy) > 8) window.clearTimeout(s.lp);
    if (!s.lock) {
      if (Math.abs(ddx) > 10 && Math.abs(ddx) > Math.abs(ddy) * 1.2) {
        s.lock = 'h';
        setDragging(true);
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      } else if (Math.abs(ddy) > 10) s.lock = 'v';
    }
    if (s.lock === 'h') setDx(Math.max(-W - 24, Math.min(0, s.base + ddx)));
  };
  const up = () => {
    const s = st.current;
    st.current = null;
    if (!s) return;
    window.clearTimeout(s.lp);
    setDragging(false);
    if (s.lock === 'h') {
      suppress.current = true;
      setDx((v) => (v < -W / 2 ? -W : 0));
    }
  };
  return (
    <div className={`relative overflow-hidden rounded-[14px] ${className}`}>
      {dx < 0 && (
        <button
          type="button"
          className="absolute inset-y-0 right-0 flex items-center justify-center gap-1 text-white text-[14px] font-semibold"
          style={{ width: Math.max(W, -dx), background: '#ff3b30' }}
          onClick={(e) => {
            e.stopPropagation();
            reset();
            onDelete();
          }}
        >
          <Icon name="trash" size={16} /> {deleteLabel || L('Удалить', 'Delete')}
        </button>
      )}
      <div
        style={{ transform: dx ? `translateX(${dx}px)` : undefined, transition: dragging ? 'none' : 'transform .22s cubic-bezier(.2,.9,.3,1)', touchAction: 'pan-y' }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onContextMenu={(e) => {
          if (!onMenu) return;
          e.preventDefault();
          onMenu();
        }}
        onClickCapture={(e) => {
          if (suppress.current) {
            suppress.current = false;
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          if (dx < 0) {
            e.preventDefault();
            e.stopPropagation();
            reset();
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ───────────── Удаление и меню ─────────────

/** Удаление упражнения из библиотеки. Если оно где-то используется — выбор: архив или удалить из планов и библиотеки. */
export async function askDeleteExercise(ex: Exercise, after?: () => void) {
  const u = await exerciseUsage(ex.id);
  if (u.plans.length || u.workouts) {
    const v = await chooseBox(
      `«${ex.name}»\n${L('Используется', 'Used in')} ${L('в', '')} ${u.plans.length} ${L(plural(u.plans.length, 'плане', 'планах', 'планах'), 'plans')} ${L('и', 'and')} ${u.workouts} ${L(plural(u.workouts, 'тренировке', 'тренировках', 'тренировках'), 'workouts')}.\n${L('История и графики сохранятся в любом случае.', 'History and charts are kept either way.')}`,
      [
        { v: 'archive', label: L('В архив (скрыть, история цела)', 'Archive (hide, keep history)') },
        { v: 'delete', label: L('Удалить из планов и библиотеки', 'Delete from plans and library'), danger: true },
      ],
    );
    if (v === 'archive') {
      await archiveExercise(ex.id, true);
      after?.();
    } else if (v === 'delete') {
      if (await deleteExercise(ex.id)) after?.();
    }
    return;
  }
  if (!(await confirmBox(`${L('Удалить из библиотеки', 'Delete from library')} «${ex.name}»?`, { danger: true, okLabel: L('Удалить', 'Delete') }))) return;
  if (await deleteExercise(ex.id)) after?.();
}

function plural(n: number, one: string, few: string, many: string) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

export async function exerciseMenu(ex: Exercise, actions: { onOpen?: () => void; onEdit?: () => void; after?: () => void }) {
  const opts = [
    ...(actions.onOpen ? [{ v: 'open', label: L('Открыть', 'Open') }] : []),
    ...(actions.onEdit ? [{ v: 'edit', label: L('Изменить / переименовать', 'Edit / rename') }] : []),
    ex.archived ? { v: 'unarchive', label: L('Вернуть из архива', 'Unarchive') } : { v: 'archive', label: L('В архив', 'Archive') },
    { v: 'delete', label: L('Удалить из библиотеки', 'Delete from library'), danger: true },
  ];
  const v = await chooseBox(ex.name, opts);
  if (v === 'open') actions.onOpen?.();
  else if (v === 'edit') actions.onEdit?.();
  else if (v === 'archive') await archiveExercise(ex.id, true);
  else if (v === 'unarchive') await archiveExercise(ex.id, false);
  else if (v === 'delete') await askDeleteExercise(ex, actions.after);
}

export async function askDeletePlan(t: Template, after?: () => void) {
  if (!(await confirmBox(`${L('Удалить план', 'Delete plan')} «${t.name || L('без названия', 'untitled')}»?\n${L('Прошлые тренировки по нему останутся в истории.', 'Past workouts stay in history.')}`, { danger: true, okLabel: L('Удалить', 'Delete') }))) return;
  if (await deletePlan(t.id)) after?.();
}

/** Меню плана «⋯»: Rename, Duplicate, Archive, Delete. */
export async function planMenu(t: Template, actions: { onEdit: () => void; onRename: () => void; after?: () => void }) {
  const v = await chooseBox(t.name || L('План', 'Plan'), [
    { v: 'edit', label: L('Открыть план', 'Open plan') },
    { v: 'rename', label: L('Переименовать', 'Rename') },
    { v: 'dup', label: L('Дублировать', 'Duplicate') },
    t.archived ? { v: 'unarchive', label: L('Вернуть из архива', 'Unarchive') } : { v: 'archive', label: L('В архив', 'Archive') },
    { v: 'delete', label: L('Удалить', 'Delete'), danger: true },
  ]);
  if (v === 'edit') actions.onEdit();
  else if (v === 'rename') actions.onRename();
  else if (v === 'dup') await duplicatePlan(t.id);
  else if (v === 'archive') await archivePlan(t.id, true);
  else if (v === 'unarchive') await archivePlan(t.id, false);
  else if (v === 'delete') await askDeletePlan(t, actions.after);
}

/** Небольшое окно переименования. */
export function RenameDialog({ title, value, onSave, onClose }: { title: string; value: string; onSave: (v: string) => void; onClose: () => void }) {
  const [v, setV] = useState(value);
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      footer={
        <>
          <Btn size="sm" variant="ghost" onClick={onClose}>
            {L('Отмена', 'Cancel')}
          </Btn>
          <Btn size="sm" icon="check" disabled={!v.trim()} onClick={() => (onSave(v.trim()), onClose())}>
            {L('Сохранить', 'Save')}
          </Btn>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!v.trim()) return;
          onSave(v.trim());
          onClose();
        }}
      >
        <input className="inp" value={v} autoFocus onChange={(e) => setV(e.target.value)} onFocus={(e) => e.currentTarget.select()} />
      </form>
    </Modal>
  );
}

// ───────────── Лист «Добавить упражнение» ─────────────

type AddTab = 'lib' | 'own';

/**
 * «+ Add exercise»: вкладки «Из библиотеки» и «Своё». Лист не закрывается после добавления —
 * можно сразу добавить следующее. В тренировке есть «только в этой тренировке».
 */
export function AddExerciseSheet({ open, onClose, context, addedIds, onAdd }: { open: boolean; onClose: () => void; context: 'plan' | 'workout'; addedIds: string[]; onAdd: (ex: Exercise, oneOff: boolean) => Promise<unknown> | unknown }) {
  const exercises = useLive(() => db.exercises.toArray(), []) || [];
  const [tab, setTab] = useState<AddTab>('lib');
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState<Muscle | 'all'>('all');
  const [last, setLast] = useState('');
  const mobile = useMedia('(max-width: 639px)');
  useEffect(() => {
    if (!open) {
      setQ('');
      setLast('');
    }
  }, [open]);
  const M = MUSCLE_LABELS();
  const list = activeExercises(exercises).filter((e) => (muscle === 'all' || e.muscle === muscle) && (!q.trim() || normName(e.name).includes(normName(q))));
  const exact = q.trim() ? findDuplicate(q, activeExercises(exercises)) : undefined;
  const added = new Set(addedIds);
  const usedMuscles = (Object.keys(M) as Muscle[]).filter((m) => exercises.some((e) => !e.archived && e.muscle === m));

  const add = async (ex: Exercise, oneOff = false) => {
    await guard(L('добавить упражнение', 'add exercise'), async () => {
      await onAdd(ex, oneOff);
      setLast(ex.name);
    });
  };

  return (
    <Modal open={open} onClose={onClose} title={L('Добавить упражнение', 'Add exercise')} kanji="技" wide>
      <Tabs
        className="mb-3"
        tabs={[
          { id: 'lib' as AddTab, label: L('Из библиотеки', 'From library') },
          { id: 'own' as AddTab, label: L('Своё', 'Custom') },
        ]}
        value={tab}
        onChange={setTab}
      />
      {last && (
        <div className="mb-3 text-[13px] flex items-center gap-1.5" style={{ color: '#30d158' }} role="status">
          <Icon name="check" size={14} /> {L('Добавлено', 'Added')}: <b className="truncate">{last}</b>
        </div>
      )}
      {tab === 'lib' ? (
        <div>
          <div className="relative mb-2">
            <Icon name="search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-dim" />
            <input
              className="inp !pl-9"
              value={q}
              autoFocus={!mobile}
              onChange={(e) => setQ(e.target.value)}
              placeholder={L('Поиск упражнения', 'Search exercises')}
              enterKeyHint="go"
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                if (exact) void add(exact);
                else if (q.trim()) void createFromQuery();
              }}
            />
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1">
            <button type="button" className={`chip shrink-0 ${muscle === 'all' ? 'chip-on' : ''}`} onClick={() => setMuscle('all')}>
              {L('Все', 'All')}
            </button>
            {usedMuscles.map((m) => (
              <button key={m} type="button" className={`chip shrink-0 ${muscle === m ? 'chip-on' : ''}`} onClick={() => setMuscle(m)}>
                {M[m]}
              </button>
            ))}
          </div>
          <div className="space-y-1" data-testid="lib-list">
            {list.map((e) => (
              <button key={e.id} type="button" className="w-full flex items-center gap-3 rounded-xl px-3 min-h-[48px] text-left hover:bg-panel-2" onClick={() => add(e)}>
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: MUSCLE_COLOR[e.muscle] || '#8e8e93' }} />
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] truncate">{e.name}</span>
                  <span className="block text-[11.5px] text-dim truncate">
                    {muscleLabel(e)}
                    {e.equipment ? ` · ${e.equipment}` : ''}
                    {kindOf(e) !== 'weight' ? ` · ${KIND_LABELS()[kindOf(e)]}` : ''}
                  </span>
                </span>
                {e.isCustom && <span className="tag !text-[10px]">Custom</span>}
                {added.has(e.id) ? <Icon name="check" size={16} className="text-jade" /> : <Icon name="plus" size={16} className="text-dim" />}
              </button>
            ))}
            {!list.length && !q.trim() && <p className="text-sm text-muted px-3 py-4">{L('В библиотеке пусто — создай своё упражнение.', 'Library is empty — create your own exercise.')}</p>}
            {q.trim() && !exact && (
              <button type="button" className="w-full flex items-center gap-3 rounded-xl px-3 min-h-[48px] text-left text-acc hover:bg-panel-2 border border-dashed border-line" onClick={() => void createFromQuery()} data-testid="create-from-search">
                <Icon name="plus" size={16} />
                <span className="truncate">
                  {L('Создать', 'Create')} «{q.trim()}»
                </span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <OwnExerciseForm context={context} exercises={exercises} onAdd={add} />
      )}
    </Modal>
  );

  async function createFromQuery() {
    const name = q.trim();
    if (!name) return;
    const ex = await guard(L('создать упражнение', 'create exercise'), () => createExercise({ name, muscle: muscle === 'all' ? undefined : muscle }));
    if (!ex) return;
    await add(ex);
    setQ('');
  }
}

const emptyDraft = (): ExerciseDraft => ({ name: '', kind: 'weight', unit: 'kg' });

function OwnExerciseForm({ context, exercises, onAdd }: { context: 'plan' | 'workout'; exercises: Exercise[]; onAdd: (ex: Exercise, oneOff: boolean) => Promise<void> }) {
  const [d, setD] = useState<ExerciseDraft>(emptyDraft);
  const [more, setMore] = useState(false);
  const [oneOff, setOneOff] = useState(false);
  const [dup, setDup] = useState<Exercise | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const M = MUSCLE_LABELS();
  const set = (p: Partial<ExerciseDraft>) => setD((x) => ({ ...x, ...p }));
  const yt = youtubeId(d.videoUrl);

  const reset = () => {
    setD(emptyDraft());
    setDup(null);
    window.setTimeout(() => nameRef.current?.focus(), 30);
  };
  const create = async (force = false) => {
    const name = d.name.trim();
    if (!name) {
      nameRef.current?.focus();
      return;
    }
    if (!force && !oneOff) {
      const ex = findDuplicate(name, exercises);
      if (ex) {
        setDup(ex);
        return;
      }
    }
    if (oneOff) {
      await onAdd(buildExercise(d), true);
      reset();
      return;
    }
    const ex = await guard(L('создать упражнение', 'create exercise'), () => createExercise(d));
    if (!ex) return;
    await onAdd(ex, false);
    reset();
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void create();
      }}
      className="space-y-3"
    >
      <Field label={L('Название', 'Name')}>
        <input
          ref={nameRef}
          className="inp text-[16px]"
          value={d.name}
          autoFocus
          enterKeyHint="done"
          onChange={(e) => {
            set({ name: e.target.value });
            setDup(null);
          }}
          placeholder={L('Например: Тяга Т-грифа', 'e.g. T-bar row')}
          data-testid="own-name"
        />
      </Field>
      {dup && (
        <div className="rounded-xl border px-3 py-2.5 text-[13.5px]" style={{ borderColor: '#ff9f0a88', background: '#ff9f0a14' }} role="alert">
          <div className="mb-2">
            {L('Такое уже есть', 'Already exists')}: <b>{dup.name}</b>
            {dup.archived ? ` (${L('в архиве', 'archived')})` : ''}
          </div>
          <div className="flex flex-wrap gap-2">
            <Btn
              size="sm"
              onClick={async () => {
                if (dup.archived) await archiveExercise(dup.id, false);
                await onAdd(dup, false);
                reset();
              }}
            >
              {L('Использовать существующее', 'Use existing')}
            </Btn>
            <Btn size="sm" variant="ghost" onClick={() => void create(true)}>
              {L('Создать всё равно', 'Create anyway')}
            </Btn>
          </div>
        </div>
      )}
      {context === 'workout' && <Toggle on={oneOff} onChange={setOneOff} label={<span className="text-[14px]">{L('Только в этой тренировке (не сохранять в библиотеку)', 'Only in this workout (don’t save to library)')}</span>} />}
      <button type="button" className="text-[13px] text-acc flex items-center gap-1 min-h-[44px]" onClick={() => setMore(!more)} aria-expanded={more}>
        <Icon name={more ? 'up' : 'down'} size={13} /> {L('Дополнительно (можно заполнить позже)', 'More (optional, fill in later)')}
      </button>
      {more && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={L('Группа мышц', 'Muscle group')}>
              <select className="inp" value={d.muscle || 'other'} onChange={(e) => set({ muscle: e.target.value as Muscle })}>
                {(Object.keys(M) as Muscle[]).map((m) => (
                  <option key={m} value={m}>
                    {m === 'other' ? L('Своя / другое', 'Custom / other') : M[m]}
                  </option>
                ))}
              </select>
            </Field>
            {(d.muscle || 'other') === 'other' && (
              <Field label={L('Своя группа', 'Custom group')}>
                <input className="inp" value={d.muscleCustom || ''} onChange={(e) => set({ muscleCustom: e.target.value })} placeholder={L('Например: Предплечья', 'e.g. Forearms')} />
              </Field>
            )}
            <Field label={L('Оборудование', 'Equipment')}>
              <input className="inp" value={d.equipment || ''} onChange={(e) => set({ equipment: e.target.value })} placeholder={L('Штанга, гантели, тренажёр…', 'Barbell, dumbbells, machine…')} />
            </Field>
          </div>
          <Group label={L('Тип', 'Type')}>
            <div className="overflow-x-auto">
              <Seg options={(Object.keys(KIND_LABELS()) as ExerciseKind[]).map((k) => ({ v: k, label: KIND_LABELS()[k] }))} value={d.kind || 'weight'} onChange={(v) => set({ kind: v })} />
            </div>
          </Group>
          {(d.kind === 'weight' || d.kind === 'bodyweight' || !d.kind) && (
            <Group label={L('Единицы', 'Units')}>
              <Seg options={[{ v: 'kg' as WeightUnit, label: 'kg' }, { v: 'lb' as WeightUnit, label: 'lb' }]} value={d.unit || 'kg'} onChange={(v) => set({ unit: v })} />
            </Group>
          )}
          <div className="grid grid-cols-3 gap-2">
            <Field label={L('Подходы', 'Sets')}>
              <input className="inp mono" inputMode="numeric" value={d.defSets ?? ''} onChange={(e) => set({ defSets: Number(e.target.value) || undefined })} placeholder="3" />
            </Field>
            <Field label={d.kind === 'time' ? L('Секунды', 'Seconds') : L('Повторы', 'Reps')}>
              <input className="inp mono" inputMode="numeric" value={d.defReps ?? ''} onChange={(e) => set({ defReps: Number(e.target.value) || undefined })} placeholder={d.kind === 'time' ? '60' : '10'} />
            </Field>
            <Field label={L('Отдых, сек', 'Rest, s')}>
              <input className="inp mono" inputMode="numeric" value={d.defRest ?? ''} onChange={(e) => set({ defRest: Number(e.target.value) || undefined })} placeholder="90" />
            </Field>
          </div>
          <Field label={L('Заметки о технике', 'Technique notes')}>
            <textarea className="inp" rows={3} value={d.notes || ''} onChange={(e) => set({ notes: e.target.value })} />
          </Field>
          <Field label={L('Видео (ссылка YouTube)', 'Video (YouTube link)')}>
            <input className="inp" value={d.videoUrl || ''} onChange={(e) => set({ videoUrl: e.target.value })} placeholder="https://youtu.be/…" inputMode="url" />
          </Field>
          {yt && (
            <div className="aspect-video bg-void border border-line/60 rounded-xl overflow-hidden">
              <iframe className="w-full h-full" src={`https://www.youtube-nocookie.com/embed/${yt}`} title="YouTube" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
            </div>
          )}
          {!oneOff && (
            <div className="flex flex-wrap gap-2 items-center">
              <ImagePick capture className="btn btn-ghost btn-sm" onPicked={async (id) => (await delBlob(d.photoId), set({ photoId: id }))}>
                <Icon name="camera" size={13} /> {d.photoId ? L('Заменить фото', 'Replace photo') : L('Фото', 'Photo')}
              </ImagePick>
              <FilePick accept="video/*" className="btn btn-ghost btn-sm" onFiles={async ([f]) => (await delBlob(d.videoBlobId), set({ videoBlobId: await putBlob(f, f.name) }))}>
                <Icon name="video" size={13} /> {d.videoBlobId ? L('Видео загружено', 'Video uploaded') : L('Загрузить видео', 'Upload video')}
              </FilePick>
              {d.photoId && <BlobImg id={d.photoId} className="h-11 w-11 rounded-lg object-cover" />}
            </div>
          )}
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <Btn type="submit" icon="plus" className="flex-1" disabled={!d.name.trim()}>
          {context === 'plan' ? L('Создать и добавить в план', 'Create & add to plan') : oneOff ? L('Добавить в тренировку', 'Add to workout') : L('Создать и добавить', 'Create & add')}
        </Btn>
      </div>
      <p className="text-[11.5px] text-dim">{oneOff ? L('Разовое упражнение останется только в этой тренировке и в истории.', 'A one-off exercise stays only in this workout and its history.') : L('Своё упражнение попадёт в библиотеку с пометкой Custom. Enter — добавить и продолжить.', 'Saved to the library as Custom. Enter adds and keeps the sheet open.')}</p>
    </form>
  );
}

// ───────────── Список планов ─────────────

export function PlanList({ onStart, compact }: { onStart?: (t: Template) => void; compact?: boolean }) {
  const templates = useLive(() => db.templates.toArray(), []) || [];
  const exercises = useLive(() => db.exercises.toArray(), []) || [];
  const [edit, setEdit] = useState<string | null>(null);
  const [rename, setRename] = useState<Template | null>(null);
  const [showArch, setShowArch] = useState(false);
  const plans = sortPlans(templates);
  const active = plans.filter((t) => !t.archived);
  const archived = plans.filter((t) => t.archived);
  const exName = (id: string) => exercises.find((e) => e.id === id)?.name || '—';
  const menu = (t: Template) => planMenu(t, { onEdit: () => setEdit(t.id), onRename: () => setRename(t) });

  const create = async () => {
    const p = { ...newPlan(''), order: await nextPlanOrder() };
    const ok = await guard(L('создать план', 'create plan'), async () => void (await db.templates.put(p)));
    if (ok !== undefined || (await db.templates.get(p.id))) setEdit(p.id);
  };

  const row = (t: Template) => (
    <SwipeRow key={t.id} onDelete={() => void askDeletePlan(t)} onMenu={() => void menu(t)}>
      <div className="flex items-stretch gap-1.5" data-plan={t.name}>
        <button
          type="button"
          className={`flex-1 min-w-0 min-h-[48px] rounded-[14px] px-4 py-2 text-left flex items-center gap-3 ${onStart && !t.archived ? '' : 'bg-panel-2'}`}
          style={onStart && !t.archived ? { background: `linear-gradient(100deg, ${t.color || '#ff9f0a'}, color-mix(in srgb, ${t.color || '#ff9f0a'} 55%, #ff2744))`, color: '#fff' } : undefined}
          onClick={() => (onStart && !t.archived ? onStart(t) : setEdit(t.id))}
        >
          <Icon name={t.icon || 'dumbbell'} size={16} />
          <span className="flex-1 min-w-0">
            <span className="block font-semibold truncate">{t.name || L('Без названия', 'Untitled')}</span>
            {!compact && <span className="block text-[11.5px] opacity-75 truncate">{t.items.map((i) => `${exName(i.exerciseId)} ${i.sets}×${i.reps}`).join(' · ') || L('нет упражнений', 'no exercises')}</span>}
          </span>
          <span className="text-[10.5px] opacity-80 shrink-0">
            {t.items.length} {L('упр.', 'ex.')}
          </span>
        </button>
        <button
          type="button"
          className="ibtn !w-11 !h-auto min-h-[48px] rounded-[14px] bg-panel-2"
          title={L('Действия', 'Actions')}
          aria-label={`${L('Действия', 'Actions')}: ${t.name}`}
          onClick={(e) => {
            e.stopPropagation();
            void menu(t);
          }}
        >
          <Icon name="more" size={18} />
        </button>
      </div>
    </SwipeRow>
  );

  return (
    <div>
      <div className="space-y-2">{active.map(row)}</div>
      {!active.length && <p className="text-sm text-muted py-2">{L('Планов пока нет.', 'No plans yet.')}</p>}
      <Btn variant="ghost" icon="plus" className="w-full mt-2" onClick={() => void create()}>
        {L('Новый план', 'New plan')}
      </Btn>
      {archived.length > 0 && (
        <div className="mt-3">
          <button type="button" className="text-[12.5px] text-muted flex items-center gap-1 min-h-[40px]" onClick={() => setShowArch(!showArch)}>
            <Icon name={showArch ? 'up' : 'down'} size={12} /> {L('Архив', 'Archive')} ({archived.length})
          </button>
          {showArch && <div className="space-y-2 mt-1 opacity-80">{archived.map(row)}</div>}
        </div>
      )}
      {edit && <PlanEditor id={edit} onClose={() => setEdit(null)} />}
      {rename && <RenameDialog title={L('Переименовать план', 'Rename plan')} value={rename.name} onSave={(v) => void renamePlan(rename.id, v)} onClose={() => setRename(null)} />}
    </div>
  );
}

// ───────────── Редактор плана ─────────────

export function PlanEditor({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useLive(async () => (await db.templates.get(id)) ?? null, [id]);
  const exercises = useLive(() => db.exercises.toArray(), []) || [];
  const days = useLive(() => planDays(id), [id]) || [];
  const [sheet, setSheet] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const closing = useRef(false);
  useEffect(() => {
    if (t && name === null) setName(t.name);
  }, [t, name]);
  useAutosave(name, (v) => {
    if (v === null) return;
    void guard(L('сохранить план', 'save plan'), async () => {
      const cur = await db.templates.get(id);
      if (cur && cur.name !== v) await db.templates.put({ ...cur, name: v });
    });
  }, 350);
  const names = weekdayNames('EEEEEE');

  const close = async () => {
    if (closing.current) return;
    closing.current = true;
    const cur = await db.templates.get(id);
    const n = (name ?? cur?.name ?? '').trim();
    if (cur) {
      // пустой план без названия — это отменённое создание, его не оставляем
      if (!n && !cur.items.length) await db.templates.delete(id);
      else if (cur.name !== n) await db.templates.put({ ...cur, name: n || L('План', 'Plan') });
    }
    onClose();
  };
  if (t === undefined) return null;
  if (t === null) {
    return (
      <Modal open onClose={onClose} title={L('План не найден', 'Plan not found')}>
        <p className="text-sm text-muted">{L('Похоже, план удалён.', 'This plan seems to be deleted.')}</p>
      </Modal>
    );
  }
  const exOf = (eid: string) => exercises.find((e) => e.id === eid);
  const patch = (p: Partial<Template>) => void guard(L('сохранить план', 'save plan'), async () => {
    const cur = await db.templates.get(id);
    if (cur) await db.templates.put({ ...cur, ...p });
  });
  const patchItem = (itemId: string | undefined, p: Partial<Template['items'][number]>) => patch({ items: t.items.map((i) => (i.id === itemId ? { ...i, ...p } : i)) });

  return (
    <Modal
      open
      onClose={() => void close()}
      title={t.name || name || L('Новый план', 'New plan')}
      kanji="型"
      wide
      footer={
        <>
          <Btn size="sm" variant="danger" icon="trash" className="mr-auto" onClick={() => void askDeletePlan(t, onClose)}>
            {L('Удалить', 'Delete')}
          </Btn>
          <Btn size="sm" variant="ghost" icon={t.archived ? 'undo' : 'inbox'} onClick={() => void archivePlan(t.id, !t.archived).then(() => !t.archived && onClose())}>
            {t.archived ? L('Из архива', 'Unarchive') : L('В архив', 'Archive')}
          </Btn>
          <Btn size="sm" icon="check" onClick={() => void close()}>
            {L('Готово', 'Done')}
          </Btn>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={L('Название', 'Name')}>
          <input className="inp text-[16px]" value={name ?? ''} autoFocus={!t.name} onChange={(e) => setName(e.target.value)} placeholder="Push / Pull / Legs / Upper…" data-testid="plan-name" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Group label={L('Цвет', 'Color')}>
            <div className="flex flex-wrap gap-1.5">
              {PLAN_COLORS.map((c) => (
                <button key={c} type="button" className="w-9 h-9 rounded-full border-2" style={{ background: c, borderColor: t.color === c ? '#fff' : 'transparent' }} onClick={() => patch({ color: c })} aria-label={c} />
              ))}
            </div>
          </Group>
          <Group label={L('Иконка', 'Icon')}>
            <div className="flex flex-wrap gap-1.5">
              {PLAN_ICONS.map((ic) => (
                <button key={ic} type="button" className={`w-9 h-9 rounded-full grid place-items-center ${t.icon === ic ? 'bg-panel-2 text-ink' : 'text-dim'}`} style={t.icon === ic ? { boxShadow: `0 0 0 2px ${t.color || '#ff9f0a'}` } : undefined} onClick={() => patch({ icon: ic })} aria-label={ic}>
                  <Icon name={ic} size={16} />
                </button>
              ))}
            </div>
          </Group>
        </div>
        <Group label={L('Дни недели (по желанию)', 'Weekdays (optional)')} hint={L('План показывается в HQ и в календаре в эти дни.', 'Shown in HQ and the calendar on these days.')}>
          <div className="flex flex-wrap gap-1.5">
            {names.map((n, i) => {
              const on = days.includes(i);
              return (
                <button key={i} type="button" className={`chip capitalize ${on ? 'chip-on' : ''}`} onClick={() => void guard(L('дни плана', 'plan days'), () => setPlanDays(id, on ? days.filter((x) => x !== i) : [...days, i]))}>
                  {n}
                </button>
              );
            })}
          </div>
        </Group>

        <div>
          <div className="label mb-2">
            {L('Упражнения', 'Exercises')} · {t.items.length}
          </div>
          <PlanItems
            items={t.items}
            exOf={exOf}
            onReorder={(items) => patch({ items })}
            onPatch={patchItem}
            onRemove={(itemId) => void removeFromPlan(id, itemId)}
          />
          <Btn variant="ghost" icon="plus" className="w-full mt-2" onClick={() => setSheet(true)}>
            {L('Добавить упражнение', 'Add exercise')}
          </Btn>
        </div>
      </div>
      <AddExerciseSheet
        open={sheet}
        onClose={() => setSheet(false)}
        context="plan"
        addedIds={t.items.map((i) => i.exerciseId)}
        onAdd={async (ex) => {
          const cur = await db.templates.get(id);
          if (!cur) throw new Error(L('План не найден', 'Plan not found'));
          await db.templates.put({ ...cur, items: [...cur.items, planItem(ex)] });
        }}
      />
    </Modal>
  );
}

/** Пункты плана: перетаскивание за ручку (мышь и палец), свои подходы × повторы и вес, «Убрать из плана». */
function PlanItems({ items, exOf, onReorder, onPatch, onRemove }: { items: Template['items']; exOf: (id: string) => Exercise | undefined; onReorder: (items: Template['items']) => void; onPatch: (itemId: string | undefined, p: Partial<Template['items'][number]>) => void; onRemove: (itemId: string) => void }) {
  const [drag, setDrag] = useState<{ id: string; y0: number; dy: number; h: number } | null>(null);
  const order = useMemo(() => {
    if (!drag) return items;
    const from = items.findIndex((i) => i.id === drag.id);
    const to = Math.max(0, Math.min(items.length - 1, from + Math.round(drag.dy / drag.h)));
    const out = items.slice();
    const [m] = out.splice(from, 1);
    out.splice(to, 0, m);
    return out;
  }, [items, drag]);
  useEffect(() => {
    if (!drag) return;
    const stop = (e: TouchEvent) => e.preventDefault();
    window.addEventListener('touchmove', stop, { passive: false });
    return () => window.removeEventListener('touchmove', stop);
  }, [drag]);

  return (
    <div className="space-y-2" data-testid="plan-items">
      {order.map((it) => {
        const ex = exOf(it.exerciseId);
        const kind = kindOf(ex);
        const dragging = drag?.id === it.id;
        const from = items.findIndex((i) => i.id === it.id);
        const shown = order.findIndex((i) => i.id === it.id);
        const offset = dragging ? drag!.dy - (shown - from) * drag!.h : 0;
        return (
          <SwipeRow key={it.id} onDelete={() => onRemove(it.id!)} deleteLabel={L('Убрать', 'Remove')}>
            <div
              className={`flex flex-wrap sm:flex-nowrap items-center gap-2 rounded-[14px] bg-panel-2 px-2 py-2 ${dragging ? 'relative z-10 shadow-xl' : ''}`}
              style={{ transform: dragging ? `translateY(${offset}px)` : undefined }}
              data-item={ex?.name || ''}
            >
              <span
                className="ibtn !w-9 cursor-grab touch-none text-dim"
                title={L('Перетащить', 'Drag')}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                  const h = ((e.currentTarget as HTMLElement).closest('[data-item]') as HTMLElement)?.getBoundingClientRect().height + 8 || 56;
                  setDrag({ id: it.id!, y0: e.clientY, dy: 0, h });
                }}
                onPointerMove={(e) => drag && drag.id === it.id && setDrag({ ...drag, dy: e.clientY - drag.y0 })}
                onPointerUp={() => {
                  if (drag && drag.id === it.id) {
                    if (order.map((x) => x.id).join() !== items.map((x) => x.id).join()) onReorder(order);
                    setDrag(null);
                  }
                }}
                onPointerCancel={() => setDrag(null)}
              >
                <Icon name="grip" size={16} />
              </span>
              <span className="flex-1 min-w-[8rem]">
                <span className="block text-[14.5px] truncate">{ex?.name || L('Удалённое упражнение', 'Deleted exercise')}</span>
                {ex && <span className="block text-[11px] text-dim truncate">{muscleLabel(ex)}{ex.isCustom ? ' · Custom' : ''}</span>}
              </span>
              <input type="number" min={1} inputMode="numeric" aria-label={L('Подходы', 'Sets')} className="inp !py-1.5 !w-14 mono" value={it.sets} onChange={(e) => onPatch(it.id, { sets: Math.max(1, Number(e.target.value) || 1) })} />
              <span className="text-dim">×</span>
              <input type="number" min={1} inputMode="numeric" aria-label={kind === 'time' ? L('Секунды', 'Seconds') : L('Повторы', 'Reps')} className="inp !py-1.5 !w-16 mono" value={it.reps} onChange={(e) => onPatch(it.id, { reps: Math.max(1, Number(e.target.value) || 1) })} />
              {(kind === 'weight' || kind === 'bodyweight') && (
                <input inputMode="decimal" aria-label={L('Вес', 'Weight')} placeholder={ex?.unit || 'kg'} className="inp !py-1.5 !w-20 mono" value={it.weight ?? ''} onChange={(e) => onPatch(it.id, { weight: Number(e.target.value.replace(',', '.')) || undefined })} />
              )}
              <IBtn icon="x" title={L('Убрать из плана', 'Remove from plan')} onClick={(e) => (e.stopPropagation(), onRemove(it.id!))} />
            </div>
          </SwipeRow>
        );
      })}
      {!items.length && <p className="text-sm text-muted">{L('Добавь упражнения — из библиотеки или своё.', 'Add exercises — from the library or your own.')}</p>}
    </div>
  );
}

/** Отметка «Custom» для своих упражнений. */
export const CustomTag = ({ ex }: { ex: Exercise }) => (ex.isCustom ? <span className="tag !text-[10px]">Custom</span> : null);

// ───────────── Вставить тренировку из заметок ─────────────

const SAMPLE = 'Bench: 30x10 40x7 35x4\nПодтягивания 20x6 25x8 30x10\nSquats: 30x10 30x10 30x10';

/**
 * Вставка тренировки «как в заметках»: по строке на упражнение, подходы — «вес x повторы».
 * Перед добавлением видно, что распозналось, и для каждой строки можно выбрать упражнение из библиотеки.
 */
export function PasteWorkoutSheet({ open, onClose, workoutId, onApplied }: { open: boolean; onClose: () => void; workoutId: string; onApplied: () => void }) {
  const exercises = useLive(() => db.exercises.toArray(), []) || [];
  const [text, setText] = useState('');
  const [pick, setPick] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) {
      setText('');
      setPick({});
    }
  }, [open]);
  const lines = useMemo(() => parseWorkoutText(text), [text]);
  const lib = activeExercises(exercises);
  const auto = (name: string) => findDuplicate(name, exercises)?.id || 'new';
  const choice = (i: number, name: string) => pick[i] ?? auto(name);
  const exLines = lines.map((l, i) => ({ l, i })).filter(({ l }) => !l.note);
  const notes = lines.filter((l) => l.note);
  const totalSets = exLines.reduce((s, { l }) => s + l.sets.length, 0);
  const uniq = new Set(exLines.map(({ l, i }) => (choice(i, l.name) === 'new' ? `n:${normName(l.name)}` : choice(i, l.name)))).size;

  const apply = async () => {
    setBusy(true);
    const res = await guard(L('добавить тренировку из заметок', 'add workout from notes'), async () => {
      const fresh = await db.workouts.get(workoutId);
      if (!fresh) throw new Error(L('Тренировка не найдена', 'Workout not found'));
      const all = await db.workouts.toArray();
      const created = new Map<string, Exercise>();
      const entries = fresh.entries.slice();
      let best: { title: string; sub?: string } | null = null;
      let prs = 0;
      for (const { l, i } of exLines) {
        const c = choice(i, l.name);
        let ex: Exercise | undefined;
        if (c === 'new') {
          const key = normName(l.name);
          ex = created.get(key) || (await createExercise({ name: l.name }));
          created.set(key, ex);
        } else ex = await db.exercises.get(c);
        if (!ex) continue;
        let entry = entries.find((e) => e.exerciseId === ex!.id);
        if (!entry) {
          entry = { ...newEntry(ex) };
          entries.push(entry);
        }
        const kind = kindOf(ex);
        const unit = unitOf(ex);
        for (const s of l.sets) {
          const prior = bestOf(all, ex.id, workoutId);
          const input = kind === 'time' ? { reps: 0, weight: 0, time: s.reps } : { reps: s.reps, weight: s.weight };
          const pr = detectPR(kind, unit, prior, entry.sets, input);
          entry.sets = [...entry.sets, { id: uid(), ...input, pr: pr.isPR }];
          if (pr.isPR) {
            prs++;
            best = { title: `${ex.name} — ${setLabel(entry.sets[entry.sets.length - 1], kind, unit)}`, sub: pr.sub };
          }
        }
      }
      const noteText = notes.map((n) => (n.name ? `${n.name}: ${n.note}` : n.note)).join('\n');
      await db.workouts.put({ ...fresh, entries, notes: [fresh.notes, noteText].filter((x) => x && x.trim()).join('\n') });
      return { prs, best };
    });
    setBusy(false);
    if (!res) return;
    onApplied();
    onClose();
    toast(`${L('Добавлено', 'Added')}: ${uniq} ${L('упр.', 'ex.')}, ${totalSets} ${L('подходов', 'sets')}${res.prs ? ` · PR ×${res.prs}` : ''}`);
    if (res.best) {
      play('flash');
      fx.emit({ type: 'blackflash', title: res.best.title, sub: res.prs > 1 ? `${res.best.sub || ''} · PR ×${res.prs}` : res.best.sub });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={L('Вставить из заметок', 'Paste from notes')}
      kanji="録"
      wide
      footer={
        <>
          <Btn size="sm" variant="ghost" onClick={onClose}>
            {L('Отмена', 'Cancel')}
          </Btn>
          <Btn size="sm" icon="check" disabled={busy || !exLines.length} onClick={() => void apply()}>
            {L('Добавить', 'Add')} {exLines.length ? `${uniq} ${L('упр.', 'ex.')} · ${totalSets} ${L('подх.', 'sets')}` : ''}
          </Btn>
        </>
      }
    >
      <p className="text-[13px] text-muted mb-2">
        {L('По строке на упражнение: название и подходы «вес x повторы». Можно писать x, х, × или *.', 'One line per exercise: name and sets as “weight x reps”. x, ×, or * all work.')}
      </p>
      <textarea className="inp mono text-[14px] min-h-[150px]" value={text} onChange={(e) => setText(e.target.value)} placeholder={SAMPLE} autoFocus data-testid="paste-text" />
      {lines.length > 0 && (
        <div className="mt-3 space-y-1.5" data-testid="paste-preview">
          <div className="label">{L('Что распозналось', 'Recognized')}</div>
          {exLines.map(({ l, i }) => {
            const c = choice(i, l.name);
            return (
              <div key={i} className="rounded-xl bg-panel-2 px-3 py-2 flex flex-wrap items-center gap-2">
                <select className="inp !py-1 !w-auto max-w-[60%] text-[13.5px]" value={c} onChange={(e) => setPick({ ...pick, [i]: e.target.value })} aria-label={l.name}>
                  <option value="new">
                    + {L('Новое', 'New')}: {l.name}
                  </option>
                  {lib.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
                {c !== 'new' && <span className="text-[11px] text-jade">{L('из библиотеки', 'from library')}</span>}
                <span className="mono text-[13px] flex-1 min-w-[8rem]">{l.sets.length ? l.sets.map((s) => `${s.weight}×${s.reps}`).join('  ') : <span className="text-dim">{L('без подходов', 'no sets')}</span>}</span>
              </div>
            );
          })}
          {notes.map((n, k) => (
            <div key={`n${k}`} className="rounded-xl px-3 py-2 text-[13px] text-muted border border-dashed border-line">
              <Icon name="note" size={12} /> {L('В заметки тренировки', 'To workout notes')}: {n.name ? `${n.name}: ` : ''}
              {n.note}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
