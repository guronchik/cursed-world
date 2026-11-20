// «Найти на карте»: свой пин в My Map, иначе — номер аудитории в буфер и AITU Map.
import { db } from '../db/schema';
import { toast } from './fx';
import { go } from './router';
import { L } from './runtime';

export async function findOnMap(room?: string, pinId?: string) {
  if (pinId && (await db.pins.get(pinId))) return go(`/tools/map?map=my&pin=${pinId}`);
  const r = (room || '').trim().toLowerCase();
  if (r) {
    const pins = await db.pins.toArray();
    const norm = (s: string) => s.toLowerCase().replace(/^(ауд\.?|аудитория|room|каб\.?)\s*/i, '').trim();
    const p = pins.find((x) => norm(x.name) === norm(r)) || pins.find((x) => norm(x.name).includes(norm(r)) && norm(r).length >= 2);
    if (p) return go(`/tools/map?map=my&pin=${p.id}`);
    try {
      await navigator.clipboard.writeText(room!.trim());
      toast(L(`«${room}» скопировано — вставь в поиск AITU Map`, `“${room}” copied — paste it into AITU Map search`));
    } catch {
      toast(L(`Аудитория: ${room}`, `Room: ${room}`));
    }
  }
  go(`/tools/map?map=aitu${room ? `&room=${encodeURIComponent(room.trim())}` : ''}`);
}
