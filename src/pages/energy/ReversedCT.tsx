// Reversed Cursed Technique — идеи и сохранёнки: быстрый ввод, папки, ссылки с превью, теги, избранное, «посмотрел/сделал».
import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { openDesk } from '../../components/DeskCard';
import { TiltGallery } from '../../components/TiltGallery';
import { Icon } from '../../components/Icon';
import { Btn, ColorPick, Empty, Field, IBtn, Modal, Panel, Seg, TagInput, Toggle } from '../../components/ui';
import { db, type Folder, type SaveItem } from '../../db/schema';
import { quickSave } from '../../lib/actions';
import { fmt } from '../../lib/dates';
import { confirmBox, toast } from '../../lib/fx';
import { useLive } from '../../lib/hooks';
import { faviconOf, fetchPreview, hostOf } from '../../lib/links';
import { setQuery, useRoute } from '../../lib/router';
import { L, uid } from '../../lib/runtime';

type Scope = 'all' | 'inbox' | 'fav' | string;

const FOLDER_ICONS = ['folder', 'film', 'book', 'utensils', 'video', 'bulb', 'music', 'heart', 'star', 'camera', 'dumbbell', 'grad', 'link', 'tag', 'sparkle', 'flame', 'globe', 'note'];

export function ReversedCT() {
  const { query } = useRoute();
  const folders = useLive(() => db.folders.orderBy('order').toArray(), []) || [];
  const saves = useLive(() => db.saves.toArray(), []) || [];
  const [scope, setScope] = useState<Scope>('all');
  const [q, setQ] = useState('');
  const [tag, setTag] = useState('');
  const [hideDone, setHideDone] = useState(false);
  const [quick, setQuick] = useState('');
  const [editF, setEditF] = useState<Folder | null>(null);
  const [mode, setMode] = useState<'list' | 'folders'>('list');
  const openId = query.get('item');
  const opened = saves.find((s) => s.id === openId) || null;

  const inScope = saves.filter((s) => (scope === 'all' ? true : scope === 'inbox' ? !s.folderId : scope === 'fav' ? s.favorite : s.folderId === scope));
  const tags = Array.from(new Set(inScope.flatMap((s) => s.tags))).sort();
  const qq = q.trim().toLowerCase();
  const list = inScope
    .filter((s) => (!tag || s.tags.includes(tag)) && (!hideDone || !s.done) && (!qq || [s.title, s.text, s.url, s.tags.join(' ')].some((x) => x?.toLowerCase().includes(qq))))
    .sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.createdAt - a.createdAt);
  const count = (sc: Scope) => saves.filter((s) => (sc === 'all' ? true : sc === 'inbox' ? !s.folderId : sc === 'fav' ? s.favorite : s.folderId === sc)).length;
  const scopeBtn = (sc: Scope, icon: string, label: string, color?: string) => (
    <button key={sc} className={`w-full flex items-center gap-2 px-2 py-2 text-left text-sm ${scope === sc ? 'bg-cursed/15 text-white' : 'text-muted hover:text-ink hover:bg-cursed/5'}`} onClick={() => setScope(sc)}>
      <span className="w-5 grid place-items-center" style={color ? { color } : undefined}>
        <Icon name={icon} size={15} />
      </span>
      <span className="flex-1 truncate">{label}</span>
      <span className="mono text-[11px] text-dim">{count(sc)}</span>
    </button>
  );

  return (
    <div className="space-y-4">
      <Panel kanji="反転" title={L('Быстрый ввод «с головы»', 'Brain dump')} bodyClass="px-4 pb-4 pt-1">
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!quick.trim()) return;
            await quickSave(quick, scope !== 'all' && scope !== 'inbox' && scope !== 'fav' ? scope : undefined);
            setQuick('');
          }}
        >
          <input className="inp text-base" autoFocus value={quick} onChange={(e) => setQuick(e.target.value)} placeholder={L('Вставь ссылку или напиши мысль… #теги → Enter', 'Paste a link or type a thought… #tags → Enter')} />
          <Btn type="submit" icon="plus">
            <span className="hidden sm:inline">{L('Сохранить', 'Save')}</span>
          </Btn>
        </form>
      </Panel>

      <Seg
        options={[
          { v: 'list' as const, label: L('Сохранённое', 'Saved') },
          { v: 'folders' as const, label: L('Папки — галерея', 'Folders — gallery') },
        ]}
        value={mode}
        onChange={setMode}
      />
      {mode === 'folders' && (
        <TiltGallery
          items={folders}
          label={L('Папки', 'Folders')}
          getId={(f) => f.id}
          getTitle={(f) => f.name}
          getSubtitle={(f) => `${count(f.id)} ${L('записей', 'items')}`}
          getColor={(f) => f.color}
          getImage={(f) => (
            <div className="absolute inset-0 grid place-items-center text-white" style={{ background: `linear-gradient(150deg, color-mix(in srgb, ${f.color} 70%, #000), #0b0b10)` }}>
              <Icon name={f.icon} size={72} />
            </div>
          )}
          renderMeta={(f) => (
            <div className="space-y-2">
              <div className="mono text-[28px] font-bold">{count(f.id)}</div>
              {saves
                .filter((x) => x.folderId === f.id)
                .slice(0, 3)
                .map((x) => (
                  <div key={x.id} className="text-[13px] text-muted truncate">· {x.title}</div>
                ))}
            </div>
          )}
          onOpen={(f) => {
            setScope(f.id);
            setMode('list');
          }}
        />
      )}

      <div className={`grid gap-4 lg:grid-cols-[240px_1fr] items-start ${mode === 'folders' ? 'hidden' : ''}`}>
        <Panel title={L('Папки', 'Folders')} kanji="箱" bodyClass="p-2" actions={<IBtn icon="plus" size={16} onClick={() => setEditF({ id: uid(), name: '', icon: 'folder', color: '#7c5cff', order: folders.length })} title={L('Новая папка', 'New folder')} />}>
          <div className="flex lg:block gap-1 scroll-x no-scrollbar">
            <div className="contents lg:block">
              {scopeBtn('all', 'layers', L('Всё', 'All'))}
              {scopeBtn('inbox', 'inbox', L('Входящие', 'Inbox'))}
              {scopeBtn('fav', 'star', L('Избранное', 'Favorites'), '#f2c14e')}
            </div>
            <div className="hidden lg:block divider-glow my-2" />
            {folders.map((f) => (
              <div key={f.id} className="group relative min-w-[9rem] lg:min-w-0">
                {scopeBtn(f.id, f.icon, f.name, f.color)}
                <button className="absolute right-8 top-2 opacity-0 group-hover:opacity-100 text-dim hover:text-ink" onClick={() => setEditF(f)} aria-label="edit">
                  <Icon name="edit" size={12} />
                </button>
              </div>
            ))}
          </div>
        </Panel>

        <div className="space-y-3 min-w-0">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative w-full sm:w-64">
              <Icon name="search" size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dim" />
              <input className="inp !pl-8 !py-1.5" value={q} onChange={(e) => setQ(e.target.value)} placeholder={L('Поиск', 'Search')} />
            </div>
            <Toggle on={hideDone} onChange={setHideDone} label={<span className="text-xs text-muted">{L('скрыть «сделано»', 'hide done')}</span>} />
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              <button className={`chip !text-[11px] ${!tag ? 'chip-on' : ''}`} onClick={() => setTag('')}>
                #{L('все', 'all')}
              </button>
              {tags.map((t) => (
                <button key={t} className={`chip !text-[11px] ${tag === t ? 'chip-on' : ''}`} onClick={() => setTag(tag === t ? '' : t)}>
                  #{t}
                </button>
              ))}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <AnimatePresence initial={false}>
              {list.map((s) => (
                <SaveCard key={s.id} s={s} folder={folders.find((f) => f.id === s.folderId)} />
              ))}
            </AnimatePresence>
          </div>
          {!list.length && (
            <Panel>
              <Empty text={L('Пусто. Закинь сюда мысль, ссылку или идею.', 'Empty. Drop a thought, link or idea here.')} icon="sparkle" />
            </Panel>
          )}
        </div>
      </div>

      {opened && <SaveEditor key={opened.id} s={opened} folders={folders} onClose={() => setQuery('item')} />}
      {editF && <FolderEditor f={editF} exists={folders.some((x) => x.id === editF.id)} onClose={() => setEditF(null)} onDeleted={() => setScope('all')} />}
    </div>
  );
}

function SaveCard({ s, folder }: { s: SaveItem; folder?: Folder }) {
  const [imgOk, setImgOk] = useState(true);
  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className={`panel panel-flat overflow-hidden flex flex-col ${s.done ? 'opacity-60' : ''}`}>
      {s.preview?.image && imgOk && (
        <button className="block aspect-[1.9] bg-void overflow-hidden" onClick={() => setQuery('item', s.id)}>
          <img src={s.preview.image} alt="" className="w-full h-full object-cover" loading="lazy" onError={() => setImgOk(false)} referrerPolicy="no-referrer" />
        </button>
      )}
      <div className="p-3 flex-1 flex flex-col">
        <div className="flex items-start gap-2">
          {s.kind === 'link' ? <img src={faviconOf(s.url)} alt="" className="w-4 h-4 mt-0.5 shrink-0" loading="lazy" onError={(e) => ((e.currentTarget.style.display = 'none'))} /> : <Icon name="sparkle" size={14} className="text-acc mt-0.5 shrink-0" />}
          <button className={`text-left text-sm leading-snug flex-1 hover:text-acc ${s.done ? 'line-through' : ''}`} data-cursor="Open" onClick={(e) => openSavePreview(s, folder, e.currentTarget)}>
            {s.title}
          </button>
        </div>
        {s.kind === 'link' && <div className="text-[11px] text-dim mt-1 truncate">{s.preview?.site || hostOf(s.url)}</div>}
        {s.text && <p className="text-[12.5px] text-muted mt-1.5 line-clamp-3 whitespace-pre-line">{s.text}</p>}
        <div className="flex flex-wrap gap-1 mt-2">
          {folder && (
            <span className="tag" style={{ color: folder.color, background: `color-mix(in srgb, ${folder.color} 10%, transparent)` }}>
              <Icon name={folder.icon} size={10} /> {folder.name}
            </span>
          )}
          {s.tags.map((t) => (
            <span key={t} className="tag">
              #{t}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-1 mt-auto pt-2">
          <span className="text-[10px] text-dim mono mr-auto">{fmt(s.createdAt, 'd MMM')}</span>
          <IBtn icon="star" className={`ibtn-sm ${s.favorite ? '!text-gold' : ''}`} onClick={() => db.saves.put({ ...s, favorite: !s.favorite })} title={L('Избранное', 'Favorite')} />
          <IBtn icon="check" className={`ibtn-sm ${s.done ? '!text-jade' : ''}`} onClick={() => db.saves.put({ ...s, done: !s.done })} title={L('Посмотрел / сделал', 'Watched / done')} />
          {s.url && (
            <a className="ibtn ibtn-sm" href={s.url} target="_blank" rel="noopener noreferrer" title={L('Открыть', 'Open')}>
              <Icon name="external" size={14} />
            </a>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function SaveEditor({ s: init, folders, onClose }: { s: SaveItem; folders: Folder[]; onClose: () => void }) {
  const [s, setS] = useState(init);
  const [loading, setLoading] = useState(false);
  const set = (p: Partial<SaveItem>) => setS((x) => ({ ...x, ...p }));
  return (
    <Modal
      open
      onClose={onClose}
      title={L('Сохранёнка', 'Saved item')}
      kanji="反"
      footer={
        <>
          <Btn
            size="sm"
            variant="danger"
            icon="trash"
            className="mr-auto"
            onClick={async () => {
              if (await confirmBox(L('Удалить?', 'Delete?'), { danger: true })) {
                await db.saves.delete(s.id);
                onClose();
              }
            }}
          >
            {L('Удалить', 'Delete')}
          </Btn>
          <Btn
            size="sm"
            icon="check"
            onClick={async () => {
              await db.saves.put({ ...s, kind: s.url ? 'link' : 'note', title: s.title.trim() || hostOf(s.url) || L('Без названия', 'Untitled') });
              onClose();
            }}
          >
            {L('Сохранить', 'Save')}
          </Btn>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={L('Заголовок', 'Title')}>
          <input className="inp" value={s.title} onChange={(e) => set({ title: e.target.value })} />
        </Field>
        <Field label={L('Ссылка', 'Link')}>
          <div className="flex gap-2">
            <input className="inp" value={s.url || ''} onChange={(e) => set({ url: e.target.value || undefined })} placeholder="https://…" />
            {s.url && (
              <Btn
                size="sm"
                variant="ghost"
                icon="refresh"
                disabled={loading}
                onClick={async () => {
                  setLoading(true);
                  const p = await fetchPreview(s.url!);
                  setLoading(false);
                  set({ preview: p, title: s.title || p.title || s.title });
                  toast(p.title || p.image ? L('Превью обновлено', 'Preview updated') : L('Сайт не отдал превью', 'No preview available'), p.title ? 'ok' : 'warn');
                }}
              >
                {L('Превью', 'Preview')}
              </Btn>
            )}
          </div>
        </Field>
        {s.preview?.image && <img src={s.preview.image} alt="" className="w-full max-h-48 object-cover border border-line/60" referrerPolicy="no-referrer" />}
        <Field label={L('Заметка', 'Note')}>
          <textarea className="inp" rows={4} value={s.text} onChange={(e) => set({ text: e.target.value })} />
        </Field>
        <Field label={L('Теги', 'Tags')}>
          <TagInput value={s.tags} onChange={(tags) => set({ tags })} />
        </Field>
        <Field label={L('Папка', 'Folder')}>
          <select className="inp" value={s.folderId || ''} onChange={(e) => set({ folderId: e.target.value || undefined })}>
            <option value="">{L('Входящие', 'Inbox')}</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex gap-5">
          <Toggle on={s.favorite} onChange={(favorite) => set({ favorite })} label={L('Избранное', 'Favorite')} />
          <Toggle on={s.done} onChange={(done) => set({ done })} label={L('Посмотрел / сделал', 'Watched / done')} />
        </div>
      </div>
    </Modal>
  );
}

function FolderEditor({ f: init, exists, onClose, onDeleted }: { f: Folder; exists: boolean; onClose: () => void; onDeleted: () => void }) {
  const [f, setF] = useState(init);
  return (
    <Modal
      open
      onClose={onClose}
      title={exists ? f.name : L('Новая папка', 'New folder')}
      kanji="箱"
      footer={
        <>
          {exists && (
            <Btn
              size="sm"
              variant="danger"
              icon="trash"
              className="mr-auto"
              onClick={async () => {
                if (!(await confirmBox(L('Удалить папку? Её содержимое переедет во «Входящие».', 'Delete folder? Items move to Inbox.'), { danger: true }))) return;
                const items = await db.saves.where('folderId').equals(f.id).toArray();
                await db.saves.bulkPut(items.map((i) => ({ ...i, folderId: undefined })));
                await db.folders.delete(f.id);
                onDeleted();
                onClose();
              }}
            >
              {L('Удалить', 'Delete')}
            </Btn>
          )}
          <Btn
            size="sm"
            icon="check"
            disabled={!f.name.trim()}
            onClick={async () => {
              await db.folders.put({ ...f, name: f.name.trim() });
              onClose();
            }}
          >
            {L('Сохранить', 'Save')}
          </Btn>
        </>
      }
    >
      <div className="grid grid-cols-[80px_1fr] gap-3">
        <div className="app-icon w-14 h-14 self-end" style={{ background: f.color }}>
          <Icon name={f.icon} size={24} />
        </div>
        <Field label={L('Название', 'Name')}>
          <input className="inp" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={L('Аниме, манхва, еда…', 'Anime, manhwa, food…')} />
        </Field>
        <Field label={L('Цвет', 'Color')} className="col-span-2">
          <ColorPick value={f.color} onChange={(color) => setF({ ...f, color })} />
        </Field>
        <div className="col-span-2">
          <div className="label mb-1.5 ml-1">{L('Иконка', 'Icon')}</div>
          <div className="flex flex-wrap gap-1.5">
            {FOLDER_ICONS.map((ic) => (
              <button key={ic} type="button" className={`ibtn ${f.icon === ic ? 'chip-on' : 'bg-panel-2'}`} onClick={() => setF({ ...f, icon: ic })} aria-label={ic}>
                <Icon name={ic} size={17} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

/** Превью сохранённой идеи или ссылки — светлая карточка на «столе» (DeskCard). */
function openSavePreview(s: SaveItem, folder: Folder | undefined, from: Element) {
  openDesk({
    id: `save:${s.id}`,
    variant: 'light',
    title: s.title,
    from,
    width: 340,
    node: () => (
      <div className="pr-12">
        {folder && <div className="text-[11px] uppercase tracking-[0.14em] desk-muted">{folder.name}</div>}
        <div className="text-[18px] font-bold leading-snug mt-1">{s.title}</div>
        {s.preview?.image && <img src={s.preview.image} alt="" className="mt-3 w-full aspect-[1.9] object-cover rounded-xl" referrerPolicy="no-referrer" draggable={false} />}
        {s.text && <p className="text-[13.5px] mt-3 whitespace-pre-line leading-relaxed">{s.text}</p>}
        {s.tags.length > 0 && <div className="flex flex-wrap gap-1 mt-3">{s.tags.map((t) => <span key={t} className="text-[11.5px] desk-muted">#{t}</span>)}</div>}
        <div className="flex gap-2 mt-4">
          {s.url && (
            <a className="btn btn-sm" href={s.url} target="_blank" rel="noopener noreferrer">
              <Icon name="external" size={13} /> {L('Открыть', 'Open')}
            </a>
          )}
          <button className="btn btn-sm btn-ghost !text-[#1c1c1e]" onClick={() => setQuery('item', s.id)}>
            <Icon name="edit" size={13} /> {L('Изменить', 'Edit')}
          </button>
        </div>
      </div>
    ),
  });
}
