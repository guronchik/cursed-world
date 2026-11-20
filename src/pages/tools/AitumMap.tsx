// AITU Map: чужая карта yuujiso во iframe (код не копируем). Офлайн/блокировка → предложение открыть My Map.
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { Btn, IBtn, Panel } from '../../components/ui';
import { L } from '../../lib/runtime';
import { useSettings } from '../../lib/settings';

export const AITUMAP_URL = 'https://yuujiso.github.io/aitumap/';

export function AitumMap({ room, onMyMap }: { room?: string; onMyMap: () => void }) {
  const s = useSettings();
  const [online, setOnline] = useState(navigator.onLine);
  const [loaded, setLoaded] = useState(false);
  const [slow, setSlow] = useState(false);
  const [key, setKey] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  // deep-link: если в настройках задан шаблон с {room}, подставляем аудиторию
  const src = room && s.aitumapLink?.includes('{room}') ? s.aitumapLink.replace('{room}', encodeURIComponent(room)) : AITUMAP_URL;

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  useEffect(() => {
    setLoaded(false);
    setSlow(false);
    const t = window.setTimeout(() => setSlow(true), 12000);
    return () => window.clearTimeout(t);
  }, [key, src]);

  if (!online)
    return (
      <Panel bodyClass="p-6">
        <div className="flex flex-col items-center text-center gap-3 py-6">
          <span className="app-icon w-14 h-14">
            <Icon name="wifioff" size={26} />
          </span>
          <div className="text-[17px] font-semibold">{L('Нет интернета', 'You are offline')}</div>
          <p className="text-[14px] text-muted max-w-sm">{L('AITU Map загружается с сайта автора. Твоя карта со своими пинами работает офлайн.', "AITU Map loads from the author's site. Your own map with pins works offline.")}</p>
          <Btn icon="map" onClick={onMyMap}>
            {L('Открыть My Map', 'Open My Map')}
          </Btn>
        </div>
      </Panel>
    );

  return (
    <div className="space-y-2">
      {room && (
        <div className="panel !rounded-2xl px-4 py-2.5 text-[13.5px] flex items-center gap-2">
          <Icon name="copy" size={15} />
          {L(`Ищем «${room}» — номер в буфере, вставь его в поиск карты.`, `Looking for “${room}” — it's in your clipboard, paste it into the map search.`)}
        </div>
      )}
      <div ref={box} className="panel relative overflow-hidden h-[calc(100dvh-260px)] min-h-[420px] lg:h-[calc(100dvh-220px)]">
        {!loaded && (
          <div className="absolute inset-0 grid place-items-center z-10 pointer-events-none">
            <div className="flex flex-col items-center gap-2 text-muted text-[13px]">
              <span className="w-8 h-8 rounded-full border-2 border-[var(--accent-1)] border-t-transparent animate-spin" />
              {L('Загружаю AITU Map…', 'Loading AITU Map…')}
            </div>
          </div>
        )}
        {slow && !loaded && (
          <div className="absolute inset-x-4 bottom-4 z-20 panel !rounded-2xl p-4 flex flex-wrap items-center gap-3">
            <span className="text-[13.5px] flex-1 min-w-[12rem]">{L('Карта не открывается внутри сайта? Её можно открыть отдельно.', 'Map not loading here? Open it separately.')}</span>
            <a className="btn btn-sm" href={src} target="_blank" rel="noopener noreferrer">
              <Icon name="external" size={14} /> {L('В новой вкладке', 'New tab')}
            </a>
            <Btn size="sm" variant="ghost" onClick={onMyMap}>
              My Map
            </Btn>
          </div>
        )}
        <iframe
          key={key}
          src={src}
          title="AITU Map"
          loading="lazy"
          allow="geolocation"
          sandbox="allow-scripts allow-same-origin allow-popups"
          className="absolute inset-0 w-full h-full border-0 bg-[var(--panel-solid)]"
          onLoad={() => setLoaded(true)}
        />
        <div className="absolute top-2 right-2 z-20 flex gap-1 panel !rounded-full p-1">
          <a className="ibtn" href={src} target="_blank" rel="noopener noreferrer" title={L('Открыть в новой вкладке', 'Open in new tab')} aria-label={L('Открыть в новой вкладке', 'Open in new tab')}>
            <Icon name="external" size={17} />
          </a>
          <IBtn icon="maximize" title={L('Во весь экран', 'Fullscreen')} onClick={() => box.current?.requestFullscreen?.().catch(() => window.open(src, '_blank'))} />
          <IBtn icon="refresh" title={L('Перезагрузить', 'Reload')} onClick={() => setKey((k) => k + 1)} />
        </div>
      </div>
      <div className="text-[12px] text-dim text-center">
        Map by{' '}
        <a href={AITUMAP_URL} target="_blank" rel="noopener noreferrer" className="text-acc underline">
          yuujiso
        </a>{' '}
        · {L('не грузится внутри сайта?', 'not loading here?')}{' '}
        <a href={src} target="_blank" rel="noopener noreferrer" className="text-acc underline">
          {L('открыть отдельно', 'open separately')}
        </a>{' '}
        {L('или', 'or')}{' '}
        <button className="text-acc underline" onClick={onMyMap}>
          My Map
        </button>
      </div>
    </div>
  );
}
