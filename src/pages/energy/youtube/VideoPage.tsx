// Страница видео: полноэкранный лист (как страница Notion) — иконка, обложка, большой заголовок, свойства,
// пайплайн, «Сделать Curse», редактор блоков с Ideas и Notes, обратные ссылки.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BlockEditor, type PageRef } from '../../../components/BlockEditor';
import { Icon } from '../../../components/Icon';
import { Monster } from '../../../components/Monster';
import { BlobImg, Btn, IBtn, ImagePick, Modal, Progress, TagInput, Toggle } from '../../../components/ui';
import { db, type Block, type VIdea, type Video, type VideoProp, type VNote } from '../../../db/schema';
import { cloneBlocks } from '../../../lib/blocks';
import { fmt, fromLocalInput, toLocalInput } from '../../../lib/dates';
import { confirmBox, toast } from '../../../lib/fx';
import { curseGrade, gradeName } from '../../../lib/grade';
import { useLive, useNow } from '../../../lib/hooks';
import { setVideoCurse } from '../../../lib/linked';
import { delBlob } from '../../../lib/media';
import { L, uid } from '../../../lib/runtime';
import { iconOf, isDoneIn, PAGE_COLORS, PAGE_ICONS, PRIORITY, PRIORITY_COLOR, progressOf, sortCols, statusOf } from '../../../lib/videoMeta';
import { useVideoStatuses } from '../../../lib/statuses';
import { deleteVideo, duplicateVideo, exportVideoJson, exportVideoMd, getTemplates, saveDoc, saveTemplates, saveVideo } from '../../../lib/videos';
import { PageIcon, StatusPill } from './views';
import { EntityLayout, MetaRow } from '../../../components/EntityLayout';
import { BlurText } from '../../../components/BlurText';
import { runCurtain } from '../../../lib/transition';

const IDEA_KINDS = (): { v: VIdea['kind']; label: string }[] => [
  { v: 'hook', label: L('Хук', 'Hook') },
  { v: 'title', label: L('Название', 'Title') },
  { v: 'thumb', label: L('Обложка', 'Thumbnail') },
  { v: 'broll', label: 'B-roll' },
  { v: 'other', label: L('Другое', 'Other') },
];

export function VideoPage({ id, onClose, onOpen, props, order }: { id: string; onClose: () => void; onOpen: (id: string) => void; props: VideoProp[]; order?: string[] }) {
  // результат запроса помечен id: пока грузится новая страница, старые данные не попадут в неё
  const loaded = useLive(async () => ({ id, video: await db.videos.get(id), doc: await db.docs.get(id) }), [id]);
  const fresh = loaded?.id === id ? loaded : undefined;
  const video = fresh ? fresh.video || null : undefined;
  const doc = fresh?.doc;
  const all = useLive(() => db.videos.toArray(), []) || [];
  const cols = useVideoStatuses() || [];
  const backlinks = useLive(async () => (await db.docs.toArray()).filter((d) => d.id !== id && d.links.includes(id)).map((d) => d.id), [id]) || [];
  const [iconPick, setIconPick] = useState(false);
  const onDocChange = useDebouncedDocSave(id);

  if (video === undefined) return null;
  if (!video) return <EntityLayout kind="YouTube" title={L('Видео не найдено', 'Video not found')} onClose={onClose} meta={null} sections={[{ id: 'x', label: '', node: <Btn size="sm" onClick={onClose}>{L('Назад', 'Back')}</Btn> }]} />;

  const pages: PageRef[] = all.map((v) => ({ id: v.id, title: v.title, icon: iconOf(v, cols) }));
  const st = statusOf(video, cols);
  // «Next video» — по порядку, откуда открыли (галерея/доска), иначе по колонкам и порядку
  const ordered = (order?.length ? order : sortCols(cols).flatMap((c) => all.filter((v) => v.statusId === c.id).sort((x, y) => x.order - y.order).map((v) => v.id))).filter((x) => all.some((v) => v.id === x));
  const ni = ordered.indexOf(video.id);
  const nextV = ni >= 0 && ordered.length > 1 ? all.find((v) => v.id === ordered[(ni + 1) % ordered.length]) : undefined;
  return (
    <>
      <EntityLayout
        kind="YouTube Technique"
        title={video.title || L('Без названия', 'Untitled')}
        onClose={onClose}
        actions={<PageMenu video={video} onClose={onClose} onOpen={onOpen} />}
        hero={
          video.coverBlobId ? (
            <div className="relative h-[180px] sm:h-[240px] group">
              <BlobImg id={video.coverBlobId} className="w-full h-full object-cover" />
              <div className="absolute right-3 bottom-3 flex gap-2">
                <ImagePick max={1920} onPicked={(coverBlobId) => void saveVideo({ ...video, coverBlobId })} className="chip !bg-black/60 !text-white">
                  {L('Сменить обложку', 'Change cover')}
                </ImagePick>
                <button className="chip !bg-black/60 !text-white" onClick={async () => { await delBlob(video.coverBlobId); await saveVideo({ ...video, coverBlobId: undefined }); }}>
                  {L('Убрать', 'Remove')}
                </button>
              </div>
            </div>
          ) : undefined
        }
        meta={
          <div className="space-y-4">
            <div className="flex items-end gap-3">
              <button onClick={() => setIconPick(true)} aria-label={L('Иконка страницы', 'Page icon')}>
                <PageIcon v={video} cols={cols} size={64} />
              </button>
              {!video.coverBlobId && (
                <ImagePick max={1920} onPicked={(coverBlobId) => void saveVideo({ ...video, coverBlobId })} className="chip !text-[12px]">
                  <Icon name="image" size={13} /> {L('Обложка', 'Cover')}
                </ImagePick>
              )}
            </div>
            <TitleInput key={`t-${video.id}`} video={video} />
            <MetaRow label={L('Статус', 'Status')}>
              <StatusPill col={st} />
            </MetaRow>
            <MetaRow label={L('Прогресс', 'Progress')}>
              <div className="flex items-center gap-2">
                <Progress value={progressOf(video, cols)} className="flex-1" height={5} />
                <span className="mono text-[12px]">{progressOf(video, cols)}%</span>
              </div>
            </MetaRow>
            {(video.publishAt || video.deadline) && (
              <MetaRow label={video.publishAt ? L('Публикация', 'Publish') : L('Дедлайн', 'Deadline')}>
                <BlurText text={fmt((video.publishAt || video.deadline)!, 'EEEE, d MMMM, HH:mm')} />
              </MetaRow>
            )}
            <MetaRow label={L('Формат', 'Format')}>
              <BlurText text={video.format === 'short' ? 'Short' : 'Long'} />
            </MetaRow>
          </div>
        }
        sections={[
          { id: 'props', label: L('Свойства', 'Properties'), icon: 'sliders', node: <Properties video={video} props={props} /> },
          {
            id: 'page',
            label: L('Страница', 'Page'),
            icon: 'note',
            node: fresh ? (
              <div className="vpage-editor">
                <BlockEditor key={`e-${id}`} value={doc?.blocks || []} onChange={onDocChange} pages={pages} selfId={id} onOpenPage={onOpen} renderSpecial={(b) => (b.type === 'ideas' ? <IdeasBlock video={video} /> : <NotesBlock video={video} />)} />
              </div>
            ) : null,
          },
          ...(backlinks.length
            ? [
                {
                  id: 'backlinks',
                  label: `${L('Обратные ссылки', 'Backlinks')} · ${backlinks.length}`,
                  icon: 'link',
                  node: (
                    <div className="space-y-1">
                      {backlinks.map((bid) => {
                        const v = all.find((x) => x.id === bid);
                        if (!v) return null;
                        return (
                          <button key={bid} className="flex items-center gap-2 w-full text-left rounded-lg px-2 py-1.5 hover:bg-panel-2" onClick={() => onOpen(bid)}>
                            <PageIcon v={v} cols={cols} size={18} />
                            <span className="text-[14px] truncate">{v.title || L('Без названия', 'Untitled')}</span>
                          </button>
                        );
                      })}
                    </div>
                  ),
                },
              ]
            : []),
        ]}
        next={nextV ? { label: 'Next video', title: nextV.title || L('Без названия', 'Untitled'), onOpen: () => runCurtain({ title: nextV.title || 'YouTube', swap: () => onOpen(nextV.id) }) } : undefined}
      />
      <Modal open={iconPick} onClose={() => setIconPick(false)} title={L('Иконка страницы', 'Page icon')}>
        <div className="space-y-4">
          <div className="grid grid-cols-8 gap-2">
            {PAGE_ICONS.map((n) => (
              <button key={n} aria-label={n} className={`aspect-square rounded-xl grid place-items-center bg-panel-2 ${iconOf(video, cols).name === n ? 'ring-2 ring-[var(--accent-1)]' : ''}`} onClick={() => void saveVideo({ ...video, icon: { name: n, color: iconOf(video, cols).color } })}>
                <Icon name={n} size={18} />
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {PAGE_COLORS.map((c) => (
              <button key={c} aria-label={c} className={`w-8 h-8 rounded-full ${iconOf(video, cols).color === c ? 'ring-2 ring-offset-2 ring-offset-[var(--bg)] ring-[var(--ink)]' : ''}`} style={{ background: c }} onClick={() => void saveVideo({ ...video, icon: { name: iconOf(video, cols).name, color: c } })} />
            ))}
          </div>
          <Btn size="sm" variant="ghost" icon="refresh" onClick={() => { void saveVideo({ ...video, icon: undefined }); setIconPick(false); }}>
            {L('По статусу (авто)', 'By status (auto)')}
          </Btn>
        </div>
      </Modal>
    </>
  );
}

/** Сохранение блоков с задержкой 500 мс и обязательным сохранением при закрытии. */
function useDebouncedDocSave(id: string) {
  const pending = useRef<{ id: string; blocks: Block[] } | null>(null);
  const timer = useRef(0);
  const flush = useRef(() => {});
  flush.current = () => {
    clearTimeout(timer.current);
    const p = pending.current;
    pending.current = null;
    if (p) void saveDoc(p.id, p.blocks);
  };
  useEffect(() => () => flush.current(), []);
  useEffect(() => {
    const h = () => flush.current();
    window.addEventListener('pagehide', h);
    document.addEventListener('visibilitychange', h);
    return () => {
      window.removeEventListener('pagehide', h);
      document.removeEventListener('visibilitychange', h);
    };
  }, []);
  useEffect(() => () => flush.current(), [id]);
  return (blocks: Block[]) => {
    if (pending.current && pending.current.id !== id) flush.current();
    pending.current = { id, blocks };
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => flush.current(), 500);
  };
}

function TitleInput({ video }: { video: Video }) {
  const [t, setT] = useState(video.title);
  const ref = useRef<HTMLTextAreaElement>(null);
  const last = useRef(video.title);
  useEffect(() => {
    if (video.title !== last.current && document.activeElement !== ref.current) setT(video.title);
    last.current = video.title;
  }, [video.title]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [t]);
  useEffect(() => {
    if (t === video.title) return;
    const h = setTimeout(() => void db.videos.get(video.id).then((v) => v && saveVideo({ ...v, title: t })), 400);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);
  return (
    <textarea
      ref={ref}
      rows={1}
      className="vpage-title ep-title-in"
      value={t}
      placeholder={L('Без названия', 'Untitled')}
      onChange={(e) => setT(e.target.value.replace(/\n/g, ' '))}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (document.querySelector('.ep .be-text') as HTMLElement | null)?.focus();
        }
      }}
      aria-label={L('Название видео', 'Video title')}
    />
  );
}

function PropRow({ icon, label, children }: { icon: string; label: string; children: ReactNode }) {
  return (
    <div className="vprop">
      <div className="vprop-k">
        <Icon name={icon} size={14} /> <span className="truncate">{label}</span>
      </div>
      <div className="vprop-v">{children}</div>
    </div>
  );
}

function NumInput({ value, onSave, placeholder }: { value?: number; onSave: (v?: number) => void; placeholder?: string }) {
  const [s, setS] = useState(value === undefined ? '' : String(value));
  useEffect(() => setS(value === undefined ? '' : String(value)), [value]);
  return (
    <input
      className="vprop-in mono"
      inputMode="numeric"
      value={s}
      placeholder={placeholder || L('Пусто', 'Empty')}
      onChange={(e) => setS(e.target.value.replace(/[^\d.]/g, ''))}
      onBlur={() => {
        const n = s === '' ? undefined : Number(s);
        if (n !== value && (n === undefined || Number.isFinite(n))) onSave(n);
      }}
    />
  );
}

function TextInput({ value, onSave, placeholder, list, type = 'text' }: { value: string; onSave: (v: string) => void; placeholder?: string; list?: string; type?: string }) {
  const [s, setS] = useState(value);
  useEffect(() => setS(value), [value]);
  return <input className="vprop-in" type={type} list={list} value={s} placeholder={placeholder || L('Пусто', 'Empty')} onChange={(e) => setS(e.target.value)} onBlur={() => s !== value && onSave(s.trim())} onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()} />;
}

function DateInput({ value, onSave }: { value?: number; onSave: (v?: number) => void }) {
  return (
    <span className="flex items-center gap-1 min-w-0">
      <input className="vprop-in" type="datetime-local" value={value ? toLocalInput(value) : ''} onChange={(e) => onSave(e.target.value ? fromLocalInput(e.target.value) : undefined)} />
      {value !== undefined && (
        <button className="ibtn ibtn-sm shrink-0" aria-label={L('Очистить', 'Clear')} onClick={() => onSave(undefined)}>
          <Icon name="x" size={12} />
        </button>
      )}
    </span>
  );
}

function Properties({ video, props }: { video: Video; props: VideoProp[] }) {
  const now = useNow(60_000);
  const series = useLive(async () => [...new Set((await db.videos.toArray()).map((v) => v.series).filter(Boolean))], []) || [];
  const save = (p: Partial<Video>) => db.videos.get(video.id).then((v) => v && saveVideo({ ...v, ...p }));
  const [more, setMore] = useState(false);
  const cols = useVideoStatuses() || [];
  const p = progressOf(video, cols);
  const g = video.deadline && !isDoneIn(video, cols) ? curseGrade(video.deadline, Math.max(1, video.priority + 2), now) : null;
  return (
    <div className="vprops">
      <PropRow icon="target" label={L('Статус', 'Status')}>
        <div className="flex flex-wrap gap-1">
          {cols.map((c) => (
            <button key={c.id} className={`tag !text-[12px] !py-1 transition-opacity ${video.statusId === c.id ? '' : 'opacity-55 hover:opacity-90'}`} style={{ color: c.color, background: `color-mix(in srgb, ${c.color} ${video.statusId === c.id ? 22 : 10}%, transparent)` }} onClick={() => void save({ statusId: c.id })}>
              {c.name}
            </button>
          ))}
        </div>
      </PropRow>
      <PropRow icon="film" label={L('Формат', 'Format')}>
        <div className="seg">
          {(['long', 'short'] as const).map((f) => (
            <button key={f} role="radio" aria-checked={video.format === f} className={`seg-btn ${video.format === f ? 'seg-on' : ''}`} onClick={() => void save({ format: f })}>
              {f === 'long' ? 'Long' : 'Short'}
            </button>
          ))}
        </div>
      </PropRow>
      <PropRow icon="calendar" label={L('Публикация', 'Publish date')}>
        <DateInput value={video.publishAt} onSave={(publishAt) => void save({ publishAt })} />
      </PropRow>
      <PropRow icon="hourglass" label={L('Дедлайн', 'Deadline')}>
        <span className="flex items-center gap-2 min-w-0">
          <DateInput value={video.deadline} onSave={(deadline) => void save({ deadline })} />
          {g && <Monster grade={g.grade} overdue={g.overdue} size={30} title={gradeName(g.grade)} />}
        </span>
      </PropRow>
      <PropRow icon="flag" label={L('Приоритет', 'Priority')}>
        <div className="flex flex-wrap gap-1">
          {PRIORITY().map((n, i) => (
            <button key={n} className={`tag !text-[12px] !py-1 ${video.priority === i ? '' : 'opacity-45'}`} style={{ color: PRIORITY_COLOR[i] }} onClick={() => void save({ priority: i })}>
              {n}
            </button>
          ))}
        </div>
      </PropRow>
      <PropRow icon="tag" label={L('Теги', 'Tags')}>
        <TagInput value={video.tags} onChange={(tags) => void save({ tags })} placeholder={L('добавить тег', 'add tag')} />
      </PropRow>
      <PropRow icon="list" label={L('Серия / плейлист', 'Series / playlist')}>
        <TextInput value={video.series} onSave={(s) => void save({ series: s })} list="vseries" />
        <datalist id="vseries">{series.map((s) => <option key={s} value={s} />)}</datalist>
      </PropRow>
      <PropRow icon="youtube" label="YouTube">
        <span className="flex items-center gap-1 min-w-0 w-full">
          <TextInput value={video.url} onSave={(url) => void save({ url })} placeholder="https://youtube.com/watch?v=…" type="url" />
          {video.url && (
            <a className="ibtn ibtn-sm shrink-0" href={video.url} target="_blank" rel="noopener noreferrer" aria-label={L('Открыть', 'Open')}>
              <Icon name="external" size={13} />
            </a>
          )}
        </span>
      </PropRow>
      <PropRow icon="check" label={L('Пайплайн', 'Pipeline')}>
        <div className="w-full">
          <div className="flex items-center gap-2">
            <Progress value={p} className="flex-1" height={5} />
            <span className="text-[12px] text-muted mono w-9 text-right">{p}%</span>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {video.pipeline.map((s) => (
              <button key={s.id} className={`chip !py-1 !text-[12px] ${s.done ? 'chip-on' : ''}`} role="checkbox" aria-checked={s.done} onClick={() => void save({ pipeline: video.pipeline.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)) })}>
                {s.done ? <Icon name="check" size={11} /> : <span className="w-[11px] h-[11px] rounded-full border border-current opacity-60" />} {s.label}
              </button>
            ))}
          </div>
        </div>
      </PropRow>
      <PropRow icon="skull" label={L('Сделать Curse', 'Make Curse')}>
        <div className="flex items-center gap-2 min-w-0">
          <Toggle on={!!video.curseId} onChange={(on) => void setVideoCurse(video.id, on)} />
          <span className="text-[12px] text-dim leading-tight">{video.curseId ? L('видео в разделе Curses, срок и выполнение синхронизируются', 'in Curses; deadline and completion stay in sync') : L('не попадает в общий раздел Curses', 'not shown in Curses')}</span>
        </div>
      </PropRow>
      {more && (
        <>
          <PropRow icon="clock" label={L('Длительность, мин', 'Duration, min')}>
            <NumInput value={video.durationMin} onSave={(durationMin) => void save({ durationMin })} />
          </PropRow>
          <PropRow icon="eye" label={L('Просмотры', 'Views')}>
            <NumInput
              value={video.views}
              onSave={(views) => void save({ views, viewsLog: views === undefined ? video.viewsLog : [...(video.viewsLog || []), { at: Date.now(), views }] })}
            />
          </PropRow>
          <PropRow icon="heart" label={L('Лайки', 'Likes')}>
            <NumInput value={video.likes} onSave={(likes) => void save({ likes })} />
          </PropRow>
          {props.map((pp) => {
            const x = video.props?.[pp.name];
            const setP = (v: string | number | boolean | undefined) => void save({ props: { ...video.props, [pp.name]: v } });
            return (
              <PropRow key={pp.id} icon={pp.type === 'checkbox' ? 'todo' : pp.type === 'number' ? 'chart' : pp.type === 'date' ? 'calendar' : pp.type === 'url' ? 'link' : pp.type === 'select' ? 'down' : 'type'} label={pp.name}>
                {pp.type === 'checkbox' ? (
                  <Toggle on={!!x} onChange={setP} />
                ) : pp.type === 'number' ? (
                  <NumInput value={typeof x === 'number' ? x : undefined} onSave={setP} />
                ) : pp.type === 'select' ? (
                  <select className="vprop-in" value={String(x ?? '')} onChange={(e) => setP(e.target.value || undefined)}>
                    <option value="">{L('Пусто', 'Empty')}</option>
                    {(pp.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : pp.type === 'date' ? (
                  <input className="vprop-in" type="date" value={String(x ?? '')} onChange={(e) => setP(e.target.value || undefined)} />
                ) : (
                  <TextInput value={String(x ?? '')} onSave={(v) => setP(v || undefined)} type={pp.type === 'url' ? 'url' : 'text'} />
                )}
              </PropRow>
            );
          })}
          <div className="text-[11.5px] text-dim px-2 py-1">
            {L('Создано', 'Created')} {fmt(video.createdAt, 'd MMM yyyy, HH:mm')} · {L('изменено', 'edited')} {fmt(video.updatedAt, 'd MMM, HH:mm')}
            {video.publishedAt ? ` · ${L('опубликовано', 'published')} ${fmt(video.publishedAt, 'd MMM yyyy')}` : ''}
          </div>
        </>
      )}
      <button className="text-[12.5px] text-dim hover:text-ink px-2 py-1.5 flex items-center gap-1" onClick={() => setMore((m) => !m)}>
        <Icon name={more ? 'up' : 'down'} size={12} /> {more ? L('Скрыть свойства', 'Hide properties') : L(`Ещё ${3 + props.length} свойств`, `${3 + props.length} more properties`)}
      </button>
    </div>
  );
}

function PageMenu({ video, onClose, onOpen }: { video: Video; onClose: () => void; onOpen: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const act = (f: () => unknown) => () => {
    setOpen(false);
    void f();
  };
  return (
    <>
      <IBtn icon="more" onClick={() => setOpen(true)} title={L('Действия', 'Actions')} className="ml-auto" />
      <Modal open={open} onClose={() => setOpen(false)} title={L('Страница', 'Page')}>
        <div className="grid gap-2">
          <Btn variant="ghost" icon="download" onClick={act(() => exportVideoMd(video))}>{L('Экспорт в Markdown', 'Export Markdown')}</Btn>
          <Btn variant="ghost" icon="download" onClick={act(() => exportVideoJson(video))}>{L('Экспорт в JSON', 'Export JSON')}</Btn>
          <Btn variant="ghost" icon="copy" onClick={act(async () => {
            const c = await duplicateVideo(video.id);
            if (c) onOpen(c.id);
          })}>{L('Дублировать', 'Duplicate')}</Btn>
          <Btn variant="ghost" icon="layers" onClick={act(async () => {
            const doc = await db.docs.get(video.id);
            const name = window.prompt(L('Название шаблона', 'Template name'), video.title || L('Мой шаблон', 'My template'));
            if (!name) return;
            const list = await getTemplates();
            await saveTemplates([...list, { id: uid(), name, blocks: cloneBlocks(doc?.blocks || []) }]);
            toast(L('Шаблон сохранён', 'Template saved'));
          })}>{L('Сохранить как шаблон', 'Save as template')}</Btn>
          <Btn variant="danger" icon="trash" onClick={act(async () => {
            if (!(await confirmBox(L(`Удалить «${video.title || 'видео'}»? Страница, идеи и заметки удалятся.`, `Delete “${video.title || 'video'}”? Page, ideas and notes will be deleted.`), { danger: true, okLabel: L('Удалить', 'Delete') }))) return;
            await deleteVideo(video.id);
            onClose();
          })}>{L('Удалить видео', 'Delete video')}</Btn>
        </div>
      </Modal>
    </>
  );
}

// ───── Ideas (внутри страницы) ─────
function IdeasBlock({ video }: { video: Video }) {
  const [text, setText] = useState('');
  const [kind, setKind] = useState<VIdea['kind']>('hook');
  const kinds = IDEA_KINDS();
  const save = (ideas: VIdea[]) => db.videos.get(video.id).then((v) => v && saveVideo({ ...v, ideas }));
  const list = useMemo(() => video.ideas.slice().sort((a, b) => Number(b.pinned) - Number(a.pinned) || Number(a.used) - Number(b.used) || b.createdAt - a.createdAt), [video.ideas]);
  const add = () => {
    const t = text.trim();
    if (!t) return;
    void save([...video.ideas, { id: uid(), text: t, kind, used: false, pinned: false, createdAt: Date.now() }]);
    setText('');
  };
  return (
    <div className="vblock" contentEditable={false}>
      <div className="flex items-center gap-2 mb-2">
        <Icon name="bulb" size={16} className="text-gold" />
        <span className="font-semibold">Ideas</span>
        <span className="text-[12px] text-dim">{video.ideas.filter((i) => !i.used).length}</span>
      </div>
      <div className="flex flex-wrap gap-1 mb-2">
        {kinds.map((k) => (
          <button key={k.v} className={`chip !py-0.5 !text-[11.5px] ${kind === k.v ? 'chip-on' : ''}`} onClick={() => setKind(k.v)}>{k.label}</button>
        ))}
      </div>
      <div className="flex gap-2">
        <input className="inp" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder={L('Быстрая идея и Enter', 'Quick idea + Enter')} aria-label={L('Новая идея', 'New idea')} />
        <Btn size="sm" icon="plus" onClick={add}>{L('Добавить', 'Add')}</Btn>
      </div>
      <div className="mt-2 space-y-1">
        {list.map((i) => (
          <div key={i.id} className="flex items-start gap-2 rounded-lg px-1.5 py-1 hover:bg-panel-2">
            <button className={`be-check !mt-1 ${i.used ? 'be-check-on' : ''}`} role="checkbox" aria-checked={i.used} aria-label={L('Использовано', 'Used')} onClick={() => void save(video.ideas.map((x) => (x.id === i.id ? { ...x, used: !x.used } : x)))}>
              {i.used && <Icon name="check" size={11} />}
            </button>
            <span className="tag !text-[10.5px] mt-1 shrink-0">{kinds.find((k) => k.v === i.kind)?.label}</span>
            <span className={`flex-1 min-w-0 text-[14px] break-words ${i.used ? 'line-through text-dim' : ''}`}>{i.text}</span>
            <button className={`ibtn ibtn-sm ${i.pinned ? 'text-acc' : 'text-dim'}`} aria-label={L('Закрепить', 'Pin')} onClick={() => void save(video.ideas.map((x) => (x.id === i.id ? { ...x, pinned: !x.pinned } : x)))}>
              <Icon name="pushpin" size={13} />
            </button>
            <button className="ibtn ibtn-sm text-dim" aria-label={L('Удалить', 'Delete')} onClick={() => void save(video.ideas.filter((x) => x.id !== i.id))}>
              <Icon name="x" size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ───── Notes (внутри страницы) ─────
function NotesBlock({ video }: { video: Video }) {
  const [text, setText] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [edit, setEdit] = useState<VNote | null>(null);
  const save = (notes: VNote[]) => db.videos.get(video.id).then((v) => v && saveVideo({ ...v, notes }));
  const list = useMemo(() => video.notes.slice().sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt), [video.notes]);
  const add = () => {
    const t = text.trim();
    if (!t) return;
    void save([...video.notes, { id: uid(), text: t, tags, pinned: false, createdAt: Date.now(), updatedAt: Date.now() }]);
    setText('');
    setTags([]);
  };
  return (
    <div className="vblock" contentEditable={false}>
      <div className="flex items-center gap-2 mb-2">
        <Icon name="note" size={16} className="text-acc" />
        <span className="font-semibold">Notes</span>
        <span className="text-[12px] text-dim">{video.notes.length}</span>
      </div>
      <textarea className="inp min-h-[64px]" value={text} onChange={(e) => setText(e.target.value)} placeholder={L('Заметка к видео… (Ctrl+Enter — сохранить)', 'Note… (Ctrl+Enter to save)')} onKeyDown={(e) => (e.ctrlKey || e.metaKey) && e.key === 'Enter' && add()} aria-label={L('Новая заметка', 'New note')} />
      <div className="flex flex-wrap items-center gap-2 mt-2">
        <div className="flex-1 min-w-[160px]"><TagInput value={tags} onChange={setTags} placeholder={L('теги', 'tags')} /></div>
        <Btn size="sm" icon="plus" onClick={add}>{L('Заметка', 'Note')}</Btn>
      </div>
      <div className="mt-3 space-y-2">
        {list.map((n) => (
          <div key={n.id} className="rounded-xl bg-panel-2 px-3 py-2">
            <div className="flex items-center gap-2 text-[11.5px] text-dim">
              {n.pinned && <Icon name="pushpin" size={11} className="text-acc" />}
              <span>{fmt(n.createdAt, 'd MMM yyyy, HH:mm')}</span>
              {n.tags.map((t) => <span key={t} className="tag !text-[10.5px]">#{t}</span>)}
              <span className="ml-auto flex gap-0.5">
                <button className="ibtn ibtn-sm" aria-label={L('Закрепить', 'Pin')} onClick={() => void save(video.notes.map((x) => (x.id === n.id ? { ...x, pinned: !x.pinned } : x)))}><Icon name="pushpin" size={12} /></button>
                <button className="ibtn ibtn-sm" aria-label={L('Изменить', 'Edit')} onClick={() => setEdit(n)}><Icon name="edit" size={12} /></button>
                <button className="ibtn ibtn-sm" aria-label={L('Удалить', 'Delete')} onClick={() => void save(video.notes.filter((x) => x.id !== n.id))}><Icon name="trash" size={12} /></button>
              </span>
            </div>
            <div className="text-[14px] whitespace-pre-wrap break-words mt-1">{n.text}</div>
          </div>
        ))}
      </div>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={L('Заметка', 'Note')} footer={edit && <Btn onClick={() => {
        void save(video.notes.map((x) => (x.id === edit.id ? { ...edit, updatedAt: Date.now() } : x)));
        setEdit(null);
      }}>{L('Сохранить', 'Save')}</Btn>}>
        {edit && (
          <div className="space-y-3">
            <textarea className="inp min-h-[140px]" value={edit.text} onChange={(e) => setEdit({ ...edit, text: e.target.value })} />
            <TagInput value={edit.tags} onChange={(t) => setEdit({ ...edit, tags: t })} />
          </div>
        )}
      </Modal>
    </div>
  );
}
