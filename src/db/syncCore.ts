// Учёт изменений для синхронизации: прослойка Dexie (DBCore middleware) ставит каждой записи отметку времени,
// а удалению — «надгробие». По этим отметкам две копии базы (ПК и телефон) сливаются по записям.
// Данные самих записей не меняются: отметки лежат в отдельной таблице syncMeta.
import type { DBCore, DBCoreMutateRequest, DBCoreMutateResponse, DBCoreTable, DBCoreTransaction, Middleware } from 'dexie';

export const META_TABLE = 'syncMeta';

export interface SyncMeta {
  id: string; // `${table}|${key}`
  t: string;
  k: string;
  u: number; // время последнего изменения (мс)
  d?: 1; // удалено
}

export const metaId = (t: string, k: unknown) => `${t}|${String(k)}`;

const listeners = new Set<() => void>();
/** Подписка на локальные изменения (для автосинхронизации). Удалённые изменения сюда не попадают. */
export function onLocalChange(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
let applyingRemote = 0;
/** Пока применяются изменения из облака, они не считаются «моими» и не запускают новую отправку. */
export async function asRemote<T>(fn: () => Promise<T>) {
  applyingRemote++;
  try {
    return await fn();
  } finally {
    applyingRemote--;
  }
}
const notify = () => {
  if (applyingRemote) return;
  for (const f of listeners) {
    try {
      f();
    } catch (e) {
      console.error('[sync] listener', e);
    }
  }
};

const hasMeta = (trans: DBCoreTransaction) => {
  const t = trans as unknown as IDBTransaction;
  return !!t.objectStoreNames?.contains?.(META_TABLE) && t.mode !== 'versionchange';
};

export function syncMiddleware(tracked: readonly string[]): Middleware<DBCore> {
  const tset = new Set(tracked);
  return {
    stack: 'dbcore',
    name: 'CursedSync',
    level: 1,
    create: (down: DBCore) => ({
      ...down,
      // в каждую запись в отслеживаемые таблицы добавляем таблицу отметок, чтобы писать их в той же транзакции
      transaction(tables, mode, opts) {
        const names = [...tables];
        const needs = mode === 'readwrite' && names.some((n) => tset.has(n)) && !names.includes(META_TABLE) && down.schema.tables.some((t) => t.name === META_TABLE);
        return down.transaction(needs ? [...names, META_TABLE] : names, mode, opts);
      },
      table(name: string): DBCoreTable {
        const table = down.table(name);
        if (!tset.has(name)) return table;
        const pk = table.schema.primaryKey;
        const stamp = async (trans: DBCoreTransaction, keys: unknown[], deleted: boolean) => {
          if (!keys.length) return;
          const u = Date.now();
          await down.table(META_TABLE).mutate({
            type: 'put',
            trans,
            values: keys.map((k) => ({ id: metaId(name, k), t: name, k: String(k), u, ...(deleted ? { d: 1 } : {}) })),
          });
        };
        return {
          ...table,
          async mutate(req: DBCoreMutateRequest): Promise<DBCoreMutateResponse> {
            if (!hasMeta(req.trans)) return table.mutate(req);
            if (req.type === 'deleteRange') {
              const found = await table.query({ trans: req.trans, values: false, query: { index: pk, range: req.range } });
              const res = await table.mutate(req);
              await stamp(req.trans, found.result as unknown[], true);
              notify();
              return res;
            }
            const keys: unknown[] = req.type === 'delete' ? req.keys : req.keys || (pk.extractKey ? req.values.map((v) => pk.extractKey!(v)) : []);
            const res = await table.mutate(req);
            const ok = keys.filter((_, i) => !res.failures?.[i]);
            await stamp(req.trans, req.type === 'delete' ? ok : ok.length ? ok : (res.results as unknown[]) || [], req.type === 'delete');
            notify();
            return res;
          },
        };
      },
    }),
  };
}
