// Оригинальные проклятия-монстры (SVG). Чем выше грейд — тем страшнее. Можно заменить своей картинкой для грейда.
import { useId, type ReactNode } from 'react';
import { GRADE_COLOR, gradeName, type Grade } from '../lib/grade';
import { useBlobUrl } from '../lib/media';
import { useSettings } from '../lib/settings';

const TINT: Record<Grade, string> = { 0: '#4a0a18', 1: '#3d1035', 2: '#311656', 3: '#251c5e', 4: '#1c2a62' };
const EYE: Record<Grade, string> = { 0: '#ffd23f', 1: '#ff6b8f', 2: '#ff7ad9', 3: '#cbbcff', 4: '#d8e2ff' };

const teeth = (x1: number, x2: number, y: number, h: number, n: number) => {
  let d = `M${x1} ${y}`;
  const w = (x2 - x1) / n;
  for (let i = 0; i < n; i++) d += ` L${(x1 + w * (i + 0.5)).toFixed(1)} ${y + h} L${(x1 + w * (i + 1)).toFixed(1)} ${y}`;
  return d + 'Z';
};

function Eye({ cx, cy, r, id, slit = true }: { cx: number; cy: number; r: number; id: string; slit?: boolean }) {
  return (
    <g className="mon-eye">
      <circle cx={cx} cy={cy} r={r} fill={`url(#e${id})`} />
      {slit ? <ellipse cx={cx + r * 0.08} cy={cy + r * 0.05} rx={r * 0.3} ry={r * 0.68} fill="#0b0716" /> : <circle cx={cx} cy={cy} r={r * 0.45} fill="#0b0716" />}
      <circle cx={cx - r * 0.35} cy={cy - r * 0.35} r={Math.max(0.8, r * 0.18)} fill="#fff" opacity={0.85} />
    </g>
  );
}

function body(g: Grade, id: string, c: string): ReactNode {
  const fill = `url(#b${id})`;
  const S = { stroke: c, strokeWidth: 2, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
  switch (g) {
    case 4:
      return (
        <g className="mon-breathe">
          <path d="M37 30L31 16l13 11z M63 30l6-14-13 11z" fill={fill} {...S} />
          <path d="M50 24c19 0 31 16 31 35 0 10-4 17-9 21l2 9-7-4-5 7-5-7-5 7-5-7-7 4 2-9c-5-4-9-11-9-21 0-19 12-35 31-35z" fill={fill} {...S} />
          <Eye cx={50} cy={52} r={13} id={id} />
          <path d="M39 70q11 7 22 0" fill="none" {...S} />
          <path d={teeth(42, 58, 71.5, 3, 6)} fill="#e8e3ff" />
        </g>
      );
    case 3:
      return (
        <g className="mon-breathe">
          <path d="M30 40L23 25l14 10z M42 30l-2-16 10 13z M58 28l6-15 2 17z M73 37l11-10-5 16z" fill={fill} {...S} />
          <path d="M13 88c-2-26 8-50 31-58 20-7 38 2 44 22 4 14 2 28-4 36z" fill={fill} {...S} />
          <path d="M24 88l-3 6M40 88v7M60 88l2 6M76 88l5 5" fill="none" {...S} />
          <Eye cx={58} cy={50} r={10} id={id} />
          <Eye cx={37} cy={57} r={7} id={id} />
          <Eye cx={74} cy={63} r={5} id={id} />
          <path d="M28 71q25 16 48-2q-6 16-24 17q-16 0-24-15z" fill="#1a0510" {...S} />
          <path d={teeth(31, 73, 72, 5, 9)} fill="#efe9ff" />
        </g>
      );
    case 2:
      return (
        <g className="mon-breathe">
          <path d="M35 30C18 26 9 14 13 2c4 10 12 16 25 19z M65 30c17-4 26-16 22-28-4 10-12 16-25 19z" fill={fill} {...S} />
          <path d="M18 70c-8 2-12 8-12 16M82 70c8 2 12 8 12 16M6 86l-3 4M6 86l1 5M6 86l4 3M94 86l3 4M94 86l-1 5M94 86l-4 3" fill="none" {...S} />
          <path d="M50 18c20 0 32 13 32 30 0 9-3 15-6 20l10 22H14l10-22c-3-5-6-11-6-20 0-17 12-30 32-30z" fill={fill} {...S} />
          <Eye cx={40} cy={38} r={5.8} id={id} />
          <Eye cx={60} cy={38} r={5.8} id={id} />
          <Eye cx={32} cy={48} r={3.3} id={id} slit={false} />
          <Eye cx={68} cy={48} r={3.3} id={id} slit={false} />
          <path d="M31 56h38l-5 24H36z" fill="#1a0408" {...S} />
          <path d={teeth(32, 68, 56.5, 7, 9)} fill="#efe9ff" />
          <path d={teeth(37, 63, 79.5, -6, 7)} fill="#efe9ff" />
          <path d="M44 77q6-9 12 0z" fill="#ff4f8b" opacity={0.85} />
        </g>
      );
    case 1:
      return (
        <g className="mon-breathe">
          <path d="M37 50C24 56 16 70 12 93M63 50c13 6 21 20 25 43" fill="none" {...S} strokeWidth={3.2} />
          <path d="M12 93l-4 4M12 93l-1 6M12 93l3 5M88 93l4 4M88 93l1 6M88 93l-3 5" fill="none" {...S} />
          <path d="M50 9c10 0 16 8 16 17 0 6-3 10-6 13l6 10 4 41H30l4-41 6-10c-3-3-6-7-6-13 0-9 6-17 16-17z" fill={fill} {...S} />
          <path d="M39 17c6-5 16-5 22 0l-2 15c-5 4-13 4-18 0z" fill="#ddd6ff" stroke={c} strokeWidth={1.5} />
          <path d="M51 13l-2 6 3 4-2 7" stroke="#1a1030" fill="none" strokeWidth={1.3} />
          <g className="mon-eye">
            <path d="M42 23l6 1.6M52 24.6l6-1.6" stroke="#ff2744" strokeWidth={2.6} strokeLinecap="round" />
          </g>
          <path d="M44 30h12" stroke="#1a1030" strokeWidth={1.2} />
          <path d="M46 28.5v3M49 28.5v3M52 28.5v3M55 28.5v3" stroke="#1a1030" strokeWidth={0.9} />
          <Eye cx={44} cy={58} r={2.8} id={id} slit={false} />
          <Eye cx={56} cy={65} r={2.4} id={id} slit={false} />
          <Eye cx={47} cy={75} r={3.3} id={id} />
          <Eye cx={57} cy={82} r={2} id={id} slit={false} />
          <path d="M40 46l-3 6M60 46l3 6" fill="none" stroke={c} strokeWidth={1.2} opacity={0.7} />
        </g>
      );
    default: {
      const halo = Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        return { x: 50 + Math.cos(a) * 44, y: 46 + Math.sin(a) * 44 };
      });
      return (
        <g>
          <g className="seal-spin" style={{ transformOrigin: '50px 46px' }}>
            <circle cx={50} cy={46} r={44} fill="none" stroke={c} strokeWidth={1} strokeDasharray="2 5" opacity={0.8} />
            {halo.map((p, i) => (
              <Eye key={i} cx={p.x} cy={p.y} r={2.6} id={id} slit={false} />
            ))}
          </g>
          <g className="mon-breathe">
            <path d="M16 62C6 58 3 48 6 38M84 62c10-4 13-14 10-24M18 74C6 74 2 84 2 93M82 74c12 0 16 10 16 19" fill="none" {...S} strokeWidth={2.6} />
            <path d="M24 34l-6-22 13 13 5-19 8 17 6-21 6 21 8-17 5 19 13-13-6 22z" fill={fill} {...S} />
            <path d="M50 22c22 0 36 15 36 34 0 10-4 18-9 24l7 14H16l7-14c-5-6-9-14-9-24 0-19 14-34 36-34z" fill={fill} {...S} />
            <path d="M24 48l7 2M24 55h7M76 48l-7 2M76 55h-7M50 24v4" fill="none" {...S} />
            <Eye cx={38} cy={46} r={6.5} id={id} />
            <Eye cx={62} cy={46} r={6.5} id={id} />
            <g className="mon-eye">
              <ellipse cx={50} cy={35} rx={3} ry={6} fill={`url(#e${id})`} />
              <ellipse cx={50} cy={35} rx={1} ry={4} fill="#0b0716" />
            </g>
            <path d="M31 63q19 20 38 0q-4 23-19 25q-15-2-19-25z" fill="#1a0206" {...S} />
            <path d={teeth(33, 67, 64, 6, 9)} fill="#fff4e0" />
            <path d={teeth(38, 62, 86, -6, 6)} fill="#fff4e0" />
          </g>
        </g>
      );
    }
  }
}

export function Monster({ grade, overdue = false, size = 64, title }: { grade: Grade; overdue?: boolean; size?: number; title?: string }) {
  const s = useSettings();
  const url = useBlobUrl(s.gradeImages?.[grade]);
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const c = overdue ? '#ff1a3c' : GRADE_COLOR[grade];
  return (
    <span className={`mon ${overdue ? 'mon-red' : ''}`} style={{ width: size, height: size, ['--mc' as string]: c }} title={title ?? gradeName(grade)}>
      {url ? (
        <img src={url} alt="" className="mon-img" style={{ boxShadow: `0 0 0 2px ${c}` }} />
      ) : (
        <svg viewBox="0 0 100 100" style={{ filter: `drop-shadow(0 0 3px ${c})` }}>
          <defs>
            <radialGradient id={`b${id}`} cx="50%" cy="30%" r="75%">
              <stop offset="0" stopColor={overdue ? '#5a0614' : TINT[grade]} />
              <stop offset="1" stopColor="#05040a" />
            </radialGradient>
            <radialGradient id={`e${id}`} cx="40%" cy="40%" r="60%">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="0.55" stopColor={overdue ? '#ff6b6b' : EYE[grade]} />
              <stop offset="1" stopColor={c} />
            </radialGradient>
          </defs>
          {body(grade, id, c)}
        </svg>
      )}
    </span>
  );
}

export function GradeBadge({ grade, overdue }: { grade: Grade; overdue?: boolean }) {
  const c = overdue ? '#ff1a3c' : GRADE_COLOR[grade];
  return (
    <span className="tag" style={{ color: c, background: `color-mix(in srgb, ${c} 13%, transparent)`, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${c} 33%, transparent)` }}>
      {gradeName(grade)}
    </span>
  );
}
