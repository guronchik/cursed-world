// Резервная копия: все таблицы + все файлы (base64) в одном JSON.
import { DATA_TABLES, db, upgradeToV2, upgradeToV4 } from './schema';
import { upgradeToV3 } from './migrate3';

const toBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = reject;
    r.readAsDataURL(blob);
  });

function fromBase64(b64: string, type: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

export async function exportAll() {
  const tables: Record<string, unknown[]> = {};
  for (const name of DATA_TABLES) tables[name] = await db.table(name).toArray();
  const blobs: { id: string; type: string; name: string; size: number; createdAt: number; data: string }[] = [];
  for (const b of await db.blobs.toArray()) {
    blobs.push({ id: b.id, type: b.type, name: b.name, size: b.size, createdAt: b.createdAt, data: await toBase64(b.blob) });
  }
  const payload = { app: 'cursed-world', version: 3, exportedAt: new Date().toISOString(), tables, blobs };
  return new Blob([JSON.stringify(payload)], { type: 'application/json' });
}

export async function importAll(file: File) {
  const text = await file.text();
  const data = JSON.parse(text);
  if (data?.app !== 'cursed-world' || !data.tables) throw new Error('Это не резервная копия CURSED WORLD');
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) await t.clear();
    for (const name of DATA_TABLES) {
      const rows = data.tables[name];
      if (Array.isArray(rows) && rows.length) await db.table(name).bulkPut(rows);
    }
    const blobs = Array.isArray(data.blobs) ? data.blobs : [];
    if (blobs.length) {
      await db.blobs.bulkPut(
        blobs.map((b: { id: string; type: string; name: string; size: number; createdAt: number; data: string }) => ({
          id: b.id,
          type: b.type,
          name: b.name,
          size: b.size,
          createdAt: b.createdAt,
          blob: fromBase64(b.data, b.type),
        })),
      );
    }
    // копия из v1: дополнить настройки и перевести эмодзи-иконки папок (как миграция схемы v2)
    await upgradeToV2(db);
    // копия из v1/v2: задания отдельно от Curses, пары → события, YouTube → видео (окно проверки покажется один раз)
    await upgradeToV3(db as never);
    // копия до v4: колонки статусов и привязка видео по названию статуса
    await upgradeToV4(db as never);
  });
}
