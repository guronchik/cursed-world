// Демо-данные: по 2–3 примера в каждом разделе, даты считаются относительно «сейчас».
import { addDays, startOfDay, subDays, subMonths } from 'date-fns';
import { dayKey, monthKey, weekKey, weekdayIdx } from '../lib/dates';
import { putBlob, svgBlob } from '../lib/media';
import { uid } from '../lib/runtime';
import { vowPower } from '../lib/stats';
import {
  db,
  DEFAULT_SETTINGS,
  DEMO_EXERCISE_NAMES,
  type Curse,
  type Exercise,
  type MedLog,
  type Template,
  type RoutineLog,
  type Workout,
  type WorkoutEntry,
  type XpEvent,
} from './schema';
import { upgradeToV3 } from './migrate3';
import { upgradeToV4 } from './schema';
import { newVideo, pipelineForColumn } from '../lib/videoMeta';
import { cloneBlocks, defaultVideoTemplate } from '../lib/blocks';

const campusSvg = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" width="1600" height="1000">
<defs>
<pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#1d1838" stroke-width="1"/></pattern>
<linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#231b4a"/><stop offset="1" stop-color="#140f2c"/></linearGradient>
</defs>
<rect width="1600" height="1000" fill="#0a0817"/><rect width="1600" height="1000" fill="url(#grid)"/>
<path d="M0 560H1600M800 0V1000M120 0C300 300 260 700 520 1000" stroke="#2a2350" stroke-width="44" fill="none"/>
<path d="M0 560H1600M800 0V1000M120 0C300 300 260 700 520 1000" stroke="#3a3170" stroke-width="2" stroke-dasharray="18 14" fill="none"/>
<g font-family="Oswald, Arial Narrow, sans-serif" font-size="30" fill="#cfc8ff" text-anchor="middle">
<rect x="300" y="200" width="380" height="260" fill="url(#b)" stroke="#7c5cff" stroke-width="4"/><text x="490" y="340">ГЛАВНЫЙ КОРПУС</text>
<rect x="960" y="250" width="360" height="220" fill="url(#b)" stroke="#5b8cff" stroke-width="4"/><text x="1140" y="370">КОРПУС Б</text>
<rect x="1140" y="40" width="300" height="150" fill="url(#b)" stroke="#c9a2ff" stroke-width="4"/><text x="1290" y="125">БИБЛИОТЕКА</text>
<rect x="760" y="640" width="320" height="180" fill="url(#b)" stroke="#f2c14e" stroke-width="4"/><text x="920" y="740">СТОЛОВАЯ</text>
<rect x="180" y="660" width="300" height="240" fill="url(#b)" stroke="#ff4f8b" stroke-width="4"/><text x="330" y="790">СПОРТКОМПЛЕКС</text>
<rect x="1180" y="640" width="300" height="200" fill="url(#b)" stroke="#4dd4ff" stroke-width="4"/><text x="1330" y="750">ОБЩЕЖИТИЕ</text>
</g>
<g fill="#16351f" stroke="#2f6b3c" stroke-width="3">${Array.from({ length: 14 }, (_, i) => `<circle cx="${560 + (i % 7) * 34}" cy="${60 + Math.floor(i / 7) * 40}" r="14"/>`).join('')}</g>
<text x="1560" y="980" font-family="monospace" font-size="20" fill="#4b4380" text-anchor="end">DEMO MAP — замени своей картой</text>
</svg>`;

const bodySvg = (angle: 'front' | 'side' | 'back', bulk: number, label: string) => {
  const w = 1 + bulk * 0.08;
  const torso =
    angle === 'side'
      ? `<path d="M290 250c${40 * w} 10 ${55 * w} 60 ${48 * w} 140l-10 170h-70l-12-170c-4-80 10-130 44-140z"/>`
      : `<path d="M${300 - 95 * w} 260c40-25 ${150 * w} -25 ${190 * w} 0l${-12 * w} 190 ${-20 * w} 120h-${130 * w}l-20-120z"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800" width="600" height="800">
<defs><radialGradient id="g" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="#241a52"/><stop offset="1" stop-color="#07060e"/></radialGradient></defs>
<rect width="600" height="800" fill="url(#g)"/>
<g fill="#0d0a1c" stroke="#8b6bff" stroke-width="4">
<circle cx="300" cy="170" r="62"/>${torso}
${angle === 'side' ? '' : `<path d="M${300 - 100 * w} 270l${-40 * w} 210 25 8 ${50 * w} -170z"/><path d="M${300 + 100 * w} 270l${40 * w} 210 -25 8 ${-50 * w} -170z"/>`}
<path d="M240 570l-10 200h55l15-200zM360 570l10 200h-55l-15-200z"/>
</g>
<text x="300" y="60" font-family="monospace" font-size="28" fill="#b6a4ff" text-anchor="middle">${label} · ${angle.toUpperCase()}</text>
</svg>`;
};

export async function seedDemo() {
  const now = new Date();
  const T = now.getTime();
  const today = startOfDay(now);
  const at = (dOff: number, h = 12, m = 0) => {
    const d = addDays(today, dOff);
    d.setHours(h, m, 0, 0);
    return d.getTime();
  };
  const dk = (dOff: number) => dayKey(addDays(today, dOff));
  const ago = (days: number) => T - days * 864e5;
  const xp: XpEvent[] = [];
  const addXp = (key: string, amount: number, reason: string, kind: string, when: number) => xp.push({ key, amount, reason, kind, at: when });

  // ── Техники (категории) ──
  await db.techniques.bulkPut([
    { id: 't-yt', name: 'YouTube', color: '#ff3d5a', icon: '▶', kind: 'youtube', stages: ['Идея', 'Сценарий', 'Съёмка', 'Монтаж', 'Публикация'], order: 0, createdAt: ago(90) },
    { id: 't-uni', name: 'University', color: '#5b8cff', icon: '学', kind: 'university', order: 1, createdAt: ago(90) },
    { id: 't-piano', name: 'Piano', color: '#c9a2ff', icon: '♪', kind: 'piano', trackMinutes: true, repertoire: true, order: 2, createdAt: ago(90) },
    { id: 't-pers', name: 'Personal', color: '#f2c14e', icon: '己', kind: 'personal', order: 3, createdAt: ago(90) },
  ]);

  // ── Универ ──
  await db.subjects.bulkPut([
    { id: 's-math', name: 'Математический анализ', color: '#8b6bff', teacher: 'Петров А. В.' },
    { id: 's-prog', name: 'Программирование', color: '#4dd4ff', teacher: 'Смирнова Е. И.' },
    { id: 's-eng', name: 'Английский язык', color: '#f2c14e', teacher: 'J. Brown' },
    { id: 's-phys', name: 'Физика', color: '#ff7a59', teacher: 'Ковалёв Д. С.' },
  ]);
  const mapId = await putBlob(svgBlob(campusSvg()), 'campus-demo.svg');
  await db.pins.bulkPut([
    { id: 'p-main', x: 0.306, y: 0.33, name: 'Главный корпус', note: 'Вход со стороны площади, турникеты справа. Гардероб — цоколь.', kind: 'building' },
    { id: 'p-305', x: 0.36, y: 0.25, name: 'Ауд. 305', note: '3 этаж, налево от лифта, до конца коридора.', kind: 'room' },
    { id: 'p-b', x: 0.712, y: 0.36, name: 'Корпус Б', note: 'Пропуск нужен даже вечером.', kind: 'building' },
    { id: 'p-b210', x: 0.75, y: 0.31, name: 'Ауд. Б-210', note: '2 этаж, лестница у кофейного автомата.', kind: 'room' },
    { id: 'p-food', x: 0.575, y: 0.72, name: 'Столовая', note: 'Обед дешевле до 12:00.', kind: 'other' },
  ]);
  await db.classes.bulkPut([
    { id: uid(), subjectId: 's-math', weekday: 0, start: '09:00', end: '10:30', room: '305', teacher: 'Петров А. В.', type: 'lecture', weeks: 'all', pinId: 'p-305' },
    { id: uid(), subjectId: 's-prog', weekday: 0, start: '10:45', end: '12:15', room: 'Б-210', teacher: 'Смирнова Е. И.', type: 'lab', weeks: 'all', pinId: 'p-b210' },
    { id: uid(), subjectId: 's-eng', weekday: 1, start: '13:00', end: '14:30', room: '412', teacher: 'J. Brown', type: 'seminar', weeks: 'all', pinId: 'p-main' },
    { id: uid(), subjectId: 's-phys', weekday: 2, start: '09:00', end: '10:30', room: 'Актовый зал', teacher: 'Ковалёв Д. С.', type: 'lecture', weeks: 'all', pinId: 'p-main' },
    { id: uid(), subjectId: 's-math', weekday: 3, start: '10:45', end: '12:15', room: '305', teacher: 'Петров А. В.', type: 'seminar', weeks: 'all', pinId: 'p-305' },
    { id: uid(), subjectId: 's-prog', weekday: 3, start: '18:30', end: '20:00', room: 'Б-210', teacher: 'Смирнова Е. И.', type: 'lab', weeks: 'odd', pinId: 'p-b210' },
    { id: uid(), subjectId: 's-prog', weekday: 4, start: '09:00', end: '10:30', room: 'Б-101', teacher: 'Смирнова Е. И.', type: 'lecture', weeks: 'all', pinId: 'p-b' },
    { id: uid(), subjectId: 's-eng', weekday: 4, start: '10:45', end: '12:15', room: '412', teacher: 'J. Brown', type: 'seminar', weeks: 'even', pinId: 'p-main' },
  ]);
  await db.results.bulkPut([
    { id: uid(), subjectId: 's-math', semester: 1, label: 'Экзамен', score: 4, max: 5, date: dayKey(subMonths(now, 10)) },
    { id: uid(), subjectId: 's-prog', semester: 1, label: 'Экзамен', score: 5, max: 5, date: dayKey(subMonths(now, 10)) },
    { id: uid(), subjectId: 's-eng', semester: 1, label: 'Зачёт с оценкой', score: 5, max: 5, date: dayKey(subMonths(now, 10)) },
    { id: uid(), subjectId: 's-math', semester: 2, label: 'Экзамен', score: 4, max: 5, date: dayKey(subMonths(now, 5)) },
    { id: uid(), subjectId: 's-phys', semester: 2, label: 'Экзамен', score: 3, max: 5, date: dayKey(subMonths(now, 5)) },
    { id: uid(), subjectId: 's-prog', semester: 2, label: 'Курсовая', score: 5, max: 5, date: dayKey(subMonths(now, 5)) },
    { id: uid(), subjectId: 's-math', semester: 3, label: 'Контрольная 1', score: 5, max: 5, date: dayKey(subDays(now, 20)) },
    { id: uid(), subjectId: 's-prog', semester: 3, label: 'Лабораторная №2', score: 10, max: 10, date: dayKey(subDays(now, 7)) },
  ]);

  // ── Цели ──
  const mk = monthKey(now);
  const mk1 = monthKey(subMonths(now, 1));
  const mk2 = monthKey(subMonths(now, 2));
  const yr = (m: string) => Number(m.slice(0, 4));
  const Y = now.getFullYear();
  await db.goals.bulkPut([
    { id: 'g-y-yt', level: 'year', title: 'YouTube: 1000 подписчиков', description: 'Стабильно 1 ролик в неделю + шортсы.', year: Y, color: '#ff3d5a', createdAt: ago(200) },
    { id: 'g-y-uni', level: 'year', title: 'Сессия без троек', description: 'Ни одного хвоста, средний ≥ 4.5.', year: Y, color: '#5b8cff', createdAt: ago(200) },
    { id: 'g-y-zh', level: 'year', title: 'Китайский: сдать HSK 2', description: '300 слов, аудирование каждый день.', year: Y, color: '#f2c14e', createdAt: ago(200) },
    { id: 'g-y-bench', level: 'year', title: 'Жим лёжа 100 кг', description: 'Чистая масса 78 кг, техника без отрыва таза.', year: Y, color: '#ff4f8b', huge: true, createdAt: ago(200) },
    { id: 'g-m-yt', level: 'month', title: 'Выпустить 4 ролика', description: '', year: yr(mk), month: mk, parentId: 'g-y-yt', color: '#ff3d5a', createdAt: ago(18) },
    { id: 'g-m-uni', level: 'month', title: 'Закрыть все лабы и эссе', description: '', year: yr(mk), month: mk, parentId: 'g-y-uni', color: '#5b8cff', createdAt: ago(18) },
    { id: 'g-m-zh', level: 'month', title: '4 урока HSK в неделю', description: '', year: yr(mk), month: mk, parentId: 'g-y-zh', color: '#f2c14e', createdAt: ago(18) },
    { id: 'g-m-bench', level: 'month', title: 'Жим 85 кг × 3', description: '', year: yr(mk), month: mk, parentId: 'g-y-bench', color: '#ff4f8b', createdAt: ago(18) },
    { id: 'g-m-yt-1', level: 'month', title: 'Выпустить 3 ролика', description: '', year: yr(mk1), month: mk1, parentId: 'g-y-yt', color: '#ff3d5a', createdAt: ago(48) },
    { id: 'g-m-uni-2', level: 'month', title: 'Закрыть хвосты с лета', description: '', year: yr(mk2), month: mk2, parentId: 'g-y-uni', color: '#5b8cff', createdAt: ago(78) },
  ]);

  // ── Curses ──
  const base = { subtasks: [], notes: '', attachments: [], links: [], createdAt: ago(5) } as Pick<Curse, 'subtasks' | 'notes' | 'attachments' | 'links' | 'createdAt'>;
  const st = (title: string, done = false) => ({ id: uid(), title, done });
  const curses: Curse[] = [
    { ...base, id: 'c-lab3', title: 'Лабораторная №3: сортировки', due: at(1, 23, 59), techniqueId: 't-uni', importance: 3, status: 'active', isAssignment: true, subjectId: 's-prog', assignStatus: 'progress', goalId: 'g-m-uni', subtasks: [st('Реализовать quicksort', true), st('Написать тесты'), st('Отчёт в PDF')], links: ['https://ru.wikipedia.org/wiki/Быстрая_сортировка'], notes: 'Сдать через LMS до полуночи.' },
    { ...base, id: 'c-essay', title: 'Эссе: The Future of AI (300 слов)', due: at(5, 18), techniqueId: 't-uni', importance: 3, status: 'active', isAssignment: true, subjectId: 's-eng', assignStatus: 'todo', goalId: 'g-m-uni' },
    { ...base, id: 'c-calc', title: 'ДЗ: интегралы, №1–25', due: at(3, 9), techniqueId: 't-uni', importance: 2, status: 'active', isAssignment: true, subjectId: 's-math', assignStatus: 'todo', goalId: 'g-m-uni' },
    { ...base, id: 'c-yt-edit', title: 'Смонтировать ролик «Топ-10 техник»', due: T + 9 * 36e5, techniqueId: 't-yt', importance: 3, stage: 3, status: 'active', goalId: 'g-m-yt', subtasks: [st('Черновой монтаж', true), st('Цветокор'), st('Звук и музыка')] },
    { ...base, id: 'c-yt-script', title: 'Сценарий: разбор Domain Expansion', due: at(4, 20), techniqueId: 't-yt', importance: 3, stage: 1, status: 'active', goalId: 'g-m-yt' },
    { ...base, id: 'c-yt-idea', title: 'Идея: шортсы о тренировках', due: at(14, 12), techniqueId: 't-yt', importance: 2, stage: 0, status: 'active', goalId: 'g-m-yt' },
    { ...base, id: 'c-piano', title: 'Выучить 2-ю часть Ноктюрна', due: at(2, 21), techniqueId: 't-piano', importance: 3, status: 'active' },
    { ...base, id: 'c-piano-2', title: 'Разобрать аппликатуру Summer, такты 1–16', due: at(8, 21), techniqueId: 't-piano', importance: 2, status: 'active' },
    { ...base, id: 'c-bill', title: 'Оплатить интернет', due: at(-1, 20), techniqueId: 't-pers', importance: 2, status: 'active' },
    { ...base, id: 'c-dentist', title: 'Записаться к стоматологу', due: at(6, 12), techniqueId: 't-pers', importance: 2, status: 'active' },
    { ...base, id: 'c-bench', title: 'Проверка силы: жим 85 кг × 3', due: at(9, 19), techniqueId: 't-pers', importance: 4, status: 'active', goalId: 'g-m-bench' },
    { ...base, id: 'c-hsk', title: 'Урок HSK 2 №12 + 20 карточек', due: at(1, 21), techniqueId: 't-pers', importance: 3, status: 'active', goalId: 'g-m-zh' },
    { ...base, id: 'c-hsk-11', title: 'Урок HSK 2 №11', due: at(-2, 21), techniqueId: 't-pers', importance: 3, status: 'exorcised', completedAt: at(-2, 19), goalId: 'g-m-zh' },
    { ...base, id: 'c-lab2', title: 'Лабораторная №2: связные списки', due: at(-6, 23, 59), techniqueId: 't-uni', importance: 3, status: 'exorcised', completedAt: at(-7, 22), isAssignment: true, subjectId: 's-prog', assignStatus: 'done', score: '10/10', goalId: 'g-m-uni' },
    { ...base, id: 'c-yt-pub', title: 'Опубликовать «Гайд по Black Flash»', due: at(-3, 20), techniqueId: 't-yt', importance: 3, stage: 4, status: 'exorcised', completedAt: at(-3, 19), goalId: 'g-m-yt' },
    { ...base, id: 'c-prev-1', title: 'Ролик №1 (прошлый месяц)', due: ago(40), techniqueId: 't-yt', importance: 3, stage: 4, status: 'exorcised', completedAt: ago(41), goalId: 'g-m-yt-1' },
    { ...base, id: 'c-prev-2', title: 'Ролик №2 (прошлый месяц)', due: ago(33), techniqueId: 't-yt', importance: 3, stage: 4, status: 'exorcised', completedAt: ago(34), goalId: 'g-m-yt-1' },
    { ...base, id: 'c-prev-3', title: 'Ролик №3 (прошлый месяц)', due: ago(26), techniqueId: 't-yt', importance: 3, stage: 2, status: 'active', goalId: 'g-m-yt-1' },
    { ...base, id: 'c-prev2-1', title: 'Пересдать физику', due: ago(70), techniqueId: 't-uni', importance: 4, status: 'exorcised', completedAt: ago(72), goalId: 'g-m-uni-2' },
  ];
  await db.curses.bulkPut(curses);
  for (const c of curses.filter((x) => x.status === 'exorcised')) addXp(`curse:${c.id}`, 20, 'Изгнание: ' + c.title, 'curse', c.completedAt || T);
  addXp('goal:g-m-uni-2', 100, 'Maximum Technique: Закрыть хвосты с лета', 'goal', ago(72));

  // ── Divergent Fist ──
  const rM = { id: 'r-morning', slot: 'morning' as const, name: 'Утренний уход', steps: [
    { id: 'm1', name: 'Очищение', product: 'Мягкий гель для умывания' },
    { id: 'm2', name: 'Тонер', product: 'Увлажняющий тонер' },
    { id: 'm3', name: 'Сыворотка', product: 'Витамин C 10%' },
    { id: 'm4', name: 'Крем', product: 'Лёгкий увлажняющий' },
    { id: 'm5', name: 'SPF', product: 'SPF 50' },
  ] };
  const rE = { id: 'r-evening', slot: 'evening' as const, name: 'Вечерний уход', steps: [
    { id: 'e1', name: 'Гидрофильное масло', product: '' },
    { id: 'e2', name: 'Пенка', product: 'Пенка для умывания' },
    { id: 'e3', name: 'Актив', product: 'Ретинол 0.2% (пн/ср/пт)' },
    { id: 'e4', name: 'Крем', product: 'Восстанавливающий крем' },
  ] };
  await db.routines.bulkPut([rM, rE]);
  const rlogs: RoutineLog[] = [];
  for (let i = 1; i <= 34; i++) {
    const d = dk(-i);
    if (![9, 16, 23].includes(i)) rlogs.push({ id: `${d}|r-morning`, date: d, routineId: 'r-morning', done: rM.steps.map((s) => s.id) });
    else rlogs.push({ id: `${d}|r-morning`, date: d, routineId: 'r-morning', done: ['m1', 'm2'] });
    if (![5, 12, 13, 21, 27].includes(i)) rlogs.push({ id: `${d}|r-evening`, date: d, routineId: 'r-evening', done: rE.steps.map((s) => s.id) });
  }
  rlogs.push({ id: `${dk(0)}|r-morning`, date: dk(0), routineId: 'r-morning', done: ['m1', 'm2', 'm3'] });
  await db.routineLogs.bulkPut(rlogs);
  for (const l of rlogs) {
    const r = l.routineId === 'r-morning' ? rM : rE;
    if (r.steps.every((s) => l.done.includes(s.id))) addXp(`routine:${l.date}:${r.id}`, 10, 'Квест: ' + r.name, 'quest', at(-1));
  }

  const meds = [
    { id: 'm-d3', name: 'Витамин D3', dose: '1 капсула', times: ['09:00'], perDose: 1, stock: 34, refillDays: 7, reminders: true, notes: 'Во время завтрака.', active: true, createdAt: ago(40) },
    { id: 'm-omega', name: 'Омега-3', dose: '1 капсула', times: ['09:00', '21:00'], perDose: 1, stock: 9, refillDays: 7, reminders: true, notes: '', active: true, createdAt: ago(40) },
    { id: 'm-mg', name: 'Магний', dose: '1 таблетка', times: ['22:00'], perDose: 1, stock: 40, refillDays: 7, reminders: false, notes: '', active: true, createdAt: ago(40) },
  ];
  await db.meds.bulkPut(meds);
  const mlogs: MedLog[] = [];
  for (let i = 1; i <= 34; i++) {
    const d = dk(-i);
    for (const m of meds) for (const t of m.times) {
      const skip = (i === 7 && m.id === 'm-omega' && t === '21:00') || (i === 15 && m.id === 'm-mg') || (i === 22 && m.id === 'm-d3') || (i === 29 && m.id === 'm-omega');
      mlogs.push({ id: `${d}|${m.id}|${t}`, date: d, medId: m.id, time: t, status: skip ? 'skipped' : 'taken', at: at(-i, Number(t.slice(0, 2))) });
    }
  }
  if (now.getHours() >= 10) {
    mlogs.push({ id: `${dk(0)}|m-d3|09:00`, date: dk(0), medId: 'm-d3', time: '09:00', status: 'taken', at: at(0, 9, 5) });
    mlogs.push({ id: `${dk(0)}|m-omega|09:00`, date: dk(0), medId: 'm-omega', time: '09:00', status: 'taken', at: at(0, 9, 5) });
  }
  await db.medLogs.bulkPut(mlogs);
  for (let i = 1; i <= 34; i++) {
    const d = dk(-i);
    const dayLogs = mlogs.filter((l) => l.date === d);
    if (dayLogs.length && dayLogs.every((l) => l.status === 'taken')) addXp(`meds:${d}`, 10, 'Все приёмы за день', 'quest', at(-i, 23));
  }

  // ── Black Flash ──
  const demoTr = demoTraining(ago(60));
  await db.exercises.bulkPut(demoTr.exercises);
  await db.templates.bulkPut(demoTr.templates);
  const startW: Record<string, number> = { 'e-bench': 75, 'e-ohp': 45, 'e-tri': 30, 'e-dead': 120, 'e-pull': 7.5, 'e-row': 65, 'e-curl': 30, 'e-squat': 95, 'e-rdl': 80, 'e-lunge': 18 };
  const step: Record<string, number> = { 'e-bench': 2.5, 'e-ohp': 2.5, 'e-tri': 2.5, 'e-dead': 5, 'e-pull': 2.5, 'e-row': 2.5, 'e-curl': 2.5, 'e-squat': 5, 'e-rdl': 5, 'e-lunge': 2 };
  const tpl = { 0: ['tp-push', 'Push', ['e-bench', 'e-ohp', 'e-tri']], 2: ['tp-pull', 'Pull', ['e-dead', 'e-pull', 'e-row', 'e-curl']], 4: ['tp-legs', 'Legs', ['e-squat', 'e-rdl', 'e-lunge']] } as Record<number, [string, string, string[]]>;
  const best: Record<string, number> = {};
  const seen: Record<string, number> = {};
  const workouts: Workout[] = [];
  for (let i = 32; i >= 1; i--) {
    const day = addDays(today, -i);
    const wd = weekdayIdx(day);
    if (!(wd in tpl)) continue;
    if (i === 11) continue; // пропуск для реалистичности
    const [tid, name, exIds] = tpl[wd];
    const entries: WorkoutEntry[] = exIds.map((eid, k) => {
      const kk = seen[eid] = (seen[eid] ?? -1) + 1;
      const w = startW[eid] + step[eid] * Math.floor(kk / 2);
      const sets = Array.from({ length: k === 0 ? 4 : 3 }, (_, s) => {
        const reps = k === 0 ? 6 - (s === 3 ? 1 : 0) : 8;
        const weight = s === 0 ? Math.max(0, w - step[eid] * 2) : w;
        const pr = best[eid] !== undefined && weight > best[eid];
        if (best[eid] === undefined || weight > best[eid]) best[eid] = weight;
        return { id: uid(), reps, weight, pr };
      });
      return { id: uid(), exerciseId: eid, sets, name: demoTr.exercises.find((x) => x.id === eid)?.name, kind: 'weight' as const, unit: 'kg' as const };
    });
    const id = uid();
    workouts.push({ id, date: dayKey(day), name, templateId: tid, entries, notes: '', finished: true, createdAt: day.getTime() });
    const prs = entries.reduce((s, e) => s + e.sets.filter((x) => x.pr).length, 0);
    addXp(`workout:${id}`, 30 + prs * 15, 'Тренировка', 'workout', day.getTime() + 19 * 36e5);
  }
  await db.workouts.bulkPut(workouts);
  await db.bodyWeights.bulkPut(
    [74.2, 74.5, 74.4, 74.9, 75.1, 75.0, 75.4, 75.6, 75.9].map((kg, i) => {
      const d = dk(-32 + i * 4);
      return { id: d, date: d, kg };
    }),
  );
  for (const [wOff, bulk] of [[-21, 0], [-7, 1]] as const) {
    const day = addDays(today, wOff);
    const wk = weekKey(day);
    for (const angle of ['front', 'side', 'back'] as const) {
      const blobId = await putBlob(svgBlob(bodySvg(angle, bulk, wk)), `${wk}-${angle}.svg`);
      await db.photos.put({ id: uid(), week: wk, date: dayKey(day), angle, blobId });
    }
  }

  // ── Piano ──
  await db.pieces.bulkPut([
    { id: 'pc-noct', techniqueId: 't-piano', title: 'Ноктюрн op. 9 №2', composer: 'Ф. Шопен', status: 'learning', progress: 60, notes: 'Трели во 2-й части — медленно с метрономом 60.' },
    { id: 'pc-summer', techniqueId: 't-piano', title: 'Summer', composer: 'Дзё Хисаиси', status: 'polishing', progress: 80, notes: '' },
    { id: 'pc-nuvole', techniqueId: 't-piano', title: 'Nuvole Bianche', composer: 'Л. Эйнауди', status: 'ready', progress: 100, notes: 'Играть на концерте в декабре.' },
  ]);
  const mins = [45, 30, 40, 25, 35, 0, 50, 30, 20, 45, 0, 30, 40, 25];
  const practice = mins
    .map((m, i) => ({ id: uid(), techniqueId: 't-piano', date: dk(-(i + 1)), minutes: m, note: '', pieceId: i % 2 ? 'pc-noct' : 'pc-summer' }))
    .filter((p) => p.minutes > 0);
  await db.practice.bulkPut(practice);
  practice.forEach((p) => addXp(`practice:${p.id}`, Math.round(p.minutes / 3), `Практика ${p.minutes} min`, 'practice', at(-1)));

  // ── Reversed Cursed Technique ──
  await db.folders.bulkPut([
    { id: 'f-anime', name: 'Аниме', icon: 'film', color: '#8b6bff', order: 0 },
    { id: 'f-manhwa', name: 'Манхва', icon: 'book', color: '#4dd4ff', order: 1 },
    { id: 'f-food', name: 'Еда', icon: 'utensils', color: '#f2c14e', order: 2 },
    { id: 'f-video', name: 'Видео', icon: 'video', color: '#ff3d5a', order: 3 },
    { id: 'f-ideas', name: 'Идеи', icon: 'bulb', color: '#c9a2ff', order: 4 },
    { id: 'f-music', name: 'Музыка', icon: 'music', color: '#30d158', order: 5 },
    { id: 'f-books', name: 'Книги', icon: 'book', color: '#ff9f0a', order: 6 },
    { id: 'f-gym', name: 'Зал', icon: 'dumbbell', color: '#ff453a', order: 7 },
    { id: 'f-travel', name: 'Поездки', icon: 'globe', color: '#64d2ff', order: 8 },
  ]);
  const sv = (p: Partial<import('./schema').SaveItem> & { title: string }) => ({ id: uid(), kind: 'note' as const, text: '', tags: [], favorite: false, done: false, createdAt: ago(Math.random() * 20), ...p });
  await db.saves.bulkPut([
    sv({ folderId: 'f-anime', kind: 'link', title: 'Jujutsu Kaisen — MyAnimeList', url: 'https://myanimelist.net/anime/40748', tags: ['сёнэн', 'пересмотреть'], favorite: true, done: true, preview: { title: 'Jujutsu Kaisen', site: 'myanimelist.net' } }),
    sv({ folderId: 'f-anime', title: 'Посмотреть: Dandadan, Chainsaw Man', text: 'Начать с Dandadan — говорят, лучший опенинг сезона.', tags: ['список'] }),
    sv({ folderId: 'f-manhwa', kind: 'link', title: 'Solo Leveling', url: 'https://en.wikipedia.org/wiki/Solo_Leveling', tags: ['топ'], done: true, preview: { title: 'Solo Leveling — Wikipedia', site: 'en.wikipedia.org' } }),
    sv({ folderId: 'f-manhwa', title: 'Omniscient Reader — дочитать', text: 'Остановился на 120 главе.', tags: ['в процессе'], favorite: true }),
    sv({ folderId: 'f-food', title: 'Протеиновые блинчики', text: '2 яйца, 1 банан, 30 г протеина, щепотка соли. Жарить на антипригарной сковороде.', tags: ['рецепт', 'ПП'], favorite: true }),
    sv({ folderId: 'f-food', kind: 'link', title: 'Рамен: история и виды', url: 'https://en.wikipedia.org/wiki/Ramen', tags: ['рецепт'], preview: { title: 'Ramen — Wikipedia', site: 'en.wikipedia.org' } }),
    sv({ folderId: 'f-video', title: 'Монтаж: speed ramp в DaVinci', text: 'Найти урок и повторить на ролике про Black Flash.', tags: ['монтаж'] }),
    sv({ folderId: 'f-ideas', title: 'Трекер для всей группы', text: 'Общий дедлайн-календарь для однокурсников.', tags: ['проект'] }),
    sv({ title: 'Купить новые наушники до сессии', tags: [] }),
    sv({ folderId: 'f-music', title: 'Разучить: Merry-Go-Round of Life', text: 'Левая рука — вальсовый бас, сначала медленно.', tags: ['пианино'], favorite: true }),
    sv({ folderId: 'f-books', title: 'Atomic Habits — конспект', text: 'Система важнее цели. 1% в день.', tags: ['саморазвитие'] }),
    sv({ folderId: 'f-gym', title: 'Программа 5×5 на зиму', text: 'Присед, жим, тяга. +2,5 кг каждую неделю.', tags: ['сила'], favorite: true }),
    sv({ folderId: 'f-travel', title: 'Бурабай на выходных', text: 'Палатка, термос, взять пауэрбанк.', tags: ['лето'] }),
  ]);

  // ── Simple Domain ──
  await db.notes.bulkPut([
    { id: uid(), title: 'План на сессию', pinned: true, createdAt: ago(10), updatedAt: ago(1), body: '# План на сессию\n\n- [x] Сдать лабу №2\n- [ ] Лаба №3 — сортировки\n- [ ] Эссе по английскому\n- [ ] Повторить интегралы\n\n> Главное — не копить хвосты.' },
    { id: uid(), title: 'Идеи для канала', pinned: false, createdAt: ago(20), updatedAt: ago(3), body: '## Форматы\n\n- **Разбор техник** — 8–10 минут\n- Шортсы с тренировками\n- Стрим «учимся вместе»\n\n## Инструменты\n\n`DaVinci Resolve`, `OBS`' },
    { id: uid(), title: 'Подготовка к HSK 2', pinned: false, createdAt: ago(30), updatedAt: ago(6), body: '1. Лексика: 300 слов (Anki)\n2. Аудирование каждый день по 15 минут\n3. Пробный тест раз в неделю\n\n*Тоны учить сразу, а не «потом».*' },
  ]);

  // ── Binding Vow ──
  const v4 = { id: 'v-4', kind: 'restriction' as const, sacrifice: 'сериалов в будни', forWhat: 'закрытия хвостов', startDate: ago(75), endDate: ago(45), strictness: 3, status: 'fulfilled' as const, history: [{ at: ago(75), type: 'created' as const }, { at: ago(45), type: 'fulfilled' as const }], penalty: 'Неделя без кофе', conditions: 'Выходные — можно', goalId: 'g-y-uni', createdAt: ago(75) };
  await db.vows.bulkPut([
    { id: 'v-1', kind: 'vow', sacrifice: 'Roblox', forWhat: 'китайского языка', goalId: 'g-y-zh', startDate: at(-12, 10), endDate: at(18, 10), strictness: 3, status: 'active', history: [{ at: at(-12, 10), type: 'created' }], createdAt: at(-12, 10) },
    { id: 'v-2', kind: 'restriction', sacrifice: 'сладкого и фастфуда', forWhat: 'чистой массы и жима 100 кг', goalId: 'g-y-bench', startDate: at(-5, 8), endDate: at(25, 8), deadline: at(40, 20), penalty: '100 отжиманий + неделя без кофе', conditions: 'Кроме дня рождения. Фрукты и мёд можно.', strictness: 4, status: 'active', history: [{ at: at(-5, 8), type: 'created' }], parentVowId: 'v-1', createdAt: at(-5, 8) },
    { id: 'v-3', kind: 'vow', sacrifice: 'соцсети до 12:00', forWhat: 'утренней учёбы', goalId: 'g-y-uni', startDate: at(-20, 7), endDate: at(10, 7), strictness: 2, status: 'broken', history: [{ at: at(-20, 7), type: 'created' }, { at: at(-3, 9), type: 'broken', note: 'Залип в рилсах перед парой' }], createdAt: at(-20, 7) },
    v4,
  ]);
  addXp(`vow:v-4:${v4.startDate}`, vowPower(v4), 'Обет исполнен: ' + v4.sacrifice, 'vow', ago(45));
  addXp(`vowbreak:v-3:${at(-3, 9)}`, -25, 'Обет нарушен: соцсети до 12:00', 'vow', at(-3, 9));

  // ── Weekly Review прошлой недели ──
  const lastWeek = weekKey(subDays(now, 7));
  await db.reviews.put({ id: `W:${lastWeek}`, wins: 'Сдал лабу №2 на 10/10, 3 тренировки, новый PR в жиме.', fails: 'Сорвал обет про соцсети. Мало спал.', next: [{ id: uid(), text: 'Лаба №3 до четверга' }, { id: uid(), text: 'Ролик «Топ-10 техник»' }], done: true, at: ago(5) });
  addXp(`review:${lastWeek}`, 40, 'Weekly Review', 'review', ago(5));

  await db.xp.bulkPut(xp);
  await db.settings.put({ ...DEFAULT_SETTINGS(), seeded: true, campusMapId: mapId, targetBodyWeight: 78, trainingPlan: { '0': 'tp-push', '2': 'tp-pull', '4': 'tp-legs' } });
  // v3: задания отдельно, пары → события слоя My, YouTube-задачи → страницы-видео
  await upgradeToV3(db as never, { fresh: true });
  // v4: колонки статусов YouTube Technique + ещё несколько демо-видео для галереи
  await upgradeToV4(db as never);
  const demo: [string, string, number][] = [
    ['Влог: неделя сессии', 'vs-shoot', 6],
    ['Шортс: Black Flash в зале', 'vs-edit', 3],
    ['Разбор: Domain Expansion в учёбе', 'vs-script', 9],
  ];
  for (const [title, statusId, d] of demo) {
    const v = newVideo({ title, statusId, deadline: at(d, 18), priority: 2, tags: ['jjk'], order: Date.now() + d });
    v.pipeline = pipelineForColumn(v.pipeline, (await db.videoStatuses.get(statusId))!);
    await db.videos.put(v);
    await db.docs.put({ id: v.id, blocks: cloneBlocks(defaultVideoTemplate()), text: '', links: [], updatedAt: Date.now() });
  }
  await db.ideas.bulkPut([
    { id: uid(), title: 'Шортс: 3 ошибки в жиме лёжа', note: 'Снять в зале, крупно гриф.', createdAt: ago(2) },
    { id: uid(), title: 'Разбор: как я учу китайский по 20 минут', note: '', createdAt: ago(1) },
  ]);
}

/** Демо-упражнения и демо-планы. Обычные записи: их можно удалить, а вернуть — кнопкой в Settings. */
export function demoTraining(createdAt = Date.now()): { exercises: Exercise[]; templates: Template[] } {
  const ex: Omit<Exercise, 'createdAt'>[] = [
    { id: 'e-bench', name: DEMO_EXERCISE_NAMES['e-bench'], muscle: 'chest', targetWeight: 100, notes: 'Лопатки сведены и опущены, ноги в пол. Гриф — на низ груди, локти ~45°. Пауза касанием без отбива.' },
    { id: 'e-ohp', name: DEMO_EXERCISE_NAMES['e-ohp'], muscle: 'shoulders', targetWeight: 60, notes: 'Ягодицы и пресс напряжены, голова «в окно» после прохода грифа.' },
    { id: 'e-tri', name: DEMO_EXERCISE_NAMES['e-tri'], muscle: 'arms', targetWeight: 40, notes: '' },
    { id: 'e-dead', name: DEMO_EXERCISE_NAMES['e-dead'], muscle: 'back', targetWeight: 150, notes: 'Гриф над серединой стопы, спина нейтральная, «отталкиваю пол».' },
    { id: 'e-pull', name: DEMO_EXERCISE_NAMES['e-pull'], muscle: 'back', targetWeight: 20, notes: 'Полная амплитуда, без раскачки.' },
    { id: 'e-row', name: DEMO_EXERCISE_NAMES['e-row'], muscle: 'back', targetWeight: 80, notes: '' },
    { id: 'e-curl', name: DEMO_EXERCISE_NAMES['e-curl'], muscle: 'arms', targetWeight: 40, notes: '' },
    { id: 'e-squat', name: DEMO_EXERCISE_NAMES['e-squat'], muscle: 'legs', targetWeight: 130, notes: 'Колени по линии носков, глубина — бедро ниже параллели.' },
    { id: 'e-rdl', name: DEMO_EXERCISE_NAMES['e-rdl'], muscle: 'legs', targetWeight: 110, notes: '' },
    { id: 'e-lunge', name: DEMO_EXERCISE_NAMES['e-lunge'], muscle: 'legs', targetWeight: 26, notes: '' },
  ];
  const it = (tid: string, exerciseId: string, sets: number, reps: number) => ({ id: `${tid}-${exerciseId}`, exerciseId, sets, reps });
  return {
    exercises: ex.map((e) => ({ ...e, createdAt, isCustom: false, archived: false, kind: 'weight', unit: 'kg' })),
    templates: [
      { id: 'tp-push', name: 'Push', color: '#ff453a', icon: 'flame', order: 0, createdAt, items: [it('tp-push', 'e-bench', 4, 6), it('tp-push', 'e-ohp', 3, 8), it('tp-push', 'e-tri', 3, 12)] },
      { id: 'tp-pull', name: 'Pull', color: '#0a84ff', icon: 'bolt', order: 1, createdAt, items: [it('tp-pull', 'e-dead', 3, 5), it('tp-pull', 'e-pull', 4, 6), it('tp-pull', 'e-row', 3, 8), it('tp-pull', 'e-curl', 3, 10)] },
      { id: 'tp-legs', name: 'Legs', color: '#30d158', icon: 'dumbbell', order: 2, createdAt, items: [it('tp-legs', 'e-squat', 4, 6), it('tp-legs', 'e-rdl', 3, 8), it('tp-legs', 'e-lunge', 3, 10)] },
    ],
  };
}

/**
 * Первый запуск: демо загружается ровно один раз — в одной транзакции и с проверкой внутри неё.
 * Повторный вызов (StrictMode, hot reload, вторая вкладка) ничего не делает: настройки уже есть.
 * Если настроек нет, но в базе уже есть данные (например, настройки потерялись), демо НЕ грузится —
 * создаются только настройки, чтобы не перезаписать и не «воскресить» удалённое.
 */
export async function ensureSeeded() {
  await db.transaction('rw', db.tables, async () => {
    const s = await db.settings.get('app');
    if (s) {
      if (!s.seeded) await db.settings.put({ ...s, seeded: true });
      return;
    }
    const counts = await Promise.all(['exercises', 'workouts', 'curses', 'notes', 'templates'].map((t) => db.table(t).count()));
    if (counts.some((n) => n > 0)) {
      await db.settings.put({ ...DEFAULT_SETTINGS(), seeded: true });
      return;
    }
    await seedDemo();
  });
}

export async function wipeAll() {
  await Promise.all(db.tables.map((t) => t.clear()));
}

/** Чистый старт без демо: базовые техники и настройки. */
export async function initEmpty(lang: 'ru' | 'en' = 'ru') {
  const t = Date.now();
  await db.techniques.bulkPut([
    { id: 't-yt', name: 'YouTube', color: '#ff3d5a', icon: '▶', kind: 'youtube', stages: lang === 'ru' ? ['Идея', 'Сценарий', 'Съёмка', 'Монтаж', 'Публикация'] : ['Idea', 'Script', 'Shoot', 'Edit', 'Publish'], order: 0, createdAt: t },
    { id: 't-uni', name: 'University', color: '#5b8cff', icon: '学', kind: 'university', order: 1, createdAt: t },
    { id: 't-piano', name: 'Piano', color: '#c9a2ff', icon: '♪', kind: 'piano', trackMinutes: true, repertoire: true, order: 2, createdAt: t },
    { id: 't-pers', name: 'Personal', color: '#f2c14e', icon: '己', kind: 'personal', order: 3, createdAt: t },
  ]);
  await db.routines.bulkPut([
    { id: 'r-morning', slot: 'morning', name: lang === 'ru' ? 'Утренний уход' : 'Morning care', steps: [] },
    { id: 'r-evening', slot: 'evening', name: lang === 'ru' ? 'Вечерний уход' : 'Evening care', steps: [] },
  ]);
  await db.settings.put({ ...DEFAULT_SETTINGS(), seeded: true, lang });
}
