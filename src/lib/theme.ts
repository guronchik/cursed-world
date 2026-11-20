// v2: разделы, акцентные градиенты, контраст, обои.
import type { CSSProperties } from 'react';
import type { Settings } from '../db/schema';
import { L } from './runtime';

export type SectionId = 'hq' | 'curses' | 'calendar' | 'tools' | 'taijutsu' | 'energy' | 'vows' | 'review' | 'settings';

export const SECTIONS: SectionId[] = ['hq', 'curses', 'calendar', 'tools', 'taijutsu', 'energy', 'vows', 'review', 'settings'];

export const sectionOf = (part?: string): SectionId => (part && (SECTIONS as string[]).includes(part) ? (part as SectionId) : 'hq');

export const SECTION_NAME: Record<SectionId, string> = {
  hq: 'Jujutsu HQ',
  curses: 'Curses',
  calendar: 'Calendar',
  tools: 'Cursed Tools',
  taijutsu: 'Taijutsu',
  energy: 'Cursed Energy',
  vows: 'Binding Vow',
  review: 'Weekly Review',
  settings: 'Settings',
};

export const DEFAULT_ACCENTS: Record<SectionId, [string, string]> = {
  hq: ['#5ac8fa', '#0a84ff'],
  curses: ['#ff2d55', '#ff9f0a'],
  calendar: ['#64d2ff', '#5e5ce6'],
  tools: ['#0a84ff', '#30d5c8'],
  taijutsu: ['#ff9f0a', '#ff3b30'],
  energy: ['#bf5af2', '#ff375f'],
  vows: ['#ffd60a', '#ff9500'],
  review: ['#5e5ce6', '#bf5af2'],
  settings: ['#98989f', '#636366'],
};

export const PRESETS: { id: string; name: string; a: string; b: string }[] = [
  { id: 'ocean', name: 'Ocean', a: '#5ac8fa', b: '#0a84ff' },
  { id: 'ember', name: 'Ember', a: '#ff2d55', b: '#ff9f0a' },
  { id: 'lagoon', name: 'Lagoon', a: '#0a84ff', b: '#30d5c8' },
  { id: 'sunset', name: 'Sunset', a: '#ff9f0a', b: '#ff3b30' },
  { id: 'nebula', name: 'Nebula', a: '#bf5af2', b: '#ff375f' },
  { id: 'gold', name: 'Gold', a: '#ffd60a', b: '#ff9500' },
  { id: 'mint', name: 'Mint', a: '#63e6be', b: '#30d158' },
  { id: 'rose', name: 'Rose', a: '#ff8fab', b: '#ff2d55' },
  { id: 'indigo', name: 'Indigo', a: '#64d2ff', b: '#5e5ce6' },
  { id: 'lime', name: 'Lime', a: '#d4fc79', b: '#34c759' },
  { id: 'steel', name: 'Steel', a: '#98989f', b: '#636366' },
  { id: 'cursed', name: 'Cursed', a: '#9d7bff', b: '#4d7cff' },
];

// ───── цвет и контраст ─────
const hexRgb = (h: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(h.trim());
  const n = m ? parseInt(m[1], 16) : 0x888888;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgbHex = (r: number[]) => '#' + r.map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('');
export function luminance(h: string) {
  const [r, g, b] = hexRgb(h).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const mix = (a: string, b: string, t: number) => {
  const A = hexRgb(a);
  const B = hexRgb(b);
  return rgbHex(A.map((v, i) => v + (B[i] - v) * t));
};

/** Цвет текста-акцента с контрастом не ниже AA (4.5:1) на фоне темы. */
export function readableOn(color: string, dark: boolean) {
  const bg = dark ? '#1c1c1e' : '#f2f2f7';
  const to = dark ? '#ffffff' : '#000000';
  let c = color;
  for (let i = 1; i <= 10 && contrast(c, bg) < 4.5; i++) c = mix(color, to, i * 0.1);
  return c;
}

export function accentOf(s: Pick<Settings, 'accents'>, section: SectionId): [string, string] {
  return (s.accents?.[section] as [string, string]) || DEFAULT_ACCENTS[section];
}

/** CSS-переменные раздела: --accent-1/--accent-2, читаемый текст акцента и цвет текста на градиенте. */
export function accentVars(a: string, b: string, dark: boolean): CSSProperties {
  const onBg = (luminance(a) + luminance(b)) / 2 > 0.42 ? '#111114' : '#ffffff';
  return {
    ['--accent-1' as string]: a,
    ['--accent-2' as string]: b,
    ['--accent-text' as string]: readableOn(a, dark),
    ['--on-accent' as string]: onBg,
    ['--accent-grad' as string]: `linear-gradient(135deg, ${a}, ${b})`,
  };
}

// ───── обои ─────
const svg = (s: string) => `url("data:image/svg+xml;utf8,${encodeURIComponent(s)}")`;

const inkSvg = svg(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1600 1000' preserveAspectRatio='xMidYMid slice'>
<filter id='f'><feTurbulence type='fractalNoise' baseFrequency='.004 .009' numOctaves='5' seed='7'/><feColorMatrix values='0 0 0 0 .08  0 0 0 0 .2  0 0 0 0 .48  0 0 0 1.6 -.55'/></filter>
<filter id='g'><feTurbulence type='turbulence' baseFrequency='.012' numOctaves='3' seed='3'/><feColorMatrix values='0 0 0 0 .3  0 0 0 0 .5  0 0 0 0 .9  0 0 0 .9 -.45'/></filter>
<rect width='100%' height='100%' fill='#050a18'/><rect width='100%' height='100%' filter='url(#f)'/><rect width='100%' height='100%' filter='url(#g)' opacity='.35'/></svg>`);

const citySvg = svg(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1600 1000' preserveAspectRatio='xMidYMax slice'>
<defs><linearGradient id='s' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#070b1f'/><stop offset='.6' stop-color='#1b1f4a'/><stop offset='1' stop-color='#4a2259'/></linearGradient>
<radialGradient id='m' cx='.78' cy='.2' r='.12'><stop offset='0' stop-color='#fff6e0'/><stop offset='.4' stop-color='#ffe3b0' stop-opacity='.5'/><stop offset='1' stop-color='#ffe3b0' stop-opacity='0'/></radialGradient></defs>
<rect width='1600' height='1000' fill='url(#s)'/><rect width='1600' height='1000' fill='url(#m)'/>
<path fill='#0b0d1f' d='M0 1000V700h60v-90h40v60h50V560h70v120h30V620h60v-80h20v-40h30v40h20v160h60V600h80v100h40V520h30v-30h40v30h30v190h50V640h70v-60h40v120h30V560h20v-50h40v50h20v190h60V620h70v80h30V540h80v170h40V600h60v100h50V580h40v-40h30v40h30v160h40V640h60v60h40V520h70v180h40v300z'/>
<g fill='#ffd88a' opacity='.55'>${Array.from({ length: 70 }, (_, i) => `<rect x='${(i * 137) % 1580}' y='${640 + ((i * 53) % 300)}' width='4' height='6'/>`).join('')}</g></svg>`);

const wavesSvg = svg(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1600 1000' preserveAspectRatio='none'>
<defs><linearGradient id='a' x1='0' x2='1'><stop offset='0' stop-color='#2b1055'/><stop offset='1' stop-color='#7597de'/></linearGradient></defs>
<rect width='1600' height='1000' fill='#0b0b1a'/>
<path d='M0 520C300 420 500 660 800 560S1300 380 1600 470V1000H0z' fill='url(#a)' opacity='.55'/>
<path d='M0 640C350 560 600 760 900 660S1350 540 1600 620V1000H0z' fill='#5b2a86' opacity='.55'/>
<path d='M0 780C300 720 650 880 1000 790S1400 720 1600 760V1000H0z' fill='#0a84ff' opacity='.35'/></svg>`);

const domainSvg = svg(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1600 1000' preserveAspectRatio='xMidYMid slice'>
<rect width='1600' height='1000' fill='#09060f'/>${Array.from({ length: 14 }, (_, i) => `<circle cx='800' cy='520' r='${60 + i * 52}' fill='none' stroke='${i % 2 ? '#ff375f' : '#7c5cff'}' stroke-opacity='${0.32 - i * 0.02}' stroke-width='${i % 3 ? 1 : 2}' stroke-dasharray='${i % 2 ? '3 9' : '0'}'/>`).join('')}</svg>`);

const dots = (bg: string, dot: string) => `radial-gradient(${dot} 1px, transparent 1.2px) 0 0/22px 22px, ${bg}`;

export const WALLPAPERS: { id: string; name: () => string; dark: boolean; css: string }[] = [
  { id: 'ink', name: () => L('Чернила Сибуи', 'Shibuya Ink'), dark: true, css: `${inkSvg} center/cover, #050a18` },
  { id: 'aurora', name: () => 'Aurora', dark: true, css: 'radial-gradient(60% 50% at 20% 20%, #3b1f8f 0%, transparent 70%), radial-gradient(50% 60% at 85% 30%, #0b6e8f 0%, transparent 70%), radial-gradient(60% 50% at 60% 100%, #6b1d5c 0%, transparent 70%), #07060f' },
  { id: 'sequoia', name: () => 'Sequoia', dark: true, css: 'radial-gradient(70% 60% at 10% 90%, #b3264a 0%, transparent 65%), radial-gradient(70% 70% at 90% 10%, #1e3a8a 0%, transparent 65%), radial-gradient(50% 50% at 50% 50%, #3b0f45 0%, transparent 70%), #0c0718' },
  { id: 'city', name: () => L('Ночной город', 'Night city'), dark: true, css: `${citySvg} center bottom/cover, #070b1f` },
  { id: 'waves', name: () => L('Волны', 'Waves'), dark: true, css: `${wavesSvg} center/cover, #0b0b1a` },
  { id: 'aura', name: () => L('Проклятая аура', 'Cursed aura'), dark: true, css: 'radial-gradient(40% 40% at 50% 45%, rgba(255,40,80,.55) 0%, transparent 70%), radial-gradient(70% 70% at 50% 50%, rgba(124,92,255,.35) 0%, transparent 75%), #060409' },
  { id: 'domain', name: () => L('Домен', 'Domain'), dark: true, css: `${domainSvg} center/cover, #09060f` },
  { id: 'haze', name: () => L('Тёмная дымка', 'Dark haze'), dark: true, css: 'radial-gradient(80% 60% at 30% 10%, #1f2937 0%, transparent 70%), radial-gradient(60% 60% at 80% 90%, #111827 0%, transparent 70%), linear-gradient(180deg, #0b0f17, #05070c)' },
  { id: 'dots-dark', name: () => L('Точки (тёмные)', 'Dots (dark)'), dark: true, css: dots('#0d0d12', 'rgba(255,255,255,.09)') },
  { id: 'dots-light', name: () => L('Точки (светлые)', 'Dots (light)'), dark: false, css: dots('#f5f5f7', 'rgba(0,0,0,.09)') },
  { id: 'glacier', name: () => 'Glacier', dark: false, css: 'radial-gradient(70% 60% at 15% 15%, #cfe8ff 0%, transparent 70%), radial-gradient(60% 60% at 90% 30%, #e9d8ff 0%, transparent 70%), radial-gradient(60% 50% at 50% 100%, #d7fff1 0%, transparent 70%), #f3f6fb' },
  { id: 'dawn', name: () => L('Рассвет', 'Dawn'), dark: false, css: 'radial-gradient(70% 60% at 80% 10%, #ffd6c2 0%, transparent 70%), radial-gradient(70% 60% at 10% 80%, #ffe9a8 0%, transparent 70%), radial-gradient(60% 60% at 60% 60%, #ffc4dd 0%, transparent 70%), #fff7f2' },
];

/** Оттенок для режима Dynamic: утро тёплое, день нейтральный, вечер фиолетовый, ночь глубокая. */
export function dynamicTint(hour = new Date().getHours()) {
  if (hour >= 5 && hour < 10) return { hue: -20, color: 'rgba(255,170,80,.14)' };
  if (hour >= 10 && hour < 17) return { hue: 0, color: 'rgba(120,180,255,.08)' };
  if (hour >= 17 && hour < 21) return { hue: 25, color: 'rgba(200,90,255,.14)' };
  return { hue: 40, color: 'rgba(10,20,80,.25)' };
}
