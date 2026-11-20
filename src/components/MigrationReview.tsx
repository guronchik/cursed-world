// Одноразовое окно после обновления до v3: Curses, которые раньше создавались автоматически из заданий и ICS.
// Для каждого — «оставить как Curse» или «убрать из Curses» (задание остаётся). Без подтверждения ничего не удаляется.
import { useState } from 'react';
import { db } from '../db/schema';
import { REVIEW_KEY } from '../db/migrate3';
import { fmt } from '../lib/dates';
import { confirmBox, toast } from '../lib/fx';
import { useLive } from '../lib/hooks';
import { setAssignmentCurse } from '../lib/linked';
import { L } from '../lib/runtime';
import { Btn, Modal } from './ui';

export function MigrationReview() {
  const rec = useLive(async () => {
    const kv = await db.kv.get(REVIEW_KEY);
    const v = kv?.value as { ids: string[]; done: boolean } | undefined;
    if (!v || v.done) return null;
    const curses = (await db.curses.bulkGet(v.ids)).filter((c): c is NonNullable<typeof c> => !!c && c.link?.kind === 'assignment');
    const subjects = await db.subjects.toArray();
    return { ids: v.ids, curses, subjects };
  }, []);
  const [remove, setRemove] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  if (!rec) return null;
  const finish = () => db.kv.put({ key: REVIEW_KEY, value: { ids: rec.ids, done: true } });
  if (!rec.curses.length) {
    void finish();
    return null;
  }
  const toggle = (id: string) =>
    setRemove((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const apply = async () => {
    if (remove.size) {
      const ok = await confirmBox(L(`Убрать из Curses: ${remove.size}? Задания останутся в Cursed Tools → Assignments.`, `Remove ${remove.size} from Curses? The assignments stay in Cursed Tools → Assignments.`), { okLabel: L('Убрать', 'Remove') });
      if (!ok) return;
    }
    setBusy(true);
    for (const c of rec.curses) if (remove.has(c.id) && c.link) await setAssignmentCurse(c.link.id, false);
    await finish();
    setBusy(false);
    toast(remove.size ? L(`Убрано из Curses: ${remove.size}`, `Removed from Curses: ${remove.size}`) : L('Все оставлены как Curses', 'All kept as Curses'));
  };
  return (
    <Modal
      open
      onClose={() => void finish()}
      title={L('Обновление v3: задания и Curses', 'Update v3: assignments and Curses')}
      kanji="整"
      wide
      footer={
        <>
          <Btn variant="ghost" size="sm" className="mr-auto" onClick={() => setRemove(remove.size === rec.curses.length ? new Set() : new Set(rec.curses.map((c) => c.id)))}>
            {remove.size === rec.curses.length ? L('Оставить все', 'Keep all') : L('Убрать все', 'Remove all')}
          </Btn>
          <Btn size="sm" icon="check" disabled={busy} onClick={apply}>
            {L('Применить', 'Apply')}
          </Btn>
        </>
      }
    >
      <p className="text-[14px] text-muted mb-3">
        {L(
          'Теперь задания — отдельный список в Cursed Tools → Assignments, а в Curses попадает только то, что ты включил сам. Эти Curses раньше создавались автоматически. Выбери, что оставить. Задания при этом не удаляются.',
          'Assignments are now a separate list in Cursed Tools → Assignments; Curses contain only what you turn on yourself. These Curses used to be created automatically. Choose what to keep — the assignments themselves stay.',
        )}
      </p>
      <div className="space-y-1">
        {rec.curses.map((c) => {
          const keep = !remove.has(c.id);
          const s = rec.subjects.find((x) => x.id === c.subjectId);
          return (
            <button key={c.id} onClick={() => toggle(c.id)} className="w-full flex items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-panel-2 min-h-[48px]" role="checkbox" aria-checked={keep}>
              <span className={`chk shrink-0 ${keep ? "chk-on" : ""}`} />
              <span className="min-w-0 flex-1">
                <span className={`block text-[14px] truncate ${keep ? '' : 'line-through text-dim'}`}>{c.title}</span>
                <span className="block text-[12px] text-dim truncate">
                  {[s?.name, c.extSource, fmt(c.due, 'd MMM HH:mm'), c.status === 'exorcised' ? L('изгнан', 'exorcised') : ''].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className="text-[12px] shrink-0" style={{ color: keep ? '#30d158' : '#ff9f0a' }}>
                {keep ? L('оставить как Curse', 'keep as Curse') : L('убрать из Curses', 'remove from Curses')}
              </span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
