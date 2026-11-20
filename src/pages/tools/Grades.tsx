// Оценки и результаты: таблица, средние по предметам, график среднего по семестрам.
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { axis, grid, tooltip } from '../../components/charts';
import { Btn, Empty, Field, Modal, Panel, Stat } from '../../components/ui';
import { db, type GradeResult } from '../../db/schema';
import { dayKey, fmt, fromKey } from '../../lib/dates';
import { confirmBox } from '../../lib/fx';
import { useLive } from '../../lib/hooks';
import { L, round1, uid } from '../../lib/runtime';

const pct = (r: GradeResult) => (r.max ? (r.score / r.max) * 100 : 0);

export function Grades() {
  const results = useLive(() => db.results.toArray(), []) || [];
  const subjects = useLive(() => db.subjects.toArray(), []) || [];
  const [sem, setSem] = useState<number | 'all'>('all');
  const [edit, setEdit] = useState<GradeResult | null>(null);
  const sems = Array.from(new Set(results.map((r) => r.semester))).sort((a, b) => a - b);
  const shown = results.filter((r) => sem === 'all' || r.semester === sem).sort((a, b) => b.semester - a.semester || b.date.localeCompare(a.date));
  const avg = (rs: GradeResult[]) => (rs.length ? rs.reduce((s, r) => s + pct(r), 0) / rs.length : 0);
  const bySem = sems.map((s) => {
    const rs = results.filter((r) => r.semester === s);
    const a = avg(rs);
    return { name: `${L('Сем.', 'Sem')} ${s}`, pct: round1(a), gpa: round1((a / 100) * 5) };
  });
  const bySubj = subjects
    .map((s) => {
      const rs = shown.filter((r) => r.subjectId === s.id);
      return { name: s.name, color: s.color, pct: round1(avg(rs)), n: rs.length };
    })
    .filter((x) => x.n);
  const total = avg(shown);
  const subj = (id: string) => subjects.find((s) => s.id === id);
  const lastSem = sems[sems.length - 1] ?? 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <button className={`chip ${sem === 'all' ? 'chip-on' : ''}`} onClick={() => setSem('all')}>
          {L('Все семестры', 'All semesters')}
        </button>
        {sems.map((s) => (
          <button key={s} className={`chip ${sem === s ? 'chip-on' : ''}`} onClick={() => setSem(s)}>
            {L('Семестр', 'Semester')} {s}
          </button>
        ))}
        <Btn className="ml-auto" icon="plus" disabled={!subjects.length} onClick={() => setEdit({ id: uid(), subjectId: subjects[0]?.id || '', semester: sem === 'all' ? lastSem : sem, label: L('Экзамен', 'Exam'), score: 5, max: 5, date: dayKey() })}>
          {L('Результат', 'Result')}
        </Btn>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Panel bodyClass="p-3">
          <Stat label={L('Средний %', 'Average %')} value={`${round1(total)}%`} color="var(--accent-text)" />
        </Panel>
        <Panel bodyClass="p-3">
          <Stat label={L('Средний балл (из 5)', 'GPA (of 5)')} value={round1((total / 100) * 5)} color="#3ddc97" />
        </Panel>
        <Panel bodyClass="p-3">
          <Stat label={L('Результатов', 'Results')} value={shown.length} />
        </Panel>
        <Panel bodyClass="p-3">
          <Stat label={L('Лучший предмет', 'Best subject')} value={<span className="text-base block truncate">{bySubj.slice().sort((a, b) => b.pct - a.pct)[0]?.name || '—'}</span>} />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={L('Средний балл по семестрам', 'Average by semester')} kanji="績">
          {bySem.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={bySem} margin={{ top: 10, right: 10, left: -18, bottom: 0 }}>
                <CartesianGrid {...grid} />
                <XAxis dataKey="name" {...axis} />
                <YAxis yAxisId="l" domain={[0, 5]} {...axis} />
                <Tooltip {...tooltip} />
                <Line yAxisId="l" type="monotone" dataKey="gpa" name={L('Балл (из 5)', 'GPA')} stroke="var(--accent-1)" strokeWidth={3} dot={{ r: 4, fill: 'var(--accent-1)' }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <Empty text={L('Добавь результаты — появится график', 'Add results to see the chart')} />
          )}
        </Panel>
        <Panel title={L('По предметам', 'By subject')} kanji="科">
          {bySubj.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={bySubj} margin={{ top: 10, right: 10, left: -18, bottom: 0 }}>
                <CartesianGrid {...grid} />
                <XAxis dataKey="name" {...axis} tickFormatter={(v: string) => (v.length > 10 ? v.slice(0, 9) + '…' : v)} />
                <YAxis domain={[0, 100]} {...axis} />
                <Tooltip {...tooltip} />
                <Bar dataKey="pct" name="%" fill="var(--accent-2)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Empty text={L('Пока пусто', 'Empty for now')} />
          )}
        </Panel>
      </div>

      <Panel title={L('Таблица результатов', 'Results table')} bodyClass="p-2 sm:p-3 scroll-x">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="text-left">
              {[L('Предмет', 'Subject'), L('Работа', 'Work'), L('Балл', 'Score'), '%', L('Сем.', 'Sem'), L('Дата', 'Date')].map((h) => (
                <th key={h} className="label font-normal py-2 px-2">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const s = subj(r.subjectId);
              const p = pct(r);
              return (
                <tr key={r.id} className="border-t border-line/40 hover:bg-cursed/5 cursor-pointer" onClick={() => setEdit(r)}>
                  <td className="py-2 px-2">
                    <span className="inline-block w-2 h-2 rotate-45 mr-2" style={{ background: s?.color }} />
                    {s?.name || '—'}
                  </td>
                  <td className="px-2 text-muted">{r.label}</td>
                  <td className="px-2 mono">
                    {r.score}/{r.max}
                  </td>
                  <td className="px-2 mono" style={{ color: p >= 85 ? '#3ddc97' : p >= 65 ? '#f2c14e' : '#ff4d63' }}>
                    {Math.round(p)}%
                  </td>
                  <td className="px-2 mono">{r.semester}</td>
                  <td className="px-2 text-dim mono">{fmt(fromKey(r.date), 'dd.MM.yy')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!shown.length && <Empty text={L('Результатов нет', 'No results')} />}
      </Panel>

      {edit && <ResultEditor r={edit} subjects={subjects} onClose={() => setEdit(null)} />}
    </div>
  );
}

function ResultEditor({ r: init, subjects, onClose }: { r: GradeResult; subjects: { id: string; name: string }[]; onClose: () => void }) {
  const [r, setR] = useState(init);
  const exists = useLive(() => db.results.get(init.id), [init.id]);
  const set = (p: Partial<GradeResult>) => setR((x) => ({ ...x, ...p }));
  return (
    <Modal
      open
      onClose={onClose}
      title={L('Результат', 'Result')}
      kanji="績"
      footer={
        <>
          {exists && (
            <Btn
              size="sm"
              variant="danger"
              icon="trash"
              className="mr-auto"
              onClick={async () => {
                if (await confirmBox(L('Удалить результат?', 'Delete result?'), { danger: true })) {
                  await db.results.delete(r.id);
                  onClose();
                }
              }}
            >
              {L('Удалить', 'Delete')}
            </Btn>
          )}
          <Btn
            size="sm"
            icon="check"
            disabled={!r.subjectId || !(r.max > 0)}
            onClick={async () => {
              await db.results.put(r);
              onClose();
            }}
          >
            {L('Сохранить', 'Save')}
          </Btn>
        </>
      }
    >
      <div className="grid gap-3 grid-cols-2">
        <Field label={L('Предмет', 'Subject')} className="col-span-2">
          <select className="inp" value={r.subjectId} onChange={(e) => set({ subjectId: e.target.value })}>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={L('Работа', 'Work')} className="col-span-2">
          <input className="inp" value={r.label} onChange={(e) => set({ label: e.target.value })} placeholder={L('Экзамен, контрольная, лаба…', 'Exam, test, lab…')} />
        </Field>
        <Field label={L('Балл', 'Score')}>
          <input type="number" step="any" className="inp" value={r.score} onChange={(e) => set({ score: Number(e.target.value) })} />
        </Field>
        <Field label={L('Из (максимум)', 'Out of')}>
          <input type="number" step="any" className="inp" value={r.max} onChange={(e) => set({ max: Number(e.target.value) })} />
        </Field>
        <Field label={L('Семестр', 'Semester')}>
          <input type="number" min={1} className="inp" value={r.semester} onChange={(e) => set({ semester: Math.max(1, Number(e.target.value)) })} />
        </Field>
        <Field label={L('Дата', 'Date')}>
          <input type="date" className="inp" value={r.date} onChange={(e) => e.target.value && set({ date: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}
