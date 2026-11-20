// Страницы сущностей (B5): Curse, задание, упражнение открываются полноэкранной страницей (?page=kind:id).
// Порядок «Next item» берётся из галереи или списка, откуда открыли.
import { go, parseHash } from './router';
import { runCurtain } from './transition';

export type EntityKind = 'curse' | 'assignment' | 'exercise';
const orders: Partial<Record<EntityKind, string[]>> = {};
let pushed = 0;

function withPage(val: string | null) {
  const { parts, query } = parseHash(window.location.hash);
  if (val) query.set('page', val);
  else query.delete('page');
  const qs = query.toString();
  return '/' + parts.join('/') + (qs ? '?' + qs : '');
}

/** Открыть страницу сущности. cinematic — с занавесом (B2), title — надпись на занавесе. */
export function openEntity(kind: EntityKind, id: string, opts: { order?: string[]; title?: string; cinematic?: boolean } = {}) {
  if (opts.order) orders[kind] = opts.order;
  const already = !!parseHash(window.location.hash).query.get('page');
  const swap = () => {
    if (already) go(withPage(`${kind}:${id}`), true);
    else {
      pushed = 1;
      go(withPage(`${kind}:${id}`));
    }
  };
  if (opts.cinematic !== false && opts.title) runCurtain({ title: opts.title, swap });
  else swap();
}

export function closeEntity() {
  if (pushed) {
    pushed = 0;
    history.back();
  } else go(withPage(null), true);
}

export function orderOf(kind: EntityKind) {
  return orders[kind] || [];
}
export function nextOf(kind: EntityKind, id: string, fallback: string[] = []) {
  const list = orders[kind]?.length ? orders[kind]! : fallback;
  const i = list.indexOf(id);
  if (!list.length) return undefined;
  return list[(i + 1) % list.length] === id ? undefined : list[(i + 1) % list.length];
}
