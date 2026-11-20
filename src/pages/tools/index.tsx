import { PageTitle, Tabs } from '../../components/ui';
import { go, useRoute } from '../../lib/router';
import { L } from '../../lib/runtime';
import { Assignments } from './Assignments';
import { CalendarTool } from './Calendar';
import { CampusMap } from './CampusMap';
import { Grades } from './Grades';

type T = 'calendar' | 'map' | 'assignments' | 'grades';

export function Tools() {
  const { parts } = useRoute();
  const p = parts[1] === 'schedule' ? 'calendar' : parts[1];
  const tab = (['calendar', 'map', 'assignments', 'grades'].includes(p) ? p : 'calendar') as T;
  return (
    <div>
      <PageTitle title="Cursed Tools" kanji="呪具" sub={L('Университет: календарь и расписание, карта кампуса, задания, оценки.', 'University: calendar & schedule, campus map, assignments, grades.')} />
      <Tabs
        className="mb-4"
        tabs={[
          { id: 'calendar' as T, label: 'Calendar' },
          { id: 'map' as T, label: 'Campus Map' },
          { id: 'assignments' as T, label: 'Assignments' },
          { id: 'grades' as T, label: L('Оценки', 'Grades') },
        ]}
        value={tab}
        onChange={(t) => go(`/tools/${t}`)}
      />
      {tab === 'calendar' && <CalendarTool />}
      {tab === 'map' && <CampusMap />}
      {tab === 'assignments' && <Assignments />}
      {tab === 'grades' && <Grades />}
    </div>
  );
}
