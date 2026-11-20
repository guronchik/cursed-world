// YouTube Technique: колонки статусов (v4 — настраиваемые), пайплайн, иконки страниц. Чистый модуль (без базы).
import type { Video, VideoStatus, VStatus } from '../db/schema';
import { L, uid } from './runtime';

/** Названия статусов до v4 — нужны только миграциям. */
export const VSTATUSES: VStatus[] = ['idea', 'script', 'shoot', 'edit', 'scheduled', 'published'];

/** Иконки стандартных колонок; у своих колонок — нейтральная. */
const KEY_ICON: Record<string, string> = { idea: 'help', script: 'edit', shoot: 'video', edit: 'film', scheduled: 'calendar', published: 'check' };

/** «Нет колонки» — видео из удалённой или неизвестной колонки ничего не ломает. */
export const NO_STATUS = (): VideoStatus => ({ id: '', name: L('Без статуса', 'No status'), color: '#8e8e93', order: -1, isDone: false, createdAt: 0 });

export const sortCols = (cols: VideoStatus[]) => cols.slice().sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);

export function statusOf(v: Pick<Video, 'statusId'>, cols: VideoStatus[]): VideoStatus {
  return cols.find((c) => c.id === v.statusId) || NO_STATUS();
}
export const isDoneIn = (v: Pick<Video, 'statusId'>, cols: VideoStatus[]) => !!cols.find((c) => c.id === v.statusId)?.isDone;

/** Этапы пайплайна (чек-лист): прогресс видео = отмеченные / все. */
export function defaultPipeline(): Video['pipeline'] {
  return [
    { id: 'idea', label: L('Идея', 'Idea'), done: false },
    { id: 'script', label: L('Сценарий', 'Script'), done: false },
    { id: 'shoot', label: L('Съёмка', 'Shoot'), done: false },
    { id: 'edit', label: L('Монтаж', 'Edit'), done: false },
    { id: 'thumb', label: L('Обложка', 'Thumbnail'), done: false },
    { id: 'publish', label: L('Публикация', 'Publish'), done: false },
  ];
}

/** При переходе в колонку отмечаем пройденные этапы (только добавляем отметки). Done-колонка закрывает весь чек-лист. */
export function pipelineForColumn(p: Video['pipeline'], col: Pick<VideoStatus, 'key' | 'isDone'> | undefined) {
  if (!col) return p;
  if (col.isDone) return p.map((s) => ({ ...s, done: true }));
  const upto: Record<string, string[]> = {
    idea: [],
    script: ['idea'],
    shoot: ['idea', 'script'],
    edit: ['idea', 'script', 'shoot'],
    scheduled: ['idea', 'script', 'shoot', 'edit', 'thumb'],
  };
  const list = (col.key && upto[col.key]) || [];
  return p.map((s) => (list.includes(s.id) ? { ...s, done: true } : s));
}
/** Совместимость со старым кодом миграции (v3): статус-строка → отметки. */
export const pipelineForStatus = (p: Video['pipeline'], status: VStatus) => pipelineForColumn(p, { key: status, isDone: status === 'published' });

/** Прогресс: по чек-листу, а без чек-листа — по положению колонки (индекс / (колонок − 1)). */
export function progressOf(v: Pick<Video, 'pipeline' | 'statusId'>, cols?: VideoStatus[]) {
  if (v.pipeline?.length) return Math.round((v.pipeline.filter((s) => s.done).length / v.pipeline.length) * 100);
  if (!cols?.length) return 0;
  const list = sortCols(cols);
  const i = list.findIndex((c) => c.id === v.statusId);
  if (i < 0) return 0;
  if (list[i].isDone) return 100;
  return list.length > 1 ? Math.round((i / (list.length - 1)) * 100) : 0;
}

export const PRIORITY = () => [L('Нет', 'None'), L('Низкий', 'Low'), L('Средний', 'Medium'), L('Высокий', 'High')];
export const PRIORITY_COLOR = ['#8e8e93', '#64d2ff', '#ffd60a', '#ff453a'];

/** Иконки страниц (в духе Notion, без эмодзи). */
export const PAGE_ICONS = ['check', 'help', 'stop', 'square', 'video', 'film', 'bulb', 'flame', 'star', 'bolt', 'edit', 'calendar', 'music', 'heart', 'skull', 'trophy'];
export const PAGE_COLORS = ['#30d158', '#0a84ff', '#ff453a', '#8e8e93', '#ff9f0a', '#bf5af2', '#ff375f', '#64d2ff', '#ffd60a'];
/** 12 готовых цветов колонок. */
export const COLUMN_COLORS = ['#8e8e93', '#0a84ff', '#bf5af2', '#ff9f0a', '#64d2ff', '#30d158', '#ff453a', '#ff375f', '#ffd60a', '#5e5ce6', '#ac8e68', '#00c7be'];

export function iconOf(v: Pick<Video, 'icon' | 'statusId'>, cols: VideoStatus[] = []) {
  if (v.icon) return v.icon;
  const c = statusOf(v, cols);
  return { name: (c.key && KEY_ICON[c.key]) || (c.isDone ? 'check' : c.id ? 'square' : 'help'), color: c.color };
}

export function newVideo(p: Partial<Video> = {}): Video {
  const now = Date.now();
  return {
    id: uid(),
    title: '',
    statusId: '',
    format: 'long',
    priority: 0,
    tags: [],
    series: '',
    url: '',
    viewsLog: [],
    pipeline: p.status ? pipelineForStatus(defaultPipeline(), p.status) : defaultPipeline(),
    props: {},
    ideas: [],
    notes: [],
    order: now,
    createdAt: now,
    updatedAt: now,
    ...p,
  };
}
