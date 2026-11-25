/**
 * Reel filmé en plusieurs bouts : les calculs (sans écran ni vidéo), pour pouvoir les tester.
 * Les bouts sont collés les uns après les autres avec un fondu très court entre deux (« micro-transition »).
 */

/** Durée du fondu entre deux bouts, en secondes : assez court pour rester discret. */
export const CROSSFADE_SECONDS = 0.25;

/** Un bout trop court (appui accidentel) n'est pas gardé. */
export const MIN_CLIP_SECONDS = 0.3;

/** Au-delà de ce temps d'appui, lâcher arrête le bout. En dessous, c'est un simple « toc » : on continue de filmer jusqu'au toc suivant. */
export const TAP_SECONDS = 0.4;

export type MontagePlan = {
  /** Début de chaque bout dans la vidéo finale, en secondes. */
  starts: number[];
  durations: number[];
  /** Fondu réellement utilisé (plus court si un bout est très court). */
  fade: number;
  total: number;
};

export function planMontage(durations: number[], fade = CROSSFADE_SECONDS): MontagePlan {
  const ds = durations.map((d) => Math.max(0, d));
  const f = ds.length < 2 ? 0 : Math.min(fade, ...ds.map((d) => d / 3));
  const starts: number[] = [];
  let t = 0;
  for (const d of ds) {
    starts.push(t);
    t += d - f;
  }
  const total = ds.length ? t + f : 0;
  return { starts, durations: ds, fade: f, total };
}

/**
 * Ce qu'on voit à l'instant `t` de la vidéo finale : un bout (opaque), plus le suivant qui apparaît en fondu
 * pendant la transition. `local` = l'instant dans le bout lui-même.
 */
export function layersAt(plan: MontagePlan, t: number): { index: number; local: number; alpha: number }[] {
  const { starts, durations, fade } = plan;
  const out: { index: number; local: number; alpha: number }[] = [];
  for (let i = 0; i < starts.length; i++) {
    const s = starts[i];
    const e = s + durations[i];
    const last = i === starts.length - 1;
    if (t < s || (t >= e && !last)) continue;
    const local = Math.min(t - s, Math.max(0, durations[i] - 0.001));
    const alpha = i > 0 && fade > 0 && t < s + fade ? (t - s) / fade : 1;
    out.push({ index: i, local, alpha });
  }
  // Le bout qui entre se pose par-dessus : on garde au plus deux couches (celui qui part, celui qui arrive).
  return out.slice(-2);
}

/** Temps déjà filmé (tous les bouts gardés). */
export function usedSeconds(clips: { seconds: number }[]): number {
  return clips.reduce((s, c) => s + c.seconds, 0);
}

/** « 0:05 », « 1:12 ». */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** « 1 min 30 », « 90 secondes » → pour les limites affichées. */
export function limitLabel(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (!m) return `${s} secondes`;
  return s ? `${m} min ${String(s).padStart(2, '0')}` : `${m} min`;
}
