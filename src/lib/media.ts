// Хранение файлов и картинок: всё лежит в IndexedDB как blob. Картинки сжимаются (webp/jpeg).
import { useEffect, useState } from 'react';
import { db } from '../db/schema';
import { uid } from './runtime';

export async function putBlob(blob: Blob, name = 'file'): Promise<string> {
  const id = uid();
  await db.blobs.put({ id, blob, type: blob.type || 'application/octet-stream', name, size: blob.size, createdAt: Date.now() });
  return id;
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

const toBlob = (c: HTMLCanvasElement, type: string, q: number) => new Promise<Blob | null>((r) => c.toBlob(r, type, q));

/** Сжать картинку: длинная сторона ≤ max px, webp (или jpeg, если webp не поддерживается). */
export async function compressImage(file: Blob, max = 1600, q = 0.82): Promise<Blob> {
  if (!file.type.startsWith('image/') || /svg|gif/.test(file.type)) return file;
  try {
    const img = await loadImage(file);
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    if (!g) return file;
    g.drawImage(img, 0, 0, w, h);
    const webp = await toBlob(c, 'image/webp', q);
    if (webp && webp.type === 'image/webp') return webp.size < file.size || scale < 1 ? webp : file;
    const jpg = await toBlob(c, 'image/jpeg', q);
    return jpg && (jpg.size < file.size || scale < 1) ? jpg : file;
  } catch {
    return file;
  }
}

export async function putImage(file: Blob, name = 'image', max = 1600) {
  return putBlob(await compressImage(file, max), name);
}

const urlCache = new Map<string, string>();

export async function delBlob(id?: string) {
  if (!id) return;
  await db.blobs.delete(id);
  const u = urlCache.get(id);
  if (u) {
    URL.revokeObjectURL(u);
    urlCache.delete(id);
  }
}

export async function blobUrl(id: string): Promise<string | undefined> {
  const c = urlCache.get(id);
  if (c) return c;
  const r = await db.blobs.get(id);
  if (!r) return undefined;
  const u = URL.createObjectURL(r.blob);
  urlCache.set(id, u);
  return u;
}

/** objectURL для blob из базы (кэшируется). */
export function useBlobUrl(id?: string) {
  const [url, setUrl] = useState<string | undefined>(() => (id ? urlCache.get(id) : undefined));
  useEffect(() => {
    if (!id) {
      setUrl(undefined);
      return;
    }
    let alive = true;
    blobUrl(id).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [id]);
  return url;
}

export function fileSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function svgBlob(svg: string) {
  return new Blob([svg], { type: 'image/svg+xml' });
}

export function downloadBlob(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
}
