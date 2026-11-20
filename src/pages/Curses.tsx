// CURSES — все дедлайны: список, доска по грейдам, календарь; фильтры по категориям.
import { AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { Icon } from '../components/Icon';
import { Monster } from '../components/Monster';
import { CurseRow, MonthGrid, newCurse } from '../components/shared';
import { Btn, Empty, PageTitle, Panel, Tabs, Toggle } from '../components/ui';
import { db, type Curse } from '../db/schema';
import { dayKey, fmt, fromKey, endOfDayTs } from '../lib/dates';
import { curseGrade, GRADE_COLOR, gradeHint, gradeName, GRADES, type Grade } from '../lib/grade';
import { CurseGallery } from './CurseGallery';
import { useLive, useNow } from '../lib/hooks';
import { L } from '../lib/runtime';

type View = 'gallery' | 'list' | 'grades' | 'calendar';

export function CursesPage() {
  const now = useNow(60_000);
  const [view, setView] = useState<View>('gallery');
  const [gradeF, setGradeF] = useState<Grade | 'all'>('all');
  const [cat, setCat] = useState('all');
  const [showDone, setShowDone] = useState(false);
  const [q, setQ] = useState('');
  const [month, setMonth] = useState(() => new Date());
  const [day, setDay] = useState(() => dayKey());
  const curses = useLive(() => db.curses.toArray(), []) || [];
  const techs = useLive(() => db.techniques.orderBy('order').toArray(), []) || [];
  const techOf = (id: string) => techs.find((t) => t.id === id);

  const s = q.trim().toLowerCase();
  const base = curses.filter((c) => (cat === 'all' || c.techniqueId === cat) && (!s || c.title.toLowerCase().includes(s) || c.notes.toLowerCase().includes(s)));
  const active = base.filter((c) => c.status === 'active').sort((a, b) => a.due - b.due);
  const done = base
    .filter((c) => c.status === 'exorcised')
    .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0))
    .slice(0, 40);
  const today = dayKey(now);
  const groups: { id: string; title: string; items: Curse[]; hot?: boolean }[] = [
    { id: 'over', title: L('Просрочено', 'Overdue'), items: active.filter((c) => c.due < now), hot: true },
    { id: 'today', title: L('Сегодня', 'Today'), items: active.filter((c) => c.due >= now && dayKey(c.due) === today) },
    { id: 'week', title: L('Ближайшие 7 дней', 'Next 7 days'), items: active.filter((c) => c.due >= now && dayKey(c.due) !== today && c.due - now <= 7 * 864e5) },
    { id: 'later', title: L('Позже', 'Later'), items: active.filter((c) => c.due - now > 7 * 864e5) },
  ];

  const counts = GRADES.map((g) => active.filter((c) => curseGrade(c.due, c.importance, now).grade === g).length);

  return (
    <div>
      <PageTitle
        title="Curses"
        kanji="呪霊"
        sub={L('Все дедлайны. Чем ближе срок — тем страшнее проклятие.', 'All deadlines. The closer the date — the scarier the curse.')}
        right={
          <Btn icon="plus" onClick={() => newCurse(cat !== 'all' ? { techniqueId: cat } : {})}>
            {L('Призвать Curse', 'Summon curse')}
          </Btn>
        }
      />

      <div className="grid grid-cols-5 gap-2 mb-4">
        {GRADES.map((g, i) => (
          <div key={g} className="panel panel-flat p-2 sm:p-3 flex items-center gap-2" style={{ ['--bc' as string]: `color-mix(in srgb, ${GRADE_COLOR[g]} 33%, transparent)` }}>
            <Monster grade={g} size={34} />
            <div className="min-w-0">
              <div className="mono text-lg sm:text-xl font-bold leading-none" style={{ color: GRADE_COLOR[g] }}>
                {counts[i]}
              </div>
              <div className="text-[10px] text-dim truncate hidden sm:block">{gradeName(g)}</div>
            </div>
          </div>
        ))}
      </div>

      <Tabs
        tabs={[
          { id: 'gallery' as View, label: L('Галерея', 'Gallery') },
          { id: 'list' as View, label: L('Список', 'List') },
          { id: 'grades' as View, label: L('По грейдам', 'By grade') },
          { id: 'calendar' as View, label: L('Календарь', 'Calendar') },
        ]}
        value={view}
        onChange={setView}
        className="mb-3"
      />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button className={`chip ${cat === 'all' ? 'chip-on' : ''}`} onClick={() => setCat('all')}>
          {L('Все', 'All')}
        </button>
        {techs.map((t) => (
          <button key={t.id} className={`chip ${cat === t.id ? 'chip-on' : ''}`} onClick={() => setCat(t.id)}>
            <span style={{ color: t.color }}>{t.icon}</span> {t.name}
          </button>
        ))}
        <div className="relative ml-auto w-full sm:w-56">
          <Icon name="search" size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dim" />
          <input className="inp !pl-8 !py-1.5" value={q} onChange={(e) => setQ(e.target.value)} placeholder={L('Поиск', 'Search')} />
        </div>
        {view === 'list' && <Toggle on={showDone} onChange={setShowDone} label={<span className="text-muted text-xs">{L('изгнанные', 'exorcised')}</span>} />}
      </div>

      {view === 'gallery' && (
        <CurseGallery
          items={active.filter((c) => gradeF === 'all' || curseGrade(c.due, c.importance, now).grade === gradeF)}
          total={active.length}
          now={now}
          techOf={techOf}
          filters={
            <div className="space-y-3">
              <div>
                <div className="label mb-1.5">{L('Категория', 'Category')}</div>
                <div className="flex flex-wrap gap-1.5">
                  <button className={`chip !py-1 ${cat === 'all' ? 'chip-on' : ''}`} onClick={() => setCat('all')}>{L('Все', 'All')}</button>
                  {techs.map((t) => (
                    <button key={t.id} className={`chip !py-1 ${cat === t.id ? 'chip-on' : ''}`} onClick={() => setCat(t.id)}>{t.name}</button>
                  ))}
                </div>
              </div>
              <div>
                <div className="label mb-1.5">{L('Грейд', 'Grade')}</div>
                <div className="flex flex-wrap gap-1.5">
                  <button className={`chip !py-1 ${gradeF === 'all' ? 'chip-on' : ''}`} onClick={() => setGradeF('all')}>{L('Все', 'All')}</button>
                  {GRADES.map((g) => (
                    <button key={g} className={`chip !py-1 ${gradeF === g ? 'chip-on' : ''}`} onClick={() => setGradeF(g)} style={{ color: GRADE_COLOR[g] }}>{gradeName(g)}</button>
                  ))}
                </div>
              </div>
            </div>
          }
        />
      )}

      {view === 'list' && (
        <div className="grid gap-4 lg:grid-cols-2 items-start">
          {groups
            .filter((g) => g.items.length)
            .map((g) => (
              <Panel key={g.id} title={`${g.title} · ${g.items.length}`} hot={g.hot} className={g.id === 'over' || g.id === 'today' ? '' : ''}>
                <AnimatePresence initial={false}>
                  {g.items.map((c) => (
                    <CurseRow key={c.id} c={c} tech={techOf(c.techniqueId)} />
                  ))}
                </AnimatePresence>
              </Panel>
            ))}
          {!active.length && (
            <Panel className="lg:col-span-2">
              <Empty text={L('Активных проклятий нет. Можно выдохнуть.', 'No active curses. Breathe.')} icon="skull" action={<Btn size="sm" icon="plus" onClick={() => newCurse()}>{L('Добавить', 'Add')}</Btn>} />
            </Panel>
          )}
          {showDone && done.length > 0 && (
            <Panel title={`${L('Изгнанные', 'Exorcised')} · ${done.length}`} className="lg:col-span-2" accent="#3ddc97">
              <AnimatePresence initial={false}>
                {done.map((c) => (
                  <CurseRow key={c.id} c={c} tech={techOf(c.techniqueId)} />
                ))}
              </AnimatePresence>
            </Panel>
          )}
        </div>
      )}

      {view === 'grades' && (
        <div className="flex gap-3 scroll-x pb-2 -mx-3 px-3 snap-x">
          {GRADES.map((g) => {
            const items = active.filter((c) => curseGrade(c.due, c.importance, now).grade === g);
            return (
              <Panel key={g} className="w-[85vw] sm:w-[320px] shrink-0 snap-start" accent={GRADE_COLOR[g]} hot={g === 0} bodyClass="p-3">
                <div className="flex items-center gap-3 mb-2">
                  <Monster grade={g} size={64} />
                  <div>
                    <div className="h-display text-lg" style={{ color: GRADE_COLOR[g] }}>
                      {gradeName(g)}
                    </div>
                    <div className="text-[11px] text-dim">{gradeHint(g)}</div>
                    <div className="mono text-xs text-muted">{items.length}</div>
                  </div>
                </div>
                <div className="divider-glow mb-1" />
                <AnimatePresence initial={false}>
                  {items.map((c) => (
                    <CurseRow key={c.id} c={c} tech={techOf(c.techniqueId)} compact showGrade={false} />
                  ))}
                </AnimatePresence>
                {!items.length && <div className="text-xs text-dim py-4 text-center">{L('пусто', 'empty')}</div>}
              </Panel>
            );
          })}
        </div>
      )}

      {view === 'calendar' && (
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <Panel bodyClass="p-3 sm:p-4">
            <MonthGrid
              month={month}
              onMonth={setMonth}
              selected={day}
              onSelect={setDay}
              renderDay={(_, k) => {
                const items = base.filter((c) => dayKey(c.due) === k);
                return (
                  <div className="space-y-0.5">
                    {items.slice(0, 3).map((c) => {
                      const g = curseGrade(c.due, c.importance, now);
                      const col = c.status === 'exorcised' ? '#5d5888' : g.overdue ? '#ff1a3c' : GRADE_COLOR[g.grade];
                      return (
                        <div key={c.id} className={`text-[10px] leading-tight truncate px-1 hidden sm:block ${c.status === 'exorcised' ? 'line-through' : ''}`} style={{ background: `color-mix(in srgb, ${col} 15%, transparent)`, borderLeft: `2px solid ${col}` }}>
                          {c.title}
                        </div>
                      );
                    })}
                    <div className="flex gap-0.5 sm:hidden flex-wrap">
                      {items.slice(0, 4).map((c) => {
                        const g = curseGrade(c.due, c.importance, now);
                        return <span key={c.id} className="w-1.5 h-1.5 rotate-45" style={{ background: c.status === 'exorcised' ? '#5d5888' : GRADE_COLOR[g.grade] }} />;
                      })}
                    </div>
                    {items.length > 3 && <div className="text-[9px] text-dim hidden sm:block">+{items.length - 3}</div>}
                  </div>
                );
              }}
            />
          </Panel>
          <Panel
            title={fmt(fromKey(day), 'EEEE, d MMMM')}
            actions={
              <Btn size="xs" variant="ghost" icon="plus" onClick={() => newCurse({ due: endOfDayTs(fromKey(day)), ...(cat !== 'all' ? { techniqueId: cat } : {}) })}>
                {L('Сюда', 'Here')}
              </Btn>
            }
          >
            <AnimatePresence initial={false}>
              {base
                .filter((c) => dayKey(c.due) === day)
                .sort((a, b) => a.due - b.due)
                .map((c) => (
                  <CurseRow key={c.id} c={c} tech={techOf(c.techniqueId)} compact />
                ))}
            </AnimatePresence>
            {!base.some((c) => dayKey(c.due) === day) && <div className="text-sm text-muted py-3">{L('В этот день проклятий нет', 'No curses this day')}</div>}
          </Panel>
        </div>
      )}
    </div>
  );
}
