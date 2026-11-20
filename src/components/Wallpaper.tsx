// Фон-обои: встроенные (код), свои фото из IndexedDB, файлы из /public/wallpapers. Blur, dim, режим Dynamic.
import { useEffect, useState } from 'react';
import { useBlobUrl } from '../lib/media';
import { markBoot } from '../lib/boot';
import { useDark, useSettings } from '../lib/settings';
import { dynamicTint, WALLPAPERS, type SectionId } from '../lib/theme';

export function wallpaperCss(ref: string, dark: boolean, blobUrl?: string) {
  if (ref === 'builtin:auto') ref = dark ? 'builtin:ink' : 'builtin:dots-light';
  if (ref.startsWith('builtin:')) return WALLPAPERS.find((w) => w.id === ref.slice(8))?.css || WALLPAPERS[0].css;
  if (ref.startsWith('file:')) return `url("${import.meta.env.BASE_URL}wallpapers/${encodeURIComponent(ref.slice(5))}") center/cover no-repeat`;
  if (ref.startsWith('blob:') && blobUrl) return `url("${blobUrl}") center/cover no-repeat`;
  return dark ? '#000' : '#f2f2f7';
}

export function Wallpaper({ section }: { section: SectionId }) {
  const s = useSettings();
  const dark = useDark();
  const w = s.wallpaper;
  const ref = (w.mode === 'perTab' ? w.perTab?.[section] : undefined) || w.global || 'builtin:auto';
  const url = useBlobUrl(ref.startsWith('blob:') ? ref.slice(5) : undefined);
  const [hour, setHour] = useState(() => new Date().getHours());
  useEffect(() => {
    if (!w.dynamic) return;
    const t = window.setInterval(() => setHour(new Date().getHours()), 5 * 60_000);
    return () => window.clearInterval(t);
  }, [w.dynamic]);
  // прелоадер: обои готовы (своё фото — после декодирования)
  useEffect(() => {
    if (!ref.startsWith('blob:')) return markBoot('wallpaper');
    if (!url) return;
    const img = new Image();
    img.src = url;
    void img.decode().catch(() => {}).finally(() => markBoot('wallpaper'));
  }, [ref, url]);
  const tint = dynamicTint(hour);
  const blur = s.perfMode || s.blurFx === false ? 0 : w.blur;
  const filters = [blur ? `blur(${blur}px)` : '', w.dynamic ? `hue-rotate(${tint.hue}deg)` : ''].filter(Boolean).join(' ');
  return (
    <div aria-hidden="true" className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
      <div className="absolute" style={{ inset: blur ? -2 * blur : 0, background: wallpaperCss(ref, dark, url), filter: filters || undefined }} />
      <div className="absolute inset-0" style={{ background: dark ? `rgba(0,0,0,${w.dim})` : `rgba(255,255,255,${w.dim})` }} />
      {w.dynamic && <div className="absolute inset-0" style={{ background: tint.color }} />}
    </div>
  );
}
