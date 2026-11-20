// Settings → Appearance и Calendar.
import { useEffect, useState } from 'react';
import { Icon } from '../../components/Icon';
import { NAV } from '../../components/nav';
import { wallpaperCss } from '../../components/Wallpaper';
import { Btn, Field, FilePick, Panel, Progress, Seg, TagInput, Toggle } from '../../components/ui';
import { TiltGallery } from '../../components/TiltGallery';
import { DEFAULT_ICS_KEYWORDS, patchSettings, type Settings } from '../../db/schema';
import { validTz } from '../../lib/ics';
import { delBlob, putImage, useBlobUrl } from '../../lib/media';
import { L } from '../../lib/runtime';
import { useDark, useSettings } from '../../lib/settings';
import { accentOf, accentVars, contrast, DEFAULT_ACCENTS, PRESETS, SECTION_NAME, SECTIONS, WALLPAPERS, type SectionId } from '../../lib/theme';

function AccentPreview({ a, b }: { a: string; b: string }) {
  const dark = useDark();
  return (
    <div className="rounded-2xl p-3 bg-panel-2 flex flex-wrap items-center gap-2" style={accentVars(a, b, dark)}>
      <span className="btn btn-sm">{L('Кнопка', 'Button')}</span>
      <span className="chip chip-on">{L('Чип', 'Chip')}</span>
      <span className="text-[15px] font-bold grad-text" style={{ fontFamily: 'var(--font-head)' }}>
        Cursed
      </span>
      <span className="text-[13px] text-acc">{L('ссылка', 'link')}</span>
      <Progress value={64} className="w-24" />
      <span className="app-icon w-7 h-7 !rounded-[8px]">
        <Icon name="flame" size={14} />
      </span>
    </div>
  );
}

export function AppearanceSettings() {
  const s = useSettings();
  const [sec, setSec] = useState<SectionId>('hq');
  const [a, b] = accentOf(s, sec);
  const setAccent = (pair: [string, string]) => patchSettings({ accents: { ...s.accents, [sec]: pair } });
  const ratio = contrast('#ffffff', a) < 3 && contrast('#111114', a) < 3;
  return (
    <Panel title={L('Внешний вид', 'Appearance')} kanji="面">
      <div className="space-y-5">
        <Field label={L('Тема', 'Theme')}>
          <Seg
            options={[
              { v: 'dark' as const, label: L('Тёмная', 'Dark') },
              { v: 'light' as const, label: L('Светлая', 'Light') },
              { v: 'auto' as const, label: L('Авто', 'Auto') },
            ]}
            value={s.theme}
            onChange={(theme) => patchSettings({ theme })}
          />
        </Field>
        <div className="grid sm:grid-cols-2 gap-x-4">
          <Toggle on={s.jjkFx} onChange={(jjkFx) => patchSettings({ jjkFx })} label={L('JJK FX: рамки, зерно, глитч', 'JJK FX: frames, grain, glitch')} />
          <Toggle on={s.dock} onChange={(dock) => patchSettings({ dock })} label={L('Dock вместо боковой панели (ПК)', 'Dock instead of sidebar (desktop)')} />
        </div>
        <Field label={L('Шрифт Jujutsu Kaisen', 'Jujutsu Kaisen font')} hint={L('Шрифт только латинский: кириллица всегда системная. «Весь текст» — латиница везде этим шрифтом.', 'The font is Latin-only; Cyrillic uses the system font. “All text” uses it for all Latin text.')}>
          <Seg
            options={[
              { v: 'headings' as const, label: L('Заголовки', 'Headings') },
              { v: 'all' as const, label: L('Весь текст', 'All text') },
            ]}
            value={s.fontMode}
            onChange={(fontMode) => patchSettings({ fontMode })}
          />
        </Field>

        <div>
          <div className="label mb-2 ml-1">{L('Цвет каждой вкладки', 'Color per tab')}</div>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {SECTIONS.map((x) => {
              const [p, q] = accentOf(s, x);
              return (
                <button key={x} className={`chip ${sec === x ? 'ring-2 ring-[var(--ink)]' : ''}`} onClick={() => setSec(x)}>
                  <span className="w-4 h-4 rounded-full" style={{ background: `linear-gradient(135deg, ${p}, ${q})` }} />
                  {SECTION_NAME[x]}
                </button>
              );
            })}
          </div>
          <AccentPreview a={a} b={b} />
          {ratio && <div className="text-[12px] text-gold mt-1.5 ml-1">{L('Низкий контраст — текст на кнопках может читаться хуже.', 'Low contrast — button text may be harder to read.')}</div>}
          <div className="grid grid-cols-6 sm:grid-cols-12 gap-2 mt-3">
            {PRESETS.map((p) => (
              <button key={p.id} title={p.name} aria-label={p.name} onClick={() => setAccent([p.a, p.b])} className={`aspect-square rounded-2xl ${a === p.a && b === p.b ? 'ring-2 ring-offset-2 ring-offset-[var(--bg)] ring-[var(--ink)]' : ''}`} style={{ background: `linear-gradient(135deg, ${p.a}, ${p.b})` }} />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-3">
            <label className="flex items-center gap-2 text-[13px]">
              <input type="color" value={a} onChange={(e) => setAccent([e.target.value, b])} className="w-9 h-9 rounded-lg bg-transparent" /> {L('Цвет 1', 'Color 1')}
            </label>
            <label className="flex items-center gap-2 text-[13px]">
              <input type="color" value={b} onChange={(e) => setAccent([a, e.target.value])} className="w-9 h-9 rounded-lg bg-transparent" /> {L('Цвет 2', 'Color 2')}
            </label>
            <Btn size="sm" variant="ghost" onClick={() => patchSettings({ accents: Object.fromEntries(SECTIONS.map((x) => [x, [a, b]])) })}>
              {L('Один цвет для всех', 'Same for all')}
            </Btn>
            <Btn size="sm" variant="ghost" icon="refresh" onClick={() => patchSettings({ accents: { ...s.accents, [sec]: undefined } })}>
              {L('Сбросить вкладку', 'Reset tab')}
            </Btn>
            <Btn size="sm" variant="ghost" onClick={() => patchSettings({ accents: {} })}>
              {L('Сбросить все', 'Reset all')}
            </Btn>
          </div>
          <div className="text-[11.5px] text-dim mt-2 ml-1">
            {L('По умолчанию', 'Default')}: {SECTION_NAME[sec]} {DEFAULT_ACCENTS[sec].join(' → ')} · {L('текст акцента автоматически подгоняется до контраста AA', 'accent text auto-adjusts to AA contrast')}
          </div>
        </div>
        <WallpaperSettings />
      </div>
    </Panel>
  );
}

function Thumb({ refId, on, onPick, onDelete }: { refId: string; on: boolean; onPick: () => void; onDelete?: () => void }) {
  const dark = useDark();
  const url = useBlobUrl(refId.startsWith('blob:') ? refId.slice(5) : undefined);
  const name = refId.startsWith('builtin:') ? (refId === 'builtin:auto' ? L('Авто', 'Auto') : WALLPAPERS.find((w) => `builtin:${w.id}` === refId)?.name()) : refId.startsWith('file:') ? refId.slice(5) : L('Моё фото', 'My photo');
  return (
    <div className="relative">
      <button onClick={onPick} className={`block w-full aspect-[4/3] rounded-2xl overflow-hidden ${on ? 'ring-2 ring-offset-2 ring-offset-[var(--bg)] ring-[var(--accent-1)]' : ''}`} style={{ background: wallpaperCss(refId, dark, url) }} aria-label={name} />
      <div className="text-[11px] text-muted truncate mt-1 text-center">{name}</div>
      {onDelete && (
        <button className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white grid place-items-center" onClick={onDelete} aria-label="delete">
          <Icon name="x" size={12} />
        </button>
      )}
    </div>
  );
}

function WallpaperSettings() {
  const s = useSettings();
  const w = s.wallpaper;
  const [tab, setTab] = useState<SectionId>('hq');
  const [files, setFiles] = useState<string[]>([]);
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}wallpapers/manifest.json`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((x: string[]) => setFiles(Array.isArray(x) ? x : []))
      .catch(() => setFiles([]));
  }, []);
  const save = (p: Partial<Settings['wallpaper']>) => patchSettings({ wallpaper: { ...w, ...p } });
  const current = w.mode === 'perTab' ? w.perTab?.[tab] || w.global : w.global;
  const pick = (ref: string) => (w.mode === 'perTab' ? save({ perTab: { ...w.perTab, [tab]: ref } }) : save({ global: ref }));
  const refs = ['builtin:auto', ...WALLPAPERS.map((x) => `builtin:${x.id}`), ...files.map((f) => `file:${f}`), ...w.uploads.map((id) => `blob:${id}`)];
  const [view, setView] = useState<'grid' | 'gallery'>('grid');
  const [preview, setPreview] = useState(current);
  const dark = useDark();
  const wpName = (r: string) => (r.startsWith('builtin:') ? (r === 'builtin:auto' ? L('Авто', 'Auto') : WALLPAPERS.find((x) => `builtin:${x.id}` === r)?.name() || r) : r.startsWith('file:') ? r.slice(5) : L('Моё фото', 'My photo'));
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <div className="label ml-1">{L('Обои', 'Wallpaper')}</div>
        <div className="ml-auto">
          <Seg options={[{ v: 'grid' as const, label: L('Сетка', 'Grid') }, { v: 'gallery' as const, label: L('Галерея', 'Gallery') }]} value={view} onChange={setView} />
        </div>
      </div>
      {view === 'gallery' && (
        <div className="rounded-[28px] overflow-hidden mb-4 transition-[background] duration-500" style={{ background: wallpaperCss(preview, dark, undefined) }}>
          <TiltGallery
            items={refs.filter((r) => !r.startsWith('blob:'))}
            label={L('Обои', 'Wallpapers')}
            getId={(r) => r}
            getTitle={wpName}
            getSubtitle={(r) => (r === current ? L('Сейчас на фоне', 'Current') : L('Нажми, чтобы применить', 'Tap to apply'))}
            getImage={(r) => <div className="absolute inset-0" style={{ background: wallpaperCss(r, dark, undefined) }} />}
            renderMeta={(r) => (
              <div className="space-y-2">
                <div className="text-[18px] font-bold">{wpName(r)}</div>
                <div className="text-[13px] text-muted">{r === current ? L('Уже применены', 'Applied') : L('Превью на фоне галереи. Нажми на карточку, чтобы применить.', 'Previewed behind the gallery. Tap the card to apply.')}</div>
              </div>
            )}
            onActive={(r) => setPreview(r)}
            onOpen={(r) => pick(r)}
          />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Seg
          options={[
            { v: 'global' as const, label: L('Один фон', 'One for all') },
            { v: 'perTab' as const, label: L('Свой на вкладку', 'Per tab') },
          ]}
          value={w.mode}
          onChange={(mode) => save({ mode })}
        />
        {w.mode === 'perTab' && (
          <select className="inp !w-auto" value={tab} onChange={(e) => setTab(e.target.value as SectionId)}>
            {NAV().map((n) => (
              <option key={n.section} value={n.section}>
                {n.label}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        {refs.map((r) => (
          <Thumb
            key={r}
            refId={r}
            on={current === r}
            onPick={() => pick(r)}
            onDelete={
              r.startsWith('blob:')
                ? async () => {
                    await delBlob(r.slice(5));
                    save({ uploads: w.uploads.filter((x) => `blob:${x}` !== r), global: w.global === r ? 'builtin:auto' : w.global, perTab: Object.fromEntries(Object.entries(w.perTab || {}).filter(([, v]) => v !== r)) });
                  }
                : undefined
            }
          />
        ))}
        <FilePick
          accept="image/*"
          className="aspect-[4/3] rounded-2xl border-2 border-dashed border-line grid place-items-center text-muted"
          onFiles={async ([f]) => {
            const id = await putImage(f, f.name, 1920);
            const ref = `blob:${id}`;
            await patchSettings({ wallpaper: { ...w, uploads: [...w.uploads, id], ...(w.mode === 'perTab' ? { perTab: { ...w.perTab, [tab]: ref } } : { global: ref }) } });
          }}
        >
          <span className="flex flex-col items-center gap-1 text-[12px]">
            <Icon name="upload" size={20} /> {L('Своё фото', 'Upload')}
          </span>
        </FilePick>
      </div>
      <div className="grid sm:grid-cols-2 gap-4 mt-4">
        <Field label={`Blur: ${w.blur}px`}>
          <input type="range" min={0} max={40} value={w.blur} onChange={(e) => save({ blur: Number(e.target.value) })} className="w-full accent-[var(--accent-1)]" />
        </Field>
        <Field label={`${L('Затемнение', 'Dim')}: ${Math.round(w.dim * 100)}%`}>
          <input type="range" min={0} max={80} value={Math.round(w.dim * 100)} onChange={(e) => save({ dim: Number(e.target.value) / 100 })} className="w-full accent-[var(--accent-1)]" />
        </Field>
      </div>
      <Toggle on={w.dynamic} onChange={(dynamic) => save({ dynamic })} label={L('Dynamic — оттенок по времени суток', 'Dynamic — tint by time of day')} />
      <p className="text-[11.5px] text-dim mt-1 ml-1">{L('Свои фото сжимаются до 1920px (webp). Файлы из папки public/wallpapers появляются здесь автоматически.', 'Your photos are compressed to 1920px (webp). Files in public/wallpapers show up here automatically.')}</p>
    </div>
  );
}

const TZS = ['Asia/Almaty', 'Asia/Aqtobe', 'Asia/Tashkent', 'Asia/Bishkek', 'Europe/Moscow', 'Europe/Kyiv', 'Europe/Berlin', 'Europe/London', 'Asia/Dubai', 'Asia/Shanghai', 'Asia/Tokyo', 'America/New_York', 'America/Los_Angeles', 'UTC'];

export function CalendarSettings() {
  const s = useSettings();
  const [tz, setTz] = useState(s.tz);
  const [proxy, setProxy] = useState(s.icsProxy);
  const [link, setLink] = useState(s.aitumapLink);
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone;
  return (
    <Panel title={L('Календарь и напоминания', 'Calendar & reminders')} kanji="暦">
      <div className="space-y-4">
        <Field label={L('Часовой пояс по умолчанию (для ICS без пояса)', 'Default timezone (for ICS without one)')} hint={validTz(tz) ? undefined : L('Неизвестный пояс — используй формат IANA, например Asia/Almaty', 'Unknown timezone — use IANA, e.g. Asia/Almaty')}>
          <div className="flex gap-2">
            <input className="inp" list="tz-list" value={tz} onChange={(e) => setTz(e.target.value)} onBlur={() => validTz(tz) && patchSettings({ tz })} />
            <datalist id="tz-list">
              {TZS.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>
        </Field>
        <Field label={L('Напоминание о паре за', 'Class reminder before')}>
          <Seg options={[0, 5, 10, 15, 30].map((m) => ({ v: m, label: m ? `${m} ${L('мин', 'min')}` : L('выкл', 'off') }))} value={s.notifyClassMin} onChange={(notifyClassMin) => patchSettings({ notifyClassMin })} />
        </Field>
        <Field label={L('Напоминание о дедлайне за', 'Deadline reminder before')}>
          <Seg options={[0, 30, 60, 180, 1440].map((m) => ({ v: m, label: !m ? L('выкл', 'off') : m < 60 ? `${m} ${L('мин', 'min')}` : m === 1440 ? L('сутки', '1 day') : `${m / 60} ${L('ч', 'h')}` }))} value={s.notifyDeadlineMin} onChange={(notifyDeadlineMin) => patchSettings({ notifyDeadlineMin })} />
        </Field>
        <div className="rounded-2xl p-3 bg-panel-2 text-[12.5px] text-muted flex gap-2">
          <Icon name="bell" size={15} className="shrink-0 mt-0.5" />
          <span>
            {L('Уведомления приходят, пока приложение открыто или работает в фоне. На iPhone они работают только после установки на экран «Домой» (Поделиться → На экран «Домой»), iOS 16.4+.', 'Notifications arrive while the app is open or in the background. On iPhone they only work after adding to Home Screen (Share → Add to Home Screen), iOS 16.4+.')}
            {isIOS && !standalone && <b className="block mt-1 text-ink">{L('Сейчас сайт открыт в Safari — установи его, чтобы получать напоминания.', 'You are in Safari now — install the app to get reminders.')}</b>}
          </span>
        </div>
        <Field label={L('Ключевые слова дедлайнов', 'Deadline keywords')} hint={L('Событие ICS с таким словом в названии становится дедлайном и создаёт Curse.', 'An ICS event with such a word in its title becomes a deadline and creates a Curse.')}>
          <TagInput value={s.icsKeywords} onChange={(icsKeywords) => patchSettings({ icsKeywords })} />
        </Field>
        <button className="chip" onClick={() => patchSettings({ icsKeywords: DEFAULT_ICS_KEYWORDS.slice() })}>
          <Icon name="refresh" size={12} /> {L('Слова по умолчанию', 'Default keywords')}
        </button>
        <Field label={L('Прокси для ICS-ссылок (необязательно)', 'ICS link proxy (optional)')} hint={L('Если Moodle не отдаёт ссылку браузеру из-за CORS. Готовый Cloudflare Worker — в папке tools/ репозитория. Формат: https://…workers.dev/?url={url}', 'If Moodle blocks the link due to CORS. A ready Cloudflare Worker is in the repo tools/ folder. Format: https://…workers.dev/?url={url}')}>
          <input className="inp" value={proxy} onChange={(e) => setProxy(e.target.value)} onBlur={() => patchSettings({ icsProxy: proxy.trim() })} placeholder="https://ics-proxy.you.workers.dev/?url={url}" />
        </Field>
        <Field label={L('Deep-link AITU Map (необязательно)', 'AITU Map deep link (optional)')} hint={L('Если карта поддерживает параметр аудитории — шаблон с {room}. Пусто: номер копируется в буфер.', 'If the map supports a room parameter — a template with {room}. Empty: the room is copied to clipboard.')}>
          <input className="inp" value={link} onChange={(e) => setLink(e.target.value)} onBlur={() => patchSettings({ aitumapLink: link.trim() })} placeholder="https://yuujiso.github.io/aitumap/?q={room}" />
        </Field>
      </div>
    </Panel>
  );
}

export function AnimationSettings() {
  const s = useSettings();
  const pusher = useBlobUrl(s.pusherBlobId);
  const avatar = useBlobUrl(s.avatarBlobId);
  const sysReduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return (
    <Panel title={L('Анимации', 'Animations')} kanji="動">
      <div className="space-y-4">
        <Field
          label={L('Уровень', 'Level')}
          hint={L(
            'Cinematic — занавесы, прелоадер, галереи с наклоном. Smooth — быстрые slide+fade 0.35 с. Minimal — fade 0.15 с. Off — без анимаций.',
            'Cinematic — curtains, preloader, tilt galleries. Smooth — quick 0.35 s slide+fade. Minimal — 0.15 s fade. Off — no animation.',
          )}
        >
          <Seg
            options={[
              { v: 'cinematic' as const, label: 'Cinematic' },
              { v: 'smooth' as const, label: 'Smooth' },
              { v: 'minimal' as const, label: 'Minimal' },
              { v: 'off' as const, label: 'Off' },
            ]}
            value={s.animLevel}
            onChange={(animLevel) => patchSettings({ animLevel, animAutoFrom: undefined })}
          />
        </Field>
        {sysReduce && s.animLevel !== 'off' && (
          <div className="rounded-2xl p-3 bg-panel-2 text-[12.5px] text-muted">{L('На устройстве включено «Уменьшение движения» — работает уровень Minimal.', 'Reduce Motion is on for this device — Minimal is used.')}</div>
        )}
        {s.animAutoFrom && (
          <div className="rounded-2xl p-3 bg-panel-2 text-[12.5px] text-muted flex flex-wrap items-center gap-2">
            <Icon name="zap" size={14} />
            <span className="flex-1 min-w-[200px]">{L(`Уровень снижен автоматически (было ${s.animAutoFrom}): анимации шли медленнее 45 FPS.`, `Lowered automatically (was ${s.animAutoFrom}): animations ran below 45 FPS.`)}</span>
            <Btn size="xs" variant="ghost" onClick={() => patchSettings({ animLevel: s.animAutoFrom, animAutoFrom: undefined })}>{L('Вернуть', 'Restore')}</Btn>
          </div>
        )}
        <div className="grid sm:grid-cols-2 gap-x-4">
          <Toggle on={s.cursor} onChange={(cursor) => patchSettings({ cursor })} label={L('Свой курсор (мышь)', 'Custom cursor (mouse)')} />
          <Toggle on={s.sound} onChange={(sound) => patchSettings({ sound })} label={L('Звуки', 'Sounds')} />
          <Toggle on={s.blurFx} onChange={(blurFx) => patchSettings({ blurFx, perfMode: !blurFx })} label={L('Эффекты размытия (стекло, blur)', 'Blur effects (glass, blur)')} />
        </div>
        {s.cursor && (
          <Field
            label={L('Системный курсор', 'System cursor')}
            hint={L('Браузер рисует свой курсор на кадр позже системного. «Оставить рядом» — стрелка остаётся видимой под точкой, и на глаз ничего не отстаёт.', 'Browsers draw a custom cursor one frame after the system one. “Keep” leaves the arrow visible under the dot so nothing appears to lag.')}
          >
            <Seg
              options={[
                { v: 'hide' as const, label: L('Скрыть', 'Hide') },
                { v: 'show' as const, label: L('Оставить рядом', 'Keep visible') },
              ]}
              value={s.cursorSystem || 'hide'}
              onChange={(cursorSystem) => patchSettings({ cursorSystem })}
            />
          </Field>
        )}
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label={L('Человечек в прелоадере', 'Preloader runner')} hint={L('PNG или SVG с прозрачным фоном.', 'PNG or SVG with a transparent background.')}>
            <div className="flex items-center gap-2">
              {pusher ? <img src={pusher} alt="" className="w-12 h-12 object-contain rounded-xl bg-panel-2" /> : <span className="w-12 h-12 rounded-xl bg-panel-2 grid place-items-center text-dim"><Icon name="user" size={18} /></span>}
              <FilePick accept="image/png,image/svg+xml,image/webp" className="chip" onFiles={async ([f]) => patchSettings({ pusherBlobId: await putImage(f, f.name, 512) })}>
                <Icon name="upload" size={13} /> {L('Загрузить', 'Upload')}
              </FilePick>
              {s.pusherBlobId && <button className="chip" onClick={() => void delBlob(s.pusherBlobId).then(() => patchSettings({ pusherBlobId: undefined }))}>{L('Стандартный', 'Default')}</button>}
            </div>
          </Field>
          <Field label={L('Аватар сцены «Большие цифры»', 'Big Numbers avatar')} hint={L('Для Domain Expansion и Weekly Review. Лучше PNG без фона.', 'For Domain Expansion and Weekly Review. PNG without background works best.')}>
            <div className="flex items-center gap-2">
              {avatar ? <img src={avatar} alt="" className="w-12 h-12 object-contain rounded-xl bg-panel-2" /> : <span className="w-12 h-12 rounded-xl bg-panel-2 grid place-items-center text-dim"><Icon name="user" size={18} /></span>}
              <FilePick accept="image/png,image/svg+xml,image/webp" className="chip" onFiles={async ([f]) => patchSettings({ avatarBlobId: await putImage(f, f.name, 800) })}>
                <Icon name="upload" size={13} /> {L('Загрузить', 'Upload')}
              </FilePick>
              {s.avatarBlobId && <button className="chip" onClick={() => void delBlob(s.avatarBlobId).then(() => patchSettings({ avatarBlobId: undefined }))}>{L('Стандартный', 'Default')}</button>}
            </div>
          </Field>
        </div>
        <Btn size="sm" variant="ghost" icon="refresh" onClick={() => { sessionStorage.removeItem('cw-preloaded'); location.reload(); }}>
          {L('Показать прелоадер ещё раз', 'Replay preloader')}
        </Btn>
      </div>
    </Panel>
  );
}
