// Ctrl+K: глобальный поиск по всем разделам и быстрое добавление (Curse, идея/ссылка, заметка).
import { addDays } from 'date-fns';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../db/schema';
import { quickSave } from '../lib/actions';
import { endOfDayTs, fmt } from '../lib/dates';
import { toast } from '../lib/fx';
import { curseGrade } from '../lib/grade';
import { useLive } from '../lib/hooks';
import { go } from '../lib/router';
import { L, uid } from '../lib/runtime';
import { blankCurse } from './CurseEditor';
import { Icon } from './Icon';
import { Monster } from './Monster';
import { NAV } from './nav';
import { newCurse } from './shared';
import { Seg } from './ui';

type Mode = 'search' | 'add';
type AddKind = 'curse' | 'save' | 'note';
type Hit = { id: string; group: string; title: string; sub?: string; icon?: string; go: () => void; grade?: { grade: 0 | 1 | 2 | 3 | 4; overdue: boolean } };

export function CommandPalette({ mode, onClose }: { mode: Mode | null; onClose: () => void }) {
  return createPortal(<AnimatePresence>{mode && <Palette key="p" initial={mode} onClose={onClose} />}</AnimatePresence>, document.body);
}

function Palette({ initial, onClose }: { initial: Mode; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>(initial);
  const [kind, setKind] = useState<AddKind>('curse');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const [due, setDue] = useState(() => endOfDayTs(new Date()));
  const [tech, setTech] = useState('t-pers');
  const [imp, setImp] = useState(3);
  const [folder, setFolder] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const data = useLive(async () => {
    const [curses, notes, saves, exercises, pins, goals, vows, subjects, techniques, folders] = await Promise.all([
      db.curses.toArray(),
      db.notes.toArray(),
      db.saves.toArray(),
      db.exercises.toArray(),
      db.pins.toArray(),
      db.goals.toArray(),
      db.vows.toArray(),
      db.subjects.toArray(),
      db.techniques.orderBy('order').toArray(),
      db.folders.orderBy('order').toArray(),
    ]);
    return { curses, notes, saves, exercises, pins, goals, vows, subjects, techniques, folders };
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, [mode, kind]);

  const hits = useMemo<Hit[]>(() => {
    if (!data || mode !== 'search') return [];
    const s = q.trim().toLowerCase();
    const m = (...xs: (string | undefined)[]) => !s || xs.some((x) => x?.toLowerCase().includes(s));
    const out: Hit[] = [];
    const nav = NAV().filter((n) => m(n.label, n.ru, n.kanji));
    nav.slice(0, s ? 4 : 9).forEach((n) => out.push({ id: 'nav' + n.path, group: L('Разделы', 'Sections'), title: n.label, sub: n.ru, icon: n.icon, go: () => go(n.path) }));
    if (!s) return out;
    data.curses
      .filter((c) => m(c.title, c.notes))
      .sort((a, b) => (a.status === b.status ? a.due - b.due : a.status === 'active' ? -1 : 1))
      .slice(0, 6)
      .forEach((c) =>
        out.push({
          id: c.id,
          group: 'Curses',
          title: c.title,
          sub: `${fmt(c.due, 'd MMM HH:mm')}${c.status === 'exorcised' ? ' · ' + L('изгнано', 'exorcised') : ''}`,
          grade: c.status === 'active' ? curseGrade(c.due, c.importance) : undefined,
          icon: 'skull',
          go: () => go(`/curses?curse=${c.id}`),
        }),
      );
    data.notes.filter((n) => m(n.title, n.body)).slice(0, 5).forEach((n) => out.push({ id: n.id, group: 'Simple Domain', title: n.title || L('Без названия', 'Untitled'), sub: n.body.slice(0, 60), icon: 'note', go: () => go(`/energy/simple?note=${n.id}`) }));
    data.saves.filter((x) => m(x.title, x.text, x.url, x.tags.join(' '))).slice(0, 5).forEach((x) => out.push({ id: x.id, group: 'Reversed Cursed Technique', title: x.title, sub: x.url || x.text.slice(0, 60), icon: x.kind === 'link' ? 'link' : 'sparkle', go: () => go(`/energy/rct?item=${x.id}`) }));
    data.goals.filter((g) => m(g.title, g.description)).slice(0, 4).forEach((g) => out.push({ id: g.id, group: g.level === 'year' ? 'Domain Expansion' : 'Maximum Technique', title: g.title, sub: g.month || String(g.year), icon: 'target', go: () => go(g.level === 'year' ? `/energy/domain?year=${g.year}` : `/energy/maximum?month=${g.month}`) }));
    data.vows.filter((v) => m(v.sacrifice, v.forWhat)).slice(0, 4).forEach((v) => out.push({ id: v.id, group: 'Binding Vow', title: `${L('Жертвую', 'Sacrifice')} ${v.sacrifice}`, sub: `${L('ради', 'for')} ${v.forWhat}`, icon: 'chain', go: () => go('/vows') }));
    data.exercises.filter((e) => m(e.name, e.notes)).slice(0, 4).forEach((e) => out.push({ id: e.id, group: 'Black Flash', title: e.name, sub: e.muscle, icon: 'dumbbell', go: () => go(`/taijutsu/flash/library?ex=${e.id}`) }));
    data.pins.filter((p) => m(p.name, p.note)).slice(0, 4).forEach((p) => out.push({ id: p.id, group: L('Карта кампуса', 'Campus map'), title: p.name, sub: p.note, icon: 'pin', go: () => go(`/tools/map?pin=${p.id}`) }));
    data.subjects.filter((x) => m(x.name, x.teacher)).slice(0, 3).forEach((x) => out.push({ id: x.id, group: 'Cursed Tools', title: x.name, sub: x.teacher, icon: 'grad', go: () => go('/tools/calendar?view=slots') }));
    return out;
  }, [data, q, mode]);

  useEffect(() => setSel(0), [q, mode]);

  const pick = (h?: Hit) => {
    if (!h) return;
    h.go();
    onClose();
  };

  const submitAdd = async () => {
    const text = q.trim();
    if (!text) return;
    if (kind === 'curse') {
      await db.curses.put(blankCurse({ title: text, due, techniqueId: tech, importance: imp }));
      toast(L('Проклятие призвано: ', 'Curse summoned: ') + text);
    } else if (kind === 'save') {
      await quickSave(text, folder || undefined);
    } else {
      const id = uid();
      const [title, ...rest] = text.split('\n');
      await db.notes.put({ id, title, body: rest.join('\n'), pinned: false, createdAt: Date.now(), updatedAt: Date.now() });
      go(`/energy/simple?note=${id}`);
    }
    onClose();
  };

  const presets = [
    { l: L('Сегодня', 'Today'), v: endOfDayTs(new Date()) },
    { l: L('Завтра', 'Tomorrow'), v: endOfDayTs(addDays(new Date(), 1)) },
    { l: '+3', v: endOfDayTs(addDays(new Date(), 3)) },
    { l: '+7', v: endOfDayTs(addDays(new Date(), 7)) },
    { l: '+14', v: endOfDayTs(addDays(new Date(), 14)) },
  ];

  let lastGroup = '';
  return (
    <motion.div className="fixed inset-0 z-[80] flex items-start justify-center p-3 pt-[8vh]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div className="panel relative w-full max-w-xl" initial={{ y: -16, scale: 0.98 }} animate={{ y: 0, scale: 1 }} exit={{ y: -10, opacity: 0 }}>
        <div className="flex items-center gap-1 px-3 pt-3">
          <button className={`chip ${mode === 'search' ? 'chip-on' : ''}`} onClick={() => setMode('search')}>
            <Icon name="search" size={13} /> {L('Поиск', 'Search')}
          </button>
          <button className={`chip ${mode === 'add' ? 'chip-on' : ''}`} onClick={() => setMode('add')}>
            <Icon name="plus" size={13} /> {L('Добавить', 'Add')}
          </button>
          <span className="ml-auto label hidden sm:inline">Ctrl + K · Esc</span>
        </div>
        {mode === 'add' && (
          <div className="px-3 pt-2">
            <Seg
              options={[
                { v: 'curse' as AddKind, label: 'Curse' },
                { v: 'save' as AddKind, label: L('Идея / ссылка', 'Idea / link') },
                { v: 'note' as AddKind, label: L('Заметка', 'Note') },
              ]}
              value={kind}
              onChange={setKind}
            />
          </div>
        )}
        <div className="flex items-center gap-2 px-3 py-3 border-b border-line">
          <Icon name={mode === 'search' ? 'search' : 'plus'} className="text-acc" />
          <input
            ref={inputRef}
            className="flex-1 bg-transparent outline-none text-base placeholder:text-dim"
            placeholder={
              mode === 'search'
                ? L('Искать проклятия, заметки, ссылки, упражнения…', 'Search curses, notes, links, exercises…')
                : kind === 'curse'
                  ? L('Что нужно изгнать?', 'What must be exorcised?')
                  : kind === 'save'
                    ? L('Мысль или ссылка, #теги', 'Thought or link, #tags')
                    : L('Заголовок заметки', 'Note title')
            }
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (mode === 'search') {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setSel((v) => Math.min(hits.length - 1, v + 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setSel((v) => Math.max(0, v - 1));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  if (hits[sel]) pick(hits[sel]);
                  else if (q.trim()) {
                    setMode('add');
                  }
                }
              } else if (e.key === 'Enter') {
                e.preventDefault();
                void submitAdd();
              }
            }}
          />
        </div>

        {mode === 'search' ? (
          <div className="max-h-[55vh] overflow-y-auto py-1">
            {hits.map((h, i) => {
              const header = h.group !== lastGroup ? h.group : null;
              lastGroup = h.group;
              return (
                <div key={h.id + i}>
                  {header && <div className="label px-4 pt-2 pb-1">{header}</div>}
                  <button className={`w-full flex items-center gap-3 px-4 py-2 text-left ${i === sel ? 'bg-cursed/15' : 'hover:bg-cursed/10'}`} onMouseEnter={() => setSel(i)} onClick={() => pick(h)}>
                    {h.grade ? <Monster grade={h.grade.grade} overdue={h.grade.overdue} size={28} /> : <Icon name={h.icon || 'sparkle'} size={16} className="text-acc shrink-0" />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{h.title}</span>
                      {h.sub && <span className="block truncate text-[11px] text-dim">{h.sub}</span>}
                    </span>
                  </button>
                </div>
              );
            })}
            {q.trim() && (
              <button className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-cursed/10 border-t border-line/60" onClick={() => setMode('add')}>
                <Icon name="plus" size={16} className="text-jade" />
                <span className="text-sm">
                  {L('Создать', 'Create')} «{q.trim()}»
                </span>
              </button>
            )}
            {!hits.length && !q.trim() && <div className="text-sm text-muted p-4">{L('Начни вводить…', 'Start typing…')}</div>}
          </div>
        ) : (
          <div className="p-3 space-y-3">
            {kind === 'curse' && data && (
              <>
                <div className="flex flex-wrap gap-1 items-center">
                  <span className="label mr-1">{L('Дедлайн', 'Due')}</span>
                  {presets.map((p) => (
                    <button key={p.l} className={`chip ${due === p.v ? 'chip-on' : ''}`} onClick={() => setDue(p.v)}>
                      {p.l}
                    </button>
                  ))}
                  <span className="text-[11px] text-dim mono ml-1">{fmt(due, 'EEE d MMM, HH:mm')}</span>
                </div>
                <div className="flex flex-wrap gap-1 items-center">
                  <span className="label mr-1">{L('Категория', 'Category')}</span>
                  {data.techniques.map((t) => (
                    <button key={t.id} className={`chip ${tech === t.id ? 'chip-on' : ''}`} onClick={() => setTech(t.id)}>
                      {t.icon} {t.name}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1 items-center">
                  <span className="label mr-1">{L('Важность', 'Importance')}</span>
                  {[1, 2, 3, 4, 5].map((v) => (
                    <button key={v} className={`chip ${imp === v ? 'chip-on' : ''}`} onClick={() => setImp(v)}>
                      {v}
                    </button>
                  ))}
                  <Monster grade={curseGrade(due, imp).grade} size={30} />
                </div>
              </>
            )}
            {kind === 'save' && data && (
              <div className="flex flex-wrap gap-1 items-center">
                <span className="label mr-1">{L('Папка', 'Folder')}</span>
                <button className={`chip ${folder === '' ? 'chip-on' : ''}`} onClick={() => setFolder('')}>
                  <Icon name="inbox" size={13} /> {L('Входящие', 'Inbox')}
                </button>
                {data.folders.map((f) => (
                  <button key={f.id} className={`chip ${folder === f.id ? 'chip-on' : ''}`} onClick={() => setFolder(f.id)}>
                    <Icon name={f.icon} size={13} /> {f.name}
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-2 justify-end">
              {kind === 'curse' && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    newCurse({ title: q.trim(), due, techniqueId: tech, importance: imp });
                    onClose();
                  }}
                >
                  {L('Подробнее…', 'More…')}
                </button>
              )}
              <button className="btn btn-sm" onClick={submitAdd} disabled={!q.trim()}>
                <Icon name="check" size={13} /> {L('Сохранить', 'Save')} <span className="opacity-60 hidden sm:inline">↵</span>
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
