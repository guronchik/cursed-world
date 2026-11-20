// Общие настройки графиков Recharts под тёмную тему.
export const axis = {
  stroke: '#2b2456',
  tick: { fill: '#8f8ab8', fontSize: 11 },
  tickLine: false,
};

export const grid = { stroke: '#2b2456', strokeDasharray: '3 4', vertical: false };

export const tooltip = {
  contentStyle: { background: '#120e26', border: '1px solid #3a3170', borderRadius: 2, fontSize: 12, color: '#ece9ff' },
  labelStyle: { color: 'var(--accent-text)', marginBottom: 4 },
  itemStyle: { color: '#ece9ff' },
  cursor: { fill: 'color-mix(in srgb, var(--accent-1) 8%, transparent)', stroke: 'var(--accent-1)', strokeOpacity: 0.3 },
};
