// Синхронизация ПК ↔ телефон через приватный репозиторий GitHub (Contents API).
// В репозитории лежит data.json — все записи с отметками времени и «надгробиями» удалений — и папка blobs/ с фото.
// Слияние по записям: побеждает более позднее изменение. Удалённое на одном устройстве не возвращается с другого.
// Токен и настройки хранятся только в localStorage этого устройства (в базу и экспорт не попадают).
import { db, DATA_TABLES, type Settings } from '../db/schema';
import { asRemote, metaId, onLocalChange, type SyncMeta } from '../db/syncCore';
import { L } from './runtime';

const API = 'https://api.github.com';
const DATA_PATH = 'data.json';
const BLOB_DIR = 'blobs';
const CFG_KEY = 'cw-sync';
/** Большие видео не синхронизируются: Contents API и мобильный интернет для них не годятся. */
export const BLOB_MAX = 20 * 1024 * 1024;
/** Настройки, которые у каждого устройства свои (анимации, курсор, звук, PIN…). */
export const DEVICE_SETTINGS: (keyof Settings)[] = ['animLevel', 'animAutoFrom', 'cursor', 'cursorSystem', 'blurFx', 'perfMode', 'motion', 'sound', 'notifications', 'pinHash', 'pinSalt', 'lockAfterMin', 'dock'];

export interface SyncConfig {
  token: string;
  repo: string; // owner/name
  auto: boolean;
  lastSync?: number;
  joined?: boolean; // устройство уже хоть раз синхронизировалось
}

export interface SyncStatus {
  state: 'off' | 'idle' | 'syncing' | 'error' | 'offline';
  lastSync?: number;
  error?: string;
  detail?: string;
}

type Rec = [number, unknown | null]; // [время изменения, запись или null = удалено]
export interface RemoteData {
  app: 'cursed-world-sync';
  v: 1;
  updatedAt: number;
  records: Record<string, Record<string, Rec>>;
  blobs: Record<string, { type: string; name: string; size: number; createdAt: number }>;
}

// ───────────── Конфигурация ─────────────

export function getConfig(): SyncConfig | null {
  try {
    const raw = localStorage.getItem(CFG_KEY);
    return raw ? (JSON.parse(raw) as SyncConfig) : null;
  } catch {
    return null;
  }
}
function saveConfig(c: SyncConfig | null) {
  try {
    if (c) localStorage.setItem(CFG_KEY, JSON.stringify(c));
    else localStorage.removeItem(CFG_KEY);
  } catch (e) {
    console.error('[sync] config', e);
  }
}

let status: SyncStatus = getConfig() ? { state: 'idle', lastSync: getConfig()?.lastSync } : { state: 'off' };
const statusSubs = new Set<(s: SyncStatus) => void>();
function setStatus(s: Partial<SyncStatus>) {
  status = { ...status, ...s };
  statusSubs.forEach((f) => f(status));
}
export const getStatus = () => status;
export function onStatus(fn: (s: SyncStatus) => void) {
  statusSubs.add(fn);
  return () => void statusSubs.delete(fn);
}

// ───────────── GitHub ─────────────

export class GitHubError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function gh(token: string, path: string, init: RequestInit & { raw?: boolean } = {}) {
  let r: Response;
  try {
    r = await fetch(API + path, {
      ...init,
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: init.raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  } catch {
    throw new GitHubError(0, L('Нет связи с GitHub', 'Cannot reach GitHub'));
  }
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try {
      msg = ((await r.json()) as { message?: string }).message || msg;
    } catch {
      /* тело не JSON */
    }
    if (r.status === 401) msg = L('Токен не подходит или истёк', 'Token is invalid or expired');
    throw new GitHubError(r.status, msg);
  }
  return r;
}

const utf8 = new TextEncoder();
function b64FromBytes(bytes: Uint8Array) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function bytesFromB64(b64: string) {
  const bin = atob(b64.replace(/\s/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function whoAmI(token: string) {
  return (await (await gh(token, '/user')).json()) as { login: string };
}

export async function checkRepo(token: string, repo: string) {
  let info: { private: boolean; permissions?: { push?: boolean }; full_name: string };
  try {
    info = await (await gh(token, `/repos/${repo}`)).json();
  } catch (e) {
    if (e instanceof GitHubError && e.status === 404) throw new GitHubError(404, L(`Репозиторий ${repo} не найден (или у токена нет к нему доступа)`, `Repository ${repo} not found (or the token has no access)`));
    throw e;
  }
  if (!info.private) throw new GitHubError(400, L('Репозиторий публичный — данные увидят все. Сделай его приватным (Settings → Change visibility).', 'The repository is public. Make it private first.'));
  if (info.permissions && info.permissions.push === false) throw new GitHubError(403, L('У токена нет права записи: нужен доступ Contents — Read and write.', 'The token cannot write: grant Contents — Read and write.'));
  return info;
}

async function getFile(token: string, repo: string, path: string): Promise<{ sha: string; bytes: Uint8Array } | null> {
  let meta: { sha: string; content?: string; encoding?: string };
  try {
    meta = await (await gh(token, `/repos/${repo}/contents/${path}`)).json();
  } catch (e) {
    if (e instanceof GitHubError && e.status === 404) return null;
    throw e;
  }
  if (meta.encoding === 'base64' && meta.content) return { sha: meta.sha, bytes: bytesFromB64(meta.content) };
  // файлы больше 1 МБ API отдаёт без содержимого — берём «сырой» вариант
  const raw = await gh(token, `/repos/${repo}/contents/${path}`, { raw: true });
  return { sha: meta.sha, bytes: new Uint8Array(await raw.arrayBuffer()) };
}

async function putFile(token: string, repo: string, path: string, bytes: Uint8Array, message: string, sha?: string) {
  const r = await gh(token, `/repos/${repo}/contents/${path}`, { method: 'PUT', body: JSON.stringify({ message, content: b64FromBytes(bytes), ...(sha ? { sha } : {}) }) });
  return ((await r.json()) as { content: { sha: string } }).content.sha;
}

export async function fetchRemote(token: string, repo: string): Promise<{ sha: string; data: RemoteData } | null> {
  const f = await getFile(token, repo, DATA_PATH);
  if (!f) return null;
  const data = JSON.parse(new TextDecoder().decode(f.bytes)) as RemoteData;
  if (data?.app !== 'cursed-world-sync') throw new GitHubError(400, L('В репозитории чужой data.json', 'data.json in the repo is not ours'));
  return { sha: f.sha, data };
}

// ───────────── Локальный снимок ─────────────

type LocalRec = { u: number; row?: unknown; del?: boolean };

async function localSnapshot() {
  const metas = await db.syncMeta.toArray();
  const metaBy = new Map(metas.map((m) => [m.id, m]));
  const out: Record<string, Map<string, LocalRec>> = {};
  for (const t of DATA_TABLES) {
    const table = db.table(t);
    const pk = table.schema.primKey.keyPath as string;
    const map = new Map<string, LocalRec>();
    for (const row of await table.toArray()) {
      const k = String((row as Record<string, unknown>)[pk]);
      // запись без отметки (была до включения синхронизации) — самая старая версия
      map.set(k, { u: metaBy.get(metaId(t, k))?.u || 1, row });
    }
    out[t] = map;
  }
  for (const m of metas) if (m.d && out[m.t] && !out[m.t].has(m.k)) out[m.t].set(m.k, { u: m.u, del: true });
  return out;
}

const keepDevice = (local: Settings | undefined, remote: Settings): Settings => {
  if (!local) return remote;
  const next = { ...remote } as Record<string, unknown>;
  for (const k of DEVICE_SETTINGS) next[k] = (local as unknown as Record<string, unknown>)[k];
  return next as unknown as Settings;
};

/** Записать изменения из облака в базу; отметки ставятся облачные, чтобы не было «пинг-понга». */
async function applyRemote(changes: { t: string; k: string; rec: Rec }[], replaceAll: boolean) {
  if (!changes.length && !replaceAll) return;
  await asRemote(() =>
    db.transaction('rw', [...DATA_TABLES.map((t) => db.table(t)), db.syncMeta], async () => {
      if (replaceAll) {
        for (const t of DATA_TABLES) if (t !== 'settings') await db.table(t).clear();
        await db.syncMeta.clear();
      }
      const metas: SyncMeta[] = [];
      for (const { t, k, rec } of changes) {
        const [u, row] = rec;
        const table = db.table(t);
        if (row === null) await table.delete(k);
        else if (t === 'settings') await table.put(keepDevice(await db.settings.get('app'), row as Settings));
        else await table.put(row);
        metas.push({ id: metaId(t, k), t, k, u, ...(row === null ? { d: 1 as const } : {}) });
      }
      await db.syncMeta.bulkPut(metas);
    }),
  );
}

// ───────────── Синхронизация ─────────────

let running: Promise<boolean> | null = null;
let again = false;

/** Одна синхронизация. Повторный вызов во время работы ставит ещё один проход в очередь. */
export function syncNow(opts: { mode?: 'merge' | 'replaceLocal' } = {}): Promise<boolean> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    let ok = false;
    try {
      ok = await withLock(() => runSync(opts.mode || 'merge'));
    } finally {
      running = null;
    }
    if (again) {
      again = false;
      return syncNow();
    }
    return ok;
  })();
  return running;
}

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = (navigator as Navigator & { locks?: { request: (n: string, f: () => Promise<T>) => Promise<T> } }).locks;
  return locks ? locks.request('cw-sync', fn) : fn();
}

async function runSync(mode: 'merge' | 'replaceLocal'): Promise<boolean> {
  const cfg = getConfig();
  if (!cfg) {
    setStatus({ state: 'off' });
    return false;
  }
  if (!navigator.onLine) {
    setStatus({ state: 'offline' });
    return false;
  }
  setStatus({ state: 'syncing', error: undefined });
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      const remote = await fetchRemote(cfg.token, cfg.repo);
      const rdata: RemoteData = remote?.data || { app: 'cursed-world-sync', v: 1, updatedAt: 0, records: {}, blobs: {} };
      const replace = mode === 'replaceLocal' && !!remote;
      const local = replace ? null : await localSnapshot();

      // слияние по записям
      const toApply: { t: string; k: string; rec: Rec }[] = [];
      let push = !remote;
      const merged: RemoteData['records'] = {};
      for (const t of DATA_TABLES) {
        const R = rdata.records[t] || {};
        const Lm = local?.[t] || new Map<string, LocalRec>();
        const out: Record<string, Rec> = {};
        const keys = new Set([...Object.keys(R), ...Lm.keys()]);
        for (const k of keys) {
          const r = R[k];
          const l = Lm.get(k);
          const lrec: Rec | undefined = l ? [l.u, l.del ? null : l.row] : undefined;
          if (r && (!lrec || r[0] > lrec[0])) {
            out[k] = r;
            if (!lrec || !(lrec[1] === null && r[1] === null)) toApply.push({ t, k, rec: r });
          } else if (lrec) {
            out[k] = lrec;
            if (!r || lrec[0] > r[0]) push = true;
          }
        }
        merged[t] = out;
      }
      await applyRemote(toApply, replace);

      // фото: выгрузить новые, скачать недостающие
      setStatus({ detail: L('фото…', 'photos…') });
      const blobs = { ...rdata.blobs };
      const localBlobs = await db.blobs.toArray();
      const have = new Set(localBlobs.map((b) => b.id));
      for (const b of localBlobs) {
        if (blobs[b.id] || b.type.startsWith('video/') || b.size > BLOB_MAX) continue;
        await putFile(cfg.token, cfg.repo, `${BLOB_DIR}/${b.id}`, new Uint8Array(await b.blob.arrayBuffer()), `blob ${b.name}`).catch((e) => {
          // файл уже есть (выгрузил другой раз) — это не ошибка
          if (!(e instanceof GitHubError && (e.status === 422 || e.status === 409))) throw e;
        });
        blobs[b.id] = { type: b.type, name: b.name, size: b.size, createdAt: b.createdAt };
        push = true;
      }
      for (const [id, m] of Object.entries(blobs)) {
        if (have.has(id)) continue;
        const f = await getFile(cfg.token, cfg.repo, `${BLOB_DIR}/${id}`);
        if (!f) continue;
        await db.blobs.put({ id, blob: new Blob([f.bytes as BlobPart], { type: m.type }), type: m.type, name: m.name, size: m.size, createdAt: m.createdAt });
      }
      setStatus({ detail: undefined });

      if (push) {
        const next: RemoteData = { app: 'cursed-world-sync', v: 1, updatedAt: Date.now(), records: merged, blobs };
        try {
          await putFile(cfg.token, cfg.repo, DATA_PATH, utf8.encode(JSON.stringify(next)), `sync ${new Date().toISOString()}`, remote?.sha);
        } catch (e) {
          // другое устройство успело записать раньше — забираем его версию и сливаем заново
          if (e instanceof GitHubError && (e.status === 409 || e.status === 422)) continue;
          throw e;
        }
      }
      const now = Date.now();
      saveConfig({ ...cfg, lastSync: now, joined: true });
      setStatus({ state: 'idle', lastSync: now, error: undefined });
      return true;
    }
    throw new Error(L('Не удалось записать: файл постоянно меняется', 'Could not write: the file keeps changing'));
  } catch (e) {
    const msg = (e as Error)?.message || String(e);
    console.error('[sync]', e);
    setStatus({ state: navigator.onLine ? 'error' : 'offline', error: msg, detail: undefined });
    return false;
  }
}

/**
 * Подключение устройства. Если в облаке уже есть данные и устройство подключается впервые,
 * вызывающий решает: заменить данные этого устройства облачными или объединить.
 */
export async function connect(token: string, repoIn: string, auto = true) {
  const t = token.trim();
  const me = await whoAmI(t);
  const repo = repoIn.includes('/') ? repoIn.trim() : `${me.login}/${repoIn.trim() || 'cursed-world-data'}`;
  await checkRepo(t, repo);
  const remote = await fetchRemote(t, repo);
  return { repo, login: me.login, hasRemote: !!remote, remoteRecords: remote ? Object.values(remote.data.records).reduce((s, r) => s + Object.keys(r).length, 0) : 0, save: () => saveConfig({ token: t, repo, auto }) };
}

export function disconnect() {
  saveConfig(null);
  setStatus({ state: 'off', lastSync: undefined, error: undefined });
}

export function setAuto(auto: boolean) {
  const c = getConfig();
  if (c) saveConfig({ ...c, auto });
}

// ───────────── Автосинхронизация ─────────────

let started = false;
export function startAutoSync() {
  if (started) return;
  started = true;
  let timer = 0;
  let lastAt = 0;
  const auto = () => !!getConfig()?.auto;
  const soon = (ms: number) => {
    if (!auto()) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      lastAt = Date.now();
      void syncNow();
    }, ms);
  };
  // после моих изменений — через несколько секунд тишины
  onLocalChange(() => soon(5000));
  window.addEventListener('online', () => soon(500));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastAt > 30_000) soon(300);
  });
  window.setInterval(() => {
    if (document.visibilityState === 'visible' && Date.now() - lastAt > 4 * 60_000) soon(0);
  }, 60_000);
  soon(800);
}
