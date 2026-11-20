// YouTube Technique: пять видов базы — Board, Table, Week, Calendar, Gallery. Колонки статусов настраиваемые (v4).
import { addWeeks, subWeeks } from 'date-fns';
import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { ColumnMenu, ColumnName, useColumnAsk } from '../../../components/columns';
import { Icon } from '../../../components/Icon';
import { Monster } from '../../../components/Monster';
import { MonthGrid, useWeekDays } from '../../../components/shared';
import { BlobImg, Btn, IBtn, Progress } from '../../../components/ui';
import type { Video, VideoProp, VideoStatus } from '../../../db/schema';
import { curseGrade } from '../../../lib/grade';
import { dayKey, fmt } from '../../../lib/dates';
import { useMedia, useNow } from '../../../lib/hooks';
import { SPRING } from '../../../lib/motion';
import { L } from '../../../lib/runtime';
import { addColumn, reorderColumns, videoColumnStore, type ColumnStore } from '../../../lib/statuses';
import { iconOf, isDoneIn, PRIORITY, PRIORITY_COLOR, progressOf, statusOf } from '../../../lib/videoMeta';
import { patchVideo } from '../../../lib/videos';
import { TiltGallery } from '../../../components/TiltGallery';
import { runCurtain } from '../../../lib/transition';

export type ViewProps = { videos: Video[]; cols: VideoStatus[]; open: (id: string) => void; create: (p: Partial<Video>) => void; props: VideoProp[]; onManage: () => void };

export const dateOf = (v: Video) => v.publishAt ?? v.deadline;

export function PageIcon({ v, cols, size = 22 }: { v: Pick<Video, 'icon' | 'statusId'>; cols: VideoStatus[]; size?: number }) {
  const ic = iconOf(v, cols);
  return (
    <span className="grid place-items-center rounded-[28%] shrink-0 text-white" style={{ width: size, height: size, background: ic.color }}>
      <Icon name={ic.name} size={Math.round(size * 0.62)} />
    </span>
  );
}

export function StatusPill({ col }: { col: VideoStatus }) {
  return (
    <span className="tag !text-[11px] whitespace-nowrap" style={{ color: col.color, background: `color-mix(in srgb, ${col.color} 15%, transparent)` }}>
      {col.name}
    </span>
  );
}

function VMonster({ v, cols, size = 30 }: { v: Video; cols: VideoStatus[]; size?: number }) {
  const now = useNow(60_000);
  if (!v.deadline || isDoneIn(v, cols)) return null;
  const g = curseGrade(v.deadline, Math.max(1, v.priority + 2), now);
  return <Monster grade={g.grade} overdue={g.overdue} size={size} title={L('Дедлайн', 'Deadline')} />;
}

export function VideoCard({ v, cols, onOpen, compact }: { v: Video; cols: VideoStatus[]; onOpen: () => void; compact?: boolean }) {
  const p = progressOf(v, cols);
  const d = dateOf(v);
  return (
    <button className="vcard w-full text-left" onClick={onOpen} data-vid={v.id} data-cursor="Open">
      <div className="flex items-start gap-2">
        <PageIcon v={v} cols={cols} size={20} />
        <span className="flex-1 min-w-0 text-[13.5px] font-semibold leading-snug line-clamp-3">{v.title || L('Без названия', 'Untitled')}</span>
        <VMonster v={v} cols={cols} size={compact ? 26 : 30} />
      </div>
      <div className="flex flex-wrap items-center gap-1 mt-1.5">
        <span className="tag !text-[10.5px]">{v.format === 'short' ? 'Short' : 'Long'}</span>
        {v.priority > 0 && <span className="tag !text-[10.5px]" style={{ color: PRIORITY_COLOR[v.priority] }}>{PRIORITY()[v.priority]}</span>}
        {v.tags.slice(0, 2).map((t) => (
          <span key={t} className="tag !text-[10.5px]">#{t}</span>
        ))}
        {v.curseId && <span className="tag !text-[10.5px] text-blood">Curse</span>}
      </div>
      {d && (
        <div className="text-[11.5px] text-muted mt-1 flex items-center gap-1">
          <Icon name={v.publishAt ? 'calendar' : 'hourglass'} size={11} /> {fmt(d, 'd MMM, HH:mm')}
        </div>
      )}
      {!compact && <Progress value={p} className="mt-2" height={4} />}
    </button>
  );
}

// ───── Board ─────
export function BoardView({ videos, cols, open, create, store = videoColumnStore }: ViewProps & { store?: ColumnStore }) {
  const coarse = useMedia('(pointer: coarse)');
  const boardRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; col?: string; before?: string | null } | null>(null);
  const [colDrag, setColDrag] = useState<{ id: string; order: string[] } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ id: string; rect: DOMRect } | null>(null);
  const [ask, askNode] = useColumnAsk(store);
  const suppressClick = useRef(0);

  const orderIds = colDrag?.order || cols.map((c) => c.id);
  const colById = new Map(cols.map((c) => [c.id, c]));
  const shown = orderIds.map((id) => colById.get(id)).filter((c): c is VideoStatus => !!c);
  const lists = shown.map((c) => ({ c, items: videos.filter((v) => v.statusId === c.id).sort((a, b) => a.order - b.order) }));
  const orphans = videos.filter((v) => !colById.has(v.statusId));

  // автопрокрутка доски у краёв во время перетаскивания
  const edgeScroll = (getX: () => number) =>
    window.setInterval(() => {
      const b = boardRef.current;
      if (!b) return;
      const r = b.getBoundingClientRect();
      const x = getX();
      if (x < r.left + 40) b.scrollLeft -= 14;
      else if (x > r.right - 40) b.scrollLeft += 14;
    }, 16);

  // ── перетаскивание карточки (мышь — сразу, палец — после долгого нажатия) ──
  const begin = (v: Video, e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const sx = e.clientX;
    const sy = e.clientY;
    const el = e.currentTarget;
    const pid = e.pointerId;
    let active = false;
    let timer = 0;
    let scrollTimer = 0;
    let last = { x: sx, y: sy };
    const target = (x: number, y: number) => {
      const hit = document.elementsFromPoint(x, y);
      const col = hit.find((n) => (n as HTMLElement).dataset?.col)?.getAttribute('data-col') || null;
      const card = hit.find((n) => (n as HTMLElement).dataset?.vid && (n as HTMLElement).dataset.vid !== v.id) as HTMLElement | undefined;
      let before: string | null = null;
      if (card) {
        const r = card.getBoundingClientRect();
        const id = card.dataset.vid!;
        if (y < r.top + r.height / 2) before = id;
        else {
          const list = lists.find((l) => l.c.id === col)?.items.filter((x) => x.id !== v.id) || [];
          const i = list.findIndex((x) => x.id === id);
          before = list[i + 1]?.id ?? null;
        }
      }
      return { col: col || undefined, before };
    };
    const start = () => {
      active = true;
      try {
        el.setPointerCapture(pid);
      } catch {
        /* указатель уже отпущен */
      }
      navigator.vibrate?.(10);
      setDrag({ id: v.id, x: last.x, y: last.y, ...target(last.x, last.y) });
      scrollTimer = edgeScroll(() => last.x);
    };
    if (e.pointerType === 'touch') timer = window.setTimeout(start, 380);
    const move = (ev: PointerEvent) => {
      last = { x: ev.clientX, y: ev.clientY };
      if (!active) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 8) {
          if (ev.pointerType === 'touch') return cleanup();
          start();
        }
        return;
      }
      ev.preventDefault();
      setDrag({ id: v.id, x: ev.clientX, y: ev.clientY, ...target(ev.clientX, ev.clientY) });
    };
    const up = async (ev: PointerEvent) => {
      const was = active;
      cleanup();
      if (!was) return;
      const t = target(ev.clientX, ev.clientY);
      setDrag(null);
      suppressClick.current = Date.now();
      if (!t.col) return;
      const list = videos.filter((x) => x.statusId === t.col && x.id !== v.id).sort((a, b) => a.order - b.order);
      const i = t.before ? list.findIndex((x) => x.id === t.before) : list.length;
      const prev = list[i - 1]?.order;
      const next = list[i]?.order;
      const order = prev === undefined && next === undefined ? Date.now() : prev === undefined ? next! - 1 : next === undefined ? prev + 1 : (prev + next) / 2;
      await patchVideo(v.id, { statusId: t.col, order });
    };
    // пока карточка перетаскивается пальцем, браузер не должен прокручивать страницу (иначе он отменит жест)
    const block = (ev: TouchEvent) => {
      if (active) ev.preventDefault();
    };
    window.addEventListener('touchmove', block, { passive: false });
    const cleanup = () => {
      clearTimeout(timer);
      clearInterval(scrollTimer);
      window.removeEventListener('touchmove', block);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      active = false;
    };
    const cancel = () => {
      cleanup();
      setDrag(null);
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  };

  // ── перетаскивание колонки за заголовок (мышь — сразу, палец — долгое нажатие) ──
  const beginCol = (id: string, e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button, input')) return;
    const sx = e.clientX;
    const el = e.currentTarget;
    const pid = e.pointerId;
    let active = false;
    let timer = 0;
    let scrollTimer = 0;
    let lastX = sx;
    let order = cols.map((c) => c.id);
    const start = () => {
      active = true;
      try {
        el.setPointerCapture(pid);
      } catch {
        /* указатель уже отпущен */
      }
      navigator.vibrate?.(10);
      setColDrag({ id, order });
      scrollTimer = edgeScroll(() => lastX);
    };
    if (e.pointerType === 'touch') timer = window.setTimeout(start, 420);
    const move = (ev: PointerEvent) => {
      lastX = ev.clientX;
      if (!active) {
        if (Math.abs(ev.clientX - sx) > 8 || Math.abs(ev.clientY - e.clientY) > 8) {
          if (ev.pointerType === 'touch') return cleanup();
          start();
        }
        return;
      }
      ev.preventDefault();
      const heads = Array.from(boardRef.current?.querySelectorAll<HTMLElement>('[data-col]') || []);
      let k = heads.length - 1;
      for (let i = 0; i < heads.length; i++) {
        const r = heads[i].getBoundingClientRect();
        if (ev.clientX < r.left + r.width / 2) {
          k = i;
          break;
        }
      }
      const without = order.filter((x) => x !== id);
      without.splice(Math.min(k, without.length), 0, id);
      if (without.join() !== order.join()) {
        order = without;
        setColDrag({ id, order });
      }
    };
    const block = (ev: TouchEvent) => {
      if (active) ev.preventDefault();
    };
    const up = () => {
      const was = active;
      cleanup();
      if (!was) return;
      suppressClick.current = Date.now();
      setColDrag(null);
      void reorderColumns(store, order);
    };
    const cleanup = () => {
      clearTimeout(timer);
      clearInterval(scrollTimer);
      window.removeEventListener('touchmove', block);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      active = false;
    };
    window.addEventListener('touchmove', block, { passive: false });
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const dragged = drag ? videos.find((v) => v.id === drag.id) : undefined;
  const newColumn = async () => {
    const c = await addColumn(store, cols[cols.length - 1]?.id, L('Новая колонка', 'New column'));
    setFresh(c.id);
    setEditing(c.id);
    requestAnimationFrame(() => boardRef.current?.scrollTo({ left: boardRef.current.scrollWidth, behavior: 'smooth' }));
  };

  const renderCol = (c: VideoStatus | null, items: Video[]) => {
    const key = c?.id || '__none';
    return (
      <motion.div
        key={key}
        layout
        transition={SPRING}
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9, width: 0, paddingLeft: 0, paddingRight: 0, marginRight: -12 }}
        data-col={c?.id || undefined}
        className={`vcol snap-start ${drag?.col === c?.id ? 'vcol-over' : ''} ${colDrag?.id === key ? 'vcol-lift' : ''}`}
      >
        <div className="flex items-center gap-2 px-1 pb-2 min-h-[36px] select-none" onPointerDown={c ? (e) => beginCol(c.id, e) : undefined} style={{ touchAction: colDrag ? 'none' : undefined, cursor: c && !coarse ? 'grab' : undefined }} data-cursor={c ? 'Drag' : undefined}>
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c?.color || '#8e8e93' }} />
          {c ? (
            <ColumnName
              col={c}
              store={store}
              editing={editing === c.id}
              setEditing={(on) => {
                setEditing(on ? c.id : null);
                if (!on) setFresh(null);
              }}
              onCancelNew={fresh === c.id ? () => void store.remove(c.id).then(() => setFresh(null)) : undefined}
              className="text-[13px] font-semibold"
            />
          ) : (
            <span className="text-[13px] font-semibold text-muted">{L('Без статуса', 'No status')}</span>
          )}
          {c?.isDone && <Icon name="check" size={12} className="text-jade shrink-0" />}
          <span className="text-[12px] text-dim">{items.length}</span>
          {c && (
            <span className="ml-auto flex items-center">
              <button className="ibtn ibtn-sm" aria-label={L('Новое видео', 'New video') + ' — ' + c.name} onClick={() => create({ statusId: c.id })}>
                <Icon name="plus" size={14} />
              </button>
              <button className="ibtn ibtn-sm" aria-label={L('Меню колонки', 'Column menu') + ' — ' + c.name} onClick={(e) => setMenu({ id: c.id, rect: e.currentTarget.getBoundingClientRect() })}>
                <Icon name="more" size={14} />
              </button>
            </span>
          )}
        </div>
        <div className="space-y-2 min-h-[80px]">
          {items.map((v) => (
            <div key={v.id}>
              {drag && drag.col === c?.id && drag.before === v.id && <div className="vdrop" />}
              <div
                className={`select-none ${drag?.id === v.id ? 'opacity-30' : ''}`}
                onPointerDown={(e) => begin(v, e)}
                onClickCapture={(e) => {
                  if (Date.now() - suppressClick.current < 400) {
                    e.stopPropagation();
                    e.preventDefault();
                  }
                }}
                onContextMenu={(e) => coarse && e.preventDefault()}
              >
                <VideoCard v={v} cols={cols} onOpen={() => open(v.id)} />
              </div>
            </div>
          ))}
          {drag && c && drag.col === c.id && drag.before === null && <div className="vdrop" />}
          {c && (
            <button className="w-full text-left text-[12.5px] text-dim hover:text-acc px-2 min-h-[36px] rounded-lg" onClick={() => create({ statusId: c.id })}>
              + {L('Новое', 'New')}
            </button>
          )}
        </div>
      </motion.div>
    );
  };

  const menuCol = menu ? cols.find((c) => c.id === menu.id) : undefined;
  return (
    <div ref={boardRef} className={`vboard ${coarse ? 'snap-x snap-mandatory' : ''}`}>
      <AnimatePresence initial={false} mode="popLayout">
        {lists.map(({ c, items }) => renderCol(c, items))}
        {orphans.length > 0 && renderCol(null, orphans)}
      </AnimatePresence>
      <motion.button layout transition={SPRING} className="vcol vcol-add snap-start" onClick={() => void newColumn()} aria-label={L('Добавить колонку', 'Add column')}>
        <Icon name="plus" size={16} /> {L('Колонка', 'Add column')}
      </motion.button>
      {drag && dragged && (
        <div className="fixed z-[130] pointer-events-none w-[240px] rotate-2 opacity-95" style={{ left: drag.x - 120, top: drag.y - 30 }}>
          <VideoCard v={dragged} cols={cols} onOpen={() => {}} compact />
        </div>
      )}
      {menu && menuCol && (
        <ColumnMenu
          col={menuCol}
          store={store}
          index={cols.findIndex((c) => c.id === menuCol.id)}
          total={cols.length}
          anchor={menu.rect}
          onClose={() => setMenu(null)}
          onRename={() => setEditing(menuCol.id)}
          ask={ask}
        />
      )}
      {askNode}
    </div>
  );
}

// ───── Table ─────
type SortKey = 'title' | 'status' | 'format' | 'publishAt' | 'deadline' | 'priority' | 'progress' | 'views' | 'likes' | 'series' | `p:${string}`;
export function TableView({ videos, cols, open, props, group, onManage }: ViewProps & { group: 'none' | 'status' | 'format' | 'series' | 'tag' }) {
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: 'status', dir: 1 });
  const val = (v: Video, k: SortKey): string | number => {
    if (k.startsWith('p:')) {
      const x = v.props?.[k.slice(2)];
      return typeof x === 'number' ? x : String(x ?? '');
    }
    switch (k) {
      case 'status':
        return cols.findIndex((c) => c.id === v.statusId);
      case 'progress':
        return progressOf(v, cols);
      case 'publishAt':
        return v.publishAt ?? Infinity;
      case 'deadline':
        return v.deadline ?? Infinity;
      case 'views':
        return v.views ?? -1;
      case 'likes':
        return v.likes ?? -1;
      case 'priority':
        return v.priority;
      default:
        return String((v as unknown as Record<string, unknown>)[k] ?? '').toLowerCase();
    }
  };
  const sorted = useMemo(() => videos.slice().sort((a, b) => {
    const x = val(a, sort.k);
    const y = val(b, sort.k);
    return (x < y ? -1 : x > y ? 1 : a.order - b.order) * sort.dir;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [videos, sort]);
  const groups = useMemo(() => {
    if (group === 'none') return [{ key: '', label: '', items: sorted }];
    const m = new Map<string, Video[]>();
    for (const v of sorted) {
      const keys = group === 'status' ? [statusOf(v, cols).id || '__none'] : group === 'format' ? [v.format] : group === 'series' ? [v.series || '—'] : v.tags.length ? v.tags : ['—'];
      for (const k of keys) m.set(k, [...(m.get(k) || []), v]);
    }
    const order = group === 'status' ? [...cols.map((c) => c.id), '__none'] : [...m.keys()].sort();
    return order.filter((k) => m.has(k)).map((k) => ({ key: k, label: group === 'status' ? (k === '__none' ? L('Без статуса', 'No status') : cols.find((c) => c.id === k)!.name) : group === 'format' ? (k === 'short' ? 'Short' : 'Long') : group === 'tag' && k !== '—' ? `#${k}` : k, items: m.get(k)! }));
  }, [sorted, group]);
  const head = (k: SortKey, label: string, cls = '') => (
    <th className={cls}>
      <button className="flex items-center gap-1 whitespace-nowrap" onClick={() => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : 1 }))}>
        {label}
        {sort.k === k && <Icon name={sort.dir === 1 ? 'up' : 'down'} size={11} />}
      </button>
    </th>
  );
  return (
    <div className="scroll-x vtable-wrap">
      <table className="vtable">
        <thead>
          <tr>
            {head('title', L('Название', 'Title'), 'vt-sticky min-w-[220px]')}
            {head('status', L('Статус', 'Status'))}
            {head('format', L('Формат', 'Format'))}
            {head('publishAt', L('Публикация', 'Publish'))}
            {head('deadline', L('Дедлайн', 'Deadline'))}
            {head('priority', L('Приоритет', 'Priority'))}
            <th>{L('Теги', 'Tags')}</th>
            {head('series', L('Серия', 'Series'))}
            {head('progress', L('Прогресс', 'Progress'))}
            {head('views', L('Просмотры', 'Views'))}
            {head('likes', L('Лайки', 'Likes'))}
            {props.map((p) => head(`p:${p.name}`, p.name))}
          </tr>
        </thead>
        {groups.map((g) => (
          <tbody key={g.key}>
            {g.label && (
              <tr className="vt-group">
                <td colSpan={11 + props.length}>
                  <span className="font-semibold">{g.label}</span> <span className="text-dim">{g.items.length}</span>
                </td>
              </tr>
            )}
            {g.items.map((v) => (
              <tr key={v.id + g.key}>
                <td className="vt-sticky">
                  <button className="flex items-center gap-2 text-left w-full min-w-0" onClick={() => open(v.id)}>
                    <PageIcon v={v} cols={cols} size={18} />
                    <span className="truncate font-medium">{v.title || L('Без названия', 'Untitled')}</span>
                  </button>
                </td>
                <td>
                  <select
                    className="vt-select"
                    style={{ color: statusOf(v, cols).color }}
                    value={cols.some((c) => c.id === v.statusId) ? v.statusId : ''}
                    onChange={(e) => (e.target.value === '__edit' ? onManage() : void patchVideo(v.id, { statusId: e.target.value }))}
                    aria-label={L('Статус', 'Status')}
                  >
                    {!cols.some((c) => c.id === v.statusId) && <option value="">{L('Без статуса', 'No status')}</option>}
                    {cols.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                    <option value="__edit">{L('Изменить колонки…', 'Edit columns…')}</option>
                  </select>
                </td>
                <td>{v.format === 'short' ? 'Short' : 'Long'}</td>
                <td className="whitespace-nowrap">{v.publishAt ? fmt(v.publishAt, 'd MMM yy') : ''}</td>
                <td className="whitespace-nowrap">{v.deadline ? fmt(v.deadline, 'd MMM, HH:mm') : ''}</td>
                <td style={{ color: PRIORITY_COLOR[v.priority] }}>{v.priority ? PRIORITY()[v.priority] : ''}</td>
                <td className="max-w-[180px] truncate">{v.tags.map((t) => `#${t}`).join(' ')}</td>
                <td>{v.series}</td>
                <td>
                  <div className="flex items-center gap-2 min-w-[90px]">
                    <Progress value={progressOf(v, cols)} className="flex-1" height={4} />
                    <span className="text-[11px] text-dim w-8">{progressOf(v, cols)}%</span>
                  </div>
                </td>
                <td className="mono">{v.views ?? ''}</td>
                <td className="mono">{v.likes ?? ''}</td>
                {props.map((p) => {
                  const x = v.props?.[p.name];
                  return <td key={p.id}>{p.type === 'checkbox' ? (x ? <Icon name="check" size={13} /> : '') : p.type === 'date' && x ? fmt(new Date(String(x)), 'd MMM yy') : String(x ?? '')}</td>;
                })}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
      {!videos.length && <div className="text-center text-dim text-[13px] py-8">{L('Ничего не найдено', 'Nothing found')}</div>}
    </div>
  );
}

// ───── Week ─────
export function WeekView({ videos, cols, open, create }: ViewProps) {
  const [anchor, setAnchor] = useState(() => new Date());
  const days = useWeekDays(anchor);
  const today = dayKey();
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <IBtn icon="left" onClick={() => setAnchor(subWeeks(anchor, 1))} title={L('Назад', 'Back')} />
        <Btn size="xs" variant="ghost" onClick={() => setAnchor(new Date())}>{L('Сегодня', 'Today')}</Btn>
        <IBtn icon="right" onClick={() => setAnchor(addWeeks(anchor, 1))} title={L('Вперёд', 'Next')} />
        <span className="text-[13px] text-muted">{fmt(days[0], 'd MMM')} — {fmt(days[6], 'd MMM')}</span>
        <span className="text-[11.5px] text-dim ml-auto hidden sm:inline">{L('по дате публикации или дедлайну', 'by publish date or deadline')}</span>
      </div>
      <div className="flex lg:grid lg:grid-cols-7 gap-2 scroll-x snap-x pb-1">
        {days.map((d) => {
          const k = dayKey(d);
          const items = videos.filter((v) => dateOf(v) && dayKey(dateOf(v)!) === k).sort((a, b) => dateOf(a)! - dateOf(b)!);
          return (
            <div key={k} className={`min-w-[170px] lg:min-w-0 snap-start rounded-2xl p-1.5 flex flex-col ${k === today ? 'bg-[color-mix(in_srgb,var(--accent-1)_10%,transparent)] ring-1 ring-[var(--accent-1)]' : 'bg-panel-2'}`}>
              <div className="flex items-baseline px-1.5 py-1">
                <span className={`text-[13px] font-semibold capitalize ${k === today ? 'text-acc' : ''}`}>{fmt(d, 'EEE')}</span>
                <span className="text-[11px] text-dim ml-auto mono">{fmt(d, 'd.MM')}</span>
              </div>
              <div className="space-y-1.5 flex-1 min-h-[120px]">
                {items.map((v) => (
                  <VideoCard key={v.id} v={v} cols={cols} onOpen={() => open(v.id)} compact />
                ))}
              </div>
              <button className="text-[11.5px] text-dim hover:text-acc py-1" onClick={() => create({ publishAt: new Date(`${k}T18:00`).getTime(), statusId: (cols.find((c) => c.key === 'scheduled') || cols.find((c) => !c.isDone) || cols[0])?.id })}>
                + {L('видео', 'video')}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ───── Calendar ─────
export function CalendarView({ videos, cols, open }: ViewProps) {
  const [month, setMonth] = useState(() => new Date());
  const [sel, setSel] = useState(dayKey());
  const byDay = useMemo(() => {
    const m = new Map<string, Video[]>();
    for (const v of videos) {
      const d = v.publishAt ?? v.publishedAt;
      if (d) m.set(dayKey(d), [...(m.get(dayKey(d)) || []), v]);
    }
    return m;
  }, [videos]);
  const dayItems = byDay.get(sel) || [];
  return (
    <div className="grid lg:grid-cols-[1fr_300px] gap-4 items-start">
      <MonthGrid
        month={month}
        onMonth={setMonth}
        selected={sel}
        onSelect={setSel}
        renderDay={(_d, k) => {
          const list = byDay.get(k) || [];
          return (
            <div className="space-y-0.5 mt-0.5">
              {list.slice(0, 3).map((v) => (
                <div key={v.id} className="hidden sm:flex items-center gap-1 text-[10.5px] leading-tight truncate rounded-md px-1 py-0.5" style={{ background: `color-mix(in srgb, ${statusOf(v, cols).color} 18%, transparent)` }}>
                  <span className="truncate">{v.title || '—'}</span>
                </div>
              ))}
              {list.length > 0 && <div className="sm:hidden flex justify-center gap-0.5">{list.slice(0, 3).map((v) => <span key={v.id} className="w-1.5 h-1.5 rounded-full" style={{ background: statusOf(v, cols).color }} />)}</div>}
              {list.length > 3 && <div className="hidden sm:block text-[10px] text-dim">+{list.length - 3}</div>}
            </div>
          );
        }}
      />
      <div className="space-y-2">
        <div className="text-[13px] font-semibold capitalize">{fmt(new Date(`${sel}T12:00`), 'EEEE, d MMMM')}</div>
        {dayItems.length ? dayItems.map((v) => <VideoCard key={v.id} v={v} cols={cols} onOpen={() => open(v.id)} />) : <div className="text-[13px] text-dim">{L('Публикаций нет', 'No uploads')}</div>}
      </div>
    </div>
  );
}

// ───── Gallery (TiltGallery: обложки, статус и цвет — из колонок) ─────
export function GalleryView({ videos, cols, open, create }: ViewProps) {
  const [only, setOnly] = useState<string | null>(null);
  const list = videos.slice().sort((a, b) => (dateOf(b) ?? b.createdAt) - (dateOf(a) ?? a.createdAt)).filter((v) => !only || v.statusId === only);
  return (
    <div>
      <TiltGallery
        items={list}
        total={videos.length}
        label="YouTube Technique"
        getId={(v) => v.id}
        getTitle={(v) => v.title || L('Без названия', 'Untitled')}
        getSubtitle={(v) => [statusOf(v, cols).name, dateOf(v) ? fmt(dateOf(v)!, 'd MMM') : ''].filter(Boolean).join(' · ')}
        getColor={(v) => statusOf(v, cols).color}
        getImage={(v) =>
          v.coverBlobId ? (
            <BlobImg id={v.coverBlobId} className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 grid place-items-center" style={{ background: `linear-gradient(150deg, color-mix(in srgb, ${statusOf(v, cols).color} 55%, #000), #0b0b10)` }}>
              <PageIcon v={v} cols={cols} size={64} />
            </div>
          )
        }
        renderMeta={(v) => (
          <div className="space-y-3">
            <StatusPill col={statusOf(v, cols)} />
            <div className="text-[13px] text-muted">{v.format === 'short' ? 'Short' : 'Long'}{v.series ? ` · ${v.series}` : ''}</div>
            {dateOf(v) && <div className="text-[13px]">{fmt(dateOf(v)!, 'EEEE, d MMMM')}</div>}
            <div>
              <div className="label mb-1">{L('Прогресс', 'Progress')} {progressOf(v, cols)}%</div>
              <Progress value={progressOf(v, cols)} height={4} />
            </div>
            {v.views !== undefined && <div className="mono text-[13px]">{v.views} {L('просм.', 'views')}</div>}
          </div>
        )}
        onOpen={(v) => runCurtain({ title: v.title || L('Без названия', 'Untitled'), swap: () => open(v.id) })}
        filters={
          <div>
            <div className="label mb-1.5">{L('Статус', 'Status')}</div>
            <div className="flex flex-wrap gap-1.5">
              <button className={`chip !py-1 ${!only ? 'chip-on' : ''}`} onClick={() => setOnly(null)}>{L('Все', 'All')}</button>
              {cols.map((c) => (
                <button key={c.id} className={`chip !py-1 ${only === c.id ? 'chip-on' : ''}`} onClick={() => setOnly(c.id)}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.color }} /> {c.name}
                </button>
              ))}
            </div>
          </div>
        }
        empty={<Btn icon="plus" onClick={() => create({})}>{L('Новое видео', 'New video')}</Btn>}
      />
    </div>
  );
}

export function Pill({ children, on, onClick }: { children: ReactNode; on?: boolean; onClick?: () => void }) {
  return (
    <button className={`chip !py-1 ${on ? 'chip-on' : ''}`} onClick={onClick}>
      {children}
    </button>
  );
}

