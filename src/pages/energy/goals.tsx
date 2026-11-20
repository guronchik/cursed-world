// Общие элементы целей: редактор цели (год/месяц) и привязка задач.
import { useState } from 'react';
import { Btn, ColorPick, Field, Modal, Toggle } from '../../components/ui';
import { db, type Curse, type Goal } from '../../db/schema';
import { fmt, fromKey } from '../../lib/dates';
import { confirmBox } from '../../lib/fx';
import { L, uid } from '../../lib/runtime';

export function blankGoal(level: 'year' | 'month', p: Partial<Goal> = {}): Goal {
  const now = new Date();
  const month = p.month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return { id: uid(), level, title: '', description: '', year: Number((p.month || month).slice(0, 4)), month: level === 'month' ? month : undefined, color: level === 'year' ? '#ff2744' : '#ff4f8b', createdAt: Date.now(), ...p };
}

export function GoalEditor({ g: init, years, onClose }: { g: Goal; years: Goal[]; onClose: () => void }) {
  const [g, setG] = useState(init);
  const [exists] = useState(() => years.some((y) => y.id === init.id) || init.title !== '');
  const set = (p: Partial<Goal>) => setG((x) => ({ ...x, ...p }));
  const [y, m] = (g.month || '2026-01').split('-').map(Number);
  const months = Array.from({ length: 12 }, (_, i) => fmt(new Date(2024, i, 1), 'LLLL'));
  return (
    <Modal
      open
      onClose={onClose}
      kanji={g.level === 'year' ? '領域' : '極'}
      title={g.level === 'year' ? 'Domain Expansion' : 'Maximum Technique'}
      footer={
        <>
          {exists && (
            <Btn
              size="sm"
              variant="danger"
              icon="trash"
              className="mr-auto"
              onClick={async () => {
                if (!(await confirmBox(L('Удалить цель? Связанные задачи и месячные цели останутся, но потеряют связь.', 'Delete goal? Linked tasks and month goals stay, but unlinked.'), { danger: true }))) return;
                const cs = await db.curses.where('goalId').equals(g.id).toArray();
                await db.curses.bulkPut(cs.map((c) => ({ ...c, goalId: undefined })));
                const kids = await db.goals.where('parentId').equals(g.id).toArray();
                await db.goals.bulkPut(kids.map((k) => ({ ...k, parentId: undefined })));
                await db.goals.delete(g.id);
                onClose();
              }}
            >
              {L('Удалить', 'Delete')}
            </Btn>
          )}
          <Btn
            size="sm"
            icon="check"
            disabled={!g.title.trim()}
            onClick={async () => {
              await db.goals.put({ ...g, title: g.title.trim(), year: g.level === 'month' && g.month ? Number(g.month.slice(0, 4)) : g.year });
              onClose();
            }}
          >
            {L('Сохранить', 'Save')}
          </Btn>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={L('Цель', 'Goal')} className="sm:col-span-2">
          <input className="inp text-base" autoFocus={!exists} value={g.title} onChange={(e) => set({ title: e.target.value })} placeholder={g.level === 'year' ? L('Что изменится к концу года?', 'What changes by year end?') : L('Результат месяца', 'Result of the month')} />
        </Field>
        <Field label={L('Описание', 'Description')} className="sm:col-span-2">
          <textarea className="inp" rows={2} value={g.description} onChange={(e) => set({ description: e.target.value })} />
        </Field>
        {g.level === 'year' ? (
          <Field label={L('Год', 'Year')}>
            <input type="number" className="inp mono" value={g.year} onChange={(e) => set({ year: Number(e.target.value) || g.year })} />
          </Field>
        ) : (
          <>
            <Field label={L('Месяц', 'Month')}>
              <div className="flex gap-2">
                <select className="inp capitalize" value={m} onChange={(e) => set({ month: `${y}-${String(e.target.value).padStart(2, '0')}` })}>
                  {months.map((n, i) => (
                    <option key={i} value={i + 1}>
                      {n}
                    </option>
                  ))}
                </select>
                <input type="number" className="inp mono !w-24" value={y} onChange={(e) => set({ month: `${Number(e.target.value) || y}-${String(m).padStart(2, '0')}` })} />
              </div>
            </Field>
            <Field label="Domain Expansion" hint={L('Годовая цель, к которой ведёт этот месяц', 'The yearly goal this month leads to')}>
              <select className="inp" value={g.parentId || ''} onChange={(e) => set({ parentId: e.target.value || undefined })}>
                <option value="">—</option>
                {years.map((yg) => (
                  <option key={yg.id} value={yg.id}>
                    {yg.year} · {yg.title}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}
        <Field label={L('Цвет', 'Color')} className="sm:col-span-2">
          <ColorPick value={g.color} onChange={(color) => set({ color })} />
        </Field>
        {g.level === 'month' && (
          <div className="sm:col-span-2">
            <Toggle on={!!g.huge} onChange={(huge) => set({ huge })} label={L('Огромная цель — сразу Special Grade', 'Huge goal — Special Grade right away')} />
          </div>
        )}
      </div>
    </Modal>
  );
}

export function LinkTasks({ goal, curses, onClose }: { goal: Goal; curses: Curse[]; onClose: () => void }) {
  const [sel, setSel] = useState<Set<string>>(() => new Set(curses.filter((c) => c.goalId === goal.id).map((c) => c.id)));
  const pool = curses.filter((c) => c.goalId === goal.id || (!c.goalId && c.status === 'active')).sort((a, b) => a.due - b.due);
  return (
    <Modal
      open
      onClose={onClose}
      title={`${L('Задачи для', 'Tasks for')}: ${goal.title}`}
      kanji="繋"
      footer={
        <Btn
          size="sm"
          icon="check"
          onClick={async () => {
            const changed = pool.filter((c) => sel.has(c.id) !== (c.goalId === goal.id));
            await db.curses.bulkPut(changed.map((c) => ({ ...c, goalId: sel.has(c.id) ? goal.id : undefined })));
            onClose();
          }}
        >
          {L('Сохранить', 'Save')}
        </Btn>
      }
    >
      <div className="space-y-1">
        {pool.map((c) => (
          <label key={c.id} className="flex items-center gap-3 py-1.5 cursor-pointer">
            <input
              type="checkbox"
              className="chk"
              checked={sel.has(c.id)}
              onChange={() =>
                setSel((s) => {
                  const n = new Set(s);
                  if (n.has(c.id)) n.delete(c.id);
                  else n.add(c.id);
                  return n;
                })
              }
            />
            <span className={`text-sm flex-1 ${c.status === 'exorcised' ? 'line-through text-muted' : ''}`}>{c.title}</span>
            <span className="mono text-[11px] text-dim">{fmt(c.due, 'd MMM')}</span>
          </label>
        ))}
        {!pool.length && <div className="text-sm text-muted">{L('Нет свободных активных задач', 'No free active tasks')}</div>}
      </div>
    </Modal>
  );
}

export const monthTitle = (mk: string) => fmt(fromKey(mk + '-01'), 'LLLL yyyy');
