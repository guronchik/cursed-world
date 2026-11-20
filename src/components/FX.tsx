// Слой эффектов: изгнание (exorcise), BLACK FLASH, повышение ранга, тосты, подтверждения.
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { fx, type FxEvent } from '../lib/fx';
import { L, rt, uid } from '../lib/runtime';
import { Icon } from './Icon';
import { Seal } from './Seal';

type Burst = { id: string; x: number; y: number; xp?: number; label?: string };
type Toast = { id: string; text: string; tone: string; action?: { label: string; run: () => void } };
type Confirm = Extract<FxEvent, { type: 'confirm' }>;
type Choose = Extract<FxEvent, { type: 'choose' }>;

const bolt = (x: number, y: number, len: number, ang: number, seed: number) => {
  let d = `M${x} ${y}`;
  let cx = x;
  let cy = y;
  const steps = 7;
  for (let i = 1; i <= steps; i++) {
    const t = (len / steps) * i;
    const j = ((Math.sin(seed * 9.1 + i * 3.7) + 1) / 2 - 0.5) * 70;
    cx = x + Math.cos(ang) * t + Math.cos(ang + Math.PI / 2) * j;
    cy = y + Math.sin(ang) * t + Math.sin(ang + Math.PI / 2) * j;
    d += ` L${cx.toFixed(0)} ${cy.toFixed(0)}`;
  }
  return d;
};

function ExorciseBurst({ b }: { b: Burst }) {
  const shards = Array.from({ length: 14 }, (_, i) => {
    const a = (i / 14) * Math.PI * 2 + (i % 2) * 0.2;
    const r = 60 + (i % 3) * 26;
    return { dx: Math.cos(a) * r, dy: Math.sin(a) * r, rot: (i * 47) % 360 };
  });
  return (
    <div className="fixed pointer-events-none z-[95]" style={{ left: b.x, top: b.y }}>
      <motion.div
        className="absolute rounded-full border-2 border-glow"
        style={{ left: -20, top: -20, width: 40, height: 40, boxShadow: '0 0 30px var(--accent-1), inset 0 0 20px var(--accent-1)' }}
        initial={{ scale: 0.2, opacity: 1 }}
        animate={{ scale: 4.5, opacity: 0 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
      />
      {shards.map((s, i) => (
        <motion.span
          key={i}
          className="absolute block"
          style={{ left: -4, top: -4, width: 8, height: 8, background: i % 3 ? 'var(--accent-text)' : '#ff2744', clipPath: 'polygon(50% 0,100% 50%,50% 100%,0 50%)', boxShadow: '0 0 8px var(--accent-1)' }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 1 }}
          animate={{ x: s.dx, y: s.dy, opacity: 0, rotate: s.rot, scale: 0.3 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      ))}
      <motion.div
        className="absolute kanji text-5xl text-white"
        style={{ left: -24, top: -34, textShadow: '0 0 20px var(--accent-1), 0 0 40px #ff2744' }}
        initial={{ scale: 0.3, opacity: 0 }}
        animate={{ scale: [0.3, 1.3, 1.1], opacity: [0, 1, 0] }}
        transition={{ duration: 1.1, times: [0, 0.3, 1] }}
      >
        祓
      </motion.div>
      <motion.div
        className="absolute whitespace-nowrap h-display text-sm text-acc"
        style={{ left: -60, width: 120, textAlign: 'center', top: 22 }}
        initial={{ y: 0, opacity: 0 }}
        animate={{ y: -46, opacity: [0, 1, 0] }}
        transition={{ duration: 1.2 }}
      >
        EXORCISED{b.xp ? ` +${b.xp} XP` : ''}
      </motion.div>
    </div>
  );
}

function BlackFlash({ title, sub }: { title: string; sub?: string }) {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const bolts = Array.from({ length: 7 }, (_, i) => bolt(W / 2, H / 2, Math.max(W, H) * 0.7, (i / 7) * Math.PI * 2 + 0.3, i + 1));
  return (
    <motion.div
      className="fixed inset-0 z-[96] pointer-events-none overflow-hidden"
      style={{ animation: rt.reduce ? undefined : 'flash-bg .9s forwards, shake .5s' }}
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.4 } }}
    >
      <svg className="absolute inset-0 w-full h-full">
        {bolts.map((d, i) => (
          <g key={i}>
            <motion.path d={d} stroke="#ff1a3c" strokeWidth={9} fill="none" style={{ filter: 'blur(6px)' }} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.25, delay: i * 0.03 }} />
            <motion.path d={d} stroke="#000" strokeWidth={4} fill="none" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.25, delay: i * 0.03 }} />
            <motion.path d={d} stroke="#ffe5e8" strokeWidth={1.2} fill="none" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.25, delay: i * 0.03 }} />
          </g>
        ))}
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <motion.div className="text-center" initial={{ scale: 2.2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.12 }}>
          <div className="kanji text-7xl sm:text-8xl text-white" style={{ textShadow: '0 0 30px #ff1a3c, 0 0 60px #ff1a3c, 4px 4px 0 #000' }}>
            黒閃
          </div>
          <div className="h-display text-4xl sm:text-6xl mt-2" style={{ color: '#fff', textShadow: '3px 3px 0 #b3001e, -3px -3px 0 #000, 0 0 30px #ff1a3c', letterSpacing: '.12em' }}>
            BLACK FLASH
          </div>
          <div className="mono text-base sm:text-lg mt-3 text-[#ffd6dc]">{title}</div>
          {sub && <div className="text-sm text-[#ff8a9a] mt-1">{sub}</div>}
        </motion.div>
      </div>
    </motion.div>
  );
}

function RankUp({ rank }: { rank: string }) {
  return (
    <motion.div className="fixed inset-0 z-[96] pointer-events-none grid place-items-center bg-black/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="panel px-10 py-8 text-center" initial={{ scale: 0.6, y: 30 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 16 }}>
        <div className="flex justify-center mb-3">
          <Seal text="昇" size={84} />
        </div>
        <div className="label">RANK UP</div>
        <div className="h-display text-4xl mt-1 glitch" data-text={rank}>
          {rank}
        </div>
        <div className="text-sm text-muted mt-2">{L('Новый ранг шамана', 'New sorcerer rank')}</div>
      </motion.div>
    </motion.div>
  );
}

function ConfirmBox({ c, done }: { c: Confirm; done: (v: false | string) => void }) {
  const [note, setNote] = useState('');
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape') done(false);
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [done]);
  return (
    <motion.div className="fixed inset-0 z-[97] grid place-items-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-black/70" onClick={() => done(false)} />
      <motion.div className={`panel ${c.danger ? 'panel-hot' : ''} relative w-full max-w-sm p-5`} initial={{ scale: 0.94 }} animate={{ scale: 1 }}>
        <p className="text-[15px] leading-relaxed whitespace-pre-line">{c.text}</p>
        {c.withNote && <textarea className="inp mt-3 min-h-[4rem]" placeholder={L('Комментарий (необязательно)', 'Note (optional)')} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />}
        <div className="flex justify-end gap-2 mt-4">
          <button className="btn btn-ghost btn-sm" onClick={() => done(false)}>
            {L('Отмена', 'Cancel')}
          </button>
          <button className={`btn btn-sm ${c.danger ? 'btn-danger' : ''}`} onClick={() => done(note || ' ')} autoFocus={!c.withNote}>
            {c.okLabel ?? L('Да', 'Yes')}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function ChooseBox({ c, done }: { c: Choose; done: (v: string | null) => void }) {
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape') done(null);
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [done]);
  return (
    <motion.div className="fixed inset-0 z-[97] flex items-end sm:items-center justify-center p-3 sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-black/55" onClick={() => done(null)} />
      <motion.div className="relative w-full max-w-sm space-y-2 safe-bottom" initial={{ y: 30 }} animate={{ y: 0 }} role="dialog" aria-modal="true">
        <div className="sheet rounded-[20px] overflow-hidden">
          <p className="text-[13px] text-muted text-center px-4 py-3 whitespace-pre-line">{c.text}</p>
          {c.options.map((o) => (
            <button key={o.v} className={`block w-full min-h-[52px] border-t border-line text-[16px] ${o.danger ? 'text-blood' : 'text-acc'} hover:bg-panel-2`} onClick={() => done(o.v)}>
              {o.label}
            </button>
          ))}
        </div>
        <button className="sheet block w-full min-h-[52px] rounded-[20px] text-[16px] font-semibold text-acc" onClick={() => done(null)}>
          {L('Отмена', 'Cancel')}
        </button>
      </motion.div>
    </motion.div>
  );
}

export function FXLayer() {
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [flash, setFlash] = useState<{ id: string; title: string; sub?: string } | null>(null);
  const [rank, setRank] = useState<{ id: string; rank: string } | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [choose, setChoose] = useState<Choose | null>(null);

  useEffect(
    () =>
      fx.on((e) => {
        if (e.type === 'exorcise') {
          const b = { id: uid(), x: e.x, y: e.y, xp: e.xp, label: e.label };
          setBursts((s) => [...s, b]);
          window.setTimeout(() => setBursts((s) => s.filter((x) => x.id !== b.id)), 1300);
        } else if (e.type === 'blackflash') {
          const id = uid();
          setFlash({ id, title: e.title, sub: e.sub });
          window.setTimeout(() => setFlash((f) => (f?.id === id ? null : f)), 2300);
        } else if (e.type === 'rankup') {
          const id = uid();
          setRank({ id, rank: e.rank });
          window.setTimeout(() => setRank((r) => (r?.id === id ? null : r)), 2600);
        } else if (e.type === 'toast') {
          const t: Toast = { id: uid(), text: e.text, tone: e.tone || 'ok', action: e.action };
          setToasts((s) => [...s.slice(-3), t]);
          window.setTimeout(() => setToasts((s) => s.filter((x) => x.id !== t.id)), e.ms || 3200);
        } else if (e.type === 'confirm') {
          setConfirm(e);
        } else if (e.type === 'choose') {
          setChoose(e);
        }
      }),
    [],
  );

  const toneColor: Record<string, string> = { ok: 'var(--accent-1)', warn: '#f2c14e', bad: '#ff2744', xp: '#3ddc97' };

  return createPortal(
    <>
      {bursts.map((b) => (
        <ExorciseBurst key={b.id} b={b} />
      ))}
      <AnimatePresence>{flash && <BlackFlash key={flash.id} title={flash.title} sub={flash.sub} />}</AnimatePresence>
      <AnimatePresence>{rank && <RankUp key={rank.id} rank={rank.rank} />}</AnimatePresence>
      <AnimatePresence>
        {confirm && (
          <ConfirmBox
            key="confirm"
            c={confirm}
            done={(v) => {
              confirm.resolve(v);
              setConfirm(null);
            }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {choose && (
          <ChooseBox
            key="choose"
            c={choose}
            done={(v) => {
              choose.resolve(v);
              setChoose(null);
            }}
          />
        )}
      </AnimatePresence>
      <div className="fixed left-1/2 -translate-x-1/2 bottom-24 lg:bottom-6 z-[98] flex flex-col items-center gap-2 pointer-events-none w-[min(92vw,420px)]">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ y: 20, opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: -10, opacity: 0 }}
              className="panel panel-flat px-4 py-2.5 text-sm flex items-center gap-2 w-full pointer-events-auto"
              role="status"
              style={{ ['--bc' as string]: `color-mix(in srgb, ${toneColor[t.tone]} 53%, transparent)` }}
            >
              <Icon name={t.tone === 'xp' ? 'sparkle' : t.tone === 'bad' ? 'x' : t.tone === 'warn' ? 'bell' : 'check'} size={16} style={{ color: toneColor[t.tone] }} />
              <span className="min-w-0 flex-1">{t.text}</span>
              {t.action && (
                <button
                  className="btn btn-xs shrink-0 min-h-[32px]"
                  onClick={() => {
                    t.action!.run();
                    setToasts((s) => s.filter((x) => x.id !== t.id));
                  }}
                >
                  {t.action.label}
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </>,
    document.body,
  );
}
