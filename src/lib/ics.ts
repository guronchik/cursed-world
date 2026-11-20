// Парсер и генератор iCalendar (RFC 5545): VEVENT, VTODO, RRULE, EXDATE, RECURRENCE-ID, VTIMEZONE, all-day.
// Без внешних зависимостей, чтобы работать офлайн и предсказуемо.

export interface IcsProp {
  name: string;
  params: Record<string, string>;
  value: string;
}
export interface IcsComp {
  type: string;
  props: IcsProp[];
  comps: IcsComp[];
}

export function unfold(text: string) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const out: string[] = [];
  for (const l of lines) {
    if ((l.startsWith(' ') || l.startsWith('\t')) && out.length) out[out.length - 1] += l.slice(1);
    else if (l.length) out.push(l);
  }
  return out;
}

function parseLine(line: string): IcsProp | null {
  let i = 0;
  let inQ = false;
  for (; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQ = !inQ;
    else if (ch === ':' && !inQ) break;
  }
  if (i >= line.length) return null;
  const head = line.slice(0, i);
  const value = line.slice(i + 1);
  const parts: string[] = [];
  let cur = '';
  inQ = false;
  for (const ch of head) {
    if (ch === '"') inQ = !inQ;
    if (ch === ';' && !inQ) {
      parts.push(cur);
      cur = '';
    } else cur += ch;
  }
  parts.push(cur);
  const params: Record<string, string> = {};
  for (const p of parts.slice(1)) {
    const eq = p.indexOf('=');
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name: parts[0].toUpperCase(), params, value };
}

export function parseIcs(text: string): IcsComp {
  const root: IcsComp = { type: 'ROOT', props: [], comps: [] };
  const stack: IcsComp[] = [root];
  for (const line of unfold(text)) {
    const p = parseLine(line);
    if (!p) continue;
    if (p.name === 'BEGIN') {
      const c: IcsComp = { type: p.value.trim().toUpperCase(), props: [], comps: [] };
      stack[stack.length - 1].comps.push(c);
      stack.push(c);
    } else if (p.name === 'END') {
      if (stack.length > 1) stack.pop();
    } else stack[stack.length - 1].props.push(p);
  }
  const cal = root.comps.find((c) => c.type === 'VCALENDAR');
  if (!cal) throw new Error('Not an iCalendar file (no VCALENDAR)');
  return cal;
}

export const unescapeText = (v: string) => v.replace(/\\([nN,;\\])/g, (_, c) => (c === 'n' || c === 'N' ? '\n' : c));
export const escapeText = (v: string) => v.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

export const prop = (c: IcsComp, name: string) => c.props.find((p) => p.name === name);
export const props = (c: IcsComp, name: string) => c.props.filter((p) => p.name === name);
export const text = (c: IcsComp, name: string) => {
  const p = prop(c, name);
  return p ? unescapeText(p.value).trim() : '';
};

// ───── Часовые пояса ─────
export interface Wall {
  y: number;
  m: number; // 1..12
  d: number;
  h: number;
  mi: number;
  s: number;
}

const dtfCache = new Map<string, Intl.DateTimeFormat>();
export function validTz(tz: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
function dtf(tz: string) {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    dtfCache.set(tz, f);
  }
  return f;
}

/** Смещение пояса в минутах для момента ms (или фиксированное «+0500» из VTIMEZONE). */
export function tzOffsetMin(tz: string, ms: number): number {
  const fixed = /^([+-])(\d{2}):?(\d{2})$/.exec(tz);
  if (fixed) return (fixed[1] === '-' ? -1 : 1) * (Number(fixed[2]) * 60 + Number(fixed[3]));
  if (tz === 'UTC' || tz === 'Z') return 0;
  const parts = Object.fromEntries(dtf(tz).formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
}

export function wallToUtc(w: Wall, tz: string) {
  const guess = Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s);
  let off = tzOffsetMin(tz, guess);
  let ms = guess - off * 60000;
  const off2 = tzOffsetMin(tz, ms);
  if (off2 !== off) {
    off = off2;
    ms = guess - off * 60000;
  }
  return ms;
}

export function utcToWall(ms: number, tz: string): Wall {
  const off = tzOffsetMin(tz, ms);
  const d = new Date(ms + off * 60000);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds() };
}

/** Резолвер TZID: IANA-имя напрямую, иначе фиксированное смещение STANDARD из VTIMEZONE, иначе пояс по умолчанию. */
export function tzResolver(cal: IcsComp, fallback: string) {
  const vtz = new Map<string, string>();
  for (const t of cal.comps.filter((c) => c.type === 'VTIMEZONE')) {
    const id = prop(t, 'TZID')?.value;
    const std = t.comps.find((c) => c.type === 'STANDARD') || t.comps[0];
    const off = std && prop(std, 'TZOFFSETTO')?.value;
    if (id && off) vtz.set(id, off.length === 5 ? `${off.slice(0, 3)}:${off.slice(3)}` : off);
  }
  return (tzid?: string) => {
    if (!tzid) return fallback;
    const clean = tzid.replace(/^\/+/, '');
    if (validTz(clean)) return clean;
    return vtz.get(tzid) || fallback;
  };
}

export interface IcsTime {
  ms: number;
  allDay: boolean;
  tz: string; // IANA, 'UTC', '+05:00' или 'floating-date' для all-day
}

/** Разбор DTSTART/DTEND/DUE/RECURRENCE-ID/EXDATE-значения. */
export function parseTime(value: string, params: Record<string, string>, resolve: (tz?: string) => string): IcsTime | null {
  const v = value.trim();
  const dm = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (dm || params.VALUE === 'DATE') {
    const m = dm || /^(\d{4})(\d{2})(\d{2})/.exec(v);
    if (!m) return null;
    return { ms: new Date(+m[1], +m[2] - 1, +m[3]).getTime(), allDay: true, tz: 'floating-date' };
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(v);
  if (!m) return null;
  const w: Wall = { y: +m[1], m: +m[2], d: +m[3], h: +m[4], mi: +m[5], s: m[6] ? +m[6] : 0 };
  if (m[7]) return { ms: Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s), allDay: false, tz: 'UTC' };
  const tz = resolve(params.TZID);
  return { ms: wallToUtc(w, tz), allDay: false, tz };
}

export function parseDuration(v: string) {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v.trim());
  if (!m) return 0;
  const sign = m[1] === '-' ? -1 : 1;
  return sign * (((+(m[2] || 0) * 7 + +(m[3] || 0)) * 24 + +(m[4] || 0)) * 3600 + +(m[5] || 0) * 60 + +(m[6] || 0)) * 1000;
}

// ───── RRULE ─────
export interface RRule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  interval: number;
  count?: number;
  until?: number;
  byday?: { wd: number; n?: number }[]; // wd: 0=пн .. 6=вс
  bymonthday?: number[];
  bymonth?: number[];
}
const WD = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

export function parseRRule(s: string, resolve: (tz?: string) => string = () => 'UTC'): RRule | null {
  const kv = Object.fromEntries(
    s
      .split(';')
      .map((p) => p.split('='))
      .filter((p) => p.length === 2)
      .map(([k, v]) => [k.toUpperCase(), v]),
  );
  const freq = kv.FREQ as RRule['freq'];
  if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) return null;
  const r: RRule = { freq, interval: Math.max(1, Number(kv.INTERVAL) || 1) };
  if (kv.COUNT) r.count = Number(kv.COUNT);
  if (kv.UNTIL) r.until = parseTime(kv.UNTIL, {}, resolve)?.ms;
  if (kv.BYDAY)
    r.byday = kv.BYDAY.split(',')
      .map((x: string) => {
        const m = /^([+-]?\d+)?(MO|TU|WE|TH|FR|SA|SU)$/.exec(x.trim());
        return m ? { wd: WD.indexOf(m[2]), n: m[1] ? Number(m[1]) : undefined } : null;
      })
      .filter(Boolean) as RRule['byday'];
  if (kv.BYMONTHDAY) r.bymonthday = kv.BYMONTHDAY.split(',').map(Number);
  if (kv.BYMONTH) r.bymonth = kv.BYMONTH.split(',').map(Number);
  return r;
}

const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const wdOf = (y: number, m: number, d: number) => (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;

function monthDays(y: number, m: number, r: RRule, dflt: number): number[] {
  const dim = daysInMonth(y, m);
  if (r.byday?.length) {
    const out: number[] = [];
    for (const b of r.byday) {
      const all: number[] = [];
      for (let d = 1; d <= dim; d++) if (wdOf(y, m, d) === b.wd) all.push(d);
      if (b.n === undefined) out.push(...all);
      else {
        const pick = b.n > 0 ? all[b.n - 1] : all[all.length + b.n];
        if (pick) out.push(pick);
      }
    }
    return out;
  }
  const mds = r.bymonthday?.length ? r.bymonthday : [dflt];
  return mds.map((d) => (d < 0 ? dim + d + 1 : d)).filter((d) => d >= 1 && d <= dim);
}

/**
 * Старты повторений серии в диапазоне [from, to). Расчёт в «настенном» времени пояса события,
 * поэтому переходы на летнее время не сдвигают пары.
 */
export function expandRRule(startMs: number, tz: string, rule: RRule, from: number, to: number, exdates: number[] = [], allDay = false): number[] {
  const zone = allDay || tz === 'floating-date' ? null : tz;
  const toWall = (ms: number): Wall => {
    if (zone) return utcToWall(ms, zone);
    const d = new Date(ms);
    return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), h: d.getHours(), mi: d.getMinutes(), s: d.getSeconds() };
  };
  const toMs = (w: Wall) => (zone ? wallToUtc(w, zone) : new Date(w.y, w.m - 1, w.d, w.h, w.mi, w.s).getTime());
  const s = toWall(startMs);
  const out: number[] = [];
  const ex = new Set(exdates.map((x) => Math.round(x / 60000)));
  let n = 0;
  const push = (y: number, m: number, d: number) => {
    const ms = toMs({ ...s, y, m, d });
    if (ms < startMs) return true;
    if (rule.until !== undefined && ms > rule.until) return false;
    if (rule.count !== undefined && n >= rule.count) return false;
    n++;
    if (ms >= to) return false;
    if (ms >= from && !ex.has(Math.round(ms / 60000))) out.push(ms);
    return true;
  };
  for (let k = 0; k < 3000; k++) {
    let cands: [number, number, number][] = [];
    if (rule.freq === 'DAILY') {
      const d = new Date(Date.UTC(s.y, s.m - 1, s.d + k * rule.interval));
      cands = [[d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()]];
      if (rule.byday?.length && !rule.byday.some((b) => b.wd === wdOf(cands[0][0], cands[0][1], cands[0][2]))) cands = [];
    } else if (rule.freq === 'WEEKLY') {
      const monday = new Date(Date.UTC(s.y, s.m - 1, s.d - wdOf(s.y, s.m, s.d) + k * 7 * rule.interval));
      const wds = rule.byday?.length ? rule.byday.map((b) => b.wd).sort((a, b) => a - b) : [wdOf(s.y, s.m, s.d)];
      cands = wds.map((wd) => {
        const d = new Date(monday.getTime() + wd * 864e5);
        return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
      });
    } else if (rule.freq === 'MONTHLY') {
      const t = s.m - 1 + k * rule.interval;
      const y = s.y + Math.floor(t / 12);
      const m = (t % 12) + 1;
      if (!rule.bymonth || rule.bymonth.includes(m)) cands = monthDays(y, m, rule, s.d).sort((a, b) => a - b).map((d) => [y, m, d]);
    } else {
      const y = s.y + k * rule.interval;
      const months = rule.bymonth?.length ? rule.bymonth : [s.m];
      for (const m of months) {
        const days = rule.byday?.length || rule.bymonthday?.length ? monthDays(y, m, rule, s.d) : [s.d].filter((d) => d <= daysInMonth(y, m));
        cands.push(...days.sort((a, b) => a - b).map((d) => [y, m, d] as [number, number, number]));
      }
    }
    for (const [y, m, d] of cands) if (!push(y, m, d)) return out;
    if (toMs({ ...s, y: cands[0]?.[0] ?? s.y, m: cands[0]?.[1] ?? s.m, d: cands[0]?.[2] ?? s.d }) > to + 400 * 864e5) break;
  }
  return out;
}

// ───── Экспорт ─────
const pad = (n: number) => String(n).padStart(2, '0');
export const icsUtc = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
};
export const icsDate = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
};
export function foldLine(line: string) {
  const out: string[] = [];
  let cur = '';
  for (const ch of line) {
    if (new TextEncoder().encode(cur + ch).length > 74) {
      out.push(cur);
      cur = ' ' + ch;
    } else cur += ch;
  }
  out.push(cur);
  return out.join('\r\n');
}
