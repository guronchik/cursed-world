// Глобальное состояние рантайма, доступное вне React (язык, звук, анимации).
// App обновляет эти поля при каждом изменении настроек; Shell перемонтируется при смене языка.
export const rt = {
  lang: 'ru' as 'ru' | 'en',
  sound: true,
  reduce: false,
};

/** Двуязычная строка: L('Добавить', 'Add') */
export const L = (ruText: string, enText: string) => (rt.lang === 'ru' ? ruText : enText);

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 9);

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export const round1 = (n: number) => Math.round(n * 10) / 10;

export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

/** «3 дня» / «3 days» */
export function daysWord(n: number) {
  return rt.lang === 'ru' ? `${n} ${plural(n, 'день', 'дня', 'дней')}` : `${n} ${n === 1 ? 'day' : 'days'}`;
}
