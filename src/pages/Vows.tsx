// BINDING VOW — обеты «жертвую X ради Y», Heavenly Restriction, счётчик дней, «я нарушил», Vow Power, экран «Договоры».
import { addDays } from 'date-fns';
import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { Icon } from '../components/Icon';
import { Seal } from '../components/Seal';
import { Countdown } from '../components/shared';
import { Btn, Empty, Field, IBtn, Modal, PageTitle, Panel, Progress, Seg, Tabs } from '../components/ui';
import { db, type Goal, type Vow } from '../db/schema';
import { breakVow, fulfillVow, renewVow } from '../lib/actions';
import { fmt, fromLocalInput, shortLeft, toLocalInput } from '../lib/dates';
import { confirmBox } from '../lib/fx';
import { useLive, useNow } from '../lib/hooks';
import { go, useRoute } from '../lib/router';
import { daysWord, L, rt, uid } from '../lib/runtime';
import { play } from '../lib/sound';
import { powerTier, vowDurationDays, vowKeptDays, vowPower } from '../lib/stats';
import { openDesk } from '../components/DeskCard';

const STRICT = () => [
  { v: 1, label: L('Мягко', 'Soft') },
  { v: 2, label: L('Твёрдо', 'Firm') },
  { v: 3, label: L('Строго', 'Strict') },
  { v: 4, label: L('Жёстко', 'Harsh') },
  { v: 5, label: L('Абсолютно', 'Absolute') },
];

export function VowsPage() {
  const { parts } = useRoute();
  const tab = parts[1] === 'contracts' ? 'contracts' : 'vows';
  const vows = useLive(() => db.vows.toArray(), []) || [];
  const goals = useLive(() => db.goals.toArray(), []) || [];
  const [edit, setEdit] = useState<Vow | null>(null);
  const blank = (kind: Vow['kind']): Vow => ({ id: uid(), kind, sacrifice: '', forWhat: '', startDate: Date.now(), endDate: addDays(new Date(), 30).getTime(), strictness: 3, status: 'active', history: [], createdAt: Date.now() });
  return (
    <div>
      <PageTitle
        title="Binding Vow"
        kanji="縛り"
        sub={L('Ограничь себя — и сила возрастёт. Чем строже и дольше обет, тем больше Vow Power.', 'Restrict yourself and grow stronger. Stricter and longer vows give more Vow Power.')}
        right={
          <>
            <Btn icon="plus" onClick={() => setEdit(blank('vow'))}>
              {L('Обет', 'Vow')}
            </Btn>
            <Btn variant="flash" icon="shield" onClick={() => setEdit(blank('restriction'))}>
              Heavenly Restriction
            </Btn>
          </>
        }
      />
      <Tabs
        className="mb-4"
        tabs={[
          { id: 'vows', label: L('Обеты', 'Vows') },
          { id: 'contracts', label: L('Договоры', 'Contracts') },
        ]}
        value={tab}
        onChange={(t) => go(t === 'vows' ? '/vows' : '/vows/contracts')}
      />
      {tab === 'vows' ? <VowList vows={vows} goals={goals} onEdit={setEdit} /> : <Contracts vows={vows} goals={goals} />}
      {edit && <VowEditor v={edit} vows={vows} goals={goals} onClose={() => setEdit(null)} />}
    </div>
  );
}

function VowList({ vows, goals, onEdit }: { vows: Vow[]; goals: Goal[]; onEdit: (v: Vow) => void }) {
  const [showArchive, setShowArchive] = useState(false);
  const col = (kind: Vow['kind']) => {
    const list = vows.filter((v) => v.kind === kind);
    const active = list.filter((v) => v.status === 'active').sort((a, b) => a.endDate - b.endDate);
    const archive = list.filter((v) => v.status !== 'active').sort((a, b) => b.createdAt - a.createdAt);
    return { active, archive };
  };
  const a = col('vow');
  const b = col('restriction');
  const archiveCount = a.archive.length + b.archive.length;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="kanji text-acc">縛り</span>
            <h2 className="h-display text-lg">Binding Vows</h2>
            <span className="mono text-dim text-sm">{a.active.length}</span>
          </div>
          <AnimatePresence initial={false}>
            {a.active.map((v) => (
              <VowCard key={v.id} v={v} goals={goals} vows={vows} onEdit={() => onEdit(v)} />
            ))}
          </AnimatePresence>
          {!a.active.length && (
            <Panel>
              <Empty text={L('«Я жертвую … ради …» — заключи первый обет.', '“I sacrifice … for …” — make your first vow.')} icon="chain" />
            </Panel>
          )}
        </div>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="kanji text-blood">天与呪縛</span>
            <h2 className="h-display text-lg">Heavenly Restrictions</h2>
            <span className="mono text-dim text-sm">{b.active.length}</span>
          </div>
          <AnimatePresence initial={false}>
            {b.active.map((v) => (
              <VowCard key={v.id} v={v} goals={goals} vows={vows} onEdit={() => onEdit(v)} />
            ))}
          </AnimatePresence>
          {!b.active.length && (
            <Panel hot>
              <Empty text={L('Жёсткий договор с собой: от чего отказываюсь, срок, штраф, условия.', 'A hard deal with yourself: what you give up, term, penalty, conditions.')} icon="shield" />
            </Panel>
          )}
        </div>
      </div>
      {archiveCount > 0 && (
        <div>
          <button className="chip" onClick={() => setShowArchive(!showArchive)}>
            <Icon name={showArchive ? 'up' : 'down'} size={12} /> {L('Архив', 'Archive')} · {archiveCount}
          </button>
          {showArchive && (
            <div className="grid gap-3 lg:grid-cols-2 mt-3 items-start">
              {[...a.archive, ...b.archive].map((v) => (
                <VowCard key={v.id} v={v} goals={goals} vows={vows} onEdit={() => onEdit(v)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function PowerMeter({ v }: { v: Pick<Vow, 'strictness' | 'startDate' | 'endDate' | 'kind'> }) {
  const p = vowPower(v);
  const t = powerTier(p);
  return (
    <div>
      <div className="flex items-center gap-2 text-[12px]">
        <span className="label">Vow Power</span>
        <span className="mono font-bold" style={{ color: t.color, textShadow: `0 0 10px ${t.color}` }}>
          {p}
        </span>
        <span className="tag" style={{ color: t.color, background: `color-mix(in srgb, ${t.color} 12%, transparent)` }}>
          {rt.lang === 'ru' ? t.ru : t.label}
        </span>
        <span className="ml-auto flex gap-0.5">
          {[1, 2, 3, 4, 5].map((i) => (
            <span key={i} className="w-2 h-2 rotate-45" style={{ background: i <= v.strictness ? t.color : '#2b2456' }} />
          ))}
        </span>
      </div>
      <Progress value={Math.min(100, (p / 600) * 100)} color={t.color} className="mt-1.5" height={t.level >= 4 ? 8 : 6} />
    </div>
  );
}

function VowCard({ v, goals, vows, onEdit }: { v: Vow; goals: Goal[]; vows: Vow[]; onEdit: () => void }) {
  const now = useNow(60_000);
  const [hist, setHist] = useState(false);
  const goal = goals.find((g) => g.id === v.goalId);
  const parent = vows.find((x) => x.id === v.parentVowId);
  const kids = vows.filter((x) => x.parentVowId === v.id && x.status === 'active');
  const kept = vowKeptDays(v, now);
  const total = vowDurationDays(v);
  const isR = v.kind === 'restriction';
  const statusColor = { active: 'var(--accent-1)', fulfilled: '#3ddc97', broken: '#ff2744' }[v.status];
  const statusLabel = { active: L('Активен', 'Active'), fulfilled: L('Выполнен', 'Fulfilled'), broken: L('Нарушен', 'Broken') }[v.status];
  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
      <Panel hot={isR || v.status === 'broken'} accent={statusColor} bodyClass="p-4">
        <div className="flex items-start gap-3">
          <button onClick={(e) => openVowContract(v, e.currentTarget)} aria-label={L('Открыть договор', 'Open contract')} data-cursor="Open">
            <Seal text={isR ? '天' : '縛'} size={52} color={isR ? '#ff2744' : 'var(--accent-1)'} spin={v.status === 'active'} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="label" style={{ color: isR ? '#ff4d63' : undefined }}>
                {isR ? 'Heavenly Restriction' : 'Binding Vow'}
              </span>
              <span className="tag" style={{ color: statusColor, background: `color-mix(in srgb, ${statusColor} 12%, transparent)` }}>
                {statusLabel}
              </span>
              <IBtn icon="scroll" size={14} className="ibtn-sm ml-auto" title={L('Открыть договор', 'Open contract')} onClick={(e) => openVowContract(v, e.currentTarget)} />
              <IBtn icon="edit" size={14} className="ibtn-sm" onClick={onEdit} />
            </div>
            <div className="text-[15px] leading-snug mt-1">
              {isR ? (
                <>
                  {L('Отказываюсь от', 'I give up')} <b className="text-white">{v.sacrifice}</b>
                  {v.forWhat && (
                    <>
                      {' '}
                      {L('ради', 'for')} <b className="text-white">{v.forWhat}</b>
                    </>
                  )}
                </>
              ) : (
                <>
                  {L('Я жертвую', 'I sacrifice')} <b className="text-white">{v.sacrifice}</b> {L('ради', 'for')} <b className="text-white">{v.forWhat}</b>
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {goal && (
                <button className="tag" style={{ color: goal.color, background: `color-mix(in srgb, ${goal.color} 10%, transparent)` }} onClick={() => go(goal.level === 'year' ? `/energy/domain?year=${goal.year}` : `/energy/maximum?month=${goal.month}`)}>
                  {goal.level === 'year' ? '領域' : '極'} {goal.title}
                </button>
              )}
              {parent && <span className="tag">↳ {L('к обету', 'for vow')}: {parent.sacrifice}</span>}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mt-4">
          <div>
            <div className="label">{L('Соблюдается', 'Kept for')}</div>
            <div className="mono text-2xl font-bold" style={{ color: statusColor }}>
              {kept}
              <span className="text-xs text-dim"> / {total} {L('дн', 'd')}</span>
            </div>
          </div>
          <div>
            <div className="label">{L('Срок', 'Term')}</div>
            <div className="text-[12px] mono mt-1">
              {fmt(v.startDate, 'd MMM')} — {fmt(v.endDate, 'd MMM')}
            </div>
          </div>
          <div>
            <div className="label">{v.status === 'active' ? L('Осталось', 'Left') : L('Итог', 'Result')}</div>
            <div className="text-[12px] mono mt-1" style={{ color: statusColor }}>
              {v.status === 'active' ? shortLeft(v.endDate - now) : statusLabel}
            </div>
          </div>
        </div>
        <Progress value={(kept / total) * 100} color={statusColor} className="mt-2" />

        {(v.deadline || v.penalty || v.conditions) && (
          <div className="mt-3 grid gap-1.5 text-[12.5px] p-2.5 bg-void/50 border border-line/50">
            {v.deadline && (
              <div>
                <span className="text-dim">{L('Дедлайн', 'Deadline')}:</span> <span className="mono">{fmt(v.deadline, 'd MMM yyyy, HH:mm')}</span>
              </div>
            )}
            {v.penalty && (
              <div>
                <span className="text-dim">{L('Штраф за нарушение', 'Penalty')}:</span> <span className="text-[#ff8a9a]">{v.penalty}</span>
              </div>
            )}
            {v.conditions && (
              <div>
                <span className="text-dim">{L('Условия', 'Conditions')}:</span> {v.conditions}
              </div>
            )}
          </div>
        )}

        {kids.length > 0 && (
          <div className="mt-3 space-y-1">
            <div className="label">{L('Heavenly Restriction рядом', 'Attached restrictions')}</div>
            {kids.map((k) => (
              <div key={k.id} className="text-[12.5px] flex items-center gap-2">
                <Icon name="shield" size={12} className="text-blood" /> {L('Отказ от', 'No')} <b>{k.sacrifice}</b>
                <span className="text-dim mono ml-auto">{shortLeft(k.endDate - now)}</span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3">
          <PowerMeter v={v} />
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          {v.status === 'active' && (
            <>
              <Btn
                size="sm"
                variant="danger"
                icon="x"
                onClick={async () => {
                  const note = await confirmBox(L('Ты нарушил обет? Это зафиксируется в истории, а XP уменьшится.', 'Did you break the vow? It will be recorded and XP reduced.'), { danger: true, okLabel: L('Я нарушил', 'I broke it'), withNote: true });
                  if (note !== false) await breakVow(v, note.trim() || undefined);
                }}
              >
                {L('Я нарушил', 'I broke it')}
              </Btn>
              <Btn
                size="sm"
                variant="jade"
                icon="check"
                onClick={async () => {
                  if (await confirmBox(L('Отметить обет выполненным сейчас? XP начислится пропорционально пройденному сроку.', 'Mark as fulfilled now? XP is prorated by elapsed term.'))) await fulfillVow(v);
                }}
              >
                {L('Выполнен', 'Fulfilled')}
              </Btn>
            </>
          )}
          {v.status === 'broken' && (
            <Btn size="sm" variant="ghost" icon="refresh" onClick={() => renewVow(v)}>
              {L('Перезаключить', 'Renew')}
            </Btn>
          )}
          <button className="chip ml-auto" onClick={() => setHist(!hist)}>
            <Icon name="scroll" size={12} /> {L('История', 'History')} · {v.history.length}
          </button>
        </div>
        {hist && (
          <div className="mt-3 space-y-1 border-t border-line/50 pt-2">
            {v.history
              .slice()
              .reverse()
              .map((h, i) => (
                <div key={i} className="text-[12px] flex gap-2">
                  <span className="mono text-dim w-28 shrink-0">{fmt(h.at, 'd MMM yy, HH:mm')}</span>
                  <span style={{ color: { created: 'var(--accent-text)', renewed: 'var(--accent-text)', broken: '#ff4d63', fulfilled: '#3ddc97' }[h.type] }}>
                    {{ created: L('заключён', 'made'), renewed: L('перезаключён', 'renewed'), broken: L('нарушен', 'broken'), fulfilled: L('исполнен', 'fulfilled') }[h.type]}
                  </span>
                  {h.note && <span className="text-muted">— {h.note}</span>}
                </div>
              ))}
          </div>
        )}
      </Panel>
    </motion.div>
  );
}

function Contracts({ vows, goals }: { vows: Vow[]; goals: Goal[] }) {
  const now = useNow(60_000);
  const active = vows.filter((v) => v.status === 'active').sort((a, b) => (a.deadline ?? a.endDate) - (b.deadline ?? b.endDate));
  const totalPower = active.reduce((s, v) => s + vowPower(v), 0);
  return (
    <div className="space-y-4">
      <Panel bodyClass="p-4">
        <div className="flex flex-wrap items-center gap-4">
          <Seal text="契" size={64} color="#ff2744" />
          <div>
            <div className="h-display text-2xl">{L('Договоры', 'Contracts')}</div>
            <div className="text-sm text-muted">
              {active.length} {L('активных', 'active')} · {L('суммарная сила', 'total power')} <b className="mono text-white">{totalPower}</b>
            </div>
          </div>
        </div>
      </Panel>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 items-start">
        {active.map((v) => {
          const goal = goals.find((g) => g.id === v.goalId);
          const target = v.deadline ?? v.endDate;
          return (
            <Panel key={v.id} hot={v.kind === 'restriction'} bodyClass="p-4">
              <div className="label" style={{ color: v.kind === 'restriction' ? '#ff4d63' : undefined }}>
                {v.kind === 'restriction' ? 'Heavenly Restriction' : 'Binding Vow'}
              </div>
              <div className="text-[15px] mt-1 leading-snug">
                {v.kind === 'restriction' ? L('Отказ от', 'No') : L('Жертва:', 'Sacrifice:')} <b>{v.sacrifice}</b>
                {v.forWhat && (
                  <>
                    {' '}
                    → <b>{v.forWhat}</b>
                  </>
                )}
              </div>
              {goal && <div className="text-[11px] text-dim mt-0.5">{goal.title}</div>}
              <div className="mt-4">
                <div className="label mb-1">{v.deadline ? L('До дедлайна', 'Until deadline') : L('До конца срока', 'Until term ends')}</div>
                <Countdown to={target} />
              </div>
              <div className="text-[12px] text-muted mt-2">
                {L('Соблюдается', 'Kept')} {daysWord(vowKeptDays(v, now))} · {L('конец', 'ends')} {fmt(v.endDate, 'd MMM')}
              </div>
              {v.penalty && <div className="text-[12px] mt-1 text-[#ff8a9a] flex gap-1 items-center"><Icon name="alert" size={12} /> {v.penalty}</div>}
              <div className="mt-3">
                <PowerMeter v={v} />
              </div>
              <Btn
                size="sm"
                variant="danger"
                icon="x"
                className="mt-3"
                onClick={async () => {
                  const note = await confirmBox(L('Зафиксировать нарушение договора?', 'Record a breach of contract?'), { danger: true, okLabel: L('Я нарушил', 'I broke it'), withNote: true });
                  if (note !== false) await breakVow(v, note.trim() || undefined);
                }}
              >
                {L('Я нарушил', 'I broke it')}
              </Btn>
            </Panel>
          );
        })}
      </div>
      {!active.length && (
        <Panel>
          <Empty text={L('Активных договоров нет', 'No active contracts')} icon="chain" />
        </Panel>
      )}
    </div>
  );
}

function VowEditor({ v: init, vows, goals, onClose }: { v: Vow; vows: Vow[]; goals: Goal[]; onClose: () => void }) {
  const [v, setV] = useState(init);
  const exists = vows.some((x) => x.id === init.id);
  const set = (p: Partial<Vow>) => setV((x) => ({ ...x, ...p }));
  const isR = v.kind === 'restriction';
  const valid = v.sacrifice.trim() && (isR || v.forWhat.trim()) && v.endDate > v.startDate;
  return (
    <Modal
      open
      onClose={onClose}
      wide
      kanji={isR ? '天与呪縛' : '縛り'}
      title={exists ? L('Обет', 'Vow') : isR ? 'Heavenly Restriction' : L('Новый обет', 'New vow')}
      footer={
        <>
          {exists && (
            <Btn
              size="sm"
              variant="danger"
              icon="trash"
              className="mr-auto"
              onClick={async () => {
                if (await confirmBox(L('Удалить обет вместе с историей?', 'Delete vow with history?'), { danger: true })) {
                  await db.vows.delete(v.id);
                  onClose();
                }
              }}
            >
              {L('Удалить', 'Delete')}
            </Btn>
          )}
          <Btn
            size="sm"
            variant={isR ? 'flash' : 'primary'}
            icon="check"
            disabled={!valid}
            onClick={async () => {
              const next = { ...v, sacrifice: v.sacrifice.trim(), forWhat: v.forWhat.trim(), history: exists ? v.history : [{ at: Date.now(), type: 'created' as const }] };
              await db.vows.put(next);
              if (!exists) play('vow');
              onClose();
            }}
          >
            {exists ? L('Сохранить', 'Save') : L('Заключить', 'Bind')}
          </Btn>
        </>
      }
    >
      <div className="space-y-4">
        <Seg
          options={[
            { v: 'vow' as const, label: 'Binding Vow' },
            { v: 'restriction' as const, label: 'Heavenly Restriction' },
          ]}
          value={v.kind}
          onChange={(kind) => set({ kind })}
        />
        <div className="p-4 bg-void/60 border border-line/60 text-lg leading-relaxed">
          {isR ? L('Я отказываюсь от', 'I give up') : L('Я жертвую', 'I sacrifice')}{' '}
          <input className="inp !inline-block !w-auto min-w-[10rem] !text-lg !py-1" value={v.sacrifice} onChange={(e) => set({ sacrifice: e.target.value })} placeholder={isR ? L('сладкого', 'sugar') : 'Roblox'} autoFocus={!exists} /> {L('ради', 'for')}{' '}
          <input className="inp !inline-block !w-auto min-w-[10rem] !text-lg !py-1" value={v.forWhat} onChange={(e) => set({ forWhat: e.target.value })} placeholder={L('китайского языка', 'Chinese')} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={L('Привязка к цели', 'Linked goal')}>
            <select className="inp" value={v.goalId || ''} onChange={(e) => set({ goalId: e.target.value || undefined })}>
              <option value="">—</option>
              <optgroup label="Domain Expansion">
                {goals
                  .filter((g) => g.level === 'year')
                  .map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.year} · {g.title}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="Maximum Technique">
                {goals
                  .filter((g) => g.level === 'month')
                  .sort((a, b) => (b.month || '').localeCompare(a.month || ''))
                  .map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.month} · {g.title}
                    </option>
                  ))}
              </optgroup>
            </select>
          </Field>
          <Field label={L('Строгость', 'Strictness')}>
            <Seg options={STRICT()} value={v.strictness} onChange={(strictness) => set({ strictness })} />
          </Field>
          <Field label={isR ? L('Срок действия: с', 'Term: from') : L('Начало', 'Start')}>
            <input type="datetime-local" className="inp" value={toLocalInput(v.startDate)} onChange={(e) => e.target.value && set({ startDate: fromLocalInput(e.target.value) })} />
          </Field>
          <Field label={isR ? L('Срок действия: по', 'Term: until') : L('Конец срока', 'End')}>
            <input type="datetime-local" className="inp" value={toLocalInput(v.endDate)} onChange={(e) => e.target.value && set({ endDate: fromLocalInput(e.target.value) })} />
            <div className="flex gap-1 mt-1.5">
              {[7, 14, 30, 60, 90].map((d) => (
                <button key={d} type="button" className="chip !text-[11px] !py-0.5" onClick={() => set({ endDate: v.startDate + d * 864e5 })}>
                  {d} {L('дн', 'd')}
                </button>
              ))}
            </div>
          </Field>
          {isR && (
            <>
              <Field label={L('Дедлайн цели (необязательно)', 'Goal deadline (optional)')}>
                <input type="datetime-local" className="inp" value={v.deadline ? toLocalInput(v.deadline) : ''} onChange={(e) => set({ deadline: e.target.value ? fromLocalInput(e.target.value) : undefined })} />
              </Field>
              <Field label={L('Рядом с обетом', 'Attached to vow')}>
                <select className="inp" value={v.parentVowId || ''} onChange={(e) => set({ parentVowId: e.target.value || undefined })}>
                  <option value="">—</option>
                  {vows
                    .filter((x) => x.kind === 'vow' && x.id !== v.id)
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.sacrifice} → {x.forWhat}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label={L('Штраф за нарушение', 'Penalty for breaking')} className="sm:col-span-2">
                <input className="inp" value={v.penalty || ''} onChange={(e) => set({ penalty: e.target.value })} placeholder={L('100 отжиманий + неделя без кофе', '100 push-ups + a week without coffee')} />
              </Field>
              <Field label={L('Условия', 'Conditions')} className="sm:col-span-2">
                <textarea className="inp" rows={2} value={v.conditions || ''} onChange={(e) => set({ conditions: e.target.value })} placeholder={L('Исключения, как считать нарушение…', 'Exceptions, what counts as a breach…')} />
              </Field>
            </>
          )}
        </div>
        <div className="p-3 border border-line/60 bg-void/40">
          <PowerMeter v={v} />
          <div className="text-[11px] text-dim mt-1.5">
            {L('Срок', 'Term')}: {daysWord(vowDurationDays(v))}. {L('Исполнение даст', 'Fulfilling gives')} <b className="mono text-ink">+{vowPower(v)} XP</b>
            {isR ? ` (×1.5 Heavenly Restriction)` : ''}.
          </div>
        </div>
      </div>
    </Modal>
  );
}

/** Тёмная карточка-договор (DeskCard) в стиле Heavenly Restriction: что отдаю, срок, штраф, счётчик дней. */
function openVowContract(v: Vow, from: Element) {
  openDesk({ id: `vow:${v.id}`, variant: 'dark', title: v.kind === 'restriction' ? 'Heavenly Restriction' : 'Binding Vow', from, width: 360, node: () => <VowContract id={v.id} /> });
}
function VowContract({ id }: { id: string }) {
  const v = useLive(() => db.vows.get(id), [id]);
  const now = useNow(60_000);
  if (!v) return null;
  const isR = v.kind === 'restriction';
  const kept = vowKeptDays(v, now);
  const total = vowDurationDays(v);
  return (
    <div className="pr-14">
      <div className="text-[11px] tracking-[0.18em] uppercase desk-muted">{isR ? 'Heavenly Restriction' : 'Binding Vow'} · {L('договор', 'contract')}</div>
      <div className="text-[22px] font-bold leading-tight mt-2" style={{ fontFamily: 'var(--font-head)' }}>{isR ? '天与呪縛' : '縛り'}</div>
      <div className="mt-3 space-y-2 text-[14px]">
        <div><span className="desk-muted">{L('Отдаю', 'I give up')}:</span> <b>{v.sacrifice}</b></div>
        {v.forWhat && <div><span className="desk-muted">{L('Ради', 'For')}:</span> <b>{v.forWhat}</b></div>}
        <div><span className="desk-muted">{L('Срок', 'Term')}:</span> {fmt(v.startDate, 'd MMM')} — {fmt(v.endDate, 'd MMM yyyy')}</div>
        {v.penalty && <div><span className="desk-muted">{L('Штраф', 'Penalty')}:</span> {v.penalty}</div>}
        {v.conditions && <div className="desk-muted text-[12.5px]">{v.conditions}</div>}
      </div>
      <div className="flex items-end gap-3 mt-4">
        <div className="mono text-[44px] leading-none font-bold" style={{ color: 'var(--accent-text)' }}>{kept}</div>
        <div className="text-[12px] desk-muted pb-1">/ {total} {L('дней держу', 'days kept')}</div>
        <div className="ml-auto text-[12px] desk-muted pb-1">Power {vowPower(v)}</div>
      </div>
      <div className="h-1.5 rounded-full bg-white/10 mt-2 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.min(100, (kept / Math.max(1, total)) * 100)}%`, background: 'var(--accent-grad)' }} /></div>
    </div>
  );
}
