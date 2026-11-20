import { MotionConfig } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { FXLayer } from './components/FX';
import { PinGate } from './components/PinGate';
import { Seal } from './components/Seal';
import { Shell } from './components/Shell';
import { Cursor } from './components/Cursor';
import { db, DEFAULT_SETTINGS, patchSettings, type AnimLevel, type Settings } from './db/schema';
import { markBoot } from './lib/boot';
import { toast } from './lib/fx';
import { effectiveLevel, enableSmoothScroll, setFpsDropHandler, setMotionState } from './lib/motion';
import { accentOf } from './lib/theme';
import { ensureSeeded } from './db/seed';
import { setSemester } from './lib/calendar';
import { MigrationReview } from './components/MigrationReview';
import { startBackground } from './lib/background';
import { startAutoSync } from './lib/sync';
import { useLive, useMedia } from './lib/hooks';
import { rt } from './lib/runtime';
import { SettingsCtx } from './lib/settings';

let bootPromise: Promise<void> | null = null;
function boot() {
  bootPromise ??= (async () => {
    await db.open();
    await ensureSeeded();
    markBoot('db');
  })();
  return bootPromise;
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const raw = useLive(() => (ready ? db.settings.get('app') : undefined), [ready]);
  // новые поля v2 получают значения по умолчанию, даже если миграция ещё не дописала их
  const settings = useMemo<Settings | undefined>(() => {
    if (!raw) return undefined;
    const d = DEFAULT_SETTINGS();
    const s = { ...d, ...raw, wallpaper: { ...d.wallpaper, ...(raw.wallpaper || {}) }, semester: { ...d.semester, ...(raw.semester || {}) } };
    setSemester(s.semester); // до рендера: повторы занятий учитывают семестр и каникулы
    return s;
  }, [raw]);
  const sysReduce = useMedia('(prefers-reduced-motion: reduce)');
  const sysDark = useMedia('(prefers-color-scheme: dark)');
  const touch = useMedia('(pointer: coarse)');
  const level: AnimLevel = settings ? effectiveLevel(settings.animLevel || 'cinematic', sysReduce) : 'cinematic';
  const reduce = level === 'off' || level === 'minimal';
  const blur = settings ? settings.blurFx !== false && !settings.perfMode : true;
  const dark = settings ? (settings.theme === 'auto' ? sysDark : settings.theme !== 'light') : true;

  useEffect(() => {
    boot()
      .then(() => {
        setReady(true);
        startBackground();
        startAutoSync();
      })
      .catch((e) => setErr(String(e?.message || e)));
  }, []);

  useEffect(() => {
    const c = document.documentElement.classList;
    c.toggle('reduce', reduce);
    c.toggle('light', !dark);
    c.toggle('jjkfx', !!settings?.jjkFx);
    c.toggle('perf', !blur);
    c.toggle('touch', touch);
    for (const l of ['cinematic', 'smooth', 'minimal', 'off']) c.toggle(`anim-${l}`, level === l);
    setMotionState({ level, blur, touch, reduce: sysReduce });
    enableSmoothScroll(!touch && (level === 'cinematic' || level === 'smooth'));
    // для прелоадера следующего запуска (он показывается до загрузки базы)
    try {
      localStorage.setItem('cw-boot', JSON.stringify({ dark, level, accent: settings ? accentOf(settings, 'hq') : null }));
    } catch {
      /* приватный режим */
    }
    c.toggle('font-all', settings?.fontMode === 'all');
    if (settings) document.documentElement.lang = settings.lang;
  }, [reduce, dark, settings, level, blur, touch, sysReduce]);

  // FPS-сторож: при просадке уровень снижается на ступень (вернуть можно в Settings → Анимации)
  useEffect(() => {
    setFpsDropHandler((to) => {
      void db.settings.get('app').then((s0) => {
        if (!s0) return;
        void patchSettings({ animLevel: to, animAutoFrom: s0.animAutoFrom || s0.animLevel });
        toast(rt.lang === 'ru' ? 'Включён облегчённый режим анимаций' : 'Lighter animation mode enabled');
      });
    });
  }, []);

  if (err)
    return (
      <div className="min-h-dvh grid place-items-center p-6 text-center">
        <div>
          <div className="h-display text-2xl text-blood">Barrier failure</div>
          <p className="text-muted mt-2 text-sm max-w-sm">{err}</p>
          <p className="text-dim mt-2 text-xs">IndexedDB недоступна (приватный режим браузера?).</p>
        </div>
      </div>
    );

  if (!settings)
    return (
      <div className="min-h-dvh grid place-items-center">
        <div className="flex flex-col items-center gap-3">
          <Seal text="呪" size={72} />
          <div className="label">Opening domain…</div>
        </div>
      </div>
    );

  rt.lang = settings.lang;
  rt.sound = settings.sound;
  rt.reduce = reduce;
  rt.sound = settings.sound;

  return (
    <SettingsCtx.Provider value={settings}>
      <MotionConfig reducedMotion={reduce ? 'always' : 'never'}>
        <PinGate>
          <Shell key={settings.lang} />
          <MigrationReview />
        </PinGate>
        <FXLayer />
        {level !== 'off' && !sysReduce && settings.cursor && !touch && <Cursor hideSystem={settings.cursorSystem !== 'show'} />}
      </MotionConfig>
    </SettingsCtx.Provider>
  );
}
