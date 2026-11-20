// Экран блокировки по PIN-коду (опционально). Автоблокировка после N минут в фоне.
import { motion } from 'framer-motion';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { hashPin } from '../lib/pin';
import { L } from '../lib/runtime';
import { useSettings } from '../lib/settings';
import { play } from '../lib/sound';
import { Icon } from './Icon';
import { Seal } from './Seal';

const KEY = 'cw-unlocked';

export function PinGate({ children }: { children: ReactNode }) {
  const s = useSettings();
  const [unlocked, setUnlocked] = useState(() => !s.pinHash || sessionStorage.getItem(KEY) === s.pinHash);
  const hiddenAt = useRef<number | null>(null);

  useEffect(() => {
    if (!s.pinHash) setUnlocked(true);
  }, [s.pinHash]);

  useEffect(() => {
    if (!s.pinHash) return;
    const fn = () => {
      if (document.visibilityState === 'hidden') hiddenAt.current = Date.now();
      else if (hiddenAt.current && Date.now() - hiddenAt.current > s.lockAfterMin * 60_000) {
        sessionStorage.removeItem(KEY);
        setUnlocked(false);
      }
    };
    document.addEventListener('visibilitychange', fn);
    return () => document.removeEventListener('visibilitychange', fn);
  }, [s.pinHash, s.lockAfterMin]);

  if (!s.pinHash || unlocked) return <>{children}</>;
  return (
    <LockScreen
      onUnlock={() => {
        sessionStorage.setItem(KEY, s.pinHash!);
        setUnlocked(true);
      }}
    />
  );
}

function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const s = useSettings();
  const [pin, setPin] = useState('');
  const [bad, setBad] = useState(false);

  const press = async (d: string) => {
    if (pin.length >= 6) return;
    const next = pin + d;
    setPin(next);
    play('tick');
    if (next.length >= 4 && (await hashPin(next, s.pinSalt || '')) === s.pinHash) {
      play('vow');
      onUnlock();
      return;
    }
    if (next.length === 6) {
      setBad(true);
      play('warn');
      window.setTimeout(() => {
        setBad(false);
        setPin('');
      }, 600);
    }
  };

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) void press(e.key);
      else if (e.key === 'Backspace') setPin((p) => p.slice(0, -1));
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  });

  return (
    <div className="min-h-dvh grid place-items-center p-6">
      <motion.div className="text-center w-full max-w-xs" animate={bad ? { x: [0, -12, 10, -8, 6, 0] } : {}} transition={{ duration: 0.4 }}>
        <div className="flex justify-center mb-4">
          <Seal text="封" size={110} color={bad ? '#ff2744' : 'var(--accent-1)'} />
        </div>
        <div className="h-display text-2xl glitch" data-text="CURSED WORLD">
          CURSED WORLD
        </div>
        <div className="text-sm text-muted mt-1 mb-5">{L('Барьер активен. Введи PIN.', 'Barrier is up. Enter PIN.')}</div>
        <div className="flex justify-center gap-3 mb-6 h-4">
          {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
            <span key={i} className="w-3 h-3 rotate-45 border border-cursed" style={{ background: i < pin.length ? (bad ? '#ff2744' : 'var(--accent-1)') : 'transparent', boxShadow: i < pin.length ? '0 0 10px var(--accent-1)' : 'none' }} />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k, i) =>
            k ? (
              <button
                key={i}
                className="btn btn-ghost !text-xl !py-4 mono"
                onClick={() => (k === '⌫' ? setPin((p) => p.slice(0, -1)) : void press(k))}
                aria-label={k === '⌫' ? 'backspace' : k}
              >
                {k === '⌫' ? <Icon name="left" /> : k}
              </button>
            ) : (
              <span key={i} />
            ),
          )}
        </div>
      </motion.div>
    </div>
  );
}
