// Weekly Review — каждое воскресенье: итоги недели, что изгнано, что сгорело, цели на следующую.
import { addDays, addWeeks, subDays, subWeeks } from 'date-fns';
import { BigNumberStage } from '../components/BigNumberStage';
import { openEntity } from '../lib/entity';
import { useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { Monster } from '../components/Monster';
import { Seal } from '../components/Seal';
import { openCurse } from '../components/shared';
import { Btn, Field, IBtn, PageTitle, Panel, Stat } from '../components/ui';
import { db, type Review } from '../db/schema';
import { dayKey, endOfDayTs, fmt, weekdayIdx, weekKey, weekStart } from '../lib/dates';
import { toast } from '../lib/fx';
import { curseGrade } from '../lib/grade';
import { useAutosave, useLive } from '../lib/hooks';
import { setQuery, useRoute } from '../lib/router';
import { L, uid } from '../lib/runtime';
import { play } from '../lib/sound';
import { careScore, prCount, tonnage } from '../lib/stats';
import { award } from '../lib/xp';

function defaultWeekStart() {
  const now = new Date();
  // в понедельник по умолчанию показываем прошедшую неделю
  return weekStart(weekdayIdx(now) === 0 ? subDays(now, 1) : now);
}

export function WeeklyReview() {
  const { query } = useRoute();
  const wq = query.get('week');
  const start = useMemo(() => {
    if (wq) {
      const m = /^(\d{4})-W(\d{2})$/.exec(wq);
      if (m) {
        const jan4 = new Date(Number(m[1]), 0, 4);
        return addWeeks(weekStart(jan4), Number(m[2]) - 1);
      }
    }
    return defaultWeekStart();
  }, [wq]);
  const wk = weekKey(start);
  const from = start.getTime();
  const to = addDays(start, 7).getTime();
  const d = useLive(async () => {
    const [curses, workouts, routines, rlogs, meds, mlogs, practice, xp, vows, review, reviews, techs] = await Promise.all([
      db.curses.toArray(),
      db.workouts.toArray(),
      db.routines.toArray(),
      db.routineLogs.toArray(),
      db.meds.toArray(),
      db.medLogs.toArray(),
      db.practice.toArray(),
      db.xp.toArray(),
      db.vows.toArray(),
      db.reviews.get('W:' + wk),
      db.reviews.toArray(),
      db.techniques.toArray(),
    ]);
    return { curses, workouts, routines, rlogs, meds, mlogs, practice, xp, vows, review, reviews, techs };
  }, [wk]);
  if (!d) return null;
  const inW = (t?: number) => !!t && t >= from && t < to;
  const days = Array.from({ length: 7 }, (_, i) => dayKey(addDays(start, i)));
  const exorcised = d.curses.filter((c) => c.status === 'exorcised' && inW(c.completedAt));
  const burned = d.curses.filter((c) => c.status === 'active' && inW(c.due) && c.due < Date.now());
  const ws = d.workouts.filter((w) => days.includes(w.date));
  const care = days.filter((k) => k <= dayKey()).map((k) => careScore(k, d.routines, d.rlogs, d.meds, d.mlogs));
  const careTotal = care.reduce((s, c) => s + c.total, 0);
  const careDone = care.reduce((s, c) => s + c.done, 0);
  const practiceMin = d.practice.filter((p) => days.includes(p.date)).reduce((s, p) => s + p.minutes, 0);
  const xp = d.xp.filter((x) => inW(x.at)).reduce((s, x) => s + x.amount, 0);
  const broken = d.vows.filter((v) => v.history.some((h) => h.type === 'broken' && inW(h.at)));
  const fulfilled = d.vows.filter((v) => v.history.some((h) => h.type === 'fulfilled' && inW(h.at)));
  const nextWeekEnd = endOfDayTs(addDays(start, 13));
  const past = d.reviews.filter((r) => r.id.startsWith('W:') && r.done).sort((a, b) => b.id.localeCompare(a.id));
  const techOf = (id: string) => d.techs.find((t) => t.id === id);

  return (
    <div>
      <PageTitle
        title="Weekly Review"
        kanji="週報"
        sub={L('Каждое воскресенье — итоги недели, сгоревшие проклятия и цели на следующую.', 'Every Sunday — results, burned curses and goals for next week.')}
        right={
          <div className="flex items-center gap-1">
            <IBtn icon="left" onClick={() => setQuery('week', weekKey(subWeeks(start, 1)))} />
            <span className="h-display text-lg min-w-[13rem] text-center">
              {fmt(start, 'd MMM')} — {fmt(addDays(start, 6), 'd MMM')}
            </span>
            <IBtn icon="right" onClick={() => setQuery('week', weekKey(addWeeks(start, 1)))} />
          </div>
        }
      />
      <BigNumberStage
        left={String(exorcised.length).padStart(2, '0')}
        right={String(burned.length).padStart(2, '0')}
        mid={L('и', 'and')}
        items={exorcised.slice(0, 12).map((c) => ({ id: c.id, label: c.title, progress: 1, color: techOf(c.techniqueId)?.color, icon: <Monster grade={4} size={34} />, onClick: () => openEntity('curse', c.id, { order: exorcised.map((x) => x.id), title: c.title }) }))}
        caption={`${L('выполнено', 'done')} ${exorcised.length} · ${L('сгорело', 'burned')} ${burned.length}`}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-4">
        {[
          { l: L('Изгнано', 'Exorcised'), v: exorcised.length, c: '#3ddc97' },
          { l: L('Сгорело', 'Burned'), v: burned.length, c: burned.length ? '#ff2744' : undefined },
          { l: L('Тренировок', 'Workouts'), v: ws.length },
          { l: L('Тоннаж, кг', 'Volume, kg'), v: Math.round(ws.reduce((s, w) => s + tonnage(w), 0)) },
          { l: 'PR', v: ws.reduce((s, w) => s + prCount(w), 0), c: '#ff2744' },
          { l: L('Уход', 'Care'), v: `${careTotal ? Math.round((careDone / careTotal) * 100) : 0}%` },
          { l: L('Практика', 'Practice'), v: `${practiceMin}m` },
          { l: 'XP', v: xp, c: 'var(--accent-text)' },
        ].map((s) => (
          <Panel key={s.l} bodyClass="p-3">
            <Stat label={s.l} value={s.v} color={s.c} />
          </Panel>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <Panel title={`${L('Изгнано за неделю', 'Exorcised this week')} · ${exorcised.length}`} kanji="祓" accent="#3ddc97">
          {exorcised.map((c) => (
            <button key={c.id} className="w-full flex items-center gap-2 py-1.5 text-left hover:text-acc" onClick={() => openCurse(c.id)}>
              <Icon name="check" size={14} className="text-jade shrink-0" />
              <span className="text-sm truncate flex-1">{c.title}</span>
              <span className="text-[11px] text-dim">{techOf(c.techniqueId)?.name}</span>
            </button>
          ))}
          {!exorcised.length && <div className="text-sm text-muted">{L('Ничего не изгнано', 'Nothing exorcised')}</div>}
        </Panel>
        <Panel title={`${L('Сгорело', 'Burned')} · ${burned.length}`} kanji="焼" hot={burned.length > 0}>
          {burned.map((c) => {
            const g = curseGrade(c.due, c.importance);
            return (
              <button key={c.id} className="w-full flex items-center gap-2 py-1.5 text-left hover:text-acc" onClick={() => openCurse(c.id)}>
                <Monster grade={g.grade} overdue size={28} />
                <span className="text-sm truncate flex-1">{c.title}</span>
                <span className="text-[11px] mono text-[#ff4d63]">{fmt(c.due, 'EEE d')}</span>
              </button>
            );
          })}
          {!burned.length && <div className="text-sm text-muted">{L('Ни одно проклятие не сгорело. Чисто.', 'No curse burned. Clean.')}</div>}
          {(broken.length > 0 || fulfilled.length > 0) && (
            <div className="mt-3 pt-2 border-t border-line/50 text-[13px] space-y-1">
              {fulfilled.map((v) => (
                <div key={v.id} className="text-jade">
                  ✓ {L('Обет исполнен', 'Vow kept')}: {v.sacrifice}
                </div>
              ))}
              {broken.map((v) => (
                <div key={v.id} className="text-[#ff4d63]">
                  ✗ {L('Обет нарушен', 'Vow broken')}: {v.sacrifice}
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <ReviewForm key={wk} wk={wk} initial={d.review} nextWeekEnd={nextWeekEnd} />

      {past.length > 0 && (
        <Panel title={L('Прошлые ревью', 'Past reviews')} kanji="録" className="mt-4">
          <div className="flex flex-wrap gap-2">
            {past.map((r) => (
              <button key={r.id} className={`chip ${r.id === 'W:' + wk ? 'chip-on' : ''}`} onClick={() => setQuery('week', r.id.slice(2))}>
                <Icon name="check" size={11} /> {r.id.slice(2)}
              </button>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

function ReviewForm({ wk, initial, nextWeekEnd }: { wk: string; initial?: Review; nextWeekEnd: number }) {
  const [r, setR] = useState<Review>(() => initial || { id: 'W:' + wk, wins: '', fails: '', next: [], done: false, at: Date.now() });
  const [item, setItem] = useState('');
  useAutosave(r, (v) => db.reviews.put({ ...v, at: Date.now() }), 500);
  const set = (p: Partial<Review>) => setR((x) => ({ ...x, ...p }));
  return (
    <Panel title={L('Рефлексия', 'Reflection')} kanji="省" className="mt-4" accent={r.done ? '#3ddc97' : undefined}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label={L('Что получилось', 'What went well')}>
          <textarea className="inp" rows={4} value={r.wins} onChange={(e) => set({ wins: e.target.value })} />
        </Field>
        <Field label={L('Что не получилось / почему сгорело', 'What failed / why it burned')}>
          <textarea className="inp" rows={4} value={r.fails} onChange={(e) => set({ fails: e.target.value })} />
        </Field>
      </div>
      <div className="label mt-4 mb-2">{L('Цели на следующую неделю', 'Goals for next week')}</div>
      <div className="space-y-1.5">
        {r.next.map((n) => (
          <div key={n.id} className="flex items-center gap-2">
            <Icon name="target" size={14} className="text-acc shrink-0" />
            <input className="inp !py-1" value={n.text} onChange={(e) => set({ next: r.next.map((x) => (x.id === n.id ? { ...x, text: e.target.value } : x)) })} />
            {n.curseId ? (
              <button className="chip !text-[11px]" onClick={() => openCurse(n.curseId!)}>
                <Icon name="skull" size={11} /> Curse
              </button>
            ) : (
              <button
                className="chip !text-[11px] whitespace-nowrap"
                onClick={async () => {
                  const id = uid();
                  await db.curses.put({ id, title: n.text, due: nextWeekEnd, techniqueId: 't-pers', importance: 3, subtasks: [], notes: L('Из Weekly Review ', 'From Weekly Review ') + wk, attachments: [], links: [], status: 'active', createdAt: Date.now() });
                  set({ next: r.next.map((x) => (x.id === n.id ? { ...x, curseId: id } : x)) });
                  toast(L('Цель превращена в Curse', 'Goal turned into a Curse'));
                }}
              >
                → Curse
              </button>
            )}
            <IBtn icon="x" className="ibtn-sm" onClick={() => set({ next: r.next.filter((x) => x.id !== n.id) })} />
          </div>
        ))}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!item.trim()) return;
            set({ next: [...r.next, { id: uid(), text: item.trim() }] });
            setItem('');
          }}
        >
          <input className="inp !py-1" value={item} onChange={(e) => setItem(e.target.value)} placeholder={L('+ цель на неделю', '+ goal for the week')} />
          <Btn type="submit" size="sm" variant="ghost" icon="plus" />
        </form>
      </div>
      <div className="flex flex-wrap items-center gap-3 mt-5">
        {r.done ? (
          <>
            <Seal text="完" size={44} color="#3ddc97" spin={false} />
            <span className="text-sm text-jade">{L('Ревью завершено', 'Review completed')}</span>
            <Btn size="sm" variant="ghost" onClick={() => set({ done: false })}>
              {L('Открыть снова', 'Reopen')}
            </Btn>
          </>
        ) : (
          <Btn
            variant="flash"
            icon="check"
            onClick={async () => {
              set({ done: true });
              play('rank');
              await award(`review:${wk}`, 40, 'Weekly Review ' + wk, 'review');
            }}
          >
            {L('Завершить ревью', 'Complete review')} · +40 XP
          </Btn>
        )}
        <span className="text-[11px] text-dim ml-auto">{L('Сохраняется автоматически', 'Autosaved')}</span>
      </div>
    </Panel>
  );
}
