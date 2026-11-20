// Мини-роутер на hash (#/curses?open=id) — работает офлайн и на любом статическом хостинге.
import { createContext, useContext, useSyncExternalStore } from 'react';

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};
const snapshot = () => window.location.hash;

export function parseHash(h: string) {
  const raw = h.replace(/^#\/?/, '');
  const [p, q = ''] = raw.split('?');
  return { parts: p.split('/').filter(Boolean), query: new URLSearchParams(q), raw };
}

/** Во время кинематографичного перехода уходящая страница видит «замороженный» адрес, а не новый. */
export const FrozenRoute = createContext<string | null>(null);

export function useRoute() {
  const live = useSyncExternalStore(subscribe, snapshot, snapshot);
  const frozen = useContext(FrozenRoute);
  return parseHash(frozen ?? live);
}

export function go(to: string, replace = false) {
  const hash = to.startsWith('#') ? to : '#' + (to.startsWith('/') ? to : '/' + to);
  if (replace) {
    history.replaceState(null, '', hash);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = hash;
  }
}

/** Установить/удалить параметр запроса в текущем hash, не создавая запись истории. */
export function setQuery(key: string, val?: string | null) {
  const { parts, query } = parseHash(window.location.hash);
  if (val === undefined || val === null || val === '') query.delete(key);
  else query.set(key, val);
  const qs = query.toString();
  go('/' + parts.join('/') + (qs ? '?' + qs : ''), true);
}
