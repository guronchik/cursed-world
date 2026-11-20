import { createContext, useContext, useMemo } from 'react';
import { DEFAULT_SETTINGS, type Settings } from '../db/schema';
import { useMedia } from './hooks';
import { accentOf, accentVars, type SectionId } from './theme';

export const SettingsCtx = createContext<Settings>(DEFAULT_SETTINGS());
export const useSettings = () => useContext(SettingsCtx);

/** Тёмная ли сейчас тема (с учётом режима «авто»). */
export function useDark() {
  const s = useSettings();
  const sys = useMedia('(prefers-color-scheme: dark)');
  return s.theme === 'auto' ? sys : s.theme !== 'light';
}

/** CSS-переменные акцента раздела. */
export function useAccent(section: SectionId) {
  const s = useSettings();
  const dark = useDark();
  const [a, b] = accentOf(s, section);
  return useMemo(() => accentVars(a, b, dark), [a, b, dark]);
}
