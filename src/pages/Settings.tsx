// Настройки: язык, звук, анимации, PIN, картинки грейдов, уведомления, экспорт/импорт, хранилище, установка PWA.
import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { Monster } from '../components/Monster';
import { Seal } from '../components/Seal';
import { Btn, Field, FilePick, ImagePick, PageTitle, Panel, Seg, Toggle } from '../components/ui';
import { exportAll, importAll } from '../db/backup';
import { db, patchSettings } from '../db/schema';
import { initEmpty, seedDemo, wipeAll } from '../db/seed';
import { restoreDemoTraining } from '../lib/training';
import { fmt } from '../lib/dates';
import { confirmBox, toast } from '../lib/fx';
import { GRADE_COLOR, gradeHint, gradeName, GRADES, type Grade } from '../lib/grade';
import { delBlob, downloadBlob, fileSize } from '../lib/media';
import { hashPin, newSalt } from '../lib/pin';
import { L } from '../lib/runtime';
import { useSettings } from '../lib/settings';
import { AnimationSettings, AppearanceSettings, CalendarSettings } from './settings/Appearance';

type InstallEvt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export function SettingsPage() {
  const s = useSettings();
  const [pin1, setPin1] = useState('');
  const [pin2, setPin2] = useState('');
  const [storage, setStorage] = useState<{ usage: number; quota: number; persisted: boolean } | null>(null);
  const [installable, setInstallable] = useState(() => !!(window as unknown as { __installPrompt?: InstallEvt }).__installPrompt);

  const refreshStorage = async () => {
    if (!navigator.storage?.estimate) return;
    const e = await navigator.storage.estimate();
    const persisted = (await navigator.storage.persisted?.()) ?? false;
    setStorage({ usage: e.usage || 0, quota: e.quota || 0, persisted });
  };
  useEffect(() => {
    void refreshStorage();
    const fn = () => setInstallable(true);
    window.addEventListener('cw-installable', fn);
    return () => window.removeEventListener('cw-installable', fn);
  }, []);

  const pinValid = /^\d{4,6}$/.test(pin1) && pin1 === pin2;

  return (
    <div>
      <PageTitle title="Settings" kanji="設定" sub={L('Всё хранится только на этом устройстве (IndexedDB).', 'Everything is stored on this device only (IndexedDB).')} />
      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <Panel title={L('Интерфейс', 'Interface')} kanji="設">
          <div className="space-y-4">
            <Field label="Язык / Language">
              <Seg
                options={[
                  { v: 'ru' as const, label: 'Русский' },
                  { v: 'en' as const, label: 'English' },
                ]}
                value={s.lang}
                onChange={(lang) => patchSettings({ lang })}
              />
            </Field>
            <Toggle on={s.linkPreviews} onChange={(linkPreviews) => patchSettings({ linkPreviews })} label={L('Авто-превью ссылок (запрос к microlink.io / noembed)', 'Auto link previews (microlink.io / noembed)')} />
            <div className="flex flex-wrap items-center gap-3">
              <Toggle
                on={s.notifications}
                onChange={async (v) => {
                  if (v && 'Notification' in window) {
                    const p = await Notification.requestPermission();
                    await patchSettings({ notifications: p === 'granted' });
                    if (p !== 'granted') toast(L('Браузер запретил уведомления', 'Notifications are blocked'), 'warn');
                  } else await patchSettings({ notifications: false });
                }}
                label={L('Системные уведомления-напоминания', 'System reminder notifications')}
              />
            </div>
            <p className="text-[11px] text-dim">{L('Напоминания о таблетках, парах и дедлайнах работают, пока приложение открыто (вкладка или установленное PWA). Время напоминаний — в блоке «Календарь».', 'Reminders for pills, classes and deadlines work while the app is open (tab or installed PWA). Lead times are in the Calendar block.')}</p>
          </div>
        </Panel>

        <CalendarSettings />

        <div className="lg:col-span-2 min-w-0">
          <AppearanceSettings />
        </div>

        <div className="lg:col-span-2 min-w-0">
          <AnimationSettings />
        </div>

        <Panel title={L('PIN-код на вход', 'Entry PIN')} kanji="封">
          {s.pinHash ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Seal text="封" size={48} />
                <div className="text-sm">{L('Барьер включён. При каждом открытии нужен PIN.', 'Barrier is on. PIN is required on each launch.')}</div>
              </div>
              <Field label={L('Автоблокировка в фоне через', 'Auto-lock in background after')}>
                <Seg options={[1, 5, 15, 60].map((m) => ({ v: m, label: `${m} ${L('мин', 'min')}` }))} value={s.lockAfterMin} onChange={(lockAfterMin) => patchSettings({ lockAfterMin })} />
              </Field>
              <Btn
                size="sm"
                variant="danger"
                icon="x"
                onClick={async () => {
                  if (await confirmBox(L('Отключить PIN-код?', 'Disable PIN?'), { danger: true })) {
                    await patchSettings({ pinHash: undefined, pinSalt: undefined });
                    toast(L('PIN отключён', 'PIN disabled'));
                  }
                }}
              >
                {L('Отключить PIN', 'Disable PIN')}
              </Btn>
            </div>
          ) : (
            <form
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!pinValid) return;
                const salt = newSalt();
                const hash = await hashPin(pin1, salt);
                sessionStorage.setItem('cw-unlocked', hash);
                await patchSettings({ pinHash: hash, pinSalt: salt });
                setPin1('');
                setPin2('');
                toast(L('PIN установлен', 'PIN set'));
              }}
            >
              <div className="grid grid-cols-2 gap-3">
                <Field label={L('PIN (4–6 цифр)', 'PIN (4–6 digits)')}>
                  <input className="inp mono tracking-[0.4em]" type="password" inputMode="numeric" maxLength={6} value={pin1} onChange={(e) => setPin1(e.target.value.replace(/\D/g, ''))} autoComplete="new-password" />
                </Field>
                <Field label={L('Ещё раз', 'Repeat')}>
                  <input className="inp mono tracking-[0.4em]" type="password" inputMode="numeric" maxLength={6} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))} autoComplete="new-password" />
                </Field>
              </div>
              <Btn type="submit" icon="lock" disabled={!pinValid}>
                {L('Установить PIN', 'Set PIN')}
              </Btn>
              <p className="text-[11px] text-dim">{L('PIN закрывает экран от чужих глаз. Данные в браузере не шифруются — для настоящей защиты используй блокировку устройства.', 'The PIN hides the screen from others. Browser data is not encrypted — use device lock for real protection.')}</p>
            </form>
          )}
        </Panel>

        <Panel title={L('Монстры грейдов', 'Grade monsters')} kanji="呪霊" className="lg:col-span-2">
          <p className="text-[12px] text-muted mb-3">{L('Можно заменить оригинальных монстров своей картинкой для каждого грейда.', 'Replace the original monsters with your own image for each grade.')}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {GRADES.map((g: Grade) => (
              <div key={g} className="p-3 border border-line/60 bg-void/40 flex flex-col items-center text-center">
                <Monster grade={g} size={84} />
                <div className="h-display text-sm mt-2" style={{ color: GRADE_COLOR[g] }}>
                  {gradeName(g)}
                </div>
                <div className="text-[10.5px] text-dim">{gradeHint(g)}</div>
                <div className="flex gap-1 mt-2">
                  <ImagePick
                    max={512}
                    className="btn btn-ghost btn-xs"
                    onPicked={async (id) => {
                      await delBlob(s.gradeImages[g]);
                      await patchSettings({ gradeImages: { ...s.gradeImages, [g]: id } });
                    }}
                  >
                    <Icon name="upload" size={11} /> {L('Своя', 'Custom')}
                  </ImagePick>
                  {s.gradeImages[g] && (
                    <Btn
                      size="xs"
                      variant="ghost"
                      icon="refresh"
                      onClick={async () => {
                        await delBlob(s.gradeImages[g]);
                        const next = { ...s.gradeImages };
                        delete next[g];
                        await patchSettings({ gradeImages: next });
                      }}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title={L('Данные и резервная копия', 'Data & backup')} kanji="蔵">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Btn
                icon="download"
                onClick={async () => {
                  const blob = await exportAll();
                  downloadBlob(blob, `cursed-world-backup-${fmt(Date.now(), 'yyyy-MM-dd-HHmm')}.json`);
                  toast(L('Резервная копия скачана', 'Backup downloaded'));
                }}
              >
                Export JSON
              </Btn>
              <FilePick
                accept="application/json,.json"
                className="btn btn-ghost"
                onFiles={async ([f]) => {
                  if (!(await confirmBox(L('Импорт заменит ВСЕ текущие данные данными из файла. Продолжить?', 'Import will REPLACE all current data. Continue?'), { danger: true, okLabel: 'Import' }))) return;
                  try {
                    await importAll(f);
                    toast(L('Данные восстановлены', 'Data restored'));
                    setTimeout(() => location.reload(), 600);
                  } catch (e) {
                    toast(String((e as Error).message || e), 'bad');
                  }
                }}
              >
                <Icon name="upload" size={15} /> Import JSON
              </FilePick>
            </div>
            <p className="text-[11px] text-dim">{L('В копию входят все разделы и все файлы (фото, видео, вложения) в base64.', 'The backup includes all sections and all files (photos, videos, attachments) as base64.')}</p>
            {storage && (
              <div className="text-[12px] text-muted">
                {L('Занято', 'Used')}: <span className="mono">{fileSize(storage.usage)}</span> {L('из', 'of')} <span className="mono">{fileSize(storage.quota)}</span> · {storage.persisted ? L('хранилище постоянное', 'storage is persistent') : L('браузер может очистить при нехватке места', 'browser may evict under pressure')}
                {!storage.persisted && navigator.storage?.persist && (
                  <button
                    className="chip ml-2 !text-[11px]"
                    onClick={async () => {
                      const ok = await navigator.storage.persist();
                      toast(ok ? L('Хранилище закреплено', 'Storage persisted') : L('Браузер отказал', 'Browser declined'), ok ? 'ok' : 'warn');
                      void refreshStorage();
                    }}
                  >
                    {L('Закрепить', 'Persist')}
                  </button>
                )}
              </div>
            )}
            <div className="divider-glow my-2" />
            <div className="flex flex-wrap gap-2">
              <Btn
                size="sm"
                variant="ghost"
                icon="refresh"
                onClick={async () => {
                  if (!(await confirmBox(L('Стереть всё и загрузить демо-данные заново?', 'Wipe everything and reload the demo?'), { danger: true }))) return;
                  await wipeAll();
                  await seedDemo();
                  location.reload();
                }}
              >
                {L('Сбросить к демо', 'Reset to demo')}
              </Btn>
              <Btn
                size="sm"
                variant="ghost"
                icon="dumbbell"
                onClick={async () => {
                  if (!(await confirmBox(L('Восстановить демо-упражнения и демо-планы Black Flash, которых сейчас нет? Твои записи и изменения не тронутся.', 'Restore missing Black Flash demo exercises and plans? Your own data stays as is.')))) return;
                  await restoreDemoTraining();
                }}
              >
                {L('Восстановить демо-данные (зал)', 'Restore demo data (gym)')}
              </Btn>
              <Btn
                size="sm"
                variant="danger"
                icon="trash"
                onClick={async () => {
                  if (!(await confirmBox(L('Удалить ВСЕ данные и начать с чистого листа? Сначала сделай экспорт!', 'Delete ALL data and start clean? Export first!'), { danger: true, okLabel: L('Стереть', 'Wipe') }))) return;
                  const lang = s.lang;
                  await wipeAll();
                  await initEmpty(lang);
                  location.reload();
                }}
              >
                {L('Чистый старт', 'Clean start')}
              </Btn>
            </div>
          </div>
        </Panel>

        <Panel title={L('Приложение', 'App')} kanji="器">
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-3">
              <Seal text="呪" size={48} />
              <div>
                <div className="h-display">CURSED WORLD 3.0</div>
                <div className="text-[12px] text-muted">{L('Local-first PWA · работает офлайн', 'Local-first PWA · works offline')}</div>
              </div>
            </div>
            {installable ? (
              <Btn
                icon="download"
                onClick={async () => {
                  const ev = (window as unknown as { __installPrompt?: InstallEvt }).__installPrompt;
                  if (!ev) return;
                  await ev.prompt();
                  (window as unknown as { __installPrompt?: InstallEvt }).__installPrompt = undefined;
                  setInstallable(false);
                }}
              >
                {L('Установить на устройство', 'Install app')}
              </Btn>
            ) : (
              <p className="text-[12px] text-muted">
                {L('Установка: на iPhone — «Поделиться → На экран Домой»; на Android/ПК — значок установки в адресной строке.', 'Install: on iPhone — Share → Add to Home Screen; on Android/PC — the install icon in the address bar.')}
              </p>
            )}
            <p className="text-[12px] text-muted">{L('Быстрый поиск и добавление — Ctrl+K (⌘K на Mac), на телефоне — кнопка «+».', 'Quick search & add — Ctrl+K (⌘K on Mac), on phone — the “+” button.')}</p>
            <p className="text-[11px] text-dim">{L('Монстры и символы — оригинальные рисунки в эстетике дарк-фэнтези; официальный арт не используется.', 'Monsters and sigils are original drawings; no official artwork is used.')}</p>
            <button
              className="text-[11px] text-dim hover:text-acc"
              onClick={async () => {
                const n = await db.curses.count();
                toast(`Curses: ${n}`);
              }}
            >
              DB: cursed-world · v{db.verno}
            </button>
          </div>
        </Panel>
      </div>
    </div>
  );
}
