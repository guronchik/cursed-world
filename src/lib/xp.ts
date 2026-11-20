import { db } from '../db/schema';
import { fx, toast } from './fx';
import { play } from './sound';

export const RANKS = [
  { name: 'Grade 4', min: 0, kanji: '四級' },
  { name: 'Grade 3', min: 250, kanji: '三級' },
  { name: 'Grade 2', min: 750, kanji: '二級' },
  { name: 'Semi-Grade 1', min: 1750, kanji: '準一級' },
  { name: 'Grade 1', min: 3500, kanji: '一級' },
  { name: 'Special Grade', min: 7000, kanji: '特級' },
];

export function rankOf(xp: number) {
  let idx = 0;
  RANKS.forEach((r, i) => {
    if (xp >= r.min) idx = i;
  });
  const cur = RANKS[idx];
  const next = RANKS[idx + 1];
  const progress = next ? (xp - cur.min) / (next.min - cur.min) : 1;
  return { idx, name: cur.name, kanji: cur.kanji, next: next?.name, toNext: next ? next.min - xp : 0, progress: Math.max(0, Math.min(1, progress)), xp };
}

export async function totalXp() {
  const all = await db.xp.toArray();
  return all.reduce((s, e) => s + e.amount, 0);
}

/** Начислить XP один раз по уникальному ключу. Возвращает true, если начислено. */
export async function award(key: string, amount: number, reason: string, kind = 'misc', silent = false) {
  if (!amount) return false;
  const exists = await db.xp.get(key);
  if (exists) return false;
  const before = await totalXp();
  await db.xp.put({ key, at: Date.now(), amount, reason, kind });
  if (!silent) toast(`${amount > 0 ? '+' : ''}${amount} XP · ${reason}`, amount > 0 ? 'xp' : 'bad');
  const r0 = rankOf(before);
  const r1 = rankOf(before + amount);
  if (r1.idx > r0.idx) {
    window.setTimeout(() => {
      fx.emit({ type: 'rankup', rank: r1.name });
      play('rank');
    }, 1100);
  }
  return true;
}

export async function revoke(key: string) {
  await db.xp.delete(key);
}
