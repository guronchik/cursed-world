// Cursed Technique — задачи по техникам (YouTube, University, Piano, свои) в виде монстров. Вид «Неделя», свои поля и статистика.
import { addDays, addWeeks, subDays, subWeeks } from 'date-fns';
import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { YouTubeTechnique } from './youtube/YouTube';
import { useVideoStatuses } from '../../lib/statuses';
import { isDoneIn } from '../../lib/videoMeta';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { axis, grid, tooltip } from '../../components/charts';
import { Icon } from '../../components/Icon';
import { Monster } from '../../components/Monster';
import { newCurse, openCurse, useWeekDays } from '../../components/shared';
import { Btn, ColorPick, Empty, Field, IBtn, Modal, Panel, Progress, Seg, Stat, Toggle } from '../../components/ui';
import { db, type Curse, type Piece, type Technique } from '../../db/schema';
import { addPractice, exorcise, revive } from '../../lib/actions';
import { dayKey, endOfDayTs, fmt, fromKey, timeOf, weekKey } from '../../lib/dates';
import { confirmBox } from '../../lib/fx';
import { curseGrade } from '../../lib/grade';
import { useLive, useNow } from '../../lib/hooks';
import { go, setQuery, useRoute } from '../../lib/router';
import { L, uid } from '../../lib/runtime';
import { practiceDates, streak } from '../../lib/stats';

export function CursedTechnique() {
  const now = useNow(60_000);
  const { query } = useRoute();
  const techs = useLive(() => db.techniques.orderBy('order').toArray(), []) || [];
  const curses = useLive(() => db.curses.toArray(), []) || [];
  const videos = useLive(() => db.videos.toArray(), []) || [];
  const vcols = useVideoStatuses() || [];
  const [anchor, setAnchor] = useState(() => new Date());
  const [editT, setEditT] = useState<Technique | null>(null);
  const tech = techs.find((t) => t.id === query.get('t')) || techs[0];
  const days = useWeekDays(anchor);
  if (!tech) return <Empty text="…" />;
  const mine = curses.filter((c) => c.techniqueId === tech.id);
  const weekItems = mine.filter((c) => c.due >= days[0].getTime() && c.due < addDays(days[6], 1).getTime());
  const weekDone = weekItems.filter((c) => c.status === 'exorcised').length;
  const today = dayKey(now);

  const advance = async (c: Curse, el: Element) => {
    const n = tech.stages?.length || 0;
    const next = (c.stage ?? 0) + 1;
    if (next >= n) await exorcise(c.id, el);
    else await db.curses.put({ ...c, stage: next });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        {techs.map((t) => (
          <button key={t.id} className={`chip !py-1.5 !px-3 ${t.id === tech.id ? 'chip-on' : ''}`} style={t.id === tech.id ? { borderColor: t.color, background: `color-mix(in srgb, ${t.color} 13%, transparent)` } : undefined} onClick={() => setQuery('t', t.id)}>
            <span style={{ color: t.color }}>{t.icon}</span> {t.name} Technique
          </button>
        ))}
        <Btn size="sm" variant="ghost" icon="plus" onClick={() => setEditT({ id: uid(), name: '', color: '#3ddc97', icon: '術', kind: 'custom', stages: [], trackMinutes: false, repertoire: false, order: techs.length, createdAt: Date.now() })}>
          {L('Своя техника', 'Custom technique')}
        </Btn>
      </div>

      <Panel bodyClass="p-4" accent={tech.color} className={tech.kind === 'youtube' ? 'hidden sm:block' : ''}>
        <div className="flex flex-wrap items-center gap-4">
          <div className="w-14 h-14 grid place-items-center text-2xl kanji" style={{ color: tech.color, background: `color-mix(in srgb, ${tech.color} 10%, transparent)`, clipPath: 'polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)' }}>
            {tech.icon}
          </div>
          <div className="min-w-0">
            <div className="h-display text-2xl">{tech.name} Technique</div>
            <div className="text-xs text-muted">
              {tech.kind === 'youtube' ? L('База видео в духе Notion: каждое видео — страница', 'A Notion-style video database: every video is a page') : tech.stages?.length ? `${L('Конвейер', 'Pipeline')}: ${tech.stages.join(' → ')}` : L('Задачи-проклятия этой техники', "This technique's curse-tasks")}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-4">
            {tech.kind === 'youtube' ? (
              <>
                <Stat label={L('Видео', 'Videos')} value={videos.length} />
                <Stat label={L('Опубликовано', 'Published')} value={videos.filter((v) => isDoneIn(v, vcols)).length} />
              </>
            ) : (
              <>
                <Stat label={L('Неделя', 'Week')} value={`${weekDone}/${weekItems.length}`} />
                <Stat label={L('Изгнано всего', 'Exorcised')} value={mine.filter((c) => c.status === 'exorcised').length} />
              </>
            )}
            <IBtn icon="edit" onClick={() => setEditT(tech)} title={L('Настроить технику', 'Configure')} />
          </div>
        </div>
      </Panel>

      {tech.kind === 'youtube' ? (
        <YouTubeTechnique tech={tech} />
      ) : (
        <>
      <Panel
        title={`${fmt(days[0], 'd MMM')} — ${fmt(days[6], 'd MMM')}`}
        kanji="週"
        actions={
          <>
            <IBtn icon="left" onClick={() => setAnchor(subWeeks(anchor, 1))} />
            <Btn size="xs" variant="ghost" onClick={() => setAnchor(new Date())}>
              {L('Сегодня', 'Today')}
            </Btn>
            <IBtn icon="right" onClick={() => setAnchor(addWeeks(anchor, 1))} />
          </>
        }
        bodyClass="p-3"
      >
        <div className="flex lg:grid lg:grid-cols-7 gap-2 scroll-x pb-1 snap-x">
          {days.map((d) => {
            const k = dayKey(d);
            const items = weekItems.filter((c) => dayKey(c.due) === k).sort((a, b) => a.due - b.due);
            return (
              <div key={k} className={`min-w-[150px] lg:min-w-0 snap-start flex flex-col border ${k === today ? 'border-cursed/70 bg-cursed/5' : 'border-line/50 bg-void/30'}`}>
                <div className="px-2 py-1.5 border-b border-line/40 flex items-center">
                  <span className={`h-display text-sm ${k === today ? 'text-white' : 'text-muted'}`}>{fmt(d, 'EEE')}</span>
                  <span className="mono text-[11px] text-dim ml-auto">{fmt(d, 'd.MM')}</span>
                </div>
                <div className="p-1.5 space-y-1.5 flex-1 min-h-[140px]">
                  <AnimatePresence initial={false}>
                    {items.map((c) => {
                      const g = curseGrade(c.due, c.importance, now);
                      const done = c.status === 'exorcised';
                      return (
                        <motion.div key={c.id} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6, filter: 'blur(6px)' }} className={`p-1.5 bg-panel/80 border border-line/60 ${done ? 'opacity-50' : ''}`}>
                          <button className="w-full flex items-start gap-1.5 text-left" onClick={() => openCurse(c.id)}>
                            {done ? <span className="kanji text-dim w-8 text-center">祓</span> : <Monster grade={g.grade} overdue={g.overdue} size={32} />}
                            <span className="min-w-0">
                              <span className={`block text-[12px] leading-tight ${done ? 'line-through' : ''}`}>{c.title}</span>
                              <span className="block mono text-[10px] text-dim">{timeOf(c.due)}</span>
                            </span>
                          </button>
                          <div className="flex items-center gap-1 mt-1">
                            {tech.stages?.length ? <span className="tag !text-[10px]" style={{ color: tech.color, background: `color-mix(in srgb, ${tech.color} 10%, transparent)` }}>{tech.stages[Math.min(c.stage ?? 0, tech.stages.length - 1)]}</span> : null}
                            <button
                              className="ml-auto ibtn ibtn-sm"
                              title={done ? L('Вернуть', 'Revive') : tech.stages?.length ? L('Следующий этап', 'Next stage') : 'Exorcise'}
                              onClick={(e) => (done ? revive(c.id) : tech.stages?.length ? advance(c, e.currentTarget) : exorcise(c.id, e.currentTarget))}
                            >
                              <Icon name={done ? 'refresh' : tech.stages?.length ? 'arrowright' : 'bolt'} size={13} />
                            </button>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
                <button className="text-[11px] text-dim hover:text-acc py-1 border-t border-line/40" onClick={() => newCurse({ techniqueId: tech.id, due: endOfDayTs(d), stage: tech.stages?.length ? 0 : undefined })}>
                  + {L('задача', 'task')}
                </button>
              </div>
            );
          })}
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2 items-start">
        {tech.stages?.length ? <Pipeline tech={tech} curses={mine} /> : null}
        {tech.trackMinutes && <Practice tech={tech} />}
        {tech.repertoire && <Repertoire tech={tech} />}
        {tech.kind === 'university' && <UniStats />}
        {!tech.stages?.length && !tech.trackMinutes && !tech.repertoire && tech.kind !== 'university' && <GenericStats curses={mine} />}
      </div>

        </>
      )}

      {editT && <TechniqueEditor t={editT} techs={techs} onClose={() => setEditT(null)} />}
    </div>
  );
}

function Pipeline({ tech, curses }: { tech: Technique; curses: Curse[] }) {
  const stages = tech.stages || [];
  const active = curses.filter((c) => c.status === 'active');
  const published = curses.filter((c) => c.status === 'exorcised' && c.completedAt && c.completedAt > Date.now() - 30 * 864e5).length;
  return (
    <Panel title={L('Конвейер', 'Pipeline')} kanji="流" className="lg:col-span-2" accent={tech.color}>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0,1fr))` }}>
        {stages.map((s, i) => {
          const items = active.filter((c) => Math.min(c.stage ?? 0, stages.length - 1) === i);
          return (
            <div key={s} className="min-w-0">
              <div className="flex items-center gap-1 mb-1.5">
                <span className="label truncate">{s}</span>
                <span className="mono text-sm ml-auto" style={{ color: tech.color }}>
                  {items.length}
                </span>
              </div>
              <div className="h-1 mb-2" style={{ background: `linear-gradient(90deg, ${tech.color}, transparent)`, opacity: 0.3 + (i / stages.length) * 0.7 }} />
              <div className="space-y-1">
                {items.slice(0, 5).map((c) => (
                  <button key={c.id} onClick={() => openCurse(c.id)} className="block w-full text-left text-[11.5px] leading-tight truncate px-1.5 py-1 bg-void/40 hover:bg-cursed/10">
                    {c.title}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="text-[12px] text-muted mt-3">
        {L('Завершено за 30 дней', 'Completed in 30 days')}: <b className="mono text-ink">{published}</b>
      </div>
    </Panel>
  );
}

function Practice({ tech }: { tech: Technique }) {
  const logs = useLive(() => db.practice.where('techniqueId').equals(tech.id).toArray(), [tech.id]) || [];
  const pieces = useLive(() => db.pieces.where('techniqueId').equals(tech.id).toArray(), [tech.id]) || [];
  const [min, setMin] = useState('30');
  const [piece, setPiece] = useState('');
  const [note, setNote] = useState('');
  const wk = weekKey(new Date());
  const weekMin = logs.filter((l) => weekKey(fromKey(l.date)) === wk).reduce((s, l) => s + l.minutes, 0);
  const total = logs.reduce((s, l) => s + l.minutes, 0);
  const st = streak(practiceDates(logs, tech.id));
  const data = Array.from({ length: 14 }, (_, i) => {
    const d = subDays(new Date(), 13 - i);
    const k = dayKey(d);
    return { name: fmt(d, 'd'), m: logs.filter((l) => l.date === k).reduce((s, l) => s + l.minutes, 0) };
  });
  return (
    <Panel title={L('Практика', 'Practice')} kanji="練" accent={tech.color}>
      <div className="grid grid-cols-3 gap-3 mb-3">
        <Stat label={L('Минут за неделю', 'Min this week')} value={weekMin} color={tech.color} />
        <Stat label={L('Стрик', 'Streak')} value={st} />
        <Stat label={L('Всего часов', 'Total hours')} value={Math.round(total / 6) / 10} />
      </div>
      <ResponsiveContainer width="100%" height={150}>
        <BarChart data={data} margin={{ top: 5, right: 5, left: -22, bottom: 0 }}>
          <CartesianGrid {...grid} />
          <XAxis dataKey="name" {...axis} />
          <YAxis {...axis} />
          <Tooltip {...tooltip} />
          <Bar dataKey="m" name={L('мин', 'min')} fill={tech.color} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <form
        className="flex flex-wrap gap-2 items-end mt-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const m = Number(min);
          if (!(m > 0)) return;
          await addPractice(tech.id, m, note, piece || undefined);
          setNote('');
        }}
      >
        <Field label={L('Минут', 'Minutes')}>
          <input className="inp w-20 mono" inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value)} />
        </Field>
        {pieces.length > 0 && (
          <Field label={L('Что', 'What')}>
            <select className="inp !w-auto" value={piece} onChange={(e) => setPiece(e.target.value)}>
              <option value="">—</option>
              {pieces.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label={L('Заметка', 'Note')} className="flex-1 min-w-[8rem]">
          <input className="inp" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <Btn type="submit" icon="plus">
          {L('Записать', 'Log')}
        </Btn>
      </form>
      <div className="mt-3 max-h-40 overflow-y-auto">
        {logs
          .slice()
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, 8)
          .map((l) => (
            <div key={l.id} className="flex items-center gap-2 text-[12px] py-0.5 group">
              <span className="mono text-dim w-14">{fmt(fromKey(l.date), 'd MMM')}</span>
              <span className="mono w-14">{l.minutes} {L('мин', 'min')}</span>
              <span className="text-muted truncate flex-1">{pieces.find((p) => p.id === l.pieceId)?.title || l.note}</span>
              <button className="opacity-0 group-hover:opacity-100 text-dim hover:text-blood" onClick={() => db.practice.delete(l.id)} aria-label="delete">
                <Icon name="x" size={12} />
              </button>
            </div>
          ))}
      </div>
    </Panel>
  );
}

function Repertoire({ tech }: { tech: Technique }) {
  const pieces = useLive(() => db.pieces.where('techniqueId').equals(tech.id).toArray(), [tech.id]) || [];
  const [edit, setEdit] = useState<Piece | null>(null);
  const ST = { learning: L('Учу', 'Learning'), polishing: L('Шлифую', 'Polishing'), ready: L('Готово', 'Ready') };
  return (
    <Panel
      title={L('Произведения', 'Repertoire')}
      kanji="曲"
      accent={tech.color}
      actions={
        <Btn size="xs" icon="plus" onClick={() => setEdit({ id: uid(), techniqueId: tech.id, title: '', composer: '', status: 'learning', progress: 0, notes: '' })}>
          {L('Добавить', 'Add')}
        </Btn>
      }
    >
      <div className="space-y-3">
        {pieces.map((p) => (
          <button key={p.id} className="w-full text-left" onClick={() => setEdit(p)}>
            <div className="flex items-center gap-2">
              <Icon name="music" size={14} style={{ color: tech.color }} />
              <span className="text-sm flex-1 truncate">
                {p.title} <span className="text-dim">· {p.composer}</span>
              </span>
              <span className="tag" style={p.status === 'ready' ? { color: '#3ddc97', background: '#3ddc9722' } : undefined}>
                {ST[p.status]}
              </span>
            </div>
            <Progress value={p.progress} color={p.status === 'ready' ? '#3ddc97' : tech.color} className="mt-1.5" />
          </button>
        ))}
        {!pieces.length && <div className="text-sm text-muted">{L('Добавь первое произведение', 'Add the first piece')}</div>}
      </div>
      {edit && (
        <Modal
          open
          onClose={() => setEdit(null)}
          title={edit.title || L('Произведение', 'Piece')}
          kanji="曲"
          footer={
            <>
              <Btn
                size="sm"
                variant="danger"
                icon="trash"
                className="mr-auto"
                onClick={async () => {
                  await db.pieces.delete(edit.id);
                  setEdit(null);
                }}
              >
                {L('Удалить', 'Delete')}
              </Btn>
              <Btn
                size="sm"
                icon="check"
                disabled={!edit.title.trim()}
                onClick={async () => {
                  await db.pieces.put(edit);
                  setEdit(null);
                }}
              >
                {L('Сохранить', 'Save')}
              </Btn>
            </>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={L('Название', 'Title')}>
              <input className="inp" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
            </Field>
            <Field label={L('Автор', 'Composer')}>
              <input className="inp" value={edit.composer} onChange={(e) => setEdit({ ...edit, composer: e.target.value })} />
            </Field>
            <Field label={L('Статус', 'Status')} className="sm:col-span-2">
              <Seg options={(Object.keys(ST) as Piece['status'][]).map((k) => ({ v: k, label: ST[k] }))} value={edit.status} onChange={(status) => setEdit({ ...edit, status, progress: status === 'ready' ? 100 : edit.progress })} />
            </Field>
            <Field label={`${L('Прогресс', 'Progress')}: ${edit.progress}%`} className="sm:col-span-2">
              <input type="range" min={0} max={100} step={5} value={edit.progress} onChange={(e) => setEdit({ ...edit, progress: Number(e.target.value) })} className="w-full accent-[var(--accent-1)]" />
            </Field>
            <Field label={L('Заметки', 'Notes')} className="sm:col-span-2">
              <textarea className="inp" rows={3} value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
            </Field>
          </div>
        </Modal>
      )}
    </Panel>
  );
}

function UniStats() {
  const a = useLive(() => db.assignments.toArray(), []) || [];
  const by = (s: string) => a.filter((x) => x.status === s).length;
  return (
    <Panel title="Assignments" kanji="課" className="lg:col-span-2">
      <div className="grid grid-cols-3 gap-3">
        <Stat label={L('Не начато', 'Not started')} value={by('todo')} />
        <Stat label={L('В процессе', 'In progress')} value={by('doing')} color="#f2c14e" />
        <Stat label={L('Сдано', 'Submitted')} value={by('done')} color="#3ddc97" />
      </div>
      <Btn size="sm" variant="ghost" className="mt-3" onClick={() => go('/tools/assignments')}>
        Cursed Tools → Assignments
      </Btn>
    </Panel>
  );
}

function GenericStats({ curses }: { curses: Curse[] }) {
  const last30 = curses.filter((c) => c.status === 'exorcised' && (c.completedAt || 0) > Date.now() - 30 * 864e5).length;
  const burned = curses.filter((c) => c.status === 'active' && c.due < Date.now()).length;
  return (
    <Panel title={L('Статистика', 'Stats')} kanji="計" className="lg:col-span-2">
      <div className="grid grid-cols-3 gap-3">
        <Stat label={L('Активных', 'Active')} value={curses.filter((c) => c.status === 'active').length} />
        <Stat label={L('Изгнано за 30 дн.', 'Exorcised 30d')} value={last30} color="#3ddc97" />
        <Stat label={L('Просрочено', 'Overdue')} value={burned} color={burned ? '#ff2744' : undefined} />
      </div>
    </Panel>
  );
}

function TechniqueEditor({ t: init, techs, onClose }: { t: Technique; techs: Technique[]; onClose: () => void }) {
  const [t, setT] = useState(init);
  const [stagesText, setStagesText] = useState((init.stages || []).join(', '));
  const exists = techs.some((x) => x.id === init.id);
  return (
    <Modal
      open
      onClose={onClose}
      title={exists ? t.name : L('Новая техника', 'New technique')}
      kanji="術"
      footer={
        <>
          {exists && techs.length > 1 && (
            <Btn
              size="sm"
              variant="danger"
              icon="trash"
              className="mr-auto"
              onClick={async () => {
                const other = techs.find((x) => x.id !== t.id)!;
                if (!(await confirmBox(L(`Удалить технику? Её задачи перейдут в «${other.name}».`, `Delete technique? Its tasks move to “${other.name}”.`), { danger: true }))) return;
                const cs = await db.curses.where('techniqueId').equals(t.id).toArray();
                await db.curses.bulkPut(cs.map((c) => ({ ...c, techniqueId: other.id, stage: undefined })));
                await db.techniques.delete(t.id);
                setQuery('t');
                onClose();
              }}
            >
              {L('Удалить', 'Delete')}
            </Btn>
          )}
          <Btn
            size="sm"
            icon="check"
            disabled={!t.name.trim()}
            onClick={async () => {
              const stages = stagesText
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
              await db.techniques.put({ ...t, name: t.name.trim(), stages });
              setQuery('t', t.id);
              onClose();
            }}
          >
            {L('Сохранить', 'Save')}
          </Btn>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_90px]">
        <Field label={L('Название', 'Name')}>
          <input className="inp" value={t.name} autoFocus={!exists} onChange={(e) => setT({ ...t, name: e.target.value })} placeholder="Chinese / Drawing / Code…" />
        </Field>
        <Field label={L('Символ', 'Symbol')}>
          <input className="inp text-center kanji text-lg" maxLength={3} value={t.icon} onChange={(e) => setT({ ...t, icon: e.target.value })} />
        </Field>
        <Field label={L('Цвет', 'Color')} className="sm:col-span-2">
          <ColorPick value={t.color} onChange={(color) => setT({ ...t, color })} />
        </Field>
        <Field label={L('Этапы конвейера (через запятую)', 'Pipeline stages (comma separated)')} className="sm:col-span-2" hint={L('Например: идея, черновик, готово. Пусто — без этапов.', 'E.g.: idea, draft, done. Empty — no stages.')}>
          <input className="inp" value={stagesText} onChange={(e) => setStagesText(e.target.value)} />
        </Field>
        <div className="sm:col-span-2 flex flex-wrap gap-5">
          <Toggle on={!!t.trackMinutes} onChange={(v) => setT({ ...t, trackMinutes: v })} label={L('Минуты практики и стрик', 'Practice minutes & streak')} />
          <Toggle on={!!t.repertoire} onChange={(v) => setT({ ...t, repertoire: v })} label={L('Список произведений/проектов', 'Repertoire / projects list')} />
        </div>
      </div>
    </Modal>
  );
}
