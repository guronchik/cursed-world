// Синтезированные звуки (WebAudio) — без аудиофайлов, работают офлайн.
import { rt } from './runtime';

let ctx: AudioContext | null = null;

function ac() {
  if (!ctx) {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    // iOS: «ambient» уважает беззвучный режим телефона
    try {
      const nav = navigator as unknown as { audioSession?: { type: string } };
      if (nav.audioSession) nav.audioSession.type = 'ambient';
    } catch {
      /* старые браузеры */
    }
    ctx = new C();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(a: AudioContext, freq: number, dur: number, type: OscillatorType, gain: number, when = 0, slideTo?: number) {
  const t = a.currentTime + when;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(a: AudioContext, dur: number, gain: number, freq: number, when = 0) {
  const t = a.currentTime + when;
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.setValueAtTime(freq, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(80, freq / 6), t + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
}

export type SoundName = 'exorcise' | 'flash' | 'rank' | 'tick' | 'warn' | 'vow' | 'whoosh' | 'click' | 'hit';

export function play(name: SoundName) {
  if (!rt.sound) return;
  const a = ac();
  if (!a) return;
  try {
    switch (name) {
      case 'tick':
        tone(a, 880, 0.06, 'square', 0.04);
        break;
      case 'exorcise':
        noise(a, 0.45, 0.35, 3200);
        tone(a, 220, 0.5, 'sawtooth', 0.12, 0, 55);
        tone(a, 660, 0.25, 'triangle', 0.08, 0.05, 1320);
        break;
      case 'flash':
        noise(a, 0.12, 0.6, 6000);
        noise(a, 0.5, 0.4, 1800, 0.08);
        tone(a, 90, 0.7, 'sawtooth', 0.25, 0.02, 30);
        tone(a, 1400, 0.15, 'square', 0.06, 0.1, 300);
        break;
      case 'rank':
        [392, 523.25, 659.25, 783.99].forEach((f, i) => tone(a, f, 0.5, 'triangle', 0.1, i * 0.09));
        break;
      case 'vow':
        tone(a, 146.8, 1.1, 'sine', 0.18);
        tone(a, 220, 1.1, 'sine', 0.1, 0.05);
        break;
      case 'whoosh':
        noise(a, 0.55, 0.12, 900);
        break;
      case 'click':
        tone(a, 1800, 0.03, 'triangle', 0.05);
        break;
      case 'hit':
        noise(a, 0.18, 0.4, 2200);
        tone(a, 70, 0.4, 'sine', 0.3, 0, 40);
        break;
      case 'warn':
        tone(a, 300, 0.18, 'square', 0.06);
        tone(a, 240, 0.25, 'square', 0.06, 0.15);
        break;
    }
  } catch {
    /* звук не критичен */
  }
}
