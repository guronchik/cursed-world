// Фоновые проверки, пока приложение открыто: таблетки, пары, близкие дедлайны, авто-статусы обетов, авто-обновление ICS.
import { DEFAULT_SETTINGS, db } from '../db/schema';
import { autoRefresh, occurrences, setSemester } from './calendar';
import { checkVows } from './actions';
import { dayKey, hm, shortLeft } from './dates';
import { toast } from './fx';
import { L } from './runtime';
import { play } from './sound';

const notified = new Set<string>();

export async function notify(title: string, body: string, tag: string) {
  toast(`${title}: ${body}`, 'warn');
  play('warn');
  const s = await db.settings.get('app');
  if (!s?.notifications || !('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration?.();
    if (reg) await reg.showNotification(title, { body, tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' });
    else new Notification(title, { body, tag });
  } catch {
    /* уведомления не критичны */
  }
}

async function checkReminders() {
  const now = new Date();
  const date = dayKey(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const meds = (await db.meds.toArray()).filter((m) => m.active && m.reminders);
  if (meds.length) {
    const logs = await db.medLogs.where('date').equals(date).toArray();
    for (const m of meds) {
      for (const t of m.times) {
        const tm = hm(t);
        const key = `med|${date}|${m.id}|${t}`;
        if (nowMin < tm || nowMin - tm > 60 || notified.has(key)) continue;
        if (logs.some((l) => l.id === `${date}|${m.id}|${t}`)) continue;
        notified.add(key);
        await notify(L('Время приёма', 'Time to take'), `${m.name} — ${m.dose} (${t})`, key);
      }
    }
  }
  const settings = { ...DEFAULT_SETTINGS(), ...((await db.settings.get('app')) || {}) };
  const t = now.getTime();
  const classLead = (settings.notifyClassMin || 0) * 60_000;
  if (classLead > 0) {
    setSemester(settings.semester);
    const [events, sources] = await Promise.all([db.calEvents.where('kind').equals('class').toArray(), db.calSources.toArray()]);
    const off = new Set(sources.filter((x) => !x.enabled).map((x) => x.id));
    const upcoming: { key: string; title: string; start: number; room?: string }[] = [];
    for (const o of occurrences(events.filter((e) => !off.has(e.sourceId)), t, t + classLead + 60_000)) if (!o.ev.allDay) upcoming.push({ key: o.key, title: o.ev.title, start: o.start, room: o.ev.location });
    for (const u of upcoming) {
      const left = u.start - t;
      const key = `class|${u.key}`;
      if (left <= 0 || left > classLead || notified.has(key)) continue;
      notified.add(key);
      await notify(L('Скоро пара', 'Class soon'), `${u.title} — ${hhmm(u.start)}${u.room ? ` · ${u.room}` : ''}`, key);
    }
  }
  const lead = (settings.notifyDeadlineMin || 0) * 60_000;
  if (lead > 0)
    for (const a of await db.assignments.toArray()) {
      if (a.status === 'done' || !a.due || a.curseId) continue;
      const left = a.due - t;
      const key = `assign|${a.id}|${a.due}`;
      if (left > 0 && left <= lead && !notified.has(key)) {
        notified.add(key);
        await notify(L('Задание скоро', 'Assignment due soon'), `${a.title} — ${shortLeft(left)}`, key);
      }
    }
  const curses = lead > 0 ? await db.curses.where('status').equals('active').toArray() : [];
  for (const c of curses) {
    const left = c.due - t;
    const key = `curse|${c.id}|${c.due}`;
    if (left > 0 && left <= lead && !notified.has(key)) {
      notified.add(key);
      await notify(L('Curse близко', 'Curse incoming'), `${c.title} — ${shortLeft(left)}`, key);
    }
  }
}

const hhmm = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

let started = false;

export function startBackground() {
  if (started) return;
  started = true;
  const tick = () => {
    void checkVows();
    void checkReminders();
  };
  const refresh = async () => {
    const st = await db.settings.get('app');
    await autoRefresh({ ...DEFAULT_SETTINGS(), ...(st || {}) });
  };
  tick();
  void refresh();
  window.setInterval(tick, 30_000);
  window.setInterval(() => void refresh(), 15 * 60_000);
  window.addEventListener('online', () => void refresh());
}
