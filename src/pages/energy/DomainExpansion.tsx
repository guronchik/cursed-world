// Domain Expansion — план на год: Special Grade цели, связанные месячные цели, визуализация «домена» по месяцам.
import { useState } from 'react';
import { Monster } from '../../components/Monster';
import { Btn, Empty, IBtn, Panel, Progress, Stat } from '../../components/ui';
import { BigNumberStage } from '../../components/BigNumberStage';
import { BlurText } from '../../components/BlurText';
import { useSettings } from '../../lib/settings';
import { db, patchSettings, type Goal } from '../../db/schema';
import { fmt } from '../../lib/dates';
import { useLive } from '../../lib/hooks';
import { go, setQuery, useRoute } from '../../lib/router';
import { L } from '../../lib/runtime';
import { monthGoalProgress, yearGoalProgress } from '../../lib/stats';
import { blankGoal, GoalEditor } from './goals';

const arc = (cx: number, cy: number, r0: number, r1: number, a0: number, a1: number) => {
  const p = (r: number, a: number) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${p(r1, a0)} A${r1} ${r1} 0 ${large} 1 ${p(r1, a1)} L${p(r0, a1)} A${r0} ${r0} 0 ${large} 0 ${p(r0, a0)} Z`;
};

function Domain({ year, yearGoals, goals, curses, pct }: { year: number; yearGoals: Goal[]; goals: Goal[]; curses: import('../../db/schema').Curse[]; pct: number }) {
  const S = 420;
  const c = S / 2;
  const rings = yearGoals.slice(0, 5);
  const inner = 64;
  const outer = 178;
  const step = rings.length ? (outer - inner) / rings.length : 0;
  const now = new Date();
  const curM = now.getFullYear() === year ? now.getMonth() : -1;
  const mName = (i: number) => fmt(new Date(2024, i, 1), 'LLL').replace('.', '');
  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="w-full max-w-[460px] mx-auto block" style={{ filter: 'drop-shadow(0 0 24px color-mix(in srgb, var(--accent-1) 35%, transparent))' }}>
      <defs>
        <radialGradient id="dom-bg" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#2a0a1c" />
          <stop offset="0.6" stopColor="#0d0a1f" />
          <stop offset="1" stopColor="#06050c" />
        </radialGradient>
      </defs>
      <circle cx={c} cy={c} r={outer + 22} fill="url(#dom-bg)" stroke="var(--accent-1)" strokeOpacity={0.4} />
      <g className="seal-spin" style={{ transformOrigin: `${c}px ${c}px` }}>
        <circle cx={c} cy={c} r={outer + 14} fill="none" stroke="#ff2744" strokeOpacity={0.5} strokeDasharray="2 6" />
      </g>
      {Array.from({ length: 12 }, (_, m) => {
        const a0 = (m / 12) * Math.PI * 2 - Math.PI / 2 + 0.012;
        const a1 = ((m + 1) / 12) * Math.PI * 2 - Math.PI / 2 - 0.012;
        const mk = `${year}-${String(m + 1).padStart(2, '0')}`;
        const am = (a0 + a1) / 2;
        return (
          <g key={m}>
            {rings.map((yg, ri) => {
              const mg = goals.filter((g) => g.level === 'month' && g.parentId === yg.id && g.month === mk);
              const v = mg.length ? mg.reduce((s, g) => s + monthGoalProgress(g.id, curses).pct, 0) / mg.length : null;
              const r0 = inner + ri * step + 2;
              const r1 = inner + (ri + 1) * step - 2;
              return (
                <path
                  key={yg.id}
                  d={arc(c, c, r0, r1, a0, a1)}
                  fill={v === null ? 'color-mix(in srgb, var(--accent-1) 5%, transparent)' : yg.color}
                  fillOpacity={v === null ? 1 : 0.15 + (v / 100) * 0.85}
                  stroke={m === curM ? '#ffffff' : yg.color}
                  strokeOpacity={m === curM ? 0.8 : v === null ? 0.15 : 0.6}
                  strokeWidth={m === curM ? 1.5 : 0.8}
                  style={{ cursor: 'pointer' }}
                  onClick={() => go(`/energy/maximum?month=${mk}`)}
                >
                  <title>{`${yg.title} — ${mName(m)}: ${v === null ? '—' : Math.round(v) + '%'}`}</title>
                </path>
              );
            })}
            <text x={c + (outer + 8) * Math.cos(am)} y={c + (outer + 8) * Math.sin(am)} fontSize={10} fill={m === curM ? '#fff' : '#8f8ab8'} textAnchor="middle" dominantBaseline="central" className="mono" style={{ textTransform: 'uppercase' }}>
              {mName(m)}
            </text>
          </g>
        );
      })}
      <circle cx={c} cy={c} r={inner - 6} fill="#06050c" stroke="#ff2744" strokeWidth={2} />
      <text x={c} y={c - 14} textAnchor="middle" className="kanji" fontSize={15} fill="#ff4f8b">
        領域展開
      </text>
      <text x={c} y={c + 12} textAnchor="middle" className="mono" fontSize={24} fontWeight={700} fill="#fff">
        {pct}%
      </text>
      <text x={c} y={c + 32} textAnchor="middle" className="mono" fontSize={10} fill="#8f8ab8">
        {year}
      </text>
    </svg>
  );
}

export function DomainExpansion() {
  const { query } = useRoute();
  const year = Number(query.get('year')) || new Date().getFullYear();
  const goals = useLive(() => db.goals.toArray(), []) || [];
  const curses = useLive(() => db.curses.toArray(), []) || [];
  const vows = useLive(() => db.vows.toArray(), []) || [];
  const [edit, setEdit] = useState<Goal | null>(null);
  const yearGoals = goals.filter((g) => g.level === 'year' && g.year === year);
  const years = goals.filter((g) => g.level === 'year');
  const pct = yearGoals.length ? Math.round(yearGoals.reduce((s, g) => s + yearGoalProgress(g, goals, curses).pct, 0) / yearGoals.length) : 0;

  const ys = String(year);
  return (
    <div className="space-y-4">
      <BigNumberStage
        left={ys.slice(0, 2)}
        right={ys.slice(2)}
        items={yearGoals.map((g) => {
          const p = yearGoalProgress(g, goals, curses).pct / 100;
          return { id: g.id, label: g.title, progress: p, done: p >= 1, color: g.color, icon: <Monster grade={0} size={40} />, onClick: () => setEdit(g) };
        })}
        caption={yearGoals.length ? `Special Grade · ${yearGoals.length}` : L('Добавь цель года — она вылетит сюда', 'Add a year goal — it will fly out here')}
      />
      <YearManifest year={year} />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Goals" value={`${yearGoals.length}`} sub={`${pct}%`} />
        <Stat label="Months" value={`${goals.filter((g) => g.level === 'month' && g.month?.startsWith(ys)).length}`} sub={L('месячных целей', 'month goals')} />
        <Stat label="Binding Vows" value={`${vows.filter((v) => v.status === 'active').length}`} sub={L('активных', 'active')} />
        <Stat label="Stats" value={`${curses.filter((c) => c.status === 'exorcised' && c.completedAt && new Date(c.completedAt).getFullYear() === year).length}`} sub={L('изгнано за год', 'exorcised this year')} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <IBtn icon="left" onClick={() => setQuery('year', String(year - 1))} />
        <div className="h-display text-xl min-w-[6rem] text-center">{year}</div>
        <IBtn icon="right" onClick={() => setQuery('year', String(year + 1))} />
        <Btn className="ml-auto" icon="plus" onClick={() => setEdit(blankGoal('year', { year }))}>
          {L('Цель года', 'Year goal')}
        </Btn>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,480px)_1fr] items-start">
        <Panel title="Domain Expansion" kanji="領域展開" hot bodyClass="p-3">
          <Domain year={year} yearGoals={yearGoals} goals={goals} curses={curses} pct={pct} />
          <div className="flex flex-wrap gap-2 justify-center mt-2">
            {yearGoals.slice(0, 5).map((g, i) => (
              <span key={g.id} className="tag" style={{ color: g.color, background: `color-mix(in srgb, ${g.color} 10%, transparent)` }}>
                {i + 1}. {g.title}
              </span>
            ))}
          </div>
          <p className="text-[11px] text-dim text-center mt-2">{L('Кольца — годовые цели, сектора — месяцы. Яркость = прогресс месячных целей. Нажми на сектор.', 'Rings are year goals, sectors are months. Brightness = month progress. Tap a sector.')}</p>
        </Panel>

        <div className="space-y-4">
          {yearGoals.map((g) => {
            const p = yearGoalProgress(g, goals, curses);
            return (
              <Panel key={g.id} accent={g.color} bodyClass="p-4">
                <div className="flex items-start gap-4">
                  <Monster grade={0} size={72} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="label" style={{ color: g.color }}>
                          Special Grade · Domain Expansion
                        </div>
                        <div className="text-lg leading-tight mt-0.5">{g.title}</div>
                        {g.description && <p className="text-[12.5px] text-muted mt-1">{g.description}</p>}
                      </div>
                      <IBtn icon="edit" size={15} onClick={() => setEdit(g)} />
                    </div>
                    <div className="flex items-center gap-2 mt-3">
                      <Progress value={p.pct} color={g.color} className="flex-1" height={8} />
                      <span className="mono text-sm w-12 text-right">{p.pct}%</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {p.months
                        .slice()
                        .sort((a, b) => (a.month || '').localeCompare(b.month || ''))
                        .map((m) => {
                          const mp = monthGoalProgress(m.id, curses);
                          return (
                            <button key={m.id} className="chip !text-[11px]" onClick={() => go(`/energy/maximum?month=${m.month}`)}>
                              <span className="mono text-dim">{m.month?.slice(5)}</span> {m.title} <b className="mono" style={{ color: mp.pct === 100 ? '#3ddc97' : g.color }}>{mp.pct}%</b>
                            </button>
                          );
                        })}
                      <button className="chip !text-[11px]" onClick={() => setEdit(blankGoal('month', { parentId: g.id, color: g.color }))}>
                        + {L('месячная цель', 'month goal')}
                      </button>
                    </div>
                  </div>
                </div>
              </Panel>
            );
          })}
          {!yearGoals.length && (
            <Panel>
              <Empty text={L('Раскрой домен: поставь первую цель года.', 'Expand your domain: set the first year goal.')} icon="domain" />
            </Panel>
          )}
        </div>
      </div>

      <Panel title={L('Обзор года по месяцам', 'Year by month')} kanji="暦">
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
          {Array.from({ length: 12 }, (_, i) => {
            const mk = `${year}-${String(i + 1).padStart(2, '0')}`;
            const mg = goals.filter((g) => g.level === 'month' && g.month === mk);
            const v = mg.length ? Math.round(mg.reduce((s, g) => s + monthGoalProgress(g.id, curses).pct, 0) / mg.length) : null;
            const cur = new Date().getFullYear() === year && new Date().getMonth() === i;
            return (
              <button key={mk} onClick={() => go(`/energy/maximum?month=${mk}`)} className={`p-3 text-left border ${cur ? 'border-cursed bg-cursed/10' : 'border-line/60 bg-void/40'} hover:border-cursed`}>
                <div className="h-display text-sm capitalize">{fmt(new Date(year, i, 1), 'LLLL')}</div>
                <div className="text-[11px] text-dim">
                  {mg.length} {L('целей', 'goals')}
                </div>
                <div className="mono text-lg mt-1" style={{ color: v === null ? '#5d5888' : v === 100 ? '#3ddc97' : '#ff4f8b' }}>
                  {v === null ? '—' : `${v}%`}
                </div>
                {v !== null && <Progress value={v} color={v === 100 ? '#3ddc97' : '#ff4f8b'} className="mt-1" />}
              </button>
            );
          })}
        </div>
      </Panel>

      {edit && <GoalEditor g={edit} years={years} onClose={() => setEdit(null)} />}
    </div>
  );
}

/** Манифест года: крупно, построчно из размытия (BlurText); редактируется на месте. */
function YearManifest({ year }: { year: number }) {
  const s = useSettings();
  const text = s.yearManifest?.[String(year)] || '';
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(text);
  return (
    <div className="py-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="label">{L('Манифест', 'Manifesto')} {year}</span>
        <IBtn icon="edit" size={14} className="ibtn-sm" title={L('Изменить манифест', 'Edit manifesto')} onClick={() => { setV(text); setEdit((e) => !e); }} />
      </div>
      {edit ? (
        <div className="space-y-2">
          <textarea className="inp min-h-[120px] text-[18px]" value={v} onChange={(e) => setV(e.target.value)} placeholder={L('Каким будет этот год? Каждая строка — отдельная.', 'What will this year be? One line each.')} />
          <Btn size="sm" onClick={() => { void patchSettings({ yearManifest: { ...(s.yearManifest || {}), [String(year)]: v.trim() } }); setEdit(false); }}>{L('Сохранить', 'Save')}</Btn>
        </div>
      ) : text ? (
        <BlurText key={text} as="div" by="lines" className="manifesto" text={text} />
      ) : (
        <button className="manifesto opacity-40 text-left" onClick={() => setEdit(true)}>{L('Напиши манифест года…', 'Write your manifesto for the year…')}</button>
      )}
    </div>
  );
}
