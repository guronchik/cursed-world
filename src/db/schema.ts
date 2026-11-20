import Dexie, { type Table } from 'dexie';
import type { Grade } from '../lib/grade';
import { upgradeToV3 } from './migrate3';

// ───────────────────────── Типы сущностей ─────────────────────────

export interface Settings {
  id: 'app';
  lang: 'ru' | 'en';
  sound: boolean;
  motion: 'system' | 'reduce' | 'full';
  pinHash?: string;
  pinSalt?: string;
  lockAfterMin: number;
  gradeImages: Partial<Record<Grade, string>>; // blobId своей картинки для каждого грейда
  linkPreviews: boolean;
  campusMapId?: string;
  targetBodyWeight?: number;
  trainingPlan: Record<string, string | undefined>; // '0'..'6' (пн..вс) → templateId
  notifications: boolean;
  createdAt: number;
  // ── v2: внешний вид ──
  theme: 'dark' | 'light' | 'auto';
  jjkFx: boolean;
  perfMode: boolean;
  dock: boolean;
  fontMode: 'headings' | 'all';
  accents: Partial<Record<string, [string, string]>>;
  wallpaper: WallpaperSettings;
  // ── v2: календарь ──
  tz: string;
  notifyClassMin: number;
  notifyDeadlineMin: number;
  icsKeywords: string[];
  icsProxy: string;
  aitumapLink: string;
  // ── v3: семестр ──
  semester: Semester;
  // ── v4: анимации (заменяют motion и perfMode, старые поля оставлены для совместимости) ──
  animLevel: AnimLevel;
  animAutoFrom?: AnimLevel; // уровень, с которого FPS-сторож снизил анимации
  cursor: boolean;
  cursorSystem?: 'hide' | 'show'; // системный курсор при своём: скрыть или оставить рядом
  blurFx: boolean;
  pusherBlobId?: string; // свой PNG/SVG вместо человечка в прелоадере
  avatarBlobId?: string; // свой аватар/сигил для сцены «Большие цифры»
  yearManifest?: Record<string, string>; // манифест года: '2026' → текст
}

export type AnimLevel = 'cinematic' | 'smooth' | 'minimal' | 'off';

/** Семестр: границы, каникулы/праздничные недели (мои повторяющиеся занятия в них не показываются), отсчёт чётности недель. */
export interface Semester {
  start?: string; // yyyy-MM-dd
  end?: string;
  holidays: { id: string; from: string; to: string; name: string }[];
  parityBase: 'iso' | 'semester';
}

export interface WallpaperSettings {
  mode: 'global' | 'perTab';
  global: string; // builtin:<id> | blob:<id> | file:<name>
  perTab: Partial<Record<string, string>>;
  blur: number; // 0..40 px
  dim: number; // 0..0.8
  dynamic: boolean;
  uploads: string[]; // blob ids своих обоев
}

/** Источник календаря (ICS-файл, подписка по ссылке или вставленный текст). */
export interface CalSource {
  id: string;
  name: string;
  kind: 'file' | 'url' | 'text';
  url?: string;
  color: string;
  enabled: boolean;
  refreshHours: number;
  lastFetched?: number;
  lastError?: string;
  createdAt: number;
}

export interface IcsSnapshot {
  title: string;
  description: string;
  location: string;
  organizer: string;
  categories: string;
  start: number;
  end: number;
  allDay: boolean;
  rrule?: string;
  exdates: number[];
  tz?: string;
  hash: string;
}

/** Событие календаря. id = sourceId|UID|RECURRENCE-ID — повторный импорт обновляет, а не дублирует. */
export interface CalEvent {
  id: string;
  sourceId: string; // 'manual' для своих событий
  uid: string;
  recurrenceId?: number;
  title: string;
  description: string;
  location: string;
  organizer: string;
  categories: string;
  start: number;
  end: number;
  allDay: boolean;
  rrule?: string;
  exdates: number[];
  tz?: string;
  kind: 'class' | 'deadline' | 'event';
  kindManual?: boolean;
  subjectId?: string;
  color?: string;
  notes: string;
  hidden: boolean;
  locallyEdited: boolean;
  ics?: IcsSnapshot;
  conflict?: IcsSnapshot;
  curseId?: string; // v2: устарело, в v3 дедлайн связывается через assignmentId
  // ── v3 ──
  etype?: EventType;
  teacher?: string;
  parity?: 'odd' | 'even'; // числитель / знаменатель
  semesterBound?: boolean; // повторять до конца семестра (берётся из настроек)
  pinId?: string;
  classType?: 'lecture' | 'seminar' | 'lab' | 'other';
  assignmentId?: string; // дедлайн ICS добавлен в Assignments
  createdAt: number;
  updatedAt: number;
}

export type EventType = 'class' | 'exam' | 'office' | 'study' | 'event';

// ───── v3: задания отдельно от Curses ─────
export type AssignStatus = 'todo' | 'doing' | 'done';
export interface Assignment {
  id: string;
  title: string;
  subjectId?: string;
  due?: number;
  status: AssignStatus;
  grade: string;
  attachments: Attachment[];
  links: string[];
  notes: string;
  curseId?: string; // включён переключатель «Сделать Curse»
  importance: number; // для грейда Curse (1..5)
  source?: { kind: 'ics'; eventId: string; name: string; snap: { title: string; due?: number } };
  completedAt?: number;
  createdAt: number;
  updatedAt: number;
}

/** Связь Curse с заданием или видео (curseLinks): у Curse — link, у задания/видео — curseId. */
export interface CurseLink {
  kind: 'assignment' | 'video';
  id: string;
}

// ───── v3: YouTube Technique как база Notion ─────
export type VStatus = 'idea' | 'script' | 'shoot' | 'edit' | 'scheduled' | 'published';
export interface VIdea {
  id: string;
  text: string;
  kind: 'hook' | 'title' | 'thumb' | 'broll' | 'other';
  used: boolean;
  pinned: boolean;
  createdAt: number;
}
export interface VNote {
  id: string;
  text: string;
  tags: string[];
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}
/** v4: настраиваемая колонка статуса (YouTube Technique; тот же формат пригоден для других техник). */
export interface VideoStatus {
  id: string;
  name: string;
  color: string;
  order: number;
  isDone: boolean;
  key?: string; // стандартная колонка: idea | script | shoot | edit | scheduled | published
  createdAt: number;
}
export interface Video {
  id: string;
  title: string;
  statusId: string; // v4: ссылка на колонку videoStatuses
  status?: VStatus; // до v4: название статуса (оставлено для старых копий и миграции)
  format: 'long' | 'short';
  publishAt?: number;
  deadline?: number;
  priority: number; // 0 нет, 1 низкий, 2 средний, 3 высокий
  tags: string[];
  series: string;
  url: string;
  coverBlobId?: string;
  durationMin?: number;
  views?: number;
  likes?: number;
  viewsLog: { at: number; views: number }[];
  pipeline: { id: string; label: string; done: boolean }[];
  props: Record<string, string | number | boolean | undefined>;
  icon?: { name: string; color: string };
  ideas: VIdea[];
  notes: VNote[];
  curseId?: string;
  order: number;
  publishedAt?: number;
  createdAt: number;
  updatedAt: number;
}
export type BlockType = 'p' | 'h1' | 'h2' | 'h3' | 'bullet' | 'number' | 'todo' | 'toggle' | 'quote' | 'callout' | 'divider' | 'image' | 'embed' | 'bookmark' | 'table' | 'ideas' | 'notes';
/** Блок страницы. html — безопасный inline-HTML (b, i, u, s, code, a, mark, упоминания страниц). */
export interface Block {
  id: string;
  type: BlockType;
  html: string;
  checked?: boolean;
  open?: boolean; // toggle
  body?: string; // содержимое toggle
  color?: string; // фон блока / callout
  icon?: string; // callout
  indent?: number;
  blobId?: string;
  caption?: string;
  url?: string;
  preview?: { title?: string; image?: string; site?: string };
  rows?: string[][];
}
/** Документ страницы (видео, шаблон): блоки + плоский текст для поиска + исходящие ссылки для backlinks. */
export interface Doc {
  id: string;
  blocks: Block[];
  text: string;
  links: string[];
  updatedAt: number;
}
export interface InboxIdea {
  id: string;
  title: string;
  note: string;
  videoId?: string;
  createdAt: number;
}
export interface VideoProp {
  id: string;
  name: string;
  type: 'text' | 'number' | 'select' | 'checkbox' | 'date' | 'url';
  options?: string[];
}
export interface PageTemplate {
  id: string;
  name: string;
  blocks: Block[];
}

export interface KV {
  key: string;
  value: unknown;
}

export interface Attachment {
  id: string;
  blobId: string;
  name: string;
  type: string;
  size: number;
}

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

/** Техника = категория дедлайнов (University, YouTube, Piano, Personal, свои). */
export interface Technique {
  id: string;
  name: string;
  color: string;
  icon: string;
  kind: 'youtube' | 'university' | 'piano' | 'personal' | 'custom';
  stages?: string[]; // конвейер (YouTube: идея → публикация)
  trackMinutes?: boolean; // журнал минут практики + стрик
  repertoire?: boolean; // список произведений/проектов
  order: number;
  createdAt: number;
}

/** Curse — любой дедлайн/задача. Задания из универа — тоже Curse (isAssignment). */
export interface Curse {
  id: string;
  title: string;
  due: number;
  techniqueId: string;
  importance: number; // 1..5
  subtasks: Subtask[];
  notes: string;
  attachments: Attachment[];
  links: string[];
  goalId?: string; // месячная цель (Maximum Technique)
  stage?: number; // индекс этапа конвейера техники
  status: 'active' | 'exorcised';
  completedAt?: number;
  createdAt: number;
  isAssignment?: boolean;
  subjectId?: string;
  assignStatus?: 'todo' | 'progress' | 'done';
  score?: string;
  // v2: дедлайн пришёл из календаря (ICS)
  extSource?: string;
  calEventId?: string;
  icsSnap?: { title: string; due: number };
  // v3: Curse включён из задания или видео
  link?: CurseLink;
}

export interface Subject {
  id: string;
  name: string;
  color: string;
  teacher?: string;
}

export interface ClassSlot {
  id: string;
  subjectId: string;
  weekday: number; // 0 = пн
  start: string; // HH:mm
  end: string;
  room: string;
  teacher: string;
  type: 'lecture' | 'seminar' | 'lab' | 'other';
  weeks: 'all' | 'odd' | 'even';
  pinId?: string;
}

export interface MapPin {
  id: string;
  x: number; // 0..1 по ширине карты
  y: number; // 0..1 по высоте
  name: string;
  note: string;
  kind: 'building' | 'room' | 'other';
}

export interface GradeResult {
  id: string;
  subjectId: string;
  semester: number;
  label: string;
  score: number;
  max: number;
  date: string;
}

export interface RoutineStep {
  id: string;
  name: string;
  product?: string;
}

export interface Routine {
  id: string;
  slot: 'morning' | 'evening';
  name: string;
  steps: RoutineStep[];
}

export interface RoutineLog {
  id: string; // `${date}|${routineId}`
  date: string;
  routineId: string;
  done: string[];
}

export interface Med {
  id: string;
  name: string;
  dose: string;
  times: string[];
  perDose: number;
  stock: number;
  refillDays: number;
  reminders: boolean;
  notes: string;
  active: boolean;
  createdAt: number;
}

export interface MedLog {
  id: string; // `${date}|${medId}|${time}`
  date: string;
  medId: string;
  time: string;
  status: 'taken' | 'skipped';
  at: number;
}

export type Muscle = 'chest' | 'back' | 'legs' | 'shoulders' | 'arms' | 'core' | 'full';

export interface Exercise {
  id: string;
  name: string;
  muscle: Muscle;
  photoId?: string;
  videoUrl?: string;
  videoBlobId?: string;
  notes: string;
  targetWeight?: number;
  createdAt: number;
}

export interface WorkoutSet {
  id: string;
  reps: number;
  weight: number;
  pr?: boolean;
}

export interface WorkoutEntry {
  id: string;
  exerciseId: string;
  sets: WorkoutSet[];
}

export interface Workout {
  id: string;
  date: string;
  name: string;
  templateId?: string;
  entries: WorkoutEntry[];
  notes: string;
  finished: boolean;
  createdAt: number;
}

export interface Template {
  id: string;
  name: string;
  items: { exerciseId: string; sets: number; reps: number }[];
}

export interface BodyWeight {
  id: string; // = date
  date: string;
  kg: number;
}

export interface ProgressPhoto {
  id: string;
  week: string; // 2026-W47
  date: string;
  angle: 'front' | 'side' | 'back';
  blobId: string;
}

export interface PracticeLog {
  id: string;
  techniqueId: string;
  date: string;
  minutes: number;
  pieceId?: string;
  note: string;
}

export interface Piece {
  id: string;
  techniqueId: string;
  title: string;
  composer: string;
  status: 'learning' | 'polishing' | 'ready';
  progress: number;
  notes: string;
}

export interface Folder {
  id: string;
  name: string;
  icon: string;
  color: string;
  order: number;
}

export interface SaveItem {
  id: string;
  folderId?: string;
  kind: 'link' | 'note';
  title: string;
  url?: string;
  text: string;
  tags: string[];
  favorite: boolean;
  done: boolean;
  preview?: { title?: string; image?: string; site?: string };
  createdAt: number;
}

export interface Goal {
  id: string;
  level: 'year' | 'month';
  title: string;
  description: string;
  year: number;
  month?: string; // yyyy-MM для месячных
  parentId?: string; // годовая цель для месячной
  color: string;
  huge?: boolean;
  createdAt: number;
}

export interface Note {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
  desk?: { x: number; y: number; rot: number }; // v4: положение закреплённой заметки на «столе»
}

export interface VowEvent {
  at: number;
  type: 'created' | 'broken' | 'renewed' | 'fulfilled';
  note?: string;
}

export interface Vow {
  id: string;
  kind: 'vow' | 'restriction';
  sacrifice: string; // что жертвую / от чего отказываюсь
  forWhat: string; // ради чего / условие-цель
  goalId?: string;
  startDate: number; // начало действия (или последнего перезаключения)
  endDate: number; // конец срока действия
  deadline?: number; // дедлайн цели, ради которой ограничение
  penalty?: string;
  conditions?: string;
  strictness: number; // 1..5
  status: 'active' | 'fulfilled' | 'broken';
  history: VowEvent[];
  parentVowId?: string;
  createdAt: number;
}

export interface XpEvent {
  key: string;
  at: number;
  amount: number;
  reason: string;
  kind: string;
}

export interface Review {
  id: string; // W:2026-W47 или M:2026-11
  wins: string;
  fails: string;
  next: { id: string; text: string; curseId?: string }[];
  done: boolean;
  at: number;
}

export interface BlobRec {
  id: string;
  blob: Blob;
  type: string;
  name: string;
  size: number;
  createdAt: number;
}

// ───────────────────────── База данных ─────────────────────────

export class CursedDB extends Dexie {
  settings!: Table<Settings, string>;
  techniques!: Table<Technique, string>;
  curses!: Table<Curse, string>;
  subjects!: Table<Subject, string>;
  classes!: Table<ClassSlot, string>;
  pins!: Table<MapPin, string>;
  results!: Table<GradeResult, string>;
  routines!: Table<Routine, string>;
  routineLogs!: Table<RoutineLog, string>;
  meds!: Table<Med, string>;
  medLogs!: Table<MedLog, string>;
  exercises!: Table<Exercise, string>;
  workouts!: Table<Workout, string>;
  templates!: Table<Template, string>;
  bodyWeights!: Table<BodyWeight, string>;
  photos!: Table<ProgressPhoto, string>;
  practice!: Table<PracticeLog, string>;
  pieces!: Table<Piece, string>;
  folders!: Table<Folder, string>;
  saves!: Table<SaveItem, string>;
  goals!: Table<Goal, string>;
  notes!: Table<Note, string>;
  vows!: Table<Vow, string>;
  xp!: Table<XpEvent, string>;
  reviews!: Table<Review, string>;
  blobs!: Table<BlobRec, string>;
  kv!: Table<KV, string>;
  calSources!: Table<CalSource, string>;
  calEvents!: Table<CalEvent, string>;
  assignments!: Table<Assignment, string>;
  videos!: Table<Video, string>;
  docs!: Table<Doc, string>;
  ideas!: Table<InboxIdea, string>;
  videoStatuses!: Table<VideoStatus, string>;

  constructor() {
    super('cursed-world');
    this.version(1).stores(V1_STORES);
    this.version(2)
      .stores({ ...V1_STORES, ...V2_STORES })
      .upgrade(upgradeToV2);
    // v3: задания отдельно от Curses, свои занятия с повторами, YouTube-база. Старые таблицы и записи не удаляются.
    this.version(3)
      .stores({ ...V1_STORES, ...V2_STORES, ...V3_STORES })
      .upgrade(async (tx) => {
        await fillSettings(tx);
        await upgradeToV3(tx);
      });
    // v4: колонки статусов YouTube Technique — видео ссылаются на колонку по statusId. Ничего не удаляется.
    this.version(4)
      .stores({ ...V1_STORES, ...V2_STORES, ...V3_STORES, ...V4_STORES })
      .upgrade(async (tx) => {
        await fillSettings(tx);
        await upgradeToV4(tx);
      });
  }
}

const V4_STORES = {
  videos: 'id, statusId, publishAt, deadline, order, updatedAt',
  videoStatuses: 'id, order',
};

/** v3 → v4: шесть стандартных колонок и привязка видео по названию статуса. Повторный вызов ничего не дублирует. */
export async function upgradeToV4(tx: { table: (n: string) => Table<any, string> }) {
  const st = tx.table('videoStatuses');
  let cols: VideoStatus[] = await st.toArray();
  if (!cols.length) {
    const set = (await tx.table('settings').get('app')) as Settings | undefined;
    cols = defaultVideoStatuses(set?.lang || 'ru');
    await st.bulkPut(cols);
  }
  const byKey = new Map(cols.filter((c) => c.key).map((c) => [c.key!, c.id]));
  const ids = new Set(cols.map((c) => c.id));
  const first = cols.slice().sort((a, b) => a.order - b.order)[0];
  const vids: Video[] = await tx.table('videos').toArray();
  for (const v of vids) {
    if (v.statusId && ids.has(v.statusId)) continue;
    const statusId = (v.status && byKey.get(v.status)) || first.id;
    await tx.table('videos').put({ ...v, statusId });
  }
  await tx.table('settings').toCollection().modify((s: Settings) => {
    if (!s.animLevel) s.animLevel = s.motion === 'reduce' ? 'minimal' : 'cinematic';
    if (s.blurFx === undefined) s.blurFx = !s.perfMode;
    if (s.cursor === undefined) s.cursor = true;
  });
}

/** Стандартные колонки: id детерминированные, чтобы копии и импорт совпадали. */
export function defaultVideoStatuses(lang: 'ru' | 'en' = 'ru'): VideoStatus[] {
  const ru = lang === 'ru';
  const now = Date.now();
  const def: [string, string, string, boolean][] = [
    ['idea', ru ? 'Идея' : 'Idea', '#8e8e93', false],
    ['script', ru ? 'Сценарий' : 'Script', '#0a84ff', false],
    ['shoot', ru ? 'Съёмка' : 'Shoot', '#bf5af2', false],
    ['edit', ru ? 'Монтаж' : 'Edit', '#ff9f0a', false],
    ['scheduled', ru ? 'Запланировано' : 'Scheduled', '#64d2ff', false],
    ['published', ru ? 'Опубликовано' : 'Published', '#30d158', true],
  ];
  return def.map(([key, name, color, isDone], i) => ({ id: `vs-${key}`, key, name, color, order: i, isDone, createdAt: now }));
}

const V2_STORES = { kv: 'key', calSources: 'id', calEvents: 'id, sourceId, uid, start, kind, curseId' };
const V3_STORES = {
  calEvents: 'id, sourceId, uid, start, kind, curseId, assignmentId',
  assignments: 'id, subjectId, due, status, curseId',
  videos: 'id, status, publishAt, deadline, order, updatedAt',
  docs: 'id, updatedAt',
  ideas: 'id, createdAt',
};

const V1_STORES = {
      settings: 'id',
      techniques: 'id, order',
      curses: 'id, due, techniqueId, status, goalId, subjectId',
      subjects: 'id',
      classes: 'id, weekday, subjectId',
      pins: 'id',
      results: 'id, subjectId, semester',
      routines: 'id, slot',
      routineLogs: 'id, date, routineId',
      meds: 'id',
      medLogs: 'id, date, medId',
      exercises: 'id, muscle',
      workouts: 'id, date',
      templates: 'id',
      bodyWeights: 'id, date',
      photos: 'id, week',
      practice: 'id, techniqueId, date',
      pieces: 'id, techniqueId',
      folders: 'id, order',
      saves: 'id, folderId, createdAt',
      goals: 'id, level, month, year, parentId',
      notes: 'id, updatedAt',
      vows: 'id, status, kind',
      xp: 'key, at',
      reviews: 'id',
      blobs: 'id',
};

/** Эмодзи-иконки папок v1 → иконки в стиле SF Symbols v2. */
export const FOLDER_ICON_MAP: Record<string, string> = { '🎴': 'film', '📖': 'book', '🍜': 'utensils', '🎬': 'video', '💡': 'bulb', '📁': 'folder' };

/** Миграция v1 → v2: данные не трогаем, только добавляем новые поля и меняем эмодзи на иконки. */
async function fillSettings(tx: { table: (n: string) => Table<any, string> }) {
  await tx.table('settings').toCollection().modify((s: Settings) => {
    const d = DEFAULT_SETTINGS();
    for (const k of Object.keys(d) as (keyof Settings)[]) if ((s as any)[k] === undefined) (s as any)[k] = d[k];
  });
}

export async function upgradeToV2(tx: { table: (n: string) => Table<any, string> }) {
  await fillSettings(tx);
  await tx.table('folders').toCollection().modify((f: Folder) => {
    f.icon = FOLDER_ICON_MAP[f.icon] || (/^[a-z-]+$/.test(f.icon) ? f.icon : 'folder');
  });
}

export const db = new CursedDB();

/** Таблицы, которые попадают в экспорт (всё, кроме blobs — они экспортируются отдельно в base64). */
export const DATA_TABLES = [
  'settings',
  'techniques',
  'curses',
  'subjects',
  'classes',
  'pins',
  'results',
  'routines',
  'routineLogs',
  'meds',
  'medLogs',
  'exercises',
  'workouts',
  'templates',
  'bodyWeights',
  'photos',
  'practice',
  'pieces',
  'folders',
  'saves',
  'goals',
  'notes',
  'vows',
  'xp',
  'reviews',
  'kv',
  'calSources',
  'calEvents',
  'assignments',
  'videos',
  'docs',
  'ideas',
  'videoStatuses',
] as const;

export const DEFAULT_SETTINGS = (): Settings => ({
  id: 'app',
  lang: 'ru',
  sound: false,
  motion: 'system',
  lockAfterMin: 5,
  gradeImages: {},
  linkPreviews: true,
  trainingPlan: {},
  notifications: false,
  createdAt: Date.now(),
  theme: 'dark',
  jjkFx: false,
  perfMode: false,
  dock: false,
  fontMode: 'headings',
  accents: {},
  wallpaper: { mode: 'global', global: 'builtin:auto', perTab: {}, blur: 0, dim: 0.25, dynamic: false, uploads: [] },
  tz: 'Asia/Almaty',
  notifyClassMin: 10,
  notifyDeadlineMin: 60,
  icsKeywords: DEFAULT_ICS_KEYWORDS.slice(),
  icsProxy: '',
  aitumapLink: '',
  semester: { holidays: [], parityBase: 'iso' },
  animLevel: 'cinematic',
  cursor: true,
  blurFx: true,
});

export const DEFAULT_ICS_KEYWORDS = ['due', 'deadline', 'assignment', 'homework', 'quiz', 'exam', 'midterm', 'endterm', 'final', 'submission', 'submit', 'closes', 'project', 'essay', 'report', 'дедлайн', 'сдача', 'сдать', 'задание', 'экзамен', 'зачёт', 'зачет', 'контрольная', 'рубежка', 'срс', 'сро'];

export async function patchSettings(p: Partial<Settings>) {
  const s = (await db.settings.get('app')) || DEFAULT_SETTINGS();
  await db.settings.put({ ...s, ...p, id: 'app' });
}
