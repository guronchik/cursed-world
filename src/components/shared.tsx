import { addDays, addMonths, endOfMonth, endOfWeek, isSameMonth, startOfMonth, startOfWeek, subMonths } from 'date-fns';
import { motion } from 'framer-motion';
import { useRef, useState, type ReactNode } from 'react';
import type { Curse, Technique } from '../db/schema';
import { exorcise, removeCurse, revive } from '../lib/actions';
import { confirmBox } from '../lib/fx';
import { dayKey, fmt, leftParts, pad2, relDay, shortLeft, timeOf, weekdayNames } from '../lib/dates';
import { curseGrade, GRADE_COLOR } from '../lib/grade';
import { useNow } from '../lib/hooks';
import { setQuery } from '../lib/router';
import { L } from '../lib/runtime';
import { Icon } from './Icon';
import { GradeBadge, Monster } from './Monster';

export function TechChip({ t }: { t?: Technique }) {
  if (!t) return null;
  return (
    <span className="tag" style={{ color: t.color, background: `color-mix(in srgb, ${t.color} 12%, transparent)` }}>
      <span>{t.icon}</span>
      {t.name}
    </span>
  );
}

export function openCurse(id: string) {
  setQuery('curse', id);
}

/** Пресет для создания нового Curse (дата, техника, цель, задание). */
export const cursePreset: { current: Partial<Curse> } = { current: {} };
export function newCurse(preset: Partial<Curse> = {}) {
  cursePreset.current = preset;
  setQuery('curse', 'new');
}

/** Свайп в списке (тач): вправо — основное действие, влево — удалить. */
export function SwipeRow({ children, onRight, onLeft, rightLabel, leftLabel, rightIcon = 'bolt' }: { children: ReactNode; onRight?: (el: Element) => void; onLeft?: () => void; rightLabel: string; leftLabel?: string; rightIcon?: string }) {
  const [dx, setDx] = useState(0);
  const st = useRef<{ x: number; y: number; lock?: 'h' | 'v'; id: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const TH = 88;
  return (
    <div className="relative overflow-hidden rounded-xl">
      {dx !== 0 && (
        <div className="absolute inset-0 flex items-center justify-between px-4 text-white text-[13px] font-semibold" style={{ background: dx > 0 ? 'var(--accent-grad)' : '#ff453a' }}>
          <span className="flex items-center gap-1.5" style={{ opacity: dx > 0 ? Math.min(1, dx / TH) : 0 }}>
            <Icon name={rightIcon} size={16} /> {rightLabel}
          </span>
          <span className="flex items-center gap-1.5" style={{ opacity: dx < 0 ? Math.min(1, -dx / TH) : 0 }}>
            {leftLabel} <Icon name="trash" size={16} />
          </span>
        </div>
      )}
      <div
        ref={box}
        className="relative bg-transparent"
        style={{ transform: dx ? `translateX(${dx}px)` : undefined, transition: st.current ? 'none' : 'transform .25s cubic-bezier(.2,.9,.3,1)', touchAction: 'pan-y' }}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse') return;
          st.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
        }}
        onPointerMove={(e) => {
          const s0 = st.current;
          if (!s0 || s0.id !== e.pointerId) return;
          const mx = e.clientX - s0.x;
          const my = e.clientY - s0.y;
          if (!s0.lock && (Math.abs(mx) > 8 || Math.abs(my) > 8)) s0.lock = Math.abs(mx) > Math.abs(my) ? 'h' : 'v';
          if (s0.lock === 'h') {
            const v = mx > 0 ? (onRight ? mx : 0) : onLeft ? mx : 0;
            setDx(Math.max(-160, Math.min(160, v)));
          }
        }}
        onPointerUp={() => {
          const s0 = st.current;
          st.current = null;
          if (s0?.lock === 'h') {
            if (dx > TH && onRight && box.current) onRight(box.current);
            else if (dx < -TH && onLeft) onLeft();
          }
          setDx(0);
        }}
        onPointerCancel={() => {
          st.current = null;
          setDx(0);
        }}
        onClickCapture={(e) => {
          if (Math.abs(dx) > 4) e.stopPropagation();
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function CurseRow({ c, tech, compact, showGrade = true }: { c: Curse; tech?: Technique; compact?: boolean; showGrade?: boolean }) {
  const now = useNow(30_000);
  const { grade, overdue } = curseGrade(c.due, c.importance, now);
  const done = c.status === 'exorcised';
  const sub = c.subtasks.length ? `${c.subtasks.filter((s) => s.done).length}/${c.subtasks.length}` : null;
  return (
    <motion.div layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, filter: 'blur(4px)' }} className="cv-auto -mx-2">
      <SwipeRow
        rightLabel={done ? L('Вернуть', 'Revive') : L('Изгнать', 'Exorcise')}
        rightIcon={done ? 'refresh' : 'bolt'}
        leftLabel={L('Удалить', 'Delete')}
        onRight={(el) => (done ? void revive(c.id) : void exorcise(c.id, el))}
        onLeft={async () => {
          if (await confirmBox(L(`Удалить «${c.title}»?`, `Delete “${c.title}”?`), { danger: true, okLabel: L('Удалить', 'Delete') })) await removeCurse(c.id);
        }}
      >
        <div className={`group flex items-center gap-3 py-2 px-2 rounded-xl hover:bg-panel-2 cursor-pointer ${done ? 'opacity-55' : ''}`} onClick={() => openCurse(c.id)}>
          {done ? (
            <span className="w-11 h-11 grid place-items-center kanji text-xl text-dim rounded-full bg-panel-2 shrink-0">祓</span>
          ) : (
            <Monster grade={grade} overdue={overdue} size={compact ? 38 : 46} />
          )}
          <div className="min-w-0 flex-1">
            <div className={`text-[15px] leading-snug truncate ${done ? 'line-through' : ''}`}>{c.title}</div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5 text-[12px] text-muted">
              {c.link && <span className="tag" style={{ background: '#0a84ff22', color: '#64d2ff' }}>{c.link.kind === 'assignment' ? L('Задание', 'Assignment') : L('Видео', 'Video')}</span>}
              {c.extSource && !c.link && <span className="tag" style={{ background: '#0a84ff22', color: '#64d2ff' }}>{c.extSource}</span>}
              {!compact && <TechChip t={tech} />}
              {showGrade && !done && <GradeBadge grade={grade} overdue={overdue} />}
              <span className="mono" style={{ color: done ? undefined : overdue ? '#ff6961' : grade <= 1 ? GRADE_COLOR[grade] : undefined }}>
                {done ? L('изгнано', 'exorcised') : shortLeft(c.due - now)}
              </span>
              <span className="text-dim">
                {relDay(c.due)} {timeOf(c.due)}
              </span>
              {sub && (
                <span className="inline-flex items-center gap-1">
                  <Icon name="check" size={11} />
                  {sub}
                </span>
              )}
              {c.attachments.length > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Icon name="file" size={11} />
                  {c.attachments.length}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            className={`btn btn-xs ${done ? 'btn-ghost' : ''} shrink-0`}
            onClick={(e) => {
              e.stopPropagation();
              if (done) void revive(c.id);
              else void exorcise(c.id, e.currentTarget);
            }}
            title={done ? L('Вернуть', 'Revive') : 'Exorcise'}
            aria-label={done ? L('Вернуть', 'Revive') : 'Exorcise'}
          >
            <Icon name={done ? 'refresh' : 'bolt'} size={13} />
            <span className="hidden sm:inline">{done ? L('Вернуть', 'Revive') : L('Изгнать', 'Exorcise')}</span>
          </button>
        </div>
      </SwipeRow>
    </motion.div>
  );
}

export function Countdown({ to, big }: { to: number; big?: boolean }) {
  const now = useNow(1000);
  const ms = to - now;
  const p = leftParts(ms);
  const parts = [
    { v: p.d, l: L('дн', 'd') },
    { v: p.h, l: L('ч', 'h') },
    { v: p.m, l: L('мин', 'm') },
    { v: p.s, l: L('сек', 's') },
  ];
  return (
    <div className={`flex items-end gap-2 ${ms < 0 ? 'text-[#ff4d63]' : ''}`}>
      {ms < 0 && <span className="label text-[#ff4d63] mb-1">{L('Просрочено', 'Overdue')}</span>}
      {parts.map((x, i) => (
        <div key={i} className="text-center">
          <div className={`mono font-bold ${big ? 'text-3xl sm:text-4xl' : 'text-xl'}`} style={{ textShadow: '0 0 16px color-mix(in srgb, var(--accent-1) 60%, transparent)' }}>
            {pad2(x.v)}
          </div>
          <div className="label text-[9px]">{x.l}</div>
        </div>
      ))}
    </div>
  );
}

export function MonthGrid({
  month,
  onMonth,
  selected,
  onSelect,
  renderDay,
  cellClass = 'min-h-[64px] sm:min-h-[92px]',
}: {
  month: Date;
  onMonth: (d: Date) => void;
  selected?: string;
  onSelect?: (key: string) => void;
  renderDay: (day: Date, key: string) => ReactNode;
  cellClass?: string;
}) {
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const days: Date[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  const today = dayKey();
  const names = weekdayNames();
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <button className="ibtn" onClick={() => onMonth(subMonths(month, 1))} aria-label="prev">
          <Icon name="left" />
        </button>
        <div className="h-display text-lg capitalize min-w-0 flex-1 sm:flex-none sm:min-w-[10rem] truncate text-center">{fmt(month, 'LLLL yyyy')}</div>
        <button className="ibtn" onClick={() => onMonth(addMonths(month, 1))} aria-label="next">
          <Icon name="right" />
        </button>
        <button className="btn btn-ghost btn-xs ml-1 shrink-0" onClick={() => onMonth(new Date())}>
          {L('Сегодня', 'Today')}
        </button>
      </div>
      <div className="grid grid-cols-7 gap-px bg-line rounded-2xl overflow-hidden">
        {names.map((n) => (
          <div key={n} className="label text-center py-1.5 bg-[var(--panel-solid)]">
            {n}
          </div>
        ))}
        {days.map((d) => {
          const k = dayKey(d);
          const inMonth = isSameMonth(d, month);
          return (
            <button
              key={k}
              type="button"
              onClick={() => onSelect?.(k)}
              className={`relative flex flex-col justify-start items-stretch text-left p-1 sm:p-1.5 bg-[var(--panel-solid)] hover:brightness-110 transition-colors ${cellClass} ${inMonth ? '' : 'opacity-35'} ${selected === k ? 'ring-2 ring-inset ring-cursed z-10' : ''}`}
            >
              <div className={`mono text-[11px] mb-0.5 ${k === today ? 'text-white' : 'text-muted'}`}>
                {k === today ? <span className="inline-grid place-items-center min-w-[20px] h-5 px-1 rounded-full text-white" style={{ background: 'var(--accent-grad)', color: 'var(--on-accent)' }}>{d.getDate()}</span> : d.getDate()}
              </div>
              {renderDay(d, k)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Тепловая карта по дням: колонки — недели, строки — пн..вс. value(key) → 0..1 или null (нет данных). */
export function Heatmap({ weeks = 26, value, onPick, color = 'var(--accent-1)', selected }: { weeks?: number; value: (key: string) => number | null; onPick?: (key: string) => void; color?: string; selected?: string }) {
  const end = endOfWeek(new Date(), { weekStartsOn: 1 });
  const start = addDays(startOfWeek(end, { weekStartsOn: 1 }), -(weeks - 1) * 7);
  const cols: Date[][] = [];
  for (let w = 0; w < weeks; w++) cols.push(Array.from({ length: 7 }, (_, i) => addDays(start, w * 7 + i)));
  const today = dayKey();
  const names = weekdayNames();
  return (
    <div className="scroll-x no-scrollbar">
      <div className="inline-flex gap-[3px]">
        <div className="flex flex-col gap-[3px] mr-1 pt-4">
          {names.map((n, i) => (
            <div key={n} className="h-3 text-[9px] leading-3 text-dim mono">
              {i % 2 === 0 ? n : ''}
            </div>
          ))}
        </div>
        {cols.map((col, ci) => (
          <div key={ci} className="flex flex-col gap-[3px]">
            <div className="h-4 text-[9px] text-dim mono whitespace-nowrap">{col[0].getDate() <= 7 ? fmt(col[0], 'LLL') : ''}</div>
            {col.map((d) => {
              const k = dayKey(d);
              const future = k > today;
              const v = future ? null : value(k);
              return (
                <button
                  key={k}
                  type="button"
                  disabled={future}
                  onClick={() => onPick?.(k)}
                  title={`${fmt(d, 'd MMM yyyy')}${v !== null ? ` — ${Math.round(v * 100)}%` : ''}`}
                  className="w-3 h-3 rounded-[3px]"
                  style={{
                    background: v === null ? (future ? 'transparent' : 'color-mix(in srgb, var(--accent-1) 7%, transparent)') : v === 0 ? 'rgba(255,39,68,.18)' : color,
                    opacity: v === null || v === 0 ? 1 : 0.25 + v * 0.75,
                    boxShadow: selected === k ? '0 0 0 1.5px #fff' : v && v >= 1 ? `0 0 6px ${color}` : 'none',
                    outline: k === today ? '1px solid var(--accent-text)' : 'none',
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export function useWeekDays(anchor: Date) {
  const s = startOfWeek(anchor, { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, i) => addDays(s, i));
}
