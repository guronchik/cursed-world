import { PageTitle, Tabs } from '../../components/ui';
import { go, useRoute } from '../../lib/router';
import { L } from '../../lib/runtime';
import { CursedTechnique } from './CursedTechnique';
import { DomainExpansion } from './DomainExpansion';
import { MaximumTechnique } from './MaximumTechnique';
import { ReversedCT } from './ReversedCT';
import { SimpleDomain } from './SimpleDomain';

type T = 'technique' | 'rct' | 'maximum' | 'domain' | 'simple';

export function Energy() {
  const { parts } = useRoute();
  const tab = (['technique', 'rct', 'maximum', 'domain', 'simple'].includes(parts[1]) ? parts[1] : 'technique') as T;
  return (
    <div>
      <PageTitle title="Cursed Energy Manipulation" kanji="呪力操作" sub={L('Задачи, идеи, цели месяца и года, заметки.', 'Tasks, ideas, monthly and yearly goals, notes.')} />
      <Tabs
        className="mb-4"
        tabs={[
          { id: 'technique' as T, label: 'Cursed Technique' },
          { id: 'rct' as T, label: 'Reversed CT' },
          { id: 'maximum' as T, label: 'Maximum Technique' },
          { id: 'domain' as T, label: 'Domain Expansion' },
          { id: 'simple' as T, label: 'Simple Domain' },
        ]}
        value={tab}
        onChange={(t) => go(`/energy/${t}`)}
      />
      {tab === 'technique' && <CursedTechnique />}
      {tab === 'rct' && <ReversedCT />}
      {tab === 'maximum' && <MaximumTechnique />}
      {tab === 'domain' && <DomainExpansion />}
      {tab === 'simple' && <SimpleDomain />}
    </div>
  );
}
