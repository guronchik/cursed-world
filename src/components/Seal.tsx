// Декоративная «проклятая печать» — вращающиеся кольца с иероглифом.
export function Seal({ text = '呪', size = 56, color = 'var(--accent-1)', spin = true }: { text?: string; size?: number; color?: string; spin?: boolean }) {
  const ticks = Array.from({ length: 24 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2;
    const r1 = i % 2 ? 40 : 38;
    return { x1: 50 + Math.cos(a) * r1, y1: 50 + Math.sin(a) * r1, x2: 50 + Math.cos(a) * 44, y2: 50 + Math.sin(a) * 44 };
  });
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" style={{ filter: `drop-shadow(0 0 6px color-mix(in srgb, ${color} 55%, transparent))`, flexShrink: 0 }}>
      <g className={spin ? 'seal-spin' : ''}>
        <circle cx={50} cy={50} r={47} fill="none" stroke={color} strokeWidth={1.2} strokeDasharray="3 4" />
        {ticks.map((t, i) => (
          <line key={i} {...t} stroke={color} strokeWidth={1.2} opacity={0.8} />
        ))}
      </g>
      <g className={spin ? 'seal-spin-rev' : ''}>
        <rect x={24} y={24} width={52} height={52} transform="rotate(45 50 50)" fill="none" stroke={color} strokeWidth={1.1} />
        <rect x={24} y={24} width={52} height={52} fill="none" stroke={color} strokeWidth={1.1} opacity={0.55} />
      </g>
      <circle cx={50} cy={50} r={25} fill="rgba(6,5,12,.9)" stroke={color} strokeWidth={2} />
      <text x={50} y={51} dominantBaseline="central" textAnchor="middle" className="kanji" fontSize={text.length > 1 ? 18 : 27} fill="#fff">
        {text}
      </text>
    </svg>
  );
}
