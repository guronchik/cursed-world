// YouTube Technique как база Notion: пять видов, поиск, фильтры, Idea Inbox, статистика, шаблоны, свои свойства, экспорт.
import { useEffect, useMemo, useRef, useState } from 'react';
import { BlockEditor } from '../../../components/BlockEditor';
import { Icon } from '../../../components/Icon';
import { Btn, Empty, Field, IBtn, Modal, Panel, Seg, Stat } from '../../../components/ui';
import { db, type PageTemplate, type Technique, type Video, type VideoProp, type VideoStatus } from '../../../db/schema';
import { ManageColumnsSheet } from '../../../components/columns';
import { useVideoStatuses, videoColumnStore } from '../../../lib/statuses';
import { cloneBlocks, defaultVideoTemplate } from '../../../lib/blocks';
import { fmt } from '../../../lib/dates';
import { confirmBox } from '../../../lib/fx';
import { useLive, useMedia } from '../../../lib/hooks';
import { go, useRoute } from '../../../lib/router';
import { L, uid } from '../../../lib/runtime';
import { addInboxIdea, createVideo, DEFAULT_TEMPLATE_KEY, defaultTemplateId, exportAllJson, exportAllMd, getTemplates, ideaToVideo, PROPS_KEY, saveProps, saveTemplates, TEMPLATES_KEY, videoStats } from '../../../lib/videos';
import { BoardView, CalendarView, GalleryView, TableView, WeekView } from './views';
import { VideoPage } from './VideoPage';

type View = 'board' | 'table' | 'week' | 'calendar' | 'gallery';
const VIEWS = (): { v: View; label: string; icon: string }[] => [
  { v: 'board', label: 'Board', icon: 'board' },
  { v: 'table', label: 'Table', icon: 'table' },
  { v: 'week', label: 'Week', icon: 'columns' },
  { v: 'calendar', label: 'Calendar', icon: 'calendar' },
  { v: 'gallery', label: 'Gallery', icon: 'gallery' },
];

export function YouTubeTechnique({ tech }: { tech: Technique }) {
  const { parts, query } = useRoute();
  const videos = useLive(() => db.videos.toArray(), []);
  const docs = useLive(async () => new Map((await db.docs.toArray()).map((d) => [d.id, d.text.toLowerCase()])), []);
  const propsKv = useLive(() => db.kv.get(PROPS_KEY), []);
  const props = (Array.isArray(propsKv?.value) ? propsKv.value : []) as VideoProp[];
  const pushed = useRef(0);
  const view = (VIEWS().some((x) => x.v === query.get('yv')) ? query.get('yv') : 'board') as View;
  const openId = query.get('v');
  const [q, setQ] = useState('');
  const [fStatus, setFStatus] = useState<string[]>([]);
  const cols = useVideoStatuses() || [];
  const [fFormat, setFFormat] = useState<'all' | 'long' | 'short'>('all');
  const [fTag, setFTag] = useState('');
  const [group, setGroup] = useState<'none' | 'status' | 'format' | 'series' | 'tag'>('none');
  const [sheet, setSheet] = useState<'templates' | 'props' | 'export' | 'columns' | 'settings' | null>(null);
  const mobile = useMedia('(max-width: 639px)');

  const path = `/${parts.join('/')}`;
  const nav = (patch: Record<string, string | null>, push = false) => {
    const qs = new URLSearchParams(query.toString());
    for (const [k, v] of Object.entries(patch)) (v === null ? qs.delete(k) : qs.set(k, v));
    go(`${path}?${qs.toString()}`, !push);
  };
  // открытие из базы добавляет одну запись в историю (кнопка «Назад» на телефоне закрывает страницу),
  // переходы между страницами по ссылкам заменяют её
  useEffect(() => {
    if (!openId) pushed.current = 0;
  }, [openId]);
  const open = (id: string) => {
    if (openId) return nav({ v: id });
    pushed.current = 1;
    nav({ v: id }, true);
  };
  const close = () => {
    if (pushed.current) {
      pushed.current = 0;
      history.back();
    } else nav({ v: null });
  };
  const create = async (p: Partial<Video>) => {
    const v = await createVideo(p);
    open(v.id);
  };

  const allTags = useMemo(() => [...new Set((videos || []).flatMap((v) => v.tags))].sort(), [videos]);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (videos || []).filter(
      (v) =>
        (!fStatus.length || fStatus.includes(cols.some((c) => c.id === v.statusId) ? v.statusId : '__none')) &&
        (fFormat === 'all' || v.format === fFormat) &&
        (!fTag || v.tags.includes(fTag)) &&
        (!s || v.title.toLowerCase().includes(s) || v.tags.some((t) => t.toLowerCase().includes(s)) || v.series.toLowerCase().includes(s) || (docs?.get(v.id) || '').includes(s)),
    );
  }, [videos, q, fStatus, fFormat, fTag, docs, cols]);

  if (!videos) return null;
  const vp = { videos: filtered, cols, open, create, props, onManage: () => setSheet('columns') };
  const noStatus = videos.filter((v) => !cols.some((c) => c.id === v.statusId)).length;
  const filtersOn = fStatus.length > 0 || fFormat !== 'all' || !!fTag;

  return (
    <div className="space-y-4">
      <Panel bodyClass="p-3 sm:p-4" accent={tech.color}>
        <div className="flex items-center gap-2">
          <div className="seg shrink-0" role="radiogroup" aria-label={L('Вид', 'View')}>
            {VIEWS().map((x) => (
              <button key={x.v} role="radio" aria-checked={view === x.v} aria-label={x.label} className={`seg-btn ${view === x.v ? 'seg-on' : ''}`} onClick={() => nav({ yv: x.v === 'board' ? null : x.v })} title={x.label}>
                <Icon name={x.icon} size={14} /> {!mobile && x.label}
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-0 hidden sm:block">
            <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dim" />
            <input className="inp !pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={L('Поиск по названию и содержимому', 'Search titles and content')} aria-label={L('Поиск видео', 'Search videos')} />
          </div>
          <Btn size="sm" icon="plus" className="ml-auto sm:ml-0" onClick={() => void create({})}>New</Btn>
          <span className="hidden sm:contents">
            <IBtn icon="layers" title={L('Шаблоны страниц', 'Page templates')} onClick={() => setSheet('templates')} />
            <IBtn icon="sliders" title={L('Колонки и свойства', 'Columns & properties')} onClick={() => setSheet('settings')} />
            <IBtn icon="download" title={L('Экспорт', 'Export')} onClick={() => setSheet('export')} />
          </span>
        </div>
        <div className="flex items-center gap-1 mt-2 sm:hidden">
          <div className="relative flex-1 min-w-0">
            <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dim" />
            <input className="inp !pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={L('Поиск', 'Search')} aria-label={L('Поиск видео', 'Search videos')} />
          </div>
          <IBtn icon="layers" title={L('Шаблоны страниц', 'Page templates')} onClick={() => setSheet('templates')} />
          <IBtn icon="sliders" title={L('Колонки и свойства', 'Columns & properties')} onClick={() => setSheet('settings')} />
          <IBtn icon="download" title={L('Экспорт', 'Export')} onClick={() => setSheet('export')} />
        </div>
        <div className="flex items-center gap-1.5 mt-3 overflow-x-auto sm:flex-wrap pb-0.5 -mx-1 px-1 [&>*]:shrink-0">
          {[...cols, ...(noStatus ? [{ id: '__none', name: L('Без статуса', 'No status'), color: '#8e8e93' } as VideoStatus] : [])].map((c) => (
            <button key={c.id} className={`chip !py-1 !text-[12px] ${fStatus.includes(c.id) ? 'chip-on' : ''}`} onClick={() => setFStatus((f) => (f.includes(c.id) ? f.filter((x) => x !== c.id) : [...f, c.id]))}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.color }} /> {c.name} <span className="text-dim">{c.id === '__none' ? noStatus : videos.filter((v) => v.statusId === c.id).length}</span>
            </button>
          ))}
          <select className="inp !w-auto !py-1 !text-[12.5px]" value={fFormat} onChange={(e) => setFFormat(e.target.value as typeof fFormat)} aria-label={L('Формат', 'Format')}>
            <option value="all">{L('Все форматы', 'All formats')}</option>
            <option value="long">Long</option>
            <option value="short">Short</option>
          </select>
          {allTags.length > 0 && (
            <select className="inp !w-auto !py-1 !text-[12.5px]" value={fTag} onChange={(e) => setFTag(e.target.value)} aria-label={L('Тег', 'Tag')}>
              <option value="">{L('Все теги', 'All tags')}</option>
              {allTags.map((t) => <option key={t} value={t}>#{t}</option>)}
            </select>
          )}
          {view === 'table' && (
            <select className="inp !w-auto !py-1 !text-[12.5px]" value={group} onChange={(e) => setGroup(e.target.value as typeof group)} aria-label={L('Группировка', 'Group by')}>
              <option value="none">{L('Без группировки', 'No grouping')}</option>
              <option value="status">{L('По статусу', 'By status')}</option>
              <option value="format">{L('По формату', 'By format')}</option>
              <option value="series">{L('По серии', 'By series')}</option>
              <option value="tag">{L('По тегу', 'By tag')}</option>
            </select>
          )}
          {filtersOn && (
            <button className="chip !py-1 !text-[12px]" onClick={() => { setFStatus([]); setFFormat('all'); setFTag(''); }}>
              <Icon name="x" size={11} /> {L('Сбросить', 'Reset')}
            </button>
          )}
        </div>
      </Panel>

      {videos.length === 0 && !q ? (
        <Empty icon="youtube" text={L('Пока нет видео. Создай первое или превращай идеи из Inbox.', 'No videos yet. Create one or convert ideas from the Inbox.')} action={<Btn icon="plus" onClick={() => void create({})}>{L('Новое видео', 'New video')}</Btn>} />
      ) : view === 'board' ? (
        <BoardView {...vp} />
      ) : view === 'table' ? (
        <Panel bodyClass="p-0"><TableView {...vp} group={group} /></Panel>
      ) : view === 'week' ? (
        <WeekView {...vp} />
      ) : view === 'calendar' ? (
        <CalendarView {...vp} />
      ) : (
        <GalleryView {...vp} />
      )}

      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <IdeaInbox onOpen={open} />
        <VideoStats videos={videos} cols={cols} />
      </div>

      {openId && <VideoPage id={openId} onClose={close} onOpen={open} props={props} />}
      <TemplatesSheet open={sheet === 'templates'} onClose={() => setSheet(null)} />
      <PropsSheet open={sheet === 'props'} onClose={() => setSheet(null)} props={props} />
      <ManageColumnsSheet store={videoColumnStore} open={sheet === 'columns'} onClose={() => setSheet(null)} />
      <Modal open={sheet === 'settings'} onClose={() => setSheet(null)} title={L('Настройки базы', 'Database settings')}>
        <div className="grid gap-2">
          <Btn variant="ghost" icon="columns" onClick={() => setSheet('columns')}>{L('Колонки', 'Columns')}</Btn>
          <Btn variant="ghost" icon="sliders" onClick={() => setSheet('props')}>{L('Свои свойства', 'Custom properties')}</Btn>
          <Btn variant="ghost" icon="layers" onClick={() => setSheet('templates')}>{L('Шаблоны страниц', 'Page templates')}</Btn>
        </div>
      </Modal>
      <Modal open={sheet === 'export'} onClose={() => setSheet(null)} title={L('Экспорт базы', 'Export database')}>
        <div className="grid gap-2">
          <Btn variant="ghost" icon="download" onClick={() => void exportAllMd()}>{L('Все видео в Markdown (.md)', 'All videos as Markdown (.md)')}</Btn>
          <Btn variant="ghost" icon="download" onClick={() => void exportAllJson()}>{L('Вся база в JSON (видео, страницы, идеи, шаблоны)', 'Whole database as JSON')}</Btn>
          <p className="text-[12px] text-dim">{L('Отдельное видео экспортируется из меню «⋯» на его странице. Полная копия всех данных — Settings → Export JSON.', 'A single video exports from the “⋯” menu on its page. Full backup of everything — Settings → Export JSON.')}</p>
        </div>
      </Modal>
    </div>
  );
}

// ───── Idea Inbox ─────
function IdeaInbox({ onOpen }: { onOpen: (id: string) => void }) {
  const ideas = useLive(() => db.ideas.orderBy('createdAt').reverse().toArray(), []) || [];
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [showNote, setShowNote] = useState(false);
  const [done, setDone] = useState(false);
  const inbox = ideas.filter((i) => !i.videoId);
  const converted = ideas.filter((i) => i.videoId);
  const add = async () => {
    if (!title.trim()) return;
    await addInboxIdea(title, note);
    setTitle('');
    setNote('');
    setShowNote(false);
  };
  return (
    <Panel title="Idea Inbox" kanji="案" actions={<span className="text-[12px] text-dim">{inbox.length}</span>}>
      <div className="flex gap-2">
        <input className="inp" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && void add()} placeholder={L('Идея видео — Enter', 'Video idea — Enter')} aria-label={L('Новая идея видео', 'New video idea')} />
        <IBtn icon="note" title={L('Добавить заметку', 'Add a note')} active={showNote} onClick={() => setShowNote((s) => !s)} />
        <Btn size="sm" icon="plus" onClick={() => void add()}>{L('В Inbox', 'Add')}</Btn>
      </div>
      {showNote && <textarea className="inp mt-2 min-h-[70px]" value={note} onChange={(e) => setNote(e.target.value)} placeholder={L('Заметка: о чём, хук, референсы…', 'Note: what about, hook, references…')} />}
      <div className="mt-3 space-y-1.5">
        {inbox.length === 0 && <div className="text-[13px] text-dim px-1">{L('Inbox пуст. Записывай идеи за пару секунд — разберёшь потом.', 'Inbox is empty. Capture ideas in seconds, sort them later.')}</div>}
        {inbox.map((i) => (
          <div key={i.id} className="flex items-start gap-2 rounded-xl bg-panel-2 px-3 py-2">
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-medium break-words">{i.title}</div>
              {i.note && <div className="text-[12.5px] text-muted whitespace-pre-wrap break-words mt-0.5">{i.note}</div>}
              <div className="text-[11px] text-dim mt-0.5">{fmt(i.createdAt, 'd MMM, HH:mm')}</div>
            </div>
            <Btn size="xs" icon="arrowright" onClick={async () => onOpen((await ideaToVideo(i)).id)}>{L('В видео', 'To video')}</Btn>
            <IBtn icon="trash" size={14} title={L('Удалить', 'Delete')} onClick={() => void db.ideas.delete(i.id)} />
          </div>
        ))}
      </div>
      {converted.length > 0 && (
        <button className="text-[12px] text-dim mt-2 px-1" onClick={() => setDone((d) => !d)}>
          {done ? L('Скрыть', 'Hide') : L('Показать', 'Show')} {L('превращённые', 'converted')} ({converted.length})
        </button>
      )}
      {done && (
        <div className="mt-1 space-y-1">
          {converted.map((i) => (
            <button key={i.id} className="flex items-center gap-2 w-full text-left text-[13px] text-muted px-2 py-1 rounded-lg hover:bg-panel-2" onClick={() => onOpen(i.videoId!)}>
              <Icon name="check" size={12} className="text-jade" /> <span className="truncate">{i.title}</span>
            </button>
          ))}
        </div>
      )}
    </Panel>
  );
}

// ───── статистика ─────
function VideoStats({ videos, cols }: { videos: Video[]; cols: VideoStatus[] }) {
  const st = useMemo(() => videoStats(videos, cols), [videos, cols]);
  const max = Math.max(1, ...Object.values(st.byStatus));
  const pts = st.series;
  const maxV = Math.max(1, ...pts.map((p) => p.views));
  const W = 320;
  const H = 90;
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${pts.length === 1 ? W / 2 : (i / (pts.length - 1)) * W},${H - (p.views / maxV) * (H - 8) - 4}`).join(' ');
  return (
    <Panel title={L('Статистика', 'Stats')} kanji="統">
      <div className="grid grid-cols-3 gap-3">
        <Stat label={L('Опубликовано за месяц', 'Published this month')} value={st.publishedMonth} />
        <Stat label={L('Идея → публикация', 'Idea → publish')} value={st.avgDays === null ? '—' : `${st.avgDays} ${L('дн', 'd')}`} />
        <Stat label={L('Просмотры', 'Views')} value={st.views.toLocaleString()} sub={`${st.likes.toLocaleString()} ${L('лайков', 'likes')}`} />
      </div>
      <div className="mt-4 space-y-1.5">
        {cols.map((c) => (
          <div key={c.id} className="flex items-center gap-2 text-[12.5px]">
            <span className="w-28 truncate text-muted">{c.name}</span>
            <span className="flex-1 h-2 rounded-full bg-panel-2 overflow-hidden">
              <span className="block h-full rounded-full" style={{ width: `${((st.byStatus[c.id] || 0) / max) * 100}%`, background: c.color }} />
            </span>
            <span className="w-6 text-right mono">{st.byStatus[c.id] || 0}</span>
          </div>
        ))}
      </div>
      <div className="mt-4">
        <div className="label mb-1 ml-1">{L('Просмотры (по введённым данным)', 'Views (from your entries)')}</div>
        {pts.length ? (
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[90px]" preserveAspectRatio="none" role="img" aria-label={L('График просмотров', 'Views chart')}>
            <path d={`${path} L${pts.length === 1 ? W / 2 : W},${H} L${pts.length === 1 ? W / 2 : 0},${H} Z`} fill="color-mix(in srgb, var(--accent-1) 18%, transparent)" />
            <path d={path} fill="none" stroke="var(--accent-1)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          </svg>
        ) : (
          <div className="text-[12.5px] text-dim px-1">{L('Введи просмотры на странице опубликованного видео — здесь появится график.', 'Enter views on a published video page to see the chart.')}</div>
        )}
        {pts.length > 0 && (
          <div className="flex justify-between text-[10.5px] text-dim mono mt-0.5">
            <span>{pts[0].day}</span>
            <span>{pts[pts.length - 1].views.toLocaleString()}</span>
          </div>
        )}
      </div>
    </Panel>
  );
}

// ───── шаблоны ─────
function TemplatesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const kv = useLive(() => db.kv.get(TEMPLATES_KEY), []);
  const defKv = useLive(() => db.kv.get(DEFAULT_TEMPLATE_KEY), []);
  const list = useLive(() => getTemplates(), [kv]) || [];
  const def = useLive(() => defaultTemplateId(), [defKv]) || 'default';
  const [edit, setEdit] = useState<PageTemplate | null>(null);
  const save = async (t: PageTemplate) => {
    const has = list.some((x) => x.id === t.id);
    await saveTemplates(has ? list.map((x) => (x.id === t.id ? t : x)) : [...list, t]);
  };
  return (
    <>
      <Modal open={open && !edit} onClose={onClose} title={L('Шаблоны страниц', 'Page templates')}>
        <div className="space-y-2">
          {list.map((t) => (
            <div key={t.id} className="flex items-center gap-2 rounded-xl bg-panel-2 px-3 py-2">
              <Icon name="file" size={15} className="text-dim" />
              <span className="flex-1 min-w-0 truncate text-[14px]">{t.name}</span>
              {def === t.id ? <span className="tag !text-[11px] text-acc">{L('по умолчанию', 'default')}</span> : (
                <button className="chip !py-0.5 !text-[11.5px]" onClick={() => void db.kv.put({ key: DEFAULT_TEMPLATE_KEY, value: t.id })}>{L('Сделать основным', 'Make default')}</button>
              )}
              <IBtn icon="edit" size={14} title={L('Изменить', 'Edit')} onClick={() => setEdit({ ...t, blocks: cloneBlocks(t.blocks) })} />
              {list.length > 1 && (
                <IBtn icon="trash" size={14} title={L('Удалить', 'Delete')} onClick={async () => {
                  if (!(await confirmBox(L(`Удалить шаблон «${t.name}»?`, `Delete template “${t.name}”?`), { danger: true }))) return;
                  await saveTemplates(list.filter((x) => x.id !== t.id));
                  if (def === t.id) await db.kv.put({ key: DEFAULT_TEMPLATE_KEY, value: list.find((x) => x.id !== t.id)!.id });
                }} />
              )}
            </div>
          ))}
          <div className="flex flex-wrap gap-2 pt-1">
            <Btn size="sm" icon="plus" onClick={() => setEdit({ id: uid(), name: L('Новый шаблон', 'New template'), blocks: cloneBlocks(defaultVideoTemplate()) })}>{L('Новый шаблон', 'New template')}</Btn>
            <Btn size="sm" variant="ghost" icon="refresh" onClick={async () => {
              if (!(await confirmBox(L('Вернуть встроенный шаблон «Видео (стандарт)»?', 'Restore the built-in template?')))) return;
              await saveTemplates([{ id: 'default', name: L('Видео (стандарт)', 'Video (standard)'), blocks: defaultVideoTemplate() }, ...list.filter((x) => x.id !== 'default')]);
            }}>{L('Встроенный шаблон', 'Built-in template')}</Btn>
          </div>
          <p className="text-[12px] text-dim">{L('Новое видео создаётся из шаблона по умолчанию. Свой шаблон можно сделать и из любой страницы: «⋯» → «Сохранить как шаблон».', 'New videos use the default template. You can also save any page as a template: “⋯” → “Save as template”.')}</p>
        </div>
      </Modal>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={L('Шаблон', 'Template')} wide="xl" footer={edit && (
        <Btn onClick={async () => {
          await save(edit);
          setEdit(null);
        }}>{L('Сохранить', 'Save')}</Btn>
      )}>
        {edit && (
          <div className="space-y-3">
            <Field label={L('Название', 'Name')}>
              <input className="inp" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            </Field>
            <div className="rounded-2xl bg-panel-2 p-3 sm:pl-14">
              <BlockEditor key={edit.id} value={edit.blocks} onChange={(blocks) => setEdit((e) => (e ? { ...e, blocks } : e))} renderSpecial={(b) => <div className="vblock text-[13px] text-muted">{b.type === 'ideas' ? 'Ideas' : 'Notes'} — {L('блок появится на странице видео', 'appears on the video page')}</div>} />
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

// ───── свои свойства ─────
function PropsSheet({ open, onClose, props }: { open: boolean; onClose: () => void; props: VideoProp[] }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<VideoProp['type']>('text');
  const [options, setOptions] = useState('');
  const TYPES: { v: VideoProp['type']; label: string }[] = [
    { v: 'text', label: L('Текст', 'Text') },
    { v: 'number', label: L('Число', 'Number') },
    { v: 'select', label: L('Выбор', 'Select') },
    { v: 'checkbox', label: L('Флажок', 'Checkbox') },
    { v: 'date', label: L('Дата', 'Date') },
    { v: 'url', label: 'URL' },
  ];
  const add = async () => {
    const n = name.trim();
    if (!n || props.some((p) => p.name === n)) return;
    await saveProps([...props, { id: uid(), name: n, type, options: type === 'select' ? options.split(',').map((x) => x.trim()).filter(Boolean) : undefined }]);
    setName('');
    setOptions('');
  };
  return (
    <Modal open={open} onClose={onClose} title={L('Свои свойства видео', 'Custom video properties')}>
      <div className="space-y-3">
        {props.length === 0 && <p className="text-[13px] text-dim">{L('Например: «Спонсор», «Камера», «Ссылка на сценарий».', 'E.g. “Sponsor”, “Camera”, “Script link”.')}</p>}
        {props.map((p) => (
          <div key={p.id} className="flex items-center gap-2 rounded-xl bg-panel-2 px-3 py-2">
            <span className="flex-1 min-w-0 truncate text-[14px]">{p.name}</span>
            <span className="tag !text-[11px]">{TYPES.find((t) => t.v === p.type)?.label}</span>
            {p.options?.length ? <span className="text-[11.5px] text-dim truncate max-w-[120px]">{p.options.join(', ')}</span> : null}
            <IBtn icon="trash" size={14} title={L('Удалить свойство', 'Delete property')} onClick={async () => {
              if (await confirmBox(L(`Удалить свойство «${p.name}»? Значения у видео останутся в экспорте JSON.`, `Delete property “${p.name}”?`), { danger: true })) await saveProps(props.filter((x) => x.id !== p.id));
            }} />
          </div>
        ))}
        <div className="grid gap-2 pt-2">
          <input className="inp" value={name} onChange={(e) => setName(e.target.value)} placeholder={L('Название свойства', 'Property name')} />
          <Seg options={TYPES} value={type} onChange={setType} />
          {type === 'select' && <input className="inp" value={options} onChange={(e) => setOptions(e.target.value)} placeholder={L('Варианты через запятую', 'Options, comma-separated')} />}
          <Btn icon="plus" onClick={() => void add()}>{L('Добавить свойство', 'Add property')}</Btn>
        </div>
      </div>
    </Modal>
  );
}
