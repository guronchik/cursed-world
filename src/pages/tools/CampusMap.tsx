// Карта кампуса: своя картинка, зум/перемещение (мышь, колесо, щипок), пины с заметками «как пройти», связь с парами.
import { useCallback, useEffect, useRef, useState, type PointerEvent as RPE } from 'react';
import { Icon } from '../../components/Icon';
import { Btn, Empty, Field, IBtn, ImagePick, Modal, Panel, Seg } from '../../components/ui';
import { db, patchSettings, type MapPin } from '../../db/schema';
import { AitumMap } from './AitumMap';
import { fmt, weekdayNames } from '../../lib/dates';
import { confirmBox, toast } from '../../lib/fx';
import { useLive } from '../../lib/hooks';
import { delBlob, useBlobUrl } from '../../lib/media';
import { setQuery, useRoute } from '../../lib/router';
import { clamp, L, uid } from '../../lib/runtime';
import { useSettings } from '../../lib/settings';
import { CLASS_TYPES } from '../../lib/uni';

const KIND_COLOR: Record<MapPin['kind'], string> = { building: 'var(--accent-1)', room: '#4dd4ff', other: '#f2c14e' };
type View = { x: number; y: number; s: number };

function MyMap() {
  const settings = useSettings();
  const url = useBlobUrl(settings.campusMapId);
  const pins = useLive(() => db.pins.toArray(), []) || [];
  const classes = useLive(async () => (await db.calEvents.where('sourceId').equals('manual').toArray()).filter((e) => e.pinId), []) || [];
  const subjects = useLive(() => db.subjects.toArray(), []) || [];
  const { query } = useRoute();
  const selId = query.get('pin');
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, s: 1 });
  const [mode, setMode] = useState<'view' | 'add' | 'move'>('view');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<MapPin | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ moved: number; t: number; dist?: number; mid?: { x: number; y: number } }>({ moved: 0, t: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;

  const sel = pins.find((p) => p.id === selId);

  const fit = useCallback(() => {
    const el = box.current;
    if (!el || !nat) return;
    const s = Math.min(el.clientWidth / nat.w, el.clientHeight / nat.h);
    setView({ s, x: (el.clientWidth - nat.w * s) / 2, y: (el.clientHeight - nat.h * s) / 2 });
  }, [nat]);

  const focus = useCallback(
    (p: MapPin) => {
      const el = box.current;
      if (!el || !nat) return;
      const fitS = Math.min(el.clientWidth / nat.w, el.clientHeight / nat.h);
      const s = Math.max(viewRef.current.s, fitS * 2);
      setView({ s, x: el.clientWidth / 2 - p.x * nat.w * s, y: el.clientHeight / 2 - p.y * nat.h * s });
    },
    [nat],
  );

  useEffect(() => {
    fit();
  }, [fit]);

  // фокус на пине из ссылки (?pin=id)
  const focusedOnce = useRef<string | null>(null);
  useEffect(() => {
    if (sel && nat && focusedOnce.current !== sel.id) {
      focusedOnce.current = sel.id;
      focus(sel);
    }
  }, [sel, nat, focus]);

  const zoomAt = (factor: number, cx: number, cy: number) => {
    setView((v) => {
      const s = clamp(v.s * factor, 0.05, 12);
      const k = s / v.s;
      return { s, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
    });
  };

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [url]);

  const toImage = (clientX: number, clientY: number) => {
    const el = box.current!;
    const r = el.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (clientX - r.left - v.x) / v.s / (nat?.w || 1), y: (clientY - r.top - v.y) / v.s / (nat?.h || 1) };
  };

  const onDown = (e: RPE) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    gesture.current = { moved: 0, t: Date.now() };
  };
  const onMove = (e: RPE) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, cur);
    const pts = [...pointers.current.values()];
    if (pts.length === 1) {
      const dx = cur.x - prev.x;
      const dy = cur.y - prev.y;
      gesture.current.moved += Math.abs(dx) + Math.abs(dy);
      setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
    } else if (pts.length === 2) {
      const [a, b] = pts;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const g = gesture.current;
      if (g.dist && g.mid) {
        const r = box.current!.getBoundingClientRect();
        zoomAt(dist / g.dist, mid.x - r.left, mid.y - r.top);
        setView((v) => ({ ...v, x: v.x + (mid.x - g.mid!.x), y: v.y + (mid.y - g.mid!.y) }));
      }
      g.dist = dist;
      g.mid = mid;
      g.moved += 10;
    }
  };
  const onUp = async (e: RPE) => {
    const wasSingle = pointers.current.size === 1;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) {
      gesture.current.dist = undefined;
      gesture.current.mid = undefined;
    }
    if (!wasSingle || gesture.current.moved > 6 || !nat) return;
    const p = toImage(e.clientX, e.clientY);
    if (p.x < 0 || p.y < 0 || p.x > 1 || p.y > 1) return;
    if (mode === 'add') {
      setEdit({ id: uid(), x: p.x, y: p.y, name: '', note: '', kind: 'room' });
      setMode('view');
    } else if (mode === 'move' && sel) {
      await db.pins.put({ ...sel, x: p.x, y: p.y });
      setMode('view');
      toast(L('Пин перемещён', 'Pin moved'));
    } else {
      setQuery('pin');
    }
  };

  const s = q.trim().toLowerCase();
  const list = pins.filter((p) => !s || p.name.toLowerCase().includes(s) || p.note.toLowerCase().includes(s));
  const linked = sel ? classes.filter((c) => c.pinId === sel.id) : [];
  const wd = weekdayNames('EEE');

  if (!url)
    return (
      <Panel>
        <Empty
          icon="pin"
          text={L('Загрузи картинку карты кампуса (скриншот, фото плана этажа) — потом расставишь пины.', 'Upload a campus map image (screenshot, floor plan) — then drop pins.')}
          action={
            <ImagePick max={4000} onPicked={(id) => patchSettings({ campusMapId: id })} className="btn">
              <Icon name="upload" size={15} /> {L('Загрузить карту', 'Upload map')}
            </ImagePick>
          }
        />
      </Panel>
    );

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Panel bodyClass="p-0" className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-1 p-2 border-b border-line/60">
          <Seg
            options={[
              { v: 'view' as const, label: L('Смотреть', 'View') },
              { v: 'add' as const, label: <><Icon name="plus" size={12} /> {L('Пин', 'Pin')}</> },
            ]}
            value={mode === 'move' ? 'view' : mode}
            onChange={setMode}
          />
          {mode === 'add' && <span className="text-[11px] text-gold ml-1">{L('Нажми на карту, чтобы поставить пин', 'Tap the map to drop a pin')}</span>}
          {mode === 'move' && <span className="text-[11px] text-gold ml-1">{L('Нажми, куда перенести пин', 'Tap the new pin location')}</span>}
          <div className="ml-auto flex items-center">
            <IBtn icon="zoomin" onClick={() => zoomAt(1.4, (box.current?.clientWidth || 0) / 2, (box.current?.clientHeight || 0) / 2)} title="+" />
            <IBtn icon="zoomout" onClick={() => zoomAt(1 / 1.4, (box.current?.clientWidth || 0) / 2, (box.current?.clientHeight || 0) / 2)} title="−" />
            <IBtn icon="maximize" onClick={fit} title={L('Вписать', 'Fit')} />
            <ImagePick
              max={4000}
              className="ibtn"
              onPicked={async (id) => {
                const old = settings.campusMapId;
                await patchSettings({ campusMapId: id });
                if (old) await delBlob(old);
                toast(L('Карта обновлена. Пины сохранены в относительных координатах.', 'Map replaced. Pins kept.'));
              }}
            >
              <Icon name="upload" size={17} />
            </ImagePick>
          </div>
        </div>
        <div
          ref={box}
          className={`relative h-[62dvh] lg:h-[70dvh] overflow-hidden select-none bg-void ${mode !== 'view' ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
          style={{ touchAction: 'none' }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={(e) => pointers.current.delete(e.pointerId)}
          onDoubleClick={(e) => {
            const r = box.current!.getBoundingClientRect();
            zoomAt(1.8, e.clientX - r.left, e.clientY - r.top);
          }}
        >
          <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})`, width: nat?.w, height: nat?.h }}>
            <img
              src={url}
              alt="campus"
              draggable={false}
              className="block max-w-none pointer-events-none"
              style={{ width: nat?.w, height: nat?.h }}
              onLoad={(e) => {
                const im = e.currentTarget;
                setNat({ w: im.naturalWidth || 1600, h: im.naturalHeight || 1000 });
              }}
            />
            {nat &&
              pins.map((p) => {
                const c = KIND_COLOR[p.kind];
                const on = p.id === selId;
                return (
                  <div key={p.id} className="absolute" style={{ left: p.x * nat.w, top: p.y * nat.h, transform: `scale(${1 / view.s})`, transformOrigin: '0 0', zIndex: on ? 5 : 1 }}>
                    <button
                      className="absolute -translate-x-1/2 -translate-y-full flex flex-col items-center"
                      onPointerDown={(e) => e.stopPropagation()}
                      onPointerUp={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        setQuery('pin', p.id);
                      }}
                    >
                      <span className={`whitespace-nowrap text-[11px] px-1.5 py-0.5 mb-1 ${on ? 'bg-white text-void' : 'bg-void/85 text-ink'}`} style={{ border: `1px solid ${c}` }}>
                        {p.name}
                      </span>
                      <span className="w-4 h-4 rotate-45" style={{ background: c, boxShadow: `0 0 ${on ? 18 : 10}px ${c}`, outline: on ? '2px solid #fff' : 'none' }} />
                    </button>
                  </div>
                );
              })}
          </div>
        </div>
      </Panel>

      <div className="space-y-4">
        {sel && (
          <Panel title={sel.name} kanji="印" accent={KIND_COLOR[sel.kind]} actions={<IBtn icon="x" size={15} onClick={() => setQuery('pin')} />}>
            <div className="label mb-1">{{ building: L('Корпус', 'Building'), room: L('Аудитория', 'Room'), other: L('Место', 'Place') }[sel.kind]}</div>
            {sel.note ? <p className="text-sm whitespace-pre-line">{sel.note}</p> : <p className="text-sm text-dim">{L('Нет заметки «как пройти»', 'No directions note')}</p>}
            {linked.length > 0 && (
              <div className="mt-3">
                <div className="label mb-1">{L('Пары здесь', 'Classes here')}</div>
                {linked.map((c) => (
                  <div key={c.id} className="text-[13px] py-0.5">
                    <span className="mono text-muted">
                      {wd[(new Date(c.start).getDay() + 6) % 7]} {fmt(c.start, 'HH:mm')}
                    </span>{' '}
                    {c.title || subjects.find((x) => x.id === c.subjectId)?.name}
                    {c.classType ? ` · ${CLASS_TYPES()[c.classType]}` : ''}
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2 mt-3">
              <Btn size="xs" variant="ghost" icon="edit" onClick={() => setEdit(sel)}>
                {L('Изменить', 'Edit')}
              </Btn>
              <Btn size="xs" variant="ghost" icon="pin" onClick={() => setMode('move')}>
                {L('Переместить', 'Move')}
              </Btn>
              <Btn
                size="xs"
                variant="danger"
                icon="trash"
                onClick={async () => {
                  if (await confirmBox(L('Удалить пин?', 'Delete pin?'), { danger: true })) {
                    for (const c of linked) await db.calEvents.put({ ...c, pinId: undefined });
                    await db.pins.delete(sel.id);
                    setQuery('pin');
                  }
                }}
              >
                {L('Удалить', 'Delete')}
              </Btn>
            </div>
          </Panel>
        )}
        <Panel title={L('Пины', 'Pins')} kanji="地">
          <div className="relative mb-2">
            <Icon name="search" size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dim" />
            <input className="inp !pl-8 !py-1.5" value={q} onChange={(e) => setQ(e.target.value)} placeholder={L('Поиск по пинам', 'Search pins')} />
          </div>
          <div className="max-h-[40dvh] overflow-y-auto -mx-1">
            {list.map((p) => (
              <button
                key={p.id}
                className={`w-full flex items-center gap-2 px-1 py-1.5 text-left hover:bg-cursed/10 ${p.id === selId ? 'bg-cursed/15' : ''}`}
                onClick={() => {
                  setQuery('pin', p.id);
                  focus(p);
                }}
              >
                <span className="w-2.5 h-2.5 rotate-45 shrink-0" style={{ background: KIND_COLOR[p.kind] }} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm truncate">{p.name}</span>
                  {p.note && <span className="block text-[11px] text-dim truncate">{p.note}</span>}
                </span>
              </button>
            ))}
            {!list.length && <div className="text-sm text-muted px-1">{L('Ничего не найдено', 'Nothing found')}</div>}
          </div>
        </Panel>
      </div>

      {edit && <PinEditor p={edit} onClose={() => setEdit(null)} onSaved={(id) => setQuery('pin', id)} />}
    </div>
  );
}

function PinEditor({ p: init, onClose, onSaved }: { p: MapPin; onClose: () => void; onSaved: (id: string) => void }) {
  const [p, setP] = useState(init);
  return (
    <Modal
      open
      onClose={onClose}
      title={L('Пин', 'Pin')}
      kanji="印"
      footer={
        <Btn
          size="sm"
          icon="check"
          disabled={!p.name.trim()}
          onClick={async () => {
            await db.pins.put({ ...p, name: p.name.trim() });
            onSaved(p.id);
            onClose();
          }}
        >
          {L('Сохранить', 'Save')}
        </Btn>
      }
    >
      <div className="space-y-3">
        <Field label={L('Название', 'Name')}>
          <input className="inp" autoFocus value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} placeholder={L('Ауд. 305 / Корпус Б', 'Room 305 / Building B')} />
        </Field>
        <Field label={L('Тип', 'Type')}>
          <Seg
            options={[
              { v: 'building' as const, label: L('Корпус', 'Building') },
              { v: 'room' as const, label: L('Аудитория', 'Room') },
              { v: 'other' as const, label: L('Другое', 'Other') },
            ]}
            value={p.kind}
            onChange={(kind) => setP({ ...p, kind })}
          />
        </Field>
        <Field label={L('Как пройти', 'Directions')}>
          <textarea className="inp" rows={4} value={p.note} onChange={(e) => setP({ ...p, note: e.target.value })} placeholder={L('3 этаж, налево от лифта…', '3rd floor, left of the elevator…')} />
        </Field>
      </div>
    </Modal>
  );
}

/** Campus Map: «AITU Map | My Map». */
export function CampusMap() {
  const { query } = useRoute();
  const which = query.get('map') === 'my' || query.get('pin') ? 'my' : query.get('map') === 'aitu' ? 'aitu' : navigator.onLine ? 'aitu' : 'my';
  return (
    <div className="space-y-3">
      <Seg
        options={[
          { v: 'aitu' as const, label: 'AITU Map' },
          { v: 'my' as const, label: 'My Map' },
        ]}
        value={which}
        onChange={(v) => setQuery('map', v)}
      />
      {which === 'aitu' ? <AitumMap room={query.get('room') || undefined} onMyMap={() => setQuery('map', 'my')} /> : <MyMap />}
    </div>
  );
}
