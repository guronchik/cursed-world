// Страницы сущностей B5 (?page=kind:id): Curse, задание, упражнение. Редактирование — существующими редакторами.
import { BlurText } from './BlurText';
import { EntityLayout, MetaRow, type EntitySection } from './EntityLayout';
import { Icon } from './Icon';
import { GradeBadge, Monster } from './Monster';
import { Countdown, openCurse, TechChip } from './shared';
import { BlobImg, Btn, IBtn, Progress, Toggle } from './ui';
import { db, type Attachment, type Curse } from '../db/schema';
import { exorcise, revive } from '../lib/actions';
import { fmt } from '../lib/dates';
import { closeEntity, nextOf, openEntity, type EntityKind } from '../lib/entity';
import { curseGrade, gradeName, IMPORTANCE } from '../lib/grade';
import { useLive, useNow } from '../lib/hooks';
import { ASTATUS, ASTATUS_COLOR, setAssignmentCurse, setAssignmentStatus, syncFromCurse } from '../lib/linked';
import { hostOf, youtubeId } from '../lib/links';
import { renderMarkdown } from '../lib/markdown';
import { go, setQuery, useRoute } from '../lib/router';
import { L } from '../lib/runtime';
import { bestOf } from '../lib/stats';

export function EntityHost() {
  const { query } = useRoute();
  const raw = query.get('page');
  if (!raw) return null;
  const [kind, id] = raw.split(':') as [EntityKind, string];
  if (kind === 'curse') return <CursePage id={id} />;
  if (kind === 'assignment') return <AssignmentPage id={id} />;
  if (kind === 'exercise') return <ExercisePage id={id} />;
  return null;
}

function Files({ list }: { list: Attachment[] }) {
  if (!list.length) return <p className="text-[13px] text-dim">{L('Файлов нет', 'No files')}</p>;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {list.map((a) =>
        a.type.startsWith('image/') ? (
          <BlobImg key={a.id} id={a.blobId} className="w-full aspect-video object-cover rounded-xl" />
        ) : (
          <div key={a.id} className="rounded-xl bg-panel-2 p-3 text-[13px] flex items-center gap-2 min-w-0">
            <Icon name="file" size={15} /> <span className="truncate">{a.name}</span>
          </div>
        ),
      )}
    </div>
  );
}

function Links({ list }: { list: string[] }) {
  if (!list.length) return <p className="text-[13px] text-dim">{L('Ссылок нет', 'No links')}</p>;
  return (
    <div className="space-y-1.5">
      {list.map((u) => (
        <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-xl bg-panel-2 px-3 min-h-[44px] text-[13.5px] min-w-0 hover:brightness-125">
          <Icon name={youtubeId(u) ? 'youtube' : 'link'} size={14} /> <span className="truncate">{hostOf(u)}</span>
          <span className="text-dim truncate text-[12px]">{u}</span>
        </a>
      ))}
    </div>
  );
}

function Notes({ text }: { text: string }) {
  if (!text.trim()) return <p className="text-[13px] text-dim">{L('Описания нет', 'No description')}</p>;
  return <div className="md text-[15px]" dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} />;
}

// ───── Curse ─────
function CursePage({ id }: { id: string }) {
  const now = useNow(30_000);
  const c = useLive(() => db.curses.get(id), [id]);
  const techs = useLive(() => db.techniques.toArray(), []) || [];
  const subjects = useLive(() => db.subjects.toArray(), []) || [];
  const all = useLive(async () => (await db.curses.where('status').equals('active').toArray()).sort((a, b) => a.due - b.due).map((x) => ({ id: x.id, title: x.title })), []) || [];
  if (c === undefined) return null;
  if (!c) return <Missing onClose={closeEntity} />;
  const g = curseGrade(c.due, c.importance, now);
  const done = c.status === 'exorcised';
  const tech = techs.find((t) => t.id === c.techniqueId);
  const subject = subjects.find((s) => s.id === c.subjectId);
  const sd = c.subtasks.filter((s) => s.done).length;
  const nid = nextOf('curse', c.id, all.map((x) => x.id));
  const ntitle = all.find((x) => x.id === nid)?.title;
  const toggleSub = async (sid: string) => {
    const next: Curse = { ...c, subtasks: c.subtasks.map((s) => (s.id === sid ? { ...s, done: !s.done } : s)) };
    await db.curses.put(next);
    await syncFromCurse(next);
  };
  const sections: EntitySection[] = [
    { id: 'about', label: L('Описание', 'About'), icon: 'note', node: <Notes text={c.notes} /> },
    {
      id: 'subtasks',
      label: `${L('Подзадачи', 'Subtasks')} ${sd}/${c.subtasks.length}`,
      icon: 'todo',
      node: c.subtasks.length ? (
        <div className="space-y-1">
          <Progress value={(sd / c.subtasks.length) * 100} height={4} className="mb-2" />
          {c.subtasks.map((s) => (
            <button key={s.id} role="checkbox" aria-checked={s.done} className="flex items-center gap-3 w-full text-left min-h-[44px] rounded-xl px-2 hover:bg-panel-2" onClick={() => void toggleSub(s.id)}>
              <span className={`be-check !m-0 ${s.done ? 'be-check-on' : ''}`}>{s.done && <Icon name="check" size={11} />}</span>
              <span className={s.done ? 'line-through text-dim' : ''}>{s.title}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-[13px] text-dim">{L('Подзадач нет', 'No subtasks')}</p>
      ),
    },
    { id: 'files', label: L('Файлы', 'Files'), icon: 'image', node: <Files list={c.attachments} /> },
    { id: 'links', label: L('Ссылки', 'Links'), icon: 'link', node: <Links list={c.links} /> },
  ];
  return (
    <EntityLayout
      kind="Curse"
      title={c.title}
      onClose={closeEntity}
      actions={
        <>
          <IBtn icon="edit" title={L('Изменить', 'Edit')} onClick={() => openCurse(c.id)} />
          {done ? (
            <Btn size="sm" variant="ghost" icon="refresh" onClick={() => void revive(c.id)}>{L('Вернуть', 'Revive')}</Btn>
          ) : (
            <Btn size="sm" icon="bolt" onClick={(e) => void exorcise(c.id, e.currentTarget)}>Exorcise</Btn>
          )}
        </>
      }
      meta={
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            {done ? <span className="kanji text-4xl text-dim">祓</span> : <Monster grade={g.grade} overdue={g.overdue} size={72} />}
            <div className="space-y-1">
              {!done && <GradeBadge grade={g.grade} overdue={g.overdue} />}
              <div className="text-[12px] text-dim">{done ? L('Изгнан', 'Exorcised') : gradeName(g.grade)}</div>
            </div>
          </div>
          {!done && (
            <MetaRow label={L('До дедлайна', 'Time left')}>
              <Countdown to={c.due} />
            </MetaRow>
          )}
          <MetaRow label={L('Дедлайн', 'Deadline')}>
            <BlurText text={fmt(c.due, 'EEEE, d MMMM, HH:mm')} />
          </MetaRow>
          {tech && (
            <MetaRow label={L('Техника', 'Technique')}>
              <TechChip t={tech} />
            </MetaRow>
          )}
          {subject && (
            <MetaRow label={L('Предмет', 'Subject')}>
              <BlurText text={subject.name} />
            </MetaRow>
          )}
          <MetaRow label={L('Важность', 'Importance')}>
            <BlurText text={IMPORTANCE().find((x) => x.v === c.importance)?.label || String(c.importance)} />
          </MetaRow>
          {c.link && (
            <MetaRow label={L('Связано', 'Linked')}>
              <button className="chip" onClick={() => (c.link!.kind === 'assignment' ? openEntity('assignment', c.link!.id, { cinematic: false }) : go(`/energy/technique?v=${c.link!.id}`))}>
                <Icon name={c.link.kind === 'assignment' ? 'file' : 'youtube'} size={13} /> {c.link.kind === 'assignment' ? L('Задание', 'Assignment') : L('Видео', 'Video')}
              </button>
            </MetaRow>
          )}
        </div>
      }
      sections={sections}
      next={nid && ntitle ? { label: 'Next curse', title: ntitle, onOpen: () => openEntity('curse', nid, { title: ntitle }) } : undefined}
    />
  );
}

// ───── Задание ─────
function AssignmentPage({ id }: { id: string }) {
  const a = useLive(() => db.assignments.get(id), [id]);
  const subjects = useLive(() => db.subjects.toArray(), []) || [];
  const all = useLive(async () => (await db.assignments.toArray()).filter((x) => x.status !== 'done').sort((x, y) => (x.due ?? Infinity) - (y.due ?? Infinity)).map((x) => ({ id: x.id, title: x.title })), []) || [];
  if (a === undefined) return null;
  if (!a) return <Missing onClose={closeEntity} />;
  const subject = subjects.find((s) => s.id === a.subjectId);
  const nid = nextOf('assignment', a.id, all.map((x) => x.id));
  const ntitle = all.find((x) => x.id === nid)?.title;
  const ST = ASTATUS();
  return (
    <EntityLayout
      kind={L('Задание', 'Assignment')}
      title={a.title}
      onClose={closeEntity}
      actions={<IBtn icon="edit" title={L('Изменить', 'Edit')} onClick={() => go(`/tools/assignments?a=${a.id}`)} />}
      meta={
        <div className="space-y-4">
          {subject && (
            <MetaRow label={L('Предмет', 'Subject')}>
              <span className="tag" style={{ color: subject.color, background: `color-mix(in srgb, ${subject.color} 15%, transparent)` }}>{subject.name}</span>
            </MetaRow>
          )}
          {a.due && (
            <MetaRow label={L('Дедлайн', 'Deadline')}>
              <BlurText text={fmt(a.due, 'EEEE, d MMMM, HH:mm')} />
              {a.status !== 'done' && <div className="mt-1"><Countdown to={a.due} /></div>}
            </MetaRow>
          )}
          <MetaRow label={L('Статус', 'Status')}>
            <div className="seg">
              {(Object.keys(ST) as (keyof typeof ST)[]).map((k) => (
                <button key={k} role="radio" aria-checked={a.status === k} className={`seg-btn ${a.status === k ? 'seg-on' : ''}`} style={a.status === k ? { color: ASTATUS_COLOR[k] } : undefined} onClick={(e) => void setAssignmentStatus(a.id, k, e.currentTarget)}>
                  {ST[k]}
                </button>
              ))}
            </div>
          </MetaRow>
          {a.grade && (
            <MetaRow label={L('Оценка', 'Grade')}>
              <BlurText text={a.grade} />
            </MetaRow>
          )}
          <MetaRow label={L('Сделать Curse', 'Make Curse')}>
            <Toggle on={!!a.curseId} onChange={(on) => void setAssignmentCurse(a.id, on)} />
          </MetaRow>
        </div>
      }
      sections={[
        { id: 'notes', label: L('Заметки', 'Notes'), icon: 'note', node: <Notes text={a.notes} /> },
        { id: 'files', label: L('Файлы', 'Files'), icon: 'image', node: <Files list={a.attachments} /> },
        { id: 'links', label: L('Ссылки', 'Links'), icon: 'link', node: <Links list={a.links} /> },
        ...(a.source ? [{ id: 'source', label: L('Источник', 'Source'), icon: 'calendar', node: <p className="text-[13.5px] text-muted">{L('Добавлено из', 'Added from')} {a.source.name}</p> }] : []),
      ]}
      next={nid && ntitle ? { label: L('Следующее задание', 'Next assignment'), title: ntitle, onOpen: () => openEntity('assignment', nid, { title: ntitle }) } : undefined}
    />
  );
}

// ───── Упражнение ─────
function ExercisePage({ id }: { id: string }) {
  const ex = useLive(() => db.exercises.get(id), [id]);
  const workouts = useLive(() => db.workouts.toArray(), []) || [];
  const all = useLive(async () => (await db.exercises.toArray()).sort((a, b) => a.name.localeCompare(b.name)).map((x) => ({ id: x.id, title: x.name })), []) || [];
  if (ex === undefined) return null;
  if (!ex) return <Missing onClose={closeEntity} />;
  const best = bestOf(workouts, ex.id);
  const history = workouts
    .filter((w) => w.entries.some((e) => e.exerciseId === ex.id))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 12);
  const yt = youtubeId(ex.videoUrl);
  const nid = nextOf('exercise', ex.id, all.map((x) => x.id));
  const ntitle = all.find((x) => x.id === nid)?.title;
  return (
    <EntityLayout
      kind={L('Упражнение', 'Exercise')}
      title={ex.name}
      onClose={closeEntity}
      actions={<IBtn icon="edit" title={L('Изменить', 'Edit')} onClick={() => setQuery('ex', ex.id)} />}
      hero={ex.photoId ? <BlobImg id={ex.photoId} className="w-full h-[28vh] object-cover" /> : undefined}
      meta={
        <div className="space-y-4">
          <MetaRow label={L('Лучший вес', 'Best weight')}>
            <span className="mono text-2xl font-bold">{best.has ? `${best.maxWeight} kg` : '—'}</span>
          </MetaRow>
          <MetaRow label={L('Расчётный 1ПМ', 'Est. 1RM')}>
            <span className="mono text-lg">{best.has ? `${Math.round(best.best1rm)} kg` : '—'}</span>
          </MetaRow>
          {ex.targetWeight ? (
            <MetaRow label={L('Цель', 'Target')}>
              <span className="mono">{ex.targetWeight} kg</span>
              {best.has && <Progress value={(best.maxWeight / ex.targetWeight) * 100} height={4} className="mt-1" />}
            </MetaRow>
          ) : null}
          <MetaRow label={L('Тренировок', 'Sessions')}>
            <BlurText text={String(history.length)} />
          </MetaRow>
        </div>
      }
      sections={[
        { id: 'technique', label: L('Техника', 'Technique'), icon: 'note', node: <Notes text={ex.notes} /> },
        {
          id: 'video',
          label: L('Видео', 'Video'),
          icon: 'video',
          node: yt ? (
            <div className="be-embed">
              <iframe className="absolute inset-0 w-full h-full" src={`https://www.youtube-nocookie.com/embed/${yt}`} title={ex.name} loading="lazy" allowFullScreen />
            </div>
          ) : ex.videoUrl ? (
            <Links list={[ex.videoUrl]} />
          ) : (
            <p className="text-[13px] text-dim">{L('Видео нет', 'No video')}</p>
          ),
        },
        {
          id: 'history',
          label: L('История', 'History'),
          icon: 'chart',
          node: history.length ? (
            <div className="space-y-1.5">
              {history.map((w) => {
                const e = w.entries.find((x) => x.exerciseId === ex.id)!;
                return (
                  <div key={w.id} className="flex items-center gap-3 rounded-xl bg-panel-2 px-3 min-h-[44px] text-[13.5px]">
                    <span className="text-muted w-24 shrink-0">{fmt(new Date(w.date + 'T12:00'), 'd MMM yy')}</span>
                    <span className="mono truncate">{e.sets.map((s) => `${s.weight}×${s.reps}`).join('  ')}</span>
                    {e.sets.some((s) => s.pr) && <span className="tag !text-[10.5px] text-gold ml-auto">PR</span>}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-[13px] text-dim">{L('Ещё не делал', 'Not done yet')}</p>
          ),
        },
      ]}
      next={nid && ntitle ? { label: L('Следующее упражнение', 'Next exercise'), title: ntitle, onOpen: () => openEntity('exercise', nid, { title: ntitle }) } : undefined}
    />
  );
}

function Missing({ onClose }: { onClose: () => void }) {
  return (
    <EntityLayout kind="—" title={L('Не найдено', 'Not found')} onClose={onClose} meta={null} sections={[{ id: 'x', label: '', node: <Btn onClick={onClose}>{L('Назад', 'Back')}</Btn> }]} />
  );
}
