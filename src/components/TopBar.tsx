// Верхняя панель на ПК (B8): живые часы «Astana 21:42», «Next class in 1h 20m» из календаря, звук On/Off.
import { db, patchSettings } from '../db/schema';
import { occurrences } from '../lib/calendar';
import { useLive, useNow } from '../lib/hooks';
import { L } from '../lib/runtime';
import { useSettings } from '../lib/settings';
import { play } from '../lib/sound';
import { Icon } from './Icon';

const CITY: Record<string, string> = { 'Asia/Almaty': 'Astana', 'Asia/Aqtobe': 'Aqtobe', 'Europe/Moscow': 'Moscow', 'UTC': 'UTC' };
const cityOf = (tz: string) => CITY[tz] || tz.split('/').pop()!.replace(/_/g, ' ');

function clock(tz: string, now: number) {
  try {
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(now);
  } catch {
    return new Date(now).toTimeString().slice(0, 5);
  }
}

function inText(ms: number) {
  const m = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return h ? `${h}${L('ч', 'h')} ${mm}${L('м', 'm')}` : `${mm}${L(' мин', 'm')}`;
}

export function TopBar() {
  const s = useSettings();
  const now = useNow(15_000);
  const next = useLive(async () => {
    const [events, sources] = await Promise.all([db.calEvents.where('kind').equals('class').toArray(), db.calSources.toArray()]);
    const off = new Set(sources.filter((x) => !x.enabled).map((x) => x.id));
    const t = Date.now();
    const list = occurrences(events.filter((e) => !off.has(e.sourceId) && !e.hidden), t, t + 7 * 864e5).filter((o) => !o.ev.allDay && o.start > t);
    list.sort((a, b) => a.start - b.start);
    return list[0] ? { start: list[0].start, title: list[0].ev.title } : null;
    // каждые 15 секунд пересчитываем вместе с часами
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Math.floor(now / 60000)]);
  const tz = s.tz || 'Asia/Almaty';
  return (
    <div className="hidden lg:flex absolute right-8 top-2 z-30 items-center gap-2 text-[12.5px]">
      <span className="topbar-pill" title={tz}>
        <Icon name="clock" size={13} /> {cityOf(tz)} <b className="mono font-semibold">{clock(tz, now)}</b>
      </span>
      {next && (
        <span className="topbar-pill" title={next.title}>
          <Icon name="grad" size={13} /> {L('Пара через', 'Next class in')} <b className="font-semibold">{inText(next.start - now)}</b>
        </span>
      )}
      <button
        className="topbar-pill"
        aria-pressed={s.sound}
        onClick={() => {
          void patchSettings({ sound: !s.sound }).then(() => !s.sound && setTimeout(() => play('click'), 50));
        }}
        title={L('Звуки интерфейса', 'Interface sounds')}
      >
        <Icon name="volume" size={13} /> Sound: <b className="font-semibold">{s.sound ? 'On' : 'Off'}</b>
      </button>
    </div>
  );
}
