// Jujutsu HQ v2 — домашний экран из виджетов как в iOS: размеры S/M/L/XL, режим редактирования, перетаскивание.
import { subDays } from 'date-fns';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPE } from 'react';
import { REVEAL_EVENT, revealed } from '../../lib/boot';
import { blurPx, CSS_EASE_OUT, DUR, ms, play } from '../../lib/motion';
import { Icon } from '../../components/Icon';
import { Btn, Modal, Seg } from '../../components/ui';
import { db } from '../../db/schema';
import { dayKey, fmt } from '../../lib/dates';
import { confirmBox, toast } from '../../lib/fx';
import { useLive, useNow } from '../../lib/hooks';
import { go } from '../../lib/router';
import { L, uid } from '../../lib/runtime';
import { useDark, useSettings } from '../../lib/settings';
import { accentOf, accentVars } from '../../lib/theme';
import { totalXp } from '../../lib/xp';
import { HomeCtx, PRESETS, WIDGETS, type HomeData, type WidgetItem, type WSize } from './widgets';

const LAYOUT_KEY = 'home-layout';
let lastLongPress = 0;
const SPAN: Record<WSize, string> = {
  S: 'col-span-1 row-span-1',
  M: 'col-span-2 row-span-1',
  L: 'col-span-2 row-span-2',
  XL: 'col-span-2 row-span-2 xl:col-span-4',
};
const SIZE_NAME: Record<WSize, string> = { S: 'S · 1×1', M: 'M · 2×1', L: 'L · 2×2', XL: 'XL · 4×2' };

async function saveLayout(items: WidgetItem[]) {
  await db.kv.put({ key: LAYOUT_KEY, value: { items } });
}

/** Каскад виджетов после прелоадера: stagger 60 мс, y 24→0, scale 0.96→1, blur 8→0. */
function useRevealCascade(ref: { current: HTMLElement | null }, ready: boolean) {
  const done = useRef(false);
  useLayoutEffect(() => {
    const grid = ref.current;
    if (!ready || !grid || done.current) return;
    done.current = true;
    if (revealed || !document.documentElement.classList.contains('preloading')) return;
    const items = Array.from(grid.children) as HTMLElement[];
    items.forEach((el) => (el.style.opacity = '0'));
    const go = () => {
      const b = blurPx(8);
      items.forEach((el, i) => {
        el.style.opacity = '';
        void play(el, [{ opacity: 0, transform: 'translate3d(0,24px,0) scale(0.96)', filter: `blur(${b}px)` }, { opacity: 1, transform: 'none', filter: 'blur(0px)' }], { duration: ms(DUR.base), delay: i * 60, easing: CSS_EASE_OUT, clear: true });
      });
    };
    window.addEventListener(REVEAL_EVENT, go, { once: true });
    return () => window.removeEventListener(REVEAL_EVENT, go);
  }, [ready, ref]);
}

export function Home() {
  const gridRef = useRef<HTMLDivElement>(null);
  const now = useNow(30_000);
  const s = useSettings();
  const dark = useDark();
  const stored = useLive(async () => ((await db.kv.get(LAYOUT_KEY))?.value as { items: WidgetItem[] } | undefined) ?? null, []);
  const raw = useLive(async () => {
    const since = dayKey(subDays(new Date(), 130));
    const [curses, techs, assignments, subjects, calEvents, sources, routines, rlogs, meds, mlogs, workouts, templates, vows, practice, reviews, goals, notes, bodyWeights, xp] = await Promise.all([
      db.curses.toArray(),
      db.techniques.orderBy('order').toArray(),
      db.assignments.toArray(),
      db.subjects.toArray(),
      db.calEvents.toArray(),
      db.calSources.toArray(),
      db.routines.toArray(),
      db.routineLogs.where('date').aboveOrEqual(since).toArray(),
      db.meds.toArray(),
      db.medLogs.where('date').aboveOrEqual(since).toArray(),
      db.workouts.toArray(),
      db.templates.toArray(),
      db.vows.toArray(),
      db.practice.toArray(),
      db.reviews.toArray(),
      db.goals.toArray(),
      db.notes.toArray(),
      db.bodyWeights.toArray(),
      totalXp(),
    ]);
    const off = new Set(sources.filter((x) => !x.enabled).map((x) => x.id));
    return { curses, techs, assignments, subjects, calEvents: calEvents.filter((e) => !off.has(e.sourceId) && !e.hidden), routines, rlogs, meds, mlogs, workouts, templates, vows, practice, reviews, goals, notes, bodyWeights, xp };
  }, []);
  const data = useMemo<HomeData | null>(() => (raw ? { ...raw, now, settings: s } : null), [raw, now, s]);
  const [items, setItems] = useState<WidgetItem[] | null>(null);
  const [edit, setEdit] = useState(false);
  const [gallery, setGallery] = useState(false);
  const [menu, setMenu] = useState<WidgetItem | null>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);

  useEffect(() => {
    if (stored === undefined) return;
    setItems((cur) => cur ?? (stored?.items?.length ? stored.items : PRESETS()[0].items()));
  }, [stored]);

  const commit = (next: WidgetItem[]) => {
    setItems(next);
    void saveLayout(next);
  };

  // перетаскивание за ручку: живая перестановка под пальцем/курсором
  const onHandleDown = (e: RPE, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    setDrag({ id, x: e.clientX, y: e.clientY });
  };
  const onHandleMove = (e: RPE) => {
    if (!drag || !items) return;
    setDrag({ ...drag, x: e.clientX, y: e.clientY });
    const el = document.elementsFromPoint(e.clientX, e.clientY).find((n) => (n as HTMLElement).dataset?.wid && (n as HTMLElement).dataset.wid !== drag.id) as HTMLElement | undefined;
    if (!el) return;
    const to = items.findIndex((i) => i.id === el.dataset.wid);
    const from = items.findIndex((i) => i.id === drag.id);
    if (to < 0 || from < 0 || to === from) return;
    const next = items.slice();
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    setItems(next);
  };
  const onHandleUp = () => {
    if (!drag) return;
    setDrag(null);
    if (items) void saveLayout(items);
  };

  useRevealCascade(gridRef, !!(data && items));
  if (!data || !items) return null;
  const dragged = drag && items.find((i) => i.id === drag.id);

  return (
    <HomeCtx.Provider value={data}>
      <div className="flex flex-wrap items-end gap-3 mb-5">
        <div className="min-w-0">
          <h1 className="large-title grad-text" data-large-title="">
            Jujutsu HQ
          </h1>
          <div className="text-[15px] text-muted mt-1.5 capitalize">{fmt(now, 'EEEE, d MMMM')}</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {edit && (
            <Btn size="sm" variant="ghost" icon="plus" onClick={() => setGallery(true)}>
              {L('Виджет', 'Widget')}
            </Btn>
          )}
          <Btn size="sm" variant={edit ? 'primary' : 'ghost'} icon={edit ? 'check' : 'widgets'} onClick={() => setEdit(!edit)}>
            {edit ? L('Готово', 'Done') : L('Изменить', 'Edit')}
          </Btn>
        </div>
      </div>

      {edit && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="label">{L('Раскладки', 'Layouts')}:</span>
          {PRESETS().map((p) => (
            <button
              key={p.id}
              className="chip"
              onClick={async () => {
                if (await confirmBox(L(`Заменить раскладку на «${p.name}»?`, `Replace layout with “${p.name}”?`))) commit(p.items());
              }}
            >
              {p.name}
            </button>
          ))}
          <span className="text-[12px] text-dim">{L('Тяни за ручку, чтобы переставить. Нажми на виджет — размер и настройки.', 'Drag the handle to move. Tap a widget for size and settings.')}</span>
        </div>
      )}

      <div ref={gridRef} className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3 auto-rows-[150px] md:auto-rows-[156px] grid-flow-row-dense" style={{ touchAction: drag ? 'none' : undefined }}>
        <AnimatePresence initial={false}>
          {items.map((it) => {
            const def = WIDGETS.find((w) => w.type === it.type);
            if (!def) return null;
            const [a, b] = accentOf(s, def.section);
            return (
              <motion.div
                key={it.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: drag?.id === it.id ? 0.35 : 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                className={`${SPAN[it.size]} ${edit && !drag ? 'jiggle' : ''}`}
                style={accentVars(a, b, dark)}
              >
                <WidgetFrame
                  it={it}
                  edit={edit}
                  onLong={() => setEdit(true)}
                  onOpen={() => (edit ? setMenu(it) : go(typeof def.route === 'string' ? def.route : def.route(it.config)))}
                  onRemove={() => commit(items.filter((x) => x.id !== it.id))}
                  onHandleDown={(e) => onHandleDown(e, it.id)}
                  onHandleMove={onHandleMove}
                  onHandleUp={onHandleUp}
                  onConfig={(config) => commit(items.map((x) => (x.id === it.id ? { ...x, config } : x)))}
                />
              </motion.div>
            );
          })}
        </AnimatePresence>
        {edit && (
          <button className="col-span-1 row-span-1 rounded-[26px] border-2 border-dashed border-line grid place-items-center text-muted hover:text-ink" onClick={() => setGallery(true)}>
            <span className="flex flex-col items-center gap-1">
              <Icon name="plus" size={26} />
              <span className="text-[13px]">{L('Виджет', 'Widget')}</span>
            </span>
          </button>
        )}
      </div>

      {edit && (
        <div className="flex justify-center mt-6">
          <Btn
            size="sm"
            variant="ghost"
            icon="refresh"
            onClick={async () => {
              if (await confirmBox(L('Сбросить главную к раскладке по умолчанию?', 'Reset home to default layout?'))) commit(PRESETS()[0].items());
            }}
          >
            {L('Сбросить по умолчанию', 'Reset to default')}
          </Btn>
        </div>
      )}

      {dragged && drag && (
        <div className="fixed z-[90] pointer-events-none -translate-x-1/2 -translate-y-1/2" style={{ left: drag.x, top: drag.y }}>
          <div className="panel !rounded-2xl px-4 py-3 flex items-center gap-2 shadow-2xl">
            <Icon name={WIDGETS.find((w) => w.type === dragged.type)?.icon || 'widgets'} size={16} />
            <span className="text-[14px] font-semibold">{WIDGETS.find((w) => w.type === dragged.type)?.title()}</span>
          </div>
        </div>
      )}

      <Gallery
        open={gallery}
        onClose={() => setGallery(false)}
        onAdd={(type, size) => {
          commit([...items, { id: uid(), type, size }]);
          setGallery(false);
          toast(L('Виджет добавлен', 'Widget added'));
        }}
      />
      <WidgetMenu
        it={menu}
        onClose={() => setMenu(null)}
        onChange={(n) => {
          commit(items.map((x) => (x.id === n.id ? n : x)));
          setMenu(n);
        }}
        onDuplicate={(n) => {
          const i = items.findIndex((x) => x.id === n.id);
          const next = items.slice();
          next.splice(i + 1, 0, { ...n, id: uid() });
          commit(next);
          setMenu(null);
        }}
        onRemove={(n) => {
          commit(items.filter((x) => x.id !== n.id));
          setMenu(null);
        }}
      />
    </HomeCtx.Provider>
  );
}

function WidgetFrame({
  it,
  edit,
  onLong,
  onOpen,
  onRemove,
  onHandleDown,
  onHandleMove,
  onHandleUp,
  onConfig,
}: {
  it: WidgetItem;
  edit: boolean;
  onLong: () => void;
  onOpen: () => void;
  onRemove: () => void;
  onHandleDown: (e: RPE) => void;
  onHandleMove: (e: RPE) => void;
  onHandleUp: () => void;
  onConfig: (c: WidgetItem['config']) => void;
}) {
  const def = WIDGETS.find((w) => w.type === it.type)!;
  const press = useRef<{ t: number; x: number; y: number; fired: boolean } | null>(null);
  return (
    <div
      data-wid={it.id}
      role="button"
      tabIndex={0}
      className="panel !rounded-[26px] h-full flex flex-col p-3.5 text-left select-none cursor-pointer active:scale-[0.985] transition-transform"
      onPointerDown={(e) => {
        if (edit) return;
        const st = { t: 0, x: e.clientX, y: e.clientY, fired: false };
        st.t = window.setTimeout(() => {
          st.fired = true;
          lastLongPress = Date.now();
          navigator.vibrate?.(12);
          onLong();
        }, 520);
        press.current = st;
      }}
      onPointerMove={(e) => {
        const p = press.current;
        if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 9) {
          window.clearTimeout(p.t);
          press.current = null;
        }
      }}
      onPointerUp={() => press.current && window.clearTimeout(press.current.t)}
      onPointerCancel={() => press.current && window.clearTimeout(press.current.t)}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        // клик, который завершает долгое нажатие, не должен открывать виджет/меню (кадр мог перемонтироваться)
        if (press.current?.fired || Date.now() - lastLongPress < 800) {
          press.current = null;
          return;
        }
        press.current = null;
        onOpen();
      }}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
    >
      <div className="flex items-center gap-2 mb-2 shrink-0">
        <span className="app-icon w-6 h-6 !rounded-[7px]">
          <Icon name={def.icon} size={13} stroke={2.2} />
        </span>
        <span className="text-[12.5px] font-semibold text-muted truncate flex-1">{def.title()}</span>
      </div>
      <div className={`flex-1 min-h-0 overflow-hidden ${edit ? 'pointer-events-none' : ''}`}>{def.render({ size: it.size, config: it.config, onConfig })}</div>
      {edit && (
        <>
          <button
            className="absolute top-1.5 left-1.5 w-7 h-7 rounded-full bg-[#8e8e93] text-white grid place-items-center shadow z-10"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            aria-label={L('Удалить виджет', 'Remove widget')}
          >
            <Icon name="minus" size={16} stroke={3} />
          </button>
          <span
            className="absolute top-1 right-1 w-10 h-10 rounded-full grid place-items-center text-muted bg-panel-2 z-10 cursor-grab active:cursor-grabbing"
            style={{ touchAction: 'none' }}
            onPointerDown={onHandleDown}
            onPointerMove={onHandleMove}
            onPointerUp={onHandleUp}
            onPointerCancel={onHandleUp}
            onClick={(e) => e.stopPropagation()}
            aria-label={L('Переместить', 'Move')}
          >
            <Icon name="grip" size={18} />
          </span>
        </>
      )}
    </div>
  );
}

function Gallery({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (type: string, size: WSize) => void }) {
  const s = useSettings();
  const dark = useDark();
  const [sizes, setSizes] = useState<Record<string, WSize>>({});
  return (
    <Modal open={open} onClose={onClose} title={L('Галерея виджетов', 'Widget gallery')} wide="xl">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {WIDGETS.map((w) => {
          const size = sizes[w.type] || w.def;
          const [a, b] = accentOf(s, w.section);
          return (
            <div key={w.type} className="rounded-3xl bg-panel-2 p-3 flex flex-col gap-2" style={accentVars(a, b, dark)}>
              <div className="pointer-events-none">
                <div className={`panel !rounded-[22px] p-3 ${size === 'S' ? 'w-[150px] h-[150px]' : size === 'M' ? 'h-[150px]' : 'h-[260px]'} overflow-hidden flex flex-col`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="app-icon w-6 h-6 !rounded-[7px]">
                      <Icon name={w.icon} size={13} />
                    </span>
                    <span className="text-[12.5px] font-semibold text-muted truncate">{w.title()}</span>
                  </div>
                  <div className="flex-1 min-h-0 overflow-hidden">{w.render({ size })}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Seg options={w.sizes.map((z) => ({ v: z, label: z }))} value={size} onChange={(z) => setSizes({ ...sizes, [w.type]: z })} />
                <Btn size="sm" icon="plus" className="ml-auto" onClick={() => onAdd(w.type, size)}>
                  {L('Добавить', 'Add')}
                </Btn>
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

function WidgetMenu({ it, onClose, onChange, onDuplicate, onRemove }: { it: WidgetItem | null; onClose: () => void; onChange: (i: WidgetItem) => void; onDuplicate: (i: WidgetItem) => void; onRemove: (i: WidgetItem) => void }) {
  const techs = useLive(() => db.techniques.orderBy('order').toArray(), []) || [];
  const subjects = useLive(() => db.subjects.toArray(), []) || [];
  const def = it && WIDGETS.find((w) => w.type === it.type);
  return (
    <Modal open={!!it && !!def} onClose={onClose} title={def?.title()}>
      {it && def && (
        <div className="space-y-4">
          <div>
            <div className="label mb-1.5 ml-1">{L('Размер', 'Size')}</div>
            <Seg options={def.sizes.map((z) => ({ v: z, label: SIZE_NAME[z] }))} value={it.size} onChange={(size) => onChange({ ...it, size })} />
            {it.size === 'XL' && <div className="text-[12px] text-dim mt-1 ml-1">{L('XL раскрывается на 4 колонки только на ПК', 'XL spans 4 columns on desktop only')}</div>}
          </div>
          {def.config === 'technique' && (
            <label className="block">
              <span className="label block mb-1.5 ml-1">{L('Какие дедлайны', 'Which deadlines')}</span>
              <select className="inp" value={it.config?.techniqueId || ''} onChange={(e) => onChange({ ...it, config: { ...it.config, techniqueId: e.target.value || undefined } })}>
                <option value="">{L('Все', 'All')}</option>
                {techs.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {def.config === 'subject' && (
            <label className="block">
              <span className="label block mb-1.5 ml-1">{L('Предмет', 'Subject')}</span>
              <select className="inp" value={it.config?.subjectId || ''} onChange={(e) => onChange({ ...it, config: { ...it.config, subjectId: e.target.value || undefined } })}>
                <option value="">{L('Все', 'All')}</option>
                {subjects.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <Btn size="sm" variant="ghost" icon="copy" onClick={() => onDuplicate(it)}>
              {L('Дублировать', 'Duplicate')}
            </Btn>
            <Btn size="sm" variant="ghost" icon="external" onClick={() => go(typeof def.route === 'string' ? def.route : def.route(it.config))}>
              {L('Открыть раздел', 'Open section')}
            </Btn>
            <Btn size="sm" variant="danger" icon="trash" className="ml-auto" onClick={() => onRemove(it)}>
              {L('Удалить', 'Remove')}
            </Btn>
          </div>
        </div>
      )}
    </Modal>
  );
}
