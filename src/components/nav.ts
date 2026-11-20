import { L } from '../lib/runtime';
import type { SectionId } from '../lib/theme';

export interface NavItem {
  id: string;
  section: SectionId;
  path: string;
  label: string;
  short: string;
  ru: string;
  kanji: string;
  icon: string;
}

export const NAV = (): NavItem[] => [
  { id: '', section: 'hq', path: '/', label: 'Jujutsu HQ', short: 'Home', ru: L('Главная', 'Home'), kanji: '本部', icon: 'home' },
  { id: 'curses', section: 'curses', path: '/curses', label: 'Curses', short: 'Curses', ru: L('Дедлайны', 'Deadlines'), kanji: '呪霊', icon: 'skull' },
  { id: 'tools', section: 'tools', path: '/tools/calendar', label: 'Cursed Tools', short: 'Tools', ru: L('Универ', 'University'), kanji: '呪具', icon: 'grad' },
  { id: 'taijutsu', section: 'taijutsu', path: '/taijutsu/fist', label: 'Taijutsu', short: 'Taijutsu', ru: L('Уход и зал', 'Care & gym'), kanji: '体術', icon: 'dumbbell' },
  { id: 'energy', section: 'energy', path: '/energy/technique', label: 'Cursed Energy', short: 'Energy', ru: L('Задачи, цели, заметки', 'Tasks, goals, notes'), kanji: '呪力', icon: 'flame' },
  { id: 'calendar', section: 'calendar', path: '/calendar', label: 'Calendar', short: 'Calendar', ru: L('Единый календарь', 'Unified calendar'), kanji: '暦', icon: 'calendar' },
  { id: 'vows', section: 'vows', path: '/vows', label: 'Binding Vow', short: 'Vows', ru: L('Обеты', 'Vows'), kanji: '縛り', icon: 'chain' },
  { id: 'review', section: 'review', path: '/review', label: 'Weekly Review', short: 'Review', ru: L('Итоги недели', 'Week in review'), kanji: '週報', icon: 'chart' },
  { id: 'settings', section: 'settings', path: '/settings', label: 'Settings', short: 'Settings', ru: L('Настройки', 'Settings'), kanji: '設定', icon: 'sliders' },
];

export const MOBILE_TABS = ['', 'curses', 'tools', 'taijutsu', 'energy'];
