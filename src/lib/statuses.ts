// Колонки статусов (v4). ColumnStore — общий интерфейс для управления колонками,
// чтобы тот же компонент можно было потом включить для University и Piano Technique.
import { db, defaultVideoStatuses, type VideoStatus } from '../db/schema';
import { confirmBox, toast, toastUndo } from './fx';
import { useLive } from './hooks';
import { L, rt, uid } from './runtime';
import { sortCols } from './videoMeta';
import { deleteVideo, saveVideo } from './videos';

export type Column = VideoStatus;

export interface ColumnStore {
  /** Название набора для подписей («видео», «задач»). */
  noun: (n: number) => string;
  list(): Promise<Column[]>;
  put(c: Column): Promise<void>;
  remove(id: string): Promise<void>;
  bulkPut(cols: Column[]): Promise<void>;
  countItems(): Promise<Record<string, number>>;
  moveItems(fromId: string, toId: string): Promise<void>;
  deleteItems(colId: string): Promise<void>;
  /** Сброс к стандартным колонкам: элементы переносятся по совпадению названий, остальные — в первую. */
  reset(): Promise<void>;
  defaults(): Column[];
}

export const videoColumnStore: ColumnStore = {
  noun: (n) => (rt.lang === 'ru' ? (n % 10 === 1 && n % 100 !== 11 ? 'видео' : 'видео') : n === 1 ? 'video' : 'videos'),
  list: async () => sortCols(await db.videoStatuses.toArray()),
  put: async (c) => {
    await db.videoStatuses.put(c);
  },
  remove: (id) => db.videoStatuses.delete(id),
  bulkPut: async (cols) => {
    await db.videoStatuses.bulkPut(cols);
  },
  countItems: async () => {
    const m: Record<string, number> = {};
    for (const v of await db.videos.toArray()) m[v.statusId] = (m[v.statusId] || 0) + 1;
    return m;
  },
  moveItems: async (fromId, toId) => {
    for (const v of await db.videos.toArray()) if (v.statusId === fromId) await saveVideo({ ...v, statusId: toId });
  },
  deleteItems: async (colId) => {
    for (const v of await db.videos.toArray()) if (v.statusId === colId) await deleteVideo(v.id);
  },
  defaults: () => defaultVideoStatuses(rt.lang),
  reset: async () => {
    const old = await videoColumnStore.list();
    const defs = defaultVideoStatuses(rt.lang);
    const norm = (s: string) => s.trim().toLowerCase();
    const byName = new Map<string, string>();
    for (const d of defs) {
      byName.set(norm(d.name), d.id);
      byName.set(d.key!, d.id);
    }
    const target = (c?: Column) => (c ? byName.get(norm(c.name)) || (c.key && byName.get(c.key)) || defs[0].id : defs[0].id);
    const oldMap = new Map(old.map((c) => [c.id, c]));
    await db.videoStatuses.bulkPut(defs);
    for (const c of old) if (!defs.some((d) => d.id === c.id)) await db.videoStatuses.delete(c.id);
    for (const v of await db.videos.toArray()) {
      const to = target(oldMap.get(v.statusId));
      if (to !== v.statusId) await saveVideo({ ...v, statusId: to });
    }
  },
};

export function useColumns(store: ColumnStore = videoColumnStore, deps: unknown[] = []) {
  return useLive(() => store.list(), deps);
}
export const useVideoStatuses = () => useLive(() => videoColumnStore.list(), []);

// ───── операции над колонками (общие для доски и окна Manage columns) ─────

export async function addColumn(store: ColumnStore, afterId?: string, name = L('Новая колонка', 'New column')) {
  const list = await store.list();
  const i = afterId ? list.findIndex((c) => c.id === afterId) : list.length - 1;
  const col: Column = { id: uid(), name, color: '#8e8e93', order: 0, isDone: false, createdAt: Date.now() };
  list.splice(i + 1, 0, col);
  await store.bulkPut(list.map((c, k) => ({ ...c, order: k })));
  return col;
}

export async function patchColumn(store: ColumnStore, id: string, p: Partial<Column>) {
  const c = (await store.list()).find((x) => x.id === id);
  if (!c) return;
  if (p.name !== undefined && !p.name.trim()) return; // пустое название не сохраняем
  const next = { ...c, ...p, name: p.name !== undefined ? p.name.trim() : c.name };
  await store.put(next);
  // Done изменился — видео в колонке пересчитывают «опубликовано», Curse и XP
  if (p.isDone !== undefined && p.isDone !== c.isDone) for (const v of await db.videos.toArray()) if (v.statusId === id) await saveVideo({ ...v }, c);
}

export async function reorderColumns(store: ColumnStore, ids: string[]) {
  const list = await store.list();
  const map = new Map(list.map((c) => [c.id, c]));
  await store.bulkPut(ids.filter((id) => map.has(id)).map((id, k) => ({ ...map.get(id)!, order: k })));
}

export async function moveColumn(store: ColumnStore, id: string, dir: -1 | 1) {
  const ids = (await store.list()).map((c) => c.id);
  const i = ids.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  await reorderColumns(store, ids);
}

/**
 * Удаление колонки. Пустая — сразу, с Undo на 8 секунд. С элементами — спрашиваем, куда перенести
 * (по умолчанию соседняя слева) или «удалить вместе с ними» с подтверждением. Последнюю колонку удалить нельзя.
 * ask — показывает выбор колонки (окно на стороне интерфейса), возвращает id, 'delete' или null.
 */
export async function deleteColumn(store: ColumnStore, id: string, ask: (col: Column, n: number, others: Column[], def: string) => Promise<string | 'delete' | null>) {
  const list = await store.list();
  const col = list.find((c) => c.id === id);
  if (!col) return;
  if (list.length <= 1) {
    toast(L('Последнюю колонку удалить нельзя', 'The last column can’t be deleted'), 'warn');
    return;
  }
  const others = list.filter((c) => c.id !== id);
  // единственная Done-колонка: предложить назначить Done другую
  if (col.isDone && !others.some((c) => c.isDone)) {
    const pick = await ask(col, -1, others, others[others.length - 1].id);
    if (pick === null) return;
    if (pick !== 'delete') await patchColumn(store, pick, { isDone: true });
  }
  const n = (await store.countItems())[id] || 0;
  if (n > 0) {
    const i = list.findIndex((c) => c.id === id);
    const def = (list[i - 1] || list[i + 1]).id;
    const choice = await ask(col, n, others, def);
    if (choice === null) return;
    if (choice === 'delete') {
      if (!(await confirmBox(L(`Удалить колонку «${col.name}» вместе с ${n} ${store.noun(n)}? Это нельзя отменить.`, `Delete “${col.name}” with ${n} ${store.noun(n)}? This can’t be undone.`), { danger: true, okLabel: L('Удалить', 'Delete') }))) return;
      await store.deleteItems(id);
    } else await store.moveItems(id, choice);
    await store.remove(id);
    await reorderColumns(store, others.map((c) => c.id));
    toast(L(`Колонка «${col.name}» удалена`, `Column “${col.name}” deleted`));
    return;
  }
  await store.remove(id);
  await reorderColumns(store, others.map((c) => c.id));
  toastUndo(L(`Колонка «${col.name}» удалена`, `Column “${col.name}” deleted`), async () => {
    const now = await store.list();
    const ids = now.map((c) => c.id);
    ids.splice(Math.min(col.order, ids.length), 0, col.id);
    await store.put(col);
    await reorderColumns(store, ids);
  });
}

export async function resetColumns(store: ColumnStore) {
  if (!(await confirmBox(L('Вернуть шесть стандартных колонок? Видео перейдут в колонки с тем же названием, остальные — в первую.', 'Restore the six default columns? Items move to columns with the same name, the rest go to the first one.'), { okLabel: L('Сбросить', 'Reset') }))) return;
  await store.reset();
  toast(L('Колонки сброшены', 'Columns reset'));
}
