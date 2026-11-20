// Прогресс холодного старта для прелоадера: реальные этапы загрузки (база, шрифт, обои, первые картинки).
type Step = 'db' | 'fonts' | 'wallpaper' | 'images';
const done = new Set<Step>();
const subs = new Set<() => void>();
export const BOOT_STEPS: Step[] = ['db', 'fonts', 'wallpaper', 'images'];
export function markBoot(s: Step) {
  if (done.has(s)) return;
  done.add(s);
  subs.forEach((f) => f());
}
export const bootProgress = () => done.size / BOOT_STEPS.length;
export function onBoot(f: () => void) {
  subs.add(f);
  return () => void subs.delete(f);
}
// событие «занавес прелоадера ушёл» — главная запускает каскад виджетов
export const REVEAL_EVENT = 'cw:revealed';
export let revealed = false;
export function setRevealed() {
  revealed = true;
  window.dispatchEvent(new Event(REVEAL_EVENT));
}

// шрифт
if (typeof document !== 'undefined' && document.fonts?.ready) void document.fonts.ready.then(() => markBoot('fonts'));
else markBoot('fonts');
