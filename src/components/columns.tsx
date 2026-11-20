// Переиспользуемое управление колонками статусов: меню «⋯», выбор цвета, переименование на месте,
// диалог удаления с переносом, окно «Manage columns». Работает с любым ColumnStore
// (сейчас включено только для YouTube Technique; University/Piano могут подключить свой store).
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLive, useMedia } from '../lib/hooks';
import { SPRING } from '../lib/motion';
import { L } from '../lib/runtime';
import { addColumn, deleteColumn, moveColumn, patchColumn, reorderColumns, resetColumns, type Column, type ColumnStore } from '../lib/statuses';
import { COLUMN_COLORS } from '../lib/videoMeta';
import { Icon } from './Icon';
import { Btn, Modal, Toggle } from './ui';

// ───── диалог удаления колонки ─────
type Ask = { col: Column; n: number; others: Column[]; def: string; resolve: (v: string | 'delete' | null) => void };

export function useColumnAsk(store: ColumnStore) {
  const [ask, setAsk] = useState<Ask | null>(null);
  const [pick, setPick] = useState('');
  const fn = (col: Column, n: number, others: Column[], def: string) =>
    new Promise<string | 'delete' | null>((resolve) => {
      setPick(def);
      setAsk({ col, n, others, def, resolve });
    });
  const done = (v: string | 'delete' | null) => {
    ask?.resolve(v);
    setAsk(null);
  };
  const node = (
    <Modal
      open={!!ask}
      onClose={() => done(null)}
      title={ask?.n === -1 ? L('Done-колонка', 'Done column') : L('Удаление колонки', 'Delete column')}
      footer={
        ask && (
          <>
            {ask.n > 0 && (
              <Btn variant="danger" icon="trash" onClick={() => done('delete')}>
                {L(`Удалить вместе с ${store.noun(ask.n)}`, `Delete with ${store.noun(ask.n)}`)}
              </Btn>
            )}
            {ask.n === -1 && (
              <Btn variant="ghost" onClick={() => done('delete')}>
                {L('Не назначать', 'Don’t assign')}
              </Btn>
            )}
            <Btn onClick={() => done(pick)}>{ask.n === -1 ? L('Назначить Done', 'Make Done') : L('Перенести и удалить', 'Move and delete')}</Btn>
          </>
        )
      }
    >
      {ask && (
        <div className="space-y-3">
          <p className="text-[14px]">
            {ask.n === -1
              ? L(`«${ask.col.name}» — единственная колонка «Готово». Какую колонку считать готовой вместо неё?`, `“${ask.col.name}” is the only Done column. Which column should be Done instead?`)
              : L(`В колонке «${ask.col.name}» ${ask.n} ${store.noun(ask.n)}. Куда их переместить?`, `“${ask.col.name}” has ${ask.n} ${store.noun(ask.n)}. Where should they go?`)}
          </p>
          <div className="space-y-1" role="radiogroup">
            {ask.others.map((c) => (
              <button key={c.id} role="radio" aria-checked={pick === c.id} className={`w-full flex items-center gap-3 rounded-xl px-3 min-h-[44px] text-left ${pick === c.id ? 'bg-[color-mix(in_srgb,var(--accent-1)_16%,transparent)]' : 'hover:bg-panel-2'}`} onClick={() => setPick(c.id)}>
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: c.color }} />
                <span className="flex-1 truncate">{c.name}</span>
                {c.isDone && <span className="tag !text-[10.5px] text-jade">Done</span>}
                {pick === c.id && <Icon name="check" size={15} className="text-acc" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
  return [fn, node] as const;
}

// ───── цвет ─────
export function ColumnColors({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {COLUMN_COLORS.map((c) => (
        <button key={c} aria-label={c} className={`w-8 h-8 rounded-full ${value.toLowerCase() === c ? 'ring-2 ring-offset-2 ring-offset-[var(--panel-solid)] ring-[var(--ink)]' : ''}`} style={{ background: c }} onClick={() => onChange(c)} />
      ))}
      <label className="w-8 h-8 rounded-full border border-dashed border-line grid place-items-center cursor-pointer relative" title={L('Свой цвет', 'Custom color')}>
        <Icon name="palette" size={14} />
        <input type="color" className="absolute inset-0 opacity-0 cursor-pointer" value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#8e8e93'} onChange={(e) => onChange(e.target.value)} aria-label={L('Свой цвет', 'Custom color')} />
      </label>
    </div>
  );
}

// ───── название, редактируемое на месте ─────
export function ColumnName({ col, store, editing, setEditing, onCancelNew, className = '' }: { col: Column; store: ColumnStore; editing: boolean; setEditing: (v: boolean) => void; onCancelNew?: () => void; className?: string }) {
  const [v, setV] = useState(col.name);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) {
      setV(col.name);
      requestAnimationFrame(() => {
        ref.current?.focus();
        ref.current?.select();
      });
    }
  }, [editing, col.name]);
  if (!editing)
    return (
      <button className={`truncate text-left min-w-0 ${className}`} onClick={() => setEditing(true)} title={L('Переименовать', 'Rename')}>
        {col.name}
      </button>
    );
  const save = () => {
    if (v.trim()) void patchColumn(store, col.id, { name: v });
    setEditing(false);
  };
  return (
    <input
      ref={ref}
      className={`min-w-0 flex-1 bg-panel-2 rounded-lg px-2 py-1 outline-none ring-1 ring-[var(--accent-1)] ${className}`}
      value={v}
      aria-label={L('Название колонки', 'Column name')}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') save();
        if (e.key === 'Escape') {
          e.stopPropagation();
          setEditing(false);
          onCancelNew?.();
        }
      }}
      onBlur={save}
    />
  );
}

// ───── меню «⋯» колонки ─────
export function ColumnMenu({ col, store, index, total, anchor, onClose, onRename, ask }: { col: Column; store: ColumnStore; index: number; total: number; anchor: DOMRect | null; onClose: () => void; onRename: () => void; ask: Parameters<typeof deleteColumn>[2] }) {
  const mobile = useMedia('(pointer: coarse), (max-width: 639px)');
  const [colors, setColors] = useState(false);
  const act = (f: () => unknown) => () => {
    onClose();
    void f();
  };
  const items = (
    <div className="grid gap-0.5 min-w-[220px]">
      <MenuItem icon="edit" label={L('Переименовать', 'Rename')} onClick={act(onRename)} />
      <MenuItem icon="palette" label={L('Цвет', 'Change color')} onClick={() => setColors((c) => !c)} right={<span className="w-3.5 h-3.5 rounded-full" style={{ background: col.color }} />} />
      {colors && (
        <div className="px-2 py-2">
          <ColumnColors value={col.color} onChange={(color) => void patchColumn(store, col.id, { color })} />
        </div>
      )}
      <MenuItem icon="check" label={L('Колонка «Готово» (Done)', 'Mark as “Done”')} onClick={() => void patchColumn(store, col.id, { isDone: !col.isDone })} right={<span className={`w-9 h-5 rounded-full relative transition-colors ${col.isDone ? 'bg-jade' : 'bg-panel-2 border border-line'}`}><span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${col.isDone ? 'translate-x-4' : 'translate-x-0.5'}`} /></span>} />
      <MenuItem icon="left" label={L('Сдвинуть влево', 'Move left')} disabled={index === 0} onClick={act(() => moveColumn(store, col.id, -1))} />
      <MenuItem icon="right" label={L('Сдвинуть вправо', 'Move right')} disabled={index >= total - 1} onClick={act(() => moveColumn(store, col.id, 1))} />
      <div className="h-px bg-line my-1" />
      <MenuItem icon="trash" label={L('Удалить', 'Delete')} danger disabled={total <= 1} onClick={act(() => deleteColumn(store, col.id, ask))} />
    </div>
  );
  if (mobile)
    return (
      <Modal open onClose={onClose} title={col.name}>
        {items}
      </Modal>
    );
  const left = Math.min((anchor?.right ?? 200) - 230, window.innerWidth - 250);
  return createPortal(
    <>
      <div className="fixed inset-0 z-[110]" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <motion.div
        role="menu"
        className="fixed z-[111] p-1.5 rounded-2xl sheet border border-[var(--hair)] shadow-[var(--shadow)]"
        style={{ left: Math.max(8, left), top: (anchor?.bottom ?? 100) + 6 }}
        initial={{ opacity: 0, scale: 0.95, y: -4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        {items}
      </motion.div>
    </>,
    document.body,
  );
}

function MenuItem({ icon, label, onClick, right, danger, disabled }: { icon: string; label: string; onClick: () => void; right?: ReactNode; danger?: boolean; disabled?: boolean }) {
  return (
    <button role="menuitem" disabled={disabled} className={`flex items-center gap-2.5 w-full text-left rounded-xl px-2.5 min-h-[44px] sm:min-h-[36px] text-[14px] ${disabled ? 'opacity-35' : 'hover:bg-panel-2'} ${danger ? 'text-blood' : ''}`} onClick={onClick}>
      <Icon name={icon} size={15} /> <span className="flex-1">{label}</span>
      {right}
    </button>
  );
}

// ───── окно «Manage columns» ─────
export function ManageColumnsSheet({ store, open, onClose, title }: { store: ColumnStore; open: boolean; onClose: () => void; title?: string }) {
  const cols = useLive(() => store.list(), [store]) || [];
  const counts = useLive(() => store.countItems(), [store]) || {};
  const [ask, askNode] = useColumnAsk(store);
  const [colorFor, setColorFor] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; y: number; order: string[] } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const order = drag?.order || cols.map((c) => c.id);
  const byId = new Map(cols.map((c) => [c.id, c]));

  const startDrag = (id: string, e: RPointerEvent) => {
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    let cur = cols.map((c) => c.id);
    setDrag({ id, y: e.clientY, order: cur });
    const move = (ev: PointerEvent) => {
      const rows = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[data-colrow]') || []);
      let k = rows.length - 1;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i].getBoundingClientRect();
        if (ev.clientY < r.top + r.height / 2) {
          k = i;
          break;
        }
      }
      const without = cur.filter((x) => x !== id);
      const idxNow = cur.indexOf(id);
      const target = Math.max(0, Math.min(without.length, k > idxNow ? k : k));
      without.splice(target, 0, id);
      if (without.join() !== cur.join()) {
        cur = without;
        setDrag({ id, y: ev.clientY, order: cur });
      }
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      setDrag(null);
      void reorderColumns(store, cur);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={title || L('Колонки', 'Manage columns')}
        footer={
          <>
            <Btn variant="ghost" icon="refresh" onClick={() => void resetColumns(store)}>
              {L('Сбросить', 'Reset to default')}
            </Btn>
            <Btn icon="plus" onClick={() => void addColumn(store)}>
              {L('Колонка', 'Add column')}
            </Btn>
          </>
        }
      >
        <div ref={listRef} className="space-y-1.5">
          <AnimatePresence initial={false}>
            {order.map((id) => {
              const c = byId.get(id);
              if (!c) return null;
              return (
                <motion.div key={c.id} data-colrow layout transition={SPRING} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, height: 0 }} className={`rounded-2xl bg-panel-2 ${drag?.id === c.id ? 'ring-2 ring-[var(--accent-1)] shadow-[var(--shadow)]' : ''}`}>
                  <div className="flex items-center gap-1.5 px-1.5 min-h-[52px]">
                    <button className="w-9 h-11 grid place-items-center text-dim touch-none cursor-grab" aria-label={L('Перетащить колонку', 'Drag column')} data-cursor="Drag" onPointerDown={(e) => startDrag(c.id, e)}>
                      <Icon name="grip" size={16} />
                    </button>
                    <button className="w-11 h-11 grid place-items-center shrink-0" aria-label={L('Цвет колонки', 'Column color')} onClick={() => setColorFor(colorFor === c.id ? null : c.id)}>
                      <span className="w-4 h-4 rounded-full" style={{ background: c.color }} />
                    </button>
                    <RowName col={c} store={store} />
                    <span className="text-[12px] text-dim mono w-6 text-right">{counts[c.id] || 0}</span>
                    <label className="flex items-center gap-1.5 text-[12px] text-muted px-1">
                      <span className="hidden sm:inline">Done</span>
                      <Toggle on={c.isDone} onChange={(isDone) => void patchColumn(store, c.id, { isDone })} />
                    </label>
                    <button className="w-11 h-11 grid place-items-center text-dim hover:text-blood disabled:opacity-30" disabled={cols.length <= 1} aria-label={L('Удалить колонку', 'Delete column')} onClick={() => void deleteColumn(store, c.id, ask)}>
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
                  {colorFor === c.id && (
                    <div className="px-3 pb-3">
                      <ColumnColors value={c.color} onChange={(color) => void patchColumn(store, c.id, { color })} />
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
          <p className="text-[12px] text-dim px-1 pt-1">{L('Изменения сохраняются сразу. «Done» — колонка, в которой видео считается опубликованным: связанный Curse закрывается, XP начисляется один раз.', 'Changes save instantly. “Done” marks the column where a video counts as published: the linked Curse closes and XP is awarded once.')}</p>
        </div>
      </Modal>
      {askNode}
    </>
  );
}

function RowName({ col, store }: { col: Column; store: ColumnStore }) {
  const [v, setV] = useState(col.name);
  useEffect(() => setV(col.name), [col.name]);
  return (
    <input
      className="flex-1 min-w-0 bg-transparent outline-none rounded-lg px-2 min-h-[40px] hover:bg-panel-2 focus:bg-[var(--panel-solid)] text-[14.5px]"
      value={v}
      aria-label={L('Название колонки', 'Column name')}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => (v.trim() ? v.trim() !== col.name && void patchColumn(store, col.id, { name: v }) : setV(col.name))}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          e.stopPropagation();
          setV(col.name);
        }
      }}
    />
  );
}
