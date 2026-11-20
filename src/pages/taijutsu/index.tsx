import { PageTitle, Tabs } from '../../components/ui';
import { go, useRoute } from '../../lib/router';
import { L } from '../../lib/runtime';
import { BlackFlash } from './BlackFlash';
import { DivergentFist } from './DivergentFist';

export function Taijutsu() {
  const { parts } = useRoute();
  const tab = parts[1] === 'flash' ? 'flash' : 'fist';
  return (
    <div>
      <PageTitle title="Taijutsu" kanji="体術" sub={L('Тело — тоже техника. Уход за собой и зал.', 'The body is a technique too. Self-care and the gym.')} />
      <Tabs
        className="mb-4"
        tabs={[
          { id: 'fist', label: <span>Divergent Fist <span className="text-dim normal-case">· {L('уход', 'care')}</span></span> },
          { id: 'flash', label: <span>Black Flash <span className="text-dim normal-case">· {L('зал', 'gym')}</span></span> },
        ]}
        value={tab}
        onChange={(t) => go(t === 'fist' ? '/taijutsu/fist' : '/taijutsu/flash/log')}
      />
      {tab === 'fist' ? <DivergentFist /> : <BlackFlash />}
    </div>
  );
}
