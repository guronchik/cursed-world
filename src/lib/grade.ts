import { L } from './runtime';

/** 0 = Special Grade, 1..4 = Grade 1..4 */
export type Grade = 0 | 1 | 2 | 3 | 4;
export const GRADES: Grade[] = [0, 1, 2, 3, 4];

/**
 * Грейд проклятия по близости дедлайна и важности.
 * Grade 4: > 7 дней · Grade 3: 4–7 дней · Grade 2: 2–3 дня · Grade 1: < 48 ч ·
 * Special: < 12 ч, просрочено или «огромная цель» (важность 5).
 * Важность 4 делает проклятие на грейд страшнее.
 */
export function curseGrade(due: number, importance: number, now = Date.now()): { grade: Grade; overdue: boolean } {
  const h = (due - now) / 36e5;
  const overdue = h < 0;
  let g: Grade = overdue || h < 12 ? 0 : h < 48 ? 1 : h <= 72 ? 2 : h <= 168 ? 3 : 4;
  if (importance >= 5) g = 0;
  else if (importance === 4 && g > 1) g = (g - 1) as Grade;
  return { grade: g, overdue };
}

export const gradeName = (g: Grade) => (g === 0 ? 'Special Grade' : `Grade ${g}`);

export const GRADE_COLOR: Record<Grade, string> = {
  0: '#ff2744',
  1: '#ff4f8b',
  2: '#c04dff',
  3: '#8b6bff',
  4: '#5b8cff',
};

export const GRADE_KANJI: Record<Grade, string> = { 0: '特級', 1: '一級', 2: '二級', 3: '三級', 4: '四級' };

export const gradeHint = (g: Grade) =>
  ({
    0: L('< 12 ч, просрочено или огромная цель', '< 12h, overdue or huge goal'),
    1: L('меньше 48 часов', 'less than 48 hours'),
    2: L('2–3 дня', '2–3 days'),
    3: L('4–7 дней', '4–7 days'),
    4: L('больше 7 дней', 'more than 7 days'),
  })[g];

export const IMPORTANCE = () => [
  { v: 1, label: L('Низкая', 'Low') },
  { v: 2, label: L('Обычная', 'Normal') },
  { v: 3, label: L('Важная', 'Important') },
  { v: 4, label: L('Высокая (+1 грейд)', 'High (+1 grade)') },
  { v: 5, label: L('Огромная цель (Special)', 'Huge goal (Special)') },
];

/** Сколько XP даёт изгнание проклятия этого грейда */
export function exorciseXp(g: Grade, overdue: boolean) {
  if (overdue) return 5;
  return { 0: 50, 1: 30, 2: 20, 3: 15, 4: 10 }[g];
}
