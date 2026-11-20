// Curses → вид «Галерея» (TiltGallery): карточка — монстр грейда, подзаголовок — предмет/техника и дедлайн,
// мета — грейд, таймер, прогресс подзадач. Клик — страница Curse (B5) с занавесом.
import type { ReactNode } from 'react';
import { Countdown } from '../components/shared';
import { GradeBadge, Monster } from '../components/Monster';
import { TiltGallery } from '../components/TiltGallery';
import { Progress } from '../components/ui';
import { db, type Curse, type Technique } from '../db/schema';
import { fmt } from '../lib/dates';
import { openEntity } from '../lib/entity';
import { curseGrade, GRADE_COLOR, gradeName } from '../lib/grade';
import { useLive } from '../lib/hooks';
import { L } from '../lib/runtime';

export function CurseGallery({ items, total, now, techOf, filters }: { items: Curse[]; total: number; now: number; techOf: (id: string) => Technique | undefined; filters: ReactNode }) {
  const subjects = useLive(() => db.subjects.toArray(), []) || [];
  const sub = (c: Curse) => [subjects.find((x) => x.id === c.subjectId)?.name || techOf(c.techniqueId)?.name, fmt(c.due, 'd MMM, HH:mm')].filter(Boolean).join(' · ');
  return (
    <TiltGallery
      items={items}
      total={total}
      label="Curses"
      getId={(c) => c.id}
      getTitle={(c) => c.title}
      getSubtitle={sub}
      getColor={(c) => GRADE_COLOR[curseGrade(c.due, c.importance, now).grade]}
      getImage={(c) => {
        const g = curseGrade(c.due, c.importance, now);
        return (
          <div className="absolute inset-0 grid place-items-center" style={{ background: `radial-gradient(circle at 50% 40%, color-mix(in srgb, ${GRADE_COLOR[g.grade]} 45%, #000) 0%, #07070b 70%)` }}>
            <Monster grade={g.grade} overdue={g.overdue} size={150} />
          </div>
        );
      }}
      renderMeta={(c) => {
        const g = curseGrade(c.due, c.importance, now);
        const done = c.subtasks.filter((s) => s.done).length;
        return (
          <div className="space-y-3">
            <GradeBadge grade={g.grade} overdue={g.overdue} />
            <div>
              <div className="label">{L('До дедлайна', 'Time left')}</div>
              <Countdown to={c.due} />
            </div>
            <div className="text-[13px] text-muted">{sub(c)}</div>
            {c.subtasks.length > 0 && (
              <div>
                <div className="label mb-1">{L('Подзадачи', 'Subtasks')} {done}/{c.subtasks.length}</div>
                <Progress value={(done / c.subtasks.length) * 100} height={4} />
              </div>
            )}
            <div className="text-[11.5px] text-dim">{gradeName(g.grade)}</div>
          </div>
        );
      }}
      onOpen={(c) => openEntity('curse', c.id, { order: items.map((x) => x.id), title: c.title })}
      filters={filters}
      empty={L('Активных проклятий нет. Можно выдохнуть.', 'No active curses. Breathe.')}
    />
  );
}
