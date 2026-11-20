// Шина кинематографичных переходов: Shell рисует занавес; открытие крупной сущности тоже может его запросить.
export type CurtainRequest = { title: string; section?: string; swap: () => void };
const subs = new Set<(r: CurtainRequest) => void>();
export function onCurtain(f: (r: CurtainRequest) => void) {
  subs.add(f);
  return () => void subs.delete(f);
}
/** Переход с занавесом: swap выполняется, когда экран закрыт. Если Shell не смонтирован — swap сразу. */
export function runCurtain(r: CurtainRequest) {
  if (!subs.size) return r.swap();
  subs.forEach((f) => f(r));
}
