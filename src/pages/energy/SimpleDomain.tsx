// Simple Domain — блокнот: markdown, автосохранение, поиск, закрепление.
import { useMemo, useRef, useState } from 'react';
import { DeskCard } from '../../components/DeskCard';
import { Icon } from '../../components/Icon';
import { Btn, Empty, IBtn, Panel, Seg } from '../../components/ui';
import { db, type Note } from '../../db/schema';
import { fmt } from '../../lib/dates';
import { confirmBox } from '../../lib/fx';
import { useAutosave, useLive, useMedia } from '../../lib/hooks';
import { renderMarkdown, toggleTaskLine } from '../../lib/markdown';
import { setQuery, useRoute } from '../../lib/router';
import { L, uid } from '../../lib/runtime';

export function SimpleDomain() {
  const { query } = useRoute();
  const notes = useLive(() => db.notes.toArray(), []) || [];
  const [q, setQ] = useState('');
  const [mode, setMode] = useState<'list' | 'desk'>('list');
  const wide = useMedia('(min-width: 1024px)');
  const sorted = notes.slice().sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
  const s = q.trim().toLowerCase();
  const list = sorted.filter((n) => !s || n.title.toLowerCase().includes(s) || n.body.toLowerCase().includes(s));
  const selId = query.get('note') || (wide ? sorted[0]?.id : undefined);
  const sel = notes.find((n) => n.id === selId);

  const create = async () => {
    const id = uid();
    await db.notes.put({ id, title: '', body: '', pinned: false, createdAt: Date.now(), updatedAt: Date.now() });
    setQuery('note', id);
  };

  const listView = (
    <Panel
      title={L('Заметки', 'Notes')}
      kanji="簡易"
      bodyClass="p-2"
      actions={
        <Btn size="xs" icon="plus" onClick={create}>
          {L('Новая', 'New')}
        </Btn>
      }
    >
      <div className="relative mb-2 px-1">
        <Icon name="search" size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-dim" />
        <input className="inp !pl-8 !py-1.5" value={q} onChange={(e) => setQ(e.target.value)} placeholder={L('Поиск по заметкам', 'Search notes')} />
      </div>
      <div className="max-h-[65dvh] overflow-y-auto">
        {list.map((n) => (
          <button key={n.id} className={`w-full text-left px-2.5 py-2 border-l-2 ${n.id === selId ? 'border-cursed bg-cursed/10' : 'border-transparent hover:bg-cursed/5'}`} onClick={() => setQuery('note', n.id)}>
            <div className="flex items-center gap-1.5">
              {n.pinned && <Icon name="pushpin" size={12} className="text-gold shrink-0" />}
              <span className="text-sm truncate flex-1">{n.title || L('Без названия', 'Untitled')}</span>
            </div>
            <div className="text-[11px] text-dim truncate">{n.body.replace(/[#*>`\-[\]]/g, '').slice(0, 80) || '…'}</div>
            <div className="text-[10px] text-dim mono">{fmt(n.updatedAt, 'd MMM, HH:mm')}</div>
          </button>
        ))}
        {!list.length && <Empty text={L('Заметок нет', 'No notes')} icon="note" />}
      </div>
    </Panel>
  );

  const modeSeg = (
    <Seg
      options={[
        { v: 'list' as const, label: L('Список заметок', 'Notes list') },
        { v: 'desk' as const, label: L('Стол', 'Desk') },
      ]}
      value={mode}
      onChange={setMode}
    />
  );
  if (mode === 'desk')
    return (
      <div className="space-y-3">
        {modeSeg}
        <NotesDesk
          notes={sorted.filter((n) => n.pinned)}
          onOpen={(id) => {
            setMode('list');
            setQuery('note', id);
          }}
        />
      </div>
    );
  return (
    <div className="space-y-3">
    {modeSeg}
    <div className="grid gap-4 lg:grid-cols-[300px_1fr] items-start">
      {(wide || !sel) && listView}
      {sel ? (
        <Editor key={sel.id} note={sel} onBack={() => setQuery('note')} showBack={!wide} />
      ) : (
        wide && (
          <Panel>
            <Empty text={L('Выбери заметку или создай новую', 'Pick a note or create one')} icon="note" action={<Btn size="sm" icon="plus" onClick={create}>{L('Новая', 'New')}</Btn>} />
          </Panel>
        )
      )}
    </div>
    </div>
  );
}

/** «Стол»: закреплённые заметки лежат карточками (DeskCard); положение и поворот сохраняются в Dexie. */
function NotesDesk({ notes, onOpen }: { notes: Note[]; onOpen: (id: string) => void }) {
  const table = useRef<HTMLDivElement>(null);
  const [front, setFront] = useState<string | null>(null);
  const mobile = useMedia('(max-width: 639px)');
  if (!notes.length) return <Empty icon="pushpin" text={L('Закреплённых заметок нет — закрепи заметку, и она появится на столе.', 'No pinned notes — pin a note to put it on the desk.')} />;
  const w = mobile ? 230 : 280;
  return (
    <div ref={table} className="desk-table" style={{ height: mobile ? '78vh' : '72vh' }}>
      {notes.map((n, i) => {
        const d = n.desk || { x: 16 + ((i * (mobile ? 30 : 300)) % (mobile ? 90 : 900)), y: 16 + Math.floor((i * (mobile ? 30 : 300)) / (mobile ? 90 : 900)) * (mobile ? 120 : 230) + (i % 3) * 14, rot: ((i * 37) % 11) - 5 };
        const text = n.body.replace(/[#*>`\[\]-]/g, '').trim();
        return (
          <DeskCard
            key={n.id}
            variant={i % 3 === 2 ? 'dark' : 'light'}
            x={d.x}
            y={d.y}
            rot={d.rot}
            z={front === n.id ? 50 : 10 + i}
            width={w}
            bounds={table}
            title={n.title}
            onFront={() => setFront(n.id)}
            onMove={(x, y) => void db.notes.update(n.id, { desk: { x, y, rot: d.rot } })}
          >
            <div className="text-[16px] font-bold leading-snug pr-2">{n.title || L('Без названия', 'Untitled')}</div>
            <p className="text-[13px] mt-2 line-clamp-6 whitespace-pre-line desk-muted">{text.slice(0, 260)}</p>
            <div className="flex items-center mt-3">
              <span className="text-[11px] desk-muted">{fmt(n.updatedAt, 'd MMM')}</span>
              <button className="btn btn-xs ml-auto" onClick={() => onOpen(n.id)}>{L('Открыть', 'Open')}</button>
            </div>
          </DeskCard>
        );
      })}
    </div>
  );
}

function Editor({ note, onBack, showBack }: { note: Note; onBack: () => void; showBack: boolean }) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [mode, setMode] = useState<'edit' | 'preview' | 'split'>(note.body ? 'preview' : 'edit');
  const saved = title === note.title && body === note.body;
  const draft = useMemo(() => ({ title, body }), [title, body]);
  useAutosave(draft, async (v) => {
    const cur = await db.notes.get(note.id);
    if (!cur) return;
    await db.notes.put({ ...cur, title: v.title, body: v.body, updatedAt: Date.now() });
  }, 450);
  const html = useMemo(() => renderMarkdown(body), [body]);
  const preview = (
    <div
      className="md min-h-[50dvh]"
      onClick={(e) => {
        const t = e.target as HTMLElement;
        if (t instanceof HTMLInputElement && t.type === 'checkbox' && t.dataset.line) {
          e.preventDefault();
          setBody((b) => toggleTaskLine(b, Number(t.dataset.line)));
        }
      }}
      dangerouslySetInnerHTML={{ __html: html || `<p style="color:#5d5888">${L('Пусто', 'Empty')}</p>` }}
    />
  );
  const editor = (
    <textarea
      className="inp !min-h-[50dvh] mono !text-[13.5px] !leading-relaxed"
      value={body}
      onChange={(e) => setBody(e.target.value)}
      placeholder={L('# Заголовок\n\n- [ ] задача\n**жирный**, *курсив*, `код`, [ссылка](https://…)', '# Heading\n\n- [ ] task\n**bold**, *italic*, `code`, [link](https://…)')}
      autoFocus={!note.body}
    />
  );
  return (
    <Panel bodyClass="p-4">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {showBack && <IBtn icon="left" onClick={onBack} />}
        <input className="flex-1 min-w-0 bg-transparent outline-none h-display text-xl placeholder:text-dim" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={L('Заголовок', 'Title')} />
        <span className="text-[11px] text-dim mono">{saved ? L('сохранено', 'saved') : L('сохраняю…', 'saving…')}</span>
        <IBtn icon="pushpin" active={note.pinned} className={note.pinned ? '!text-gold' : ''} onClick={() => db.notes.put({ ...note, title, body, pinned: !note.pinned })} title={L('Закрепить', 'Pin')} />
        <IBtn
          icon="trash"
          onClick={async () => {
            if (await confirmBox(L('Удалить заметку?', 'Delete note?'), { danger: true })) {
              await db.notes.delete(note.id);
              onBack();
            }
          }}
        />
      </div>
      <div className="mb-3">
        <Seg
          options={[
            { v: 'edit' as const, label: L('Редактор', 'Edit') },
            { v: 'preview' as const, label: L('Просмотр', 'Preview') },
            { v: 'split' as const, label: L('Рядом', 'Split') },
          ]}
          value={mode}
          onChange={setMode}
        />
      </div>
      {mode === 'edit' && editor}
      {mode === 'preview' && preview}
      {mode === 'split' && (
        <div className="grid gap-4 md:grid-cols-2">
          {editor}
          <div className="border-l border-line/50 pl-4">{preview}</div>
        </div>
      )}
    </Panel>
  );
}
