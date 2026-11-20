// CURSED WORLD — ICS-прокси для Cloudflare Workers (бесплатный тариф).
// Зачем: Moodle/AITU не отдаёт календарь браузеру с чужого сайта (CORS). Прокси скачивает .ics
// на стороне Cloudflare и возвращает его с заголовком Access-Control-Allow-Origin.
//
// Запрос:  GET https://<имя>.<аккаунт>.workers.dev/?url=<ссылка на .ics, URL-encoded>
// В приложении: Settings → Календарь → «Прокси для ICS-ссылок» = https://<имя>.<аккаунт>.workers.dev/?url={url}
//
// Безопасность: прокси пускает только хосты из ALLOWED_HOSTS (чтобы его не использовали как открытый прокси)
// и только ответы, похожие на iCalendar. Добавь свой домен Moodle, если он другой.

const ALLOWED_HOSTS = ['moodle.astanait.edu.kz', 'astanait.edu.kz', 'calendar.google.com', 'outlook.office365.com', 'outlook.live.com'];
const MAX_BYTES = 5 * 1024 * 1024;

function cors(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    ...extra,
  };
}

function hostAllowed(host) {
  return ALLOWED_HOSTS.some((h) => host === h || host.endsWith('.' + h));
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: cors() });

    const target = new URL(request.url).searchParams.get('url');
    if (!target) return new Response('Missing ?url=', { status: 400, headers: cors() });

    let url;
    try {
      url = new URL(target.replace(/^webcal:/i, 'https:'));
    } catch {
      return new Response('Bad url', { status: 400, headers: cors() });
    }
    if (url.protocol !== 'https:') return new Response('Only https', { status: 400, headers: cors() });
    if (!hostAllowed(url.hostname)) return new Response(`Host not allowed: ${url.hostname}`, { status: 403, headers: cors() });

    const upstream = await fetch(url.toString(), {
      headers: { 'User-Agent': 'CursedWorld-ICS-Proxy/1.0', Accept: 'text/calendar, text/plain, */*' },
      cf: { cacheTtl: 900, cacheEverything: true },
    });
    if (!upstream.ok) return new Response(`Upstream ${upstream.status}`, { status: 502, headers: cors() });

    const text = await upstream.text();
    if (text.length > MAX_BYTES) return new Response('Too large', { status: 413, headers: cors() });
    if (!text.includes('BEGIN:VCALENDAR')) return new Response('Not an iCalendar file', { status: 422, headers: cors() });

    return new Response(text, {
      status: 200,
      headers: cors({ 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'public, max-age=900' }),
    });
  },
};
