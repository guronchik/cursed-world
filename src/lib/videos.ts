// YouTube Technique: сохранение видео и страниц, шаблоны, свои свойства, Idea Inbox, статистика, экспорт.
import { db, type Block, type Doc, type InboxIdea, type PageTemplate, type Video, type VideoProp, type VideoStatus } from '../db/schema';
import { blocksLinks, blocksText, blocksToMarkdown, cloneBlocks, defaultVideoTemplate, escapeHtml, newBlock } from './blocks';
import { dayKey, fmt } from './dates';
import { toast } from './fx';
import { afterVideoSave } from './linked';
import { downloadBlob } from './media';
import { L, uid } from './runtime';
import { isDoneIn, newVideo, pipelineForColumn, PRIORITY, progressOf, sortCols, statusOf } from './videoMeta';

export const TEMPLATES_KEY = 'video-templates';
export const DEFAULT_TEMPLATE_KEY = 'video-template-default';
export const PROPS_KEY = 'video-props';

// ───── видео ─────

/**
 * Сохранить видео: колонка ↔ пайплайн, дата публикации, связанный Curse, XP.
 * «Опубликовано» = видео в колонке с флагом Done. prevCol — прежнее состояние колонки (когда у неё переключили Done).
 */
export async function saveVideo(v: Video, prevCol?: VideoStatus) {
  const prev = await db.videos.get(v.id);
  const cols = await db.videoStatuses.toArray();
  const col = cols.find((c) => c.id === v.statusId);
  const wasDone = prevCol ? prevCol.isDone : prev ? isDoneIn(prev, cols) : false;
  const done = !!col?.isDone;
  const next = { ...v, updatedAt: Date.now() };
  if (prev && prev.statusId !== next.statusId) next.pipeline = pipelineForColumn(next.pipeline, col);
  if (done && !next.publishedAt) next.publishedAt = Date.now();
  if (!done && wasDone) next.publishedAt = undefined;
  await db.videos.put(next);
  await afterVideoSave(wasDone, done, next);
  return next;
}

export async function patchVideo(id: string, patch: Partial<Video>) {
  const v = await db.videos.get(id);
  if (!v) return;
  return saveVideo({ ...v, ...patch });
}

export async function saveDoc(id: string, blocks: Block[]) {
  const doc: Doc = { id, blocks, text: blocksText(blocks), links: blocksLinks(blocks).filter((x) => x !== id), updatedAt: Date.now() };
  await db.docs.put(doc);
  return doc;
}

/** Новое видео из шаблона (по умолчанию — выбранный шаблон или встроенный). */
export async function createVideo(p: Partial<Video> = {}, templateId?: string, extraBlocks: Block[] = []) {
  const all = await db.videos.toArray();
  // без указанной колонки — первая (шаблон новой страницы берёт колонки из таблицы videoStatuses)
  const first = sortCols(await db.videoStatuses.toArray())[0];
  const v = newVideo({ order: (all.reduce((m, x) => Math.max(m, x.order), 0) || 0) + 1, statusId: first?.id || '', ...p });
  const tpl = await templateBlocks(templateId);
  const blocks = cloneBlocks(tpl);
  if (extraBlocks.length) blocks.splice(1, 0, ...extraBlocks);
  await db.videos.put(v);
  await saveDoc(v.id, blocks);
  return v;
}

export async function duplicateVideo(id: string) {
  const v = await db.videos.get(id);
  if (!v) return;
  const doc = await db.docs.get(id);
  const cols = sortCols(await db.videoStatuses.toArray());
  const copy = newVideo({ ...v, id: uid(), title: `${v.title} ${L('(копия)', '(copy)')}`, curseId: undefined, statusId: isDoneIn(v, cols) ? cols.find((c) => !c.isDone)?.id || v.statusId : v.statusId, publishedAt: undefined, views: undefined, likes: undefined, viewsLog: [], order: v.order + 0.5, createdAt: Date.now() });
  await db.videos.put(copy);
  await saveDoc(copy.id, cloneBlocks(doc?.blocks || []));
  return copy;
}

export async function deleteVideo(id: string) {
  const v = await db.videos.get(id);
  if (!v) return;
  if (v.curseId) await db.curses.delete(v.curseId);
  await db.videos.delete(id);
  await db.docs.delete(id);
  for (const i of await db.ideas.toArray()) if (i.videoId === id) await db.ideas.put({ ...i, videoId: undefined });
}

// ───── шаблоны страниц ─────

export async function getTemplates(): Promise<PageTemplate[]> {
  const kv = await db.kv.get(TEMPLATES_KEY);
  const list = Array.isArray(kv?.value) ? (kv.value as PageTemplate[]) : [];
  if (list.length) return list;
  return [{ id: 'default', name: L('Видео (стандарт)', 'Video (standard)'), blocks: defaultVideoTemplate() }];
}
export async function saveTemplates(list: PageTemplate[]) {
  await db.kv.put({ key: TEMPLATES_KEY, value: list });
}
export async function defaultTemplateId() {
  const kv = await db.kv.get(DEFAULT_TEMPLATE_KEY);
  return typeof kv?.value === 'string' ? kv.value : 'default';
}
async function templateBlocks(id?: string) {
  const list = await getTemplates();
  const want = id || (await defaultTemplateId());
  return (list.find((t) => t.id === want) || list[0]).blocks;
}

// ───── свои свойства ─────

export async function getProps(): Promise<VideoProp[]> {
  const kv = await db.kv.get(PROPS_KEY);
  return Array.isArray(kv?.value) ? (kv.value as VideoProp[]) : [];
}
export async function saveProps(list: VideoProp[]) {
  await db.kv.put({ key: PROPS_KEY, value: list });
}

// ───── Idea Inbox ─────

export async function addInboxIdea(title: string, note = '') {
  const t = title.trim();
  if (!t) return;
  const i: InboxIdea = { id: uid(), title: t, note: note.trim(), createdAt: Date.now() };
  await db.ideas.put(i);
  return i;
}

/** «Превратить в видео»: страница из шаблона, текст идеи переносится в начало. */
export async function ideaToVideo(i: InboxIdea) {
  const extra: Block[] = i.note ? i.note.split(/\n{2,}/).map((p) => newBlock('p', escapeHtml(p).replace(/\n/g, '<br>'))) : [];
  const v = await createVideo({ title: i.title }, undefined, extra);
  await db.ideas.put({ ...i, videoId: v.id });
  toast(L('Идея стала видео', 'The idea is now a video'));
  return v;
}

// ───── статистика ─────

export function videoStats(videos: Video[], cols: VideoStatus[], now = Date.now()) {
  const byStatus: Record<string, number> = Object.fromEntries(cols.map((c) => [c.id, videos.filter((v) => v.statusId === c.id).length]));
  const noStatus = videos.filter((v) => !cols.some((c) => c.id === v.statusId)).length;
  const m = new Date(now);
  const monthStart = new Date(m.getFullYear(), m.getMonth(), 1).getTime();
  const done = (v: Video) => isDoneIn(v, cols);
  const publishedMonth = videos.filter((v) => done(v) && (v.publishedAt ?? 0) >= monthStart).length;
  const spans = videos.filter((v) => done(v) && v.publishedAt && v.publishedAt >= v.createdAt).map((v) => (v.publishedAt! - v.createdAt) / 864e5);
  const avgDays = spans.length ? Math.round((spans.reduce((a, b) => a + b, 0) / spans.length) * 10) / 10 : null;
  const views = videos.reduce((s, v) => s + (v.views || 0), 0);
  const likes = videos.reduce((s, v) => s + (v.likes || 0), 0);
  // график просмотров: сумма последних введённых значений по дням
  const days = [...new Set(videos.flatMap((v) => (v.viewsLog || []).map((p) => dayKey(p.at))))].sort();
  const series = days.map((d) => {
    const end = new Date(`${d}T23:59:59`).getTime();
    let total = 0;
    for (const v of videos) {
      const last = (v.viewsLog || []).filter((p) => p.at <= end).sort((a, b) => b.at - a.at)[0];
      if (last) total += last.views;
    }
    return { day: d, views: total };
  });
  return { byStatus, noStatus, publishedMonth, avgDays, views, likes, series };
}

// ───── экспорт ─────

const safeName = (s: string) => (s || 'video').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'video';

function frontMatter(v: Video, cols: VideoStatus[]) {
  const lines = [
    `# ${v.title || L('Без названия', 'Untitled')}`,
    '',
    `- ${L('Статус', 'Status')}: ${statusOf(v, cols).name}`,
    `- ${L('Формат', 'Format')}: ${v.format === 'short' ? 'Short' : 'Long'}`,
    v.publishAt ? `- ${L('Публикация', 'Publish')}: ${fmt(v.publishAt, 'yyyy-MM-dd HH:mm')}` : '',
    v.deadline ? `- ${L('Дедлайн', 'Deadline')}: ${fmt(v.deadline, 'yyyy-MM-dd HH:mm')}` : '',
    v.priority ? `- ${L('Приоритет', 'Priority')}: ${PRIORITY()[v.priority]}` : '',
    v.tags.length ? `- ${L('Теги', 'Tags')}: ${v.tags.join(', ')}` : '',
    v.series ? `- ${L('Серия', 'Series')}: ${v.series}` : '',
    v.url ? `- YouTube: ${v.url}` : '',
    v.durationMin ? `- ${L('Длительность', 'Duration')}: ${v.durationMin} ${L('мин', 'min')}` : '',
    v.views !== undefined ? `- ${L('Просмотры', 'Views')}: ${v.views}` : '',
    v.likes !== undefined ? `- ${L('Лайки', 'Likes')}: ${v.likes}` : '',
    `- ${L('Прогресс', 'Progress')}: ${progressOf(v, cols)}%`,
    ...Object.entries(v.props || {})
      .filter(([, x]) => x !== undefined && x !== '')
      .map(([k, x]) => `- ${k}: ${x}`),
  ];
  return lines.filter((l, i) => l !== '' || i === 1).join('\n');
}

export async function videoMarkdown(v: Video) {
  const doc = await db.docs.get(v.id);
  const titles = new Map((await db.videos.toArray()).map((x) => [x.id, x.title]));
  const ideas = v.ideas.length ? v.ideas.map((i) => `- [${i.used ? 'x' : ' '}] ${i.pinned ? '(pin) ' : ''}${i.kind}: ${i.text}`).join('\n') : '';
  const notes = v.notes.length ? v.notes.map((n) => `- ${fmt(n.createdAt, 'yyyy-MM-dd')}${n.tags.length ? ` [${n.tags.join(', ')}]` : ''}: ${n.text.replace(/\n/g, ' ')}`).join('\n') : '';
  const pipeline = v.pipeline.map((s) => `- [${s.done ? 'x' : ' '}] ${s.label}`).join('\n');
  const body = blocksToMarkdown(doc?.blocks || [], { titleOf: (id) => titles.get(id), ideas, notes });
  return `${frontMatter(v, await db.videoStatuses.toArray())}\n\n## ${L('Пайплайн', 'Pipeline')}\n\n${pipeline}\n\n${body}\n`;
}

export async function exportVideoMd(v: Video) {
  downloadBlob(new Blob([await videoMarkdown(v)], { type: 'text/markdown' }), `${safeName(v.title)}.md`);
}

export async function exportVideoJson(v: Video) {
  const doc = await db.docs.get(v.id);
  downloadBlob(new Blob([JSON.stringify({ app: 'cursed-world', kind: 'video', video: v, doc }, null, 2)], { type: 'application/json' }), `${safeName(v.title)}.json`);
}

export async function exportAllMd() {
  const vids = (await db.videos.toArray()).sort((a, b) => a.order - b.order);
  const parts: string[] = [`# YouTube Technique — ${fmt(Date.now(), 'yyyy-MM-dd')}`, ''];
  for (const v of vids) parts.push(await videoMarkdown(v), '---', '');
  const inbox = (await db.ideas.toArray()).filter((i) => !i.videoId);
  if (inbox.length) parts.push(`# Idea Inbox`, '', ...inbox.map((i) => `- ${i.title}${i.note ? ` — ${i.note.replace(/\n/g, ' ')}` : ''}`));
  downloadBlob(new Blob([parts.join('\n')], { type: 'text/markdown' }), `youtube-technique-${dayKey()}.md`);
}

export async function exportAllJson() {
  const payload = {
    app: 'cursed-world',
    kind: 'youtube-technique',
    exportedAt: new Date().toISOString(),
    videos: await db.videos.toArray(),
    columns: await db.videoStatuses.toArray(),
    docs: await db.docs.toArray(),
    ideas: await db.ideas.toArray(),
    templates: await getTemplates(),
    props: await getProps(),
  };
  downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `youtube-technique-${dayKey()}.json`);
}
