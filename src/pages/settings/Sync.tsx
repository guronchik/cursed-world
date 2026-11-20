// Settings → Синхронизация ПК ↔ телефон через приватный репозиторий GitHub.
import { useEffect, useState } from 'react';
import { Icon } from '../../components/Icon';
import { Btn, Field, Panel, Toggle } from '../../components/ui';
import { chooseBox, confirmBox, toast } from '../../lib/fx';
import { useNow } from '../../lib/hooks';
import { L } from '../../lib/runtime';
import { connect, disconnect, getConfig, getStatus, onStatus, setAuto, syncNow, type SyncStatus } from '../../lib/sync';

function ago(ts: number, now: number) {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return L('только что', 'just now');
  const m = Math.round(s / 60);
  if (m < 60) return L(`${m} мин назад`, `${m} min ago`);
  const h = Math.round(m / 60);
  if (h < 24) return L(`${h} ч назад`, `${h} h ago`);
  return new Date(ts).toLocaleString();
}

export function SyncSettings() {
  const [cfg, setCfg] = useState(getConfig);
  const [st, setSt] = useState<SyncStatus>(getStatus);
  const [token, setToken] = useState('');
  const [repo, setRepo] = useState('cursed-world-data');
  const [busy, setBusy] = useState(false);
  const [help, setHelp] = useState(false);
  const now = useNow(30_000);
  useEffect(() => onStatus((s) => setSt({ ...s })), []);

  const doConnect = async () => {
    setBusy(true);
    try {
      const c = await connect(token, repo);
      let mode: 'merge' | 'replaceLocal' = 'merge';
      if (c.hasRemote) {
        const v = await chooseBox(
          L(`В ${c.repo} уже есть данные (${c.remoteRecords} записей) — видимо, с другого устройства.\nЧто сделать с данными на этом устройстве?`, `${c.repo} already has data (${c.remoteRecords} records), probably from another device.\nWhat to do with this device’s data?`),
          [
            { v: 'replace', label: L('Взять из облака (заменить здесь)', 'Use cloud data (replace here)') },
            { v: 'merge', label: L('Объединить с данными этого устройства', 'Merge with this device’s data') },
          ],
        );
        if (!v) return;
        mode = v === 'replace' ? 'replaceLocal' : 'merge';
      }
      c.save();
      setCfg(getConfig());
      setToken('');
      const ok = await syncNow({ mode });
      toast(ok ? L('Синхронизация включена', 'Sync is on') : L('Подключено, но синхронизация не прошла — см. ошибку', 'Connected, but sync failed — see the error'), ok ? 'ok' : 'warn');
    } catch (e) {
      toast((e as Error).message || String(e), 'bad');
    } finally {
      setBusy(false);
    }
  };

  const stateText =
    st.state === 'syncing'
      ? L('Синхронизация…', 'Syncing…') + (st.detail ? ` ${st.detail}` : '')
      : st.state === 'offline'
        ? L('Нет интернета — синхронизируется, когда появится', 'Offline — will sync when back online')
        : st.state === 'error'
          ? `${L('Ошибка', 'Error')}: ${st.error}`
          : st.lastSync
            ? `${L('Синхронизировано', 'Synced')} ${ago(st.lastSync, now)}`
            : L('Ещё не синхронизировалось', 'Not synced yet');
  const color = st.state === 'error' ? '#ff453a' : st.state === 'offline' ? '#ff9f0a' : st.state === 'syncing' ? 'var(--accent-text)' : '#30d158';

  return (
    <Panel title={L('Синхронизация ПК ↔ телефон', 'Sync PC ↔ phone')} kanji="結" className="lg:col-span-2">
      {cfg ? (
        <div className="space-y-3" data-testid="sync-on">
          <div className="flex items-center gap-2 text-[14px]" role="status">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
            <span className="min-w-0 break-words">{stateText}</span>
          </div>
          <div className="text-[12.5px] text-muted">
            GitHub: <b className="mono">{cfg.repo}</b>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <Btn icon="refresh" disabled={st.state === 'syncing'} onClick={() => void syncNow()}>
              {L('Синхронизировать сейчас', 'Sync now')}
            </Btn>
            <Toggle
              on={cfg.auto}
              onChange={(v) => {
                setAuto(v);
                setCfg(getConfig());
              }}
              label={L('Автоматически', 'Automatic')}
            />
            <Btn
              variant="ghost"
              icon="x"
              className="ml-auto"
              onClick={async () => {
                if (!(await confirmBox(L('Отключить синхронизацию на этом устройстве? Данные здесь и в облаке останутся.', 'Turn off sync on this device? Data stays here and in the cloud.')))) return;
                disconnect();
                setCfg(null);
              }}
            >
              {L('Отключить', 'Turn off')}
            </Btn>
          </div>
          <p className="text-[11.5px] text-dim">
            {L(
              'Изменения отправляются через несколько секунд после правки и забираются при открытии сайта. Совпадающие записи сливаются: побеждает более поздняя правка, удаления тоже переносятся. Анимации, курсор, звук и PIN у каждого устройства свои. Видео упражнений не синхронизируются. «Сбросить к демо», «Стереть всё» и импорт копии разойдутся на все устройства.',
              'Changes upload a few seconds after editing and download when the app opens. Records merge — the later edit wins, deletions sync too. Animations, cursor, sound and PIN stay per device. Exercise videos are not synced. Reset, wipe and backup import propagate to all devices.',
            )}
          </p>
        </div>
      ) : (
        <div className="space-y-3" data-testid="sync-off">
          <p className="text-[13.5px] text-muted">
            {L('Данные хранятся в приватном репозитории на твоём GitHub. Подключи одинаково на ПК и на телефоне.', 'Data lives in a private repository on your GitHub. Connect the same way on PC and phone.')}
          </p>
          <button type="button" className="text-[13px] text-acc flex items-center gap-1 min-h-[40px]" onClick={() => setHelp(!help)} aria-expanded={help}>
            <Icon name={help ? 'up' : 'down'} size={12} /> {L('Как получить токен (2 минуты)', 'How to get a token (2 minutes)')}
          </button>
          {help && (
            <ol className="text-[13px] text-muted list-decimal pl-5 space-y-1.5">
              <li>{L('github.com → «+» → New repository → имя cursed-world-data → Private → Create.', 'github.com → “+” → New repository → name cursed-world-data → Private → Create.')}</li>
              <li>{L('Аватар → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.', 'Avatar → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.')}</li>
              <li>{L('Expiration — No expiration (или год). Repository access — Only select repositories → cursed-world-data.', 'Expiration — No expiration (or a year). Repository access — Only select repositories → cursed-world-data.')}</li>
              <li>{L('Permissions → Repository permissions → Contents → Read and write → Generate token. Скопируй токен (github_pat_…).', 'Permissions → Repository permissions → Contents → Read and write → Generate token. Copy it (github_pat_…).')}</li>
              <li>{L('Вставь токен ниже и нажми «Подключить». На телефоне — тот же токен (пришли его себе) и «Взять из облака».', 'Paste it below and press Connect. On the phone use the same token and choose “Use cloud data”.')}</li>
            </ol>
          )}
          <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
            <Field label={L('Токен GitHub', 'GitHub token')}>
              <input className="inp mono" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="github_pat_…" data-testid="sync-token" />
            </Field>
            <Field label={L('Репозиторий', 'Repository')}>
              <input className="inp mono" value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="cursed-world-data" data-testid="sync-repo" />
            </Field>
          </div>
          <Btn icon="refresh" disabled={busy || !token.trim()} onClick={() => void doConnect()}>
            {busy ? L('Проверяю…', 'Checking…') : L('Подключить', 'Connect')}
          </Btn>
          <p className="text-[11.5px] text-dim">{L('Токен хранится только в этом браузере и не попадает в экспорт. Давай ему доступ только к одному репозиторию.', 'The token stays in this browser only and is never exported. Limit it to one repository.')}</p>
        </div>
      )}
    </Panel>
  );
}
