import { liveQuery } from 'dexie';
import { useEffect, useRef, useState } from 'react';

/** Живой запрос к IndexedDB: компонент перерисовывается при любом изменении данных. */
export function useLive<T>(query: () => Promise<T> | T, deps: unknown[] = []): T | undefined {
  const [val, setVal] = useState<T | undefined>(undefined);
  useEffect(() => {
    const sub = liveQuery(query).subscribe({
      next: (v) => setVal(() => v),
      error: (e) => console.error('[liveQuery]', e),
    });
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return val;
}

/** Текущее время, обновляется каждые `ms` миллисекунд. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}

/** Автосохранение: вызывает save(value) через delay мс после последнего изменения. */
export function useAutosave<T>(value: T, save: (v: T) => void, delay = 500, enabled = true) {
  const first = useRef(true);
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!enabled) return;
    const t = window.setTimeout(() => saveRef.current(value), delay);
    return () => window.clearTimeout(t);
  }, [value, delay, enabled]);
}

export function useMedia(query: string) {
  const [m, setM] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false));
  useEffect(() => {
    const mq = window.matchMedia(query);
    const fn = () => setM(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, [query]);
  return m;
}
