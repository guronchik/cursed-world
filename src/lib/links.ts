// Превью ссылок «если возможно»: YouTube — по ID, остальное — через публичный API microlink (CORS).
// Если сеть недоступна или сервис не ответил — показываем домен и favicon.
export interface LinkPreview {
  title?: string;
  image?: string;
  site?: string;
}

export function youtubeId(url?: string): string | null {
  if (!url) return null;
  const m =
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/.exec(url) ||
    /youtube-nocookie\.com\/embed\/([\w-]{11})/.exec(url);
  return m ? m[1] : null;
}

export function hostOf(url?: string) {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, '') : '';
  } catch {
    return '';
  }
}

export const isUrl = (s: string) => /^https?:\/\/\S+$/i.test(s.trim());

export const faviconOf = (url?: string) => {
  const h = hostOf(url);
  return h ? `https://www.google.com/s2/favicons?domain=${h}&sz=64` : '';
};

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

export async function fetchPreview(url: string): Promise<LinkPreview> {
  const site = hostOf(url);
  const yt = youtubeId(url);
  const base: LinkPreview = { site, image: yt ? `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` : undefined };
  if (!navigator.onLine) return base;
  try {
    if (yt) {
      const r = await withTimeout(fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`), 6000);
      const j = await r.json();
      return { ...base, title: j.title || undefined, site: j.author_name ? `YouTube · ${j.author_name}` : 'YouTube' };
    }
    const r = await withTimeout(fetch(`https://api.microlink.io/?url=${encodeURIComponent(url)}`), 8000);
    const j = await r.json();
    if (j && j.status === 'success') {
      return { title: j.data?.title || undefined, image: j.data?.image?.url || j.data?.logo?.url || undefined, site: j.data?.publisher || site };
    }
  } catch {
    /* превью необязательно */
  }
  return base;
}
