// v2 каркас: macOS-sidebar или Dock на ПК; iOS tab bar + More на телефоне; large title, акцент раздела, обои.
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { db } from '../db/schema';
import { useLive } from '../lib/hooks';
import { go, useRoute } from '../lib/router';
import { L } from '../lib/runtime';
import { useAccent, useDark, useSettings } from '../lib/settings';
import { accentOf, accentVars, sectionOf, SECTION_NAME, type SectionId } from '../lib/theme';
import { rankOf, totalXp } from '../lib/xp';
import { CommandPalette } from './CommandPalette';
import { CurseEditorHost } from './CurseEditor';
import { Icon } from './Icon';
import { MOBILE_TABS, NAV, type NavItem } from './nav';
import { Seal } from './Seal';
import { Modal, Progress } from './ui';
import { Wallpaper } from './Wallpaper';
import { PageStage } from './PageStage';
import { TopBar } from './TopBar';
import { EntityHost } from './EntityHost';
import { DeskLayer } from './DeskCard';

// загрузчики страниц: те же промисы используются для предзагрузки под занавесом перехода
const LOADERS: Record<string, () => Promise<unknown>> = {
  hq: () => import('../pages/home/Home'),
  curses: () => import('../pages/Curses'),
  calendar: () => import('../pages/CalendarPage'),
  tools: () => import('../pages/tools'),
  taijutsu: () => import('../pages/taijutsu'),
  energy: () => import('../pages/energy'),
  vows: () => import('../pages/Vows'),
  review: () => import('../pages/WeeklyReview'),
  settings: () => import('../pages/Settings'),
};
const Home = lazy(() => import('../pages/home/Home').then((m) => ({ default: m.Home })));
const CursesPage = lazy(() => import('../pages/Curses').then((m) => ({ default: m.CursesPage })));
const CalendarPage = lazy(() => import('../pages/CalendarPage').then((m) => ({ default: m.CalendarPage })));
const Tools = lazy(() => import('../pages/tools').then((m) => ({ default: m.Tools })));
const Taijutsu = lazy(() => import('../pages/taijutsu').then((m) => ({ default: m.Taijutsu })));
const Energy = lazy(() => import('../pages/energy').then((m) => ({ default: m.Energy })));
const VowsPage = lazy(() => import('../pages/Vows').then((m) => ({ default: m.VowsPage })));
const WeeklyReview = lazy(() => import('../pages/WeeklyReview').then((m) => ({ default: m.WeeklyReview })));
const SettingsPage = lazy(() => import('../pages/Settings').then((m) => ({ default: m.SettingsPage })));

function Page({ section }: { section: string }) {
  switch (section) {
    case 'curses':
      return <CursesPage />;
    case 'calendar':
      return <CalendarPage />;
    case 'tools':
      return <Tools />;
    case 'taijutsu':
      return <Taijutsu />;
    case 'energy':
      return <Energy />;
    case 'vows':
      return <VowsPage />;
    case 'review':
      return <WeeklyReview />;
    case 'settings':
      return <SettingsPage />;
    default:
      return <Home />;
  }
}

function useNavAccent() {
  const s = useSettings();
  const dark = useDark();
  return (sec: SectionId): CSSProperties => {
    const [a, b] = accentOf(s, sec);
    return accentVars(a, b, dark);
  };
}

export function RankChip({ full }: { full?: boolean }) {
  const xp = useLive(totalXp, []) ?? 0;
  const r = rankOf(xp);
  if (!full)
    return (
      <button className="chip !min-h-[32px]" onClick={() => go('/')}>
        <span className="kanji text-acc text-xs">{r.kanji}</span>
        <span className="mono text-xs">{xp}</span>
      </button>
    );
  return (
    <div className="rounded-2xl p-3 bg-panel-2">
      <div className="flex items-center gap-2">
        <span className="kanji text-acc text-base whitespace-nowrap shrink-0">{r.kanji}</span>
        <div className="min-w-0">
          <div className="text-[13px] font-semibold truncate">{r.name}</div>
          <div className="text-[11px] text-dim mono truncate">
            {xp} XP{r.next ? ` · ${r.toNext} → ${r.next}` : ''}
          </div>
        </div>
      </div>
      <Progress value={r.progress * 100} className="mt-2" />
    </div>
  );
}

function SidebarItem({ n, active, style, badge }: { n: NavItem; active: boolean; style: CSSProperties; badge?: boolean }) {
  return (
    <button
      onClick={() => go(n.path)}
      style={style}
      className={`relative w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-left transition-colors ${active ? 'bg-[color-mix(in_srgb,var(--accent-1)_18%,transparent)]' : 'hover:bg-panel-2'}`}
    >
      <span className="app-icon w-8 h-8 !rounded-[9px] shrink-0">
        <Icon name={n.icon} size={16} stroke={2} />
      </span>
      <span className="flex-1 min-w-0">
        <span className={`block text-[13.5px] leading-tight ${active ? 'font-semibold' : ''}`} style={{ fontFamily: 'var(--font-head)' }}>
          {n.label}
        </span>
        <span className="block text-[11px] text-dim truncate">{n.ru}</span>
      </span>
      {badge && <span className="w-2 h-2 rounded-full bg-blood shrink-0" />}
    </button>
  );
}

/** Dock как в macOS: иконки увеличиваются рядом с курсором. */
function Dock({ items, section, onSearch, navAccent }: { items: NavItem[]; section: SectionId; onSearch: () => void; navAccent: (s: SectionId) => CSSProperties }) {
  const [mx, setMx] = useState<number | null>(null);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const scale = (i: number) => {
    const el = refs.current[i];
    if (mx === null || !el) return 1;
    const r = el.getBoundingClientRect();
    const d = Math.abs(mx - (r.left + r.width / 2));
    return 1 + Math.max(0, 1 - d / 140) * 0.55;
  };
  return (
    <div className="hidden lg:flex fixed bottom-3 left-1/2 -translate-x-1/2 z-40">
      <div className="panel !rounded-[22px] flex items-end gap-2 px-3 pt-2 pb-2" onMouseMove={(e) => setMx(e.clientX)} onMouseLeave={() => setMx(null)}>
        {items.map((n, i) => {
          const k = scale(i);
          return (
            <button key={n.id} ref={(el) => void (refs.current[i] = el)} onClick={() => go(n.path)} className="relative flex flex-col items-center group" title={n.label} style={navAccent(n.section)}>
              <span className="app-icon transition-[width,height] duration-100" style={{ width: 44 * k, height: 44 * k }}>
                <Icon name={n.icon} size={20 * Math.min(k, 1.3)} stroke={2} />
              </span>
              <span className={`w-1 h-1 rounded-full mt-1 ${section === n.section ? 'bg-[var(--ink)]' : 'bg-transparent'}`} />
              <span className="absolute -top-8 px-2 py-0.5 rounded-md text-[11px] bg-[var(--panel-solid)] opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none">{n.label}</span>
            </button>
          );
        })}
        <span className="w-px self-stretch bg-line mx-1" />
        <button onClick={onSearch} className="flex flex-col items-center" title="Spotlight">
          <span className="app-icon w-11 h-11" style={{ background: 'var(--panel-2)', color: 'var(--ink)' }}>
            <Icon name="search" size={20} />
          </span>
          <span className="w-1 h-1 mt-1" />
        </button>
      </div>
    </div>
  );
}

export function Shell() {
  const { parts } = useRoute();
  const s = useSettings();
  const routeId = parts[0] || '';
  const section = sectionOf(routeId || 'hq');
  const accent = useAccent(section);
  const navAccent = useNavAccent();
  const dark = useDark();
  const [palette, setPalette] = useState<null | 'search' | 'add'>(null);
  const [more, setMore] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const nav = NAV();
  const overdue = useLive(async () => (await db.curses.where('status').equals('active').toArray()).filter((c) => c.due < Date.now()).length, []) ?? 0;
  const dockMode = s.dock;

  // акцент раздела — на корень документа, чтобы его видели и всплывающие окна
  useLayoutEffect(() => {
    const st = document.documentElement.style;
    for (const [k, v] of Object.entries(accent)) st.setProperty(k, String(v));
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#000000' : '#f2f2f7');
  }, [accent, dark]);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((p) => (p ? null : 'search'));
      }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);

  useEffect(() => {
    setMore(false);
    window.scrollTo({ top: 0 });
  }, [routeId]);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 46);
    fn();
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  const tabs = MOBILE_TABS.map((id) => nav.find((n) => n.id === id)!);
  const inMore = !MOBILE_TABS.includes(routeId);

  return (
    <div className={`min-h-dvh ${dockMode ? '' : 'lg:pl-[284px]'}`}>
      <Wallpaper section={section} />

      {/* ПК: macOS sidebar */}
      {!dockMode && (
        <aside className="hidden lg:flex fixed top-3 bottom-3 left-3 w-[260px] flex-col panel !rounded-[22px] z-40">
          <button className="flex items-center gap-3 px-4 pt-4 pb-3 text-left" onClick={() => go('/')}>
            <Seal text="呪" size={38} />
            <div>
              <div className="text-[17px] leading-none" style={{ fontFamily: 'var(--font-head)' }}>
                CURSED WORLD
              </div>
              <div className="label mt-1">life · os</div>
            </div>
          </button>
          <button className="mx-3 mb-2 inp !min-h-[36px] !py-1.5 flex items-center gap-2 text-left text-dim" onClick={() => setPalette('search')}>
            <Icon name="search" size={15} />
            <span className="flex-1 text-sm">{L('Поиск', 'Search')}</span>
            <span className="mono text-[10px] px-1.5 rounded bg-panel-2">⌘K</span>
          </button>
          <nav className="flex-1 overflow-y-auto px-2 space-y-0.5">
            {nav.map((n) => (
              <SidebarItem key={n.id} n={n} active={section === n.section} style={navAccent(n.section)} badge={n.id === 'curses' && overdue > 0} />
            ))}
          </nav>
          <div className="p-3 space-y-2">
            <RankChip full />
            <button className="btn w-full" onClick={() => setPalette('add')}>
              <Icon name="plus" size={16} /> {L('Быстро добавить', 'Quick add')}
            </button>
          </div>
        </aside>
      )}
      {dockMode && <Dock items={nav} section={section} onSearch={() => setPalette('search')} navAccent={navAccent} />}

      {/* Телефон: навбар с маленьким заголовком при скролле */}
      <header
        className={`lg:hidden sticky top-0 z-40 flex items-center gap-1 px-3 transition-[background,box-shadow] duration-200 ${scrolled ? 'sheet !shadow-none border-b border-line' : ''}`}
        style={{ paddingTop: 'max(0.4rem, env(safe-area-inset-top))', paddingBottom: '0.4rem' }}
      >
        <div className={`flex-1 min-w-0 text-[17px] font-semibold text-center pl-20 transition-opacity duration-200 ${scrolled ? 'opacity-100' : 'opacity-0'}`} style={{ fontFamily: 'var(--font-head)' }}>
          {SECTION_NAME[section]}
        </div>
        <div className="flex items-center">
          <RankChip />
          <button className="ibtn" onClick={() => setPalette('search')} aria-label={L('Поиск', 'Search')}>
            <Icon name="search" size={20} />
          </button>
          <button className="ibtn text-acc" onClick={() => setPalette('add')} aria-label={L('Добавить', 'Add')}>
            <Icon name="plus" size={22} stroke={2.2} />
          </button>
        </div>
      </header>

      <main className={`relative px-4 sm:px-6 lg:px-8 pt-1 lg:pt-12 max-w-[1440px] mx-auto ${dockMode ? 'pb-36' : 'pb-32 lg:pb-12'}`}>
        <TopBar />
        <PageStage
          routeId={routeId}
          section={section}
          title={(sec) => SECTION_NAME[sec as SectionId] || 'CURSED WORLD'}
          accent={(sec) => accentOf(s, sec as SectionId)[0]}
          preload={(sec) => LOADERS[sec]?.()}
        >
          {(sec) => (
            <Suspense fallback={<div className="h-[60vh] grid place-items-center" data-suspense><Seal text="呪" size={56} /></div>}>
              <Page section={sec} />
            </Suspense>
          )}
        </PageStage>
      </main>

      {/* Телефон: iOS tab bar */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 sheet !shadow-none border-t border-line safe-bottom">
        <div className="grid grid-cols-6">
          {tabs.map((n) => {
            const on = section === n.section;
            return (
              <button key={n.id} style={navAccent(n.section)} className="relative flex flex-col items-center justify-center gap-0.5 min-h-[52px] pt-1.5" onClick={() => go(n.path)} aria-current={on ? 'page' : undefined}>
                <Icon name={n.icon} size={23} stroke={on ? 2.2 : 1.8} style={{ color: on ? 'var(--accent-text)' : 'var(--muted)' }} />
                <span className="text-[10px] font-medium" style={{ color: on ? 'var(--accent-text)' : 'var(--muted)' }}>
                  {n.short}
                </span>
                {n.id === 'curses' && overdue > 0 && <span className="absolute top-1 right-[28%] min-w-[16px] h-4 px-1 rounded-full bg-blood text-white text-[10px] grid place-items-center">{overdue}</span>}
              </button>
            );
          })}
          <button className="flex flex-col items-center justify-center gap-0.5 min-h-[52px] pt-1.5" onClick={() => setMore(true)}>
            <Icon name="more" size={23} style={{ color: inMore ? 'var(--accent-text)' : 'var(--muted)' }} />
            <span className="text-[10px] font-medium" style={{ color: inMore ? 'var(--accent-text)' : 'var(--muted)' }}>
              More
            </span>
          </button>
        </div>
      </nav>

      <Modal open={more} onClose={() => setMore(false)} title="More">
        <div className="grid grid-cols-3 gap-y-5 gap-x-2 py-2">
          {nav.map((n) => (
            <button key={n.id} onClick={() => go(n.path)} className="flex flex-col items-center gap-2" style={navAccent(n.section)}>
              <span className="app-icon w-16 h-16">
                <Icon name={n.icon} size={28} stroke={2} />
              </span>
              <span className={`pill-label !text-[12px] ${section === n.section ? 'chip-on' : ''}`}>{n.short}</span>
            </button>
          ))}
        </div>
        <div className="mt-4">
          <RankChip full />
        </div>
      </Modal>

      <CommandPalette mode={palette} onClose={() => setPalette(null)} />
      <EntityHost />
      <DeskLayer />
      <CurseEditorHost />
    </div>
  );
}
