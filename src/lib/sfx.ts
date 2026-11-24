/**
 * Petits sons et vibrations des points (style jeu mobile). Les sons sont fabriqués à la volée (Web Audio) :
 * aucun fichier à télécharger. Rien ne casse si le téléphone ne sait pas faire : on se tait, simplement.
 *  - son : sur le site et dans les applis des stores (pas sur l'appli native Expo, qui n'en a pas besoin pour l'instant) ;
 *  - vibration : applis des stores, Android dans le navigateur ; pas sur iPhone dans Safari (Apple ne le permet pas).
 */
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const AC = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  try {
    if (!ctx || ctx.state === 'closed') ctx = new AC();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

/** À appeler au moment où le commerçant touche un bouton : le navigateur n'accepte le son qu'après un geste. */
export function unlockSounds(): void {
  audio();
}

/** Une note courte avec ses harmoniques, qui s'éteint vite (« ting »). */
function note(c: AudioContext, freq: number, at: number, decay: number, volume: number, harmonics: number[] = [1, 0.3]) {
  const out = c.createGain();
  out.gain.setValueAtTime(0.0001, at);
  out.gain.exponentialRampToValueAtTime(volume, at + 0.004);
  out.gain.exponentialRampToValueAtTime(0.0001, at + decay * 5);
  out.connect(c.destination);
  harmonics.forEach((h, i) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.value = freq * (i + 1);
    g.gain.value = h;
    o.connect(g).connect(out);
    o.start(at);
    o.stop(at + decay * 5 + 0.05);
  });
}

/** « Pop » quand le +10 apparaît. */
export function playPop(): void {
  const c = audio();
  if (!c) return;
  const t = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.frequency.setValueAtTime(1200, t);
  o.frequency.exponentialRampToValueAtTime(300, t + 0.12);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.35, t + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + 0.2);
}

/** Petit souffle quand les pièces s'envolent. */
export function playWhoosh(): void {
  const c = audio();
  if (!c) return;
  const t = c.currentTime;
  const len = Math.floor(c.sampleRate * 0.35);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((Math.PI * i) / len) ** 2;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 2500;
  f.Q.value = 0.9;
  const g = c.createGain();
  g.gain.value = 0.18;
  src.connect(f).connect(g).connect(c.destination);
  src.start(t);
}

/** « Ting » d'une pièce qui arrive : un peu plus aigu à chaque pièce (step = 0, 1, 2…). */
export function playCoin(step: number): void {
  const c = audio();
  if (!c) return;
  const scale = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19];
  const f = 1318.5 * 2 ** (scale[Math.min(step, scale.length - 1)] / 12);
  const t = c.currentTime;
  note(c, f, t, 0.07, 0.16);
  note(c, f * 1.5, t + 0.045, 0.09, 0.1, [1, 0.2]);
}

/** Petite mélodie de fin (arpège qui monte). */
export function playChime(): void {
  const c = audio();
  if (!c) return;
  const t = c.currentTime;
  [1, 1.25, 1.5, 2].forEach((m, i) => note(c, 1046.5 * m, t + i * 0.06, 0.35, 0.12, [1, 0.35, 0.1]));
}

/** Vibration courte et rapide (comme un « bzz » de jeu). */
export function buzz(): void {
  try {
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      return;
    }
    // Applis des stores (Capacitor) : le module Haptics, s'il est installé.
    const cap = (window as unknown as { Capacitor?: { Plugins?: { Haptics?: { vibrate?: (o: { duration: number }) => Promise<void> } } } }).Capacitor;
    if (cap?.Plugins?.Haptics?.vibrate) {
      cap.Plugins.Haptics.vibrate({ duration: 180 }).catch(() => {});
      return;
    }
    // Android dans le navigateur. (iPhone dans Safari : pas de vibration possible.)
    navigator.vibrate?.([40, 30, 80]);
  } catch {
    // Pas de vibration : ce n'est pas grave.
  }
}
