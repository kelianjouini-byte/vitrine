/**
 * Petit texte posé SUR la photo ou la vidéo (Reel, story) : une phrase + un emoji, dans un des 3 styles.
 * Le même dessin sert pour l'aperçu et pour le fichier publié : ce que le commerçant voit est ce qui part.
 * La mise en page (calculs) est pure et testée ; le dessin utilise un « canvas » du navigateur.
 */

export type OverlayStyle = 'elegant' | 'moderne' | 'manuscrit';
export type OverlayPlace = 'haut' | 'milieu' | 'bas';

export interface Overlay {
  /** La phrase. Vide = pas de texte sur l'image. */
  text: string;
  /** L'emoji choisi (null = aucun). */
  emoji: string | null;
  style: OverlayStyle;
  place: OverlayPlace;
}

/** Taille de l'image finale (vertical plein écran : story et Reel). */
export const FRAME = { width: 1080, height: 1920 } as const;
export const OVERLAY_MAX_CHARS = 42;

export const OVERLAY_STYLES: { id: OverlayStyle; label: string }[] = [
  { id: 'elegant', label: 'Élégant' },
  { id: 'moderne', label: 'Moderne' },
  { id: 'manuscrit', label: 'Manuscrit' },
];
export const OVERLAY_PLACES: { id: OverlayPlace; label: string }[] = [
  { id: 'haut', label: 'Haut' },
  { id: 'milieu', label: 'Milieu' },
  { id: 'bas', label: 'Bas' },
];

/** Emojis proposés si l'IA n'en a pas donné (ou n'est pas branchée). */
export const DEFAULT_EMOJIS = ['✨', '❤️', '☀️', '🌿'];

export const emptyOverlay = (): Overlay => ({ text: '', emoji: null, style: 'elegant', place: 'haut' });

/** Police de chaque style (CSS). La 2e police sert si la 1re n'a pas pu être chargée. */
export const STYLE_FONTS: Record<OverlayStyle, { family: string; weight: number; size: number; upper: boolean; lineHeight: number }> = {
  elegant: { family: 'Fraunces, Georgia, serif', weight: 800, size: 92, upper: false, lineHeight: 1.08 },
  moderne: { family: 'Montserrat, "Arial Black", system-ui, sans-serif', weight: 900, size: 70, upper: true, lineHeight: 1.32 },
  manuscrit: { family: 'Caveat, "Snell Roundhand", cursive', weight: 700, size: 118, upper: false, lineHeight: 1.0 },
};

export const fontCss = (style: OverlayStyle, scale = 1) => {
  const f = STYLE_FONTS[style];
  return `${f.weight} ${Math.round(f.size * scale)}px ${f.family}`;
};

/** Largeur maximale du texte, et hauteur des emojis. */
const MAX_WIDTH = 0.84;
const EMOJI_SIZE = 112;

/** Où se trouve le centre du bloc (part de la hauteur) : en haut et en bas, on évite les boutons d'Instagram. */
const PLACE_Y: Record<OverlayPlace, number> = { haut: 0.2, milieu: 0.47, bas: 0.66 };

export type Measure = (text: string, font: string) => number;

/** Coupe la phrase en lignes qui tiennent dans la largeur (2 ou 3 lignes au plus, en réduisant la taille si besoin). */
export function wrapLines(text: string, maxWidth: number, font: string, measure: Measure): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (line && measure(next, font) > maxWidth) {
      lines.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export interface OverlayLayout {
  font: string;
  lines: { text: string; y: number; width: number }[];
  lineHeight: number;
  fontSize: number;
  emoji: { char: string; y: number; size: number } | null;
  /** Centre horizontal. */
  x: number;
}

/**
 * Mise en page dans une image de largeur W et hauteur H : taille de police réduite tant que le texte
 * dépasse 3 lignes ou qu'un mot est trop long. Les « y » sont les milieux des lignes.
 */
export function layoutOverlay(o: Overlay, W: number, H: number, measure: Measure): OverlayLayout | null {
  const text = o.text.trim();
  if (!text && !o.emoji) return null;
  const k = W / FRAME.width;
  const st = STYLE_FONTS[o.style];
  const shown = st.upper ? text.toLocaleUpperCase('fr-FR') : text;
  const maxWidth = W * MAX_WIDTH;
  let scale = 1;
  let lines: string[] = [];
  let font = fontCss(o.style, k);
  for (let i = 0; i < 8; i++) {
    font = fontCss(o.style, k * scale);
    lines = shown ? wrapLines(shown, maxWidth, font, measure) : [];
    const widest = Math.max(0, ...lines.map((l) => measure(l, font)));
    if (lines.length <= 3 && widest <= maxWidth) break;
    scale *= 0.88;
  }
  const fontSize = st.size * k * scale;
  const lineHeight = fontSize * st.lineHeight;
  const emojiSize = o.emoji ? EMOJI_SIZE * k : 0;
  const gap = o.emoji && lines.length ? 18 * k : 0;
  const blockH = emojiSize + gap + lines.length * lineHeight;
  const top = H * PLACE_Y[o.place] - blockH / 2;
  return {
    font,
    fontSize,
    lineHeight,
    x: W / 2,
    emoji: o.emoji ? { char: o.emoji, y: top + emojiSize / 2, size: emojiSize } : null,
    lines: lines.map((t, i) => ({ text: t, y: top + emojiSize + gap + lineHeight * (i + 0.5), width: measure(t, font) })),
  };
}

/** Apparition du texte dans la vidéo : fondu et petite montée entre 0,15 s et 0,75 s. */
export function entrance(t: number | null): { alpha: number; dy: number } {
  if (t === null) return { alpha: 1, dy: 0 };
  const p = Math.min(1, Math.max(0, (t - 0.15) / 0.6));
  const ease = 1 - (1 - p) ** 3;
  return { alpha: ease, dy: (1 - ease) * 36 };
}

type Ctx2D = CanvasRenderingContext2D;

/**
 * Dessine le texte et l'emoji sur un canvas de taille W x H.
 * `t` = temps de la vidéo en secondes (animation d'apparition), null pour une photo.
 */
export function drawOverlay(g: Ctx2D, o: Overlay, W: number, H: number, t: number | null = null) {
  const layout = layoutOverlay(o, W, H, (s, font) => { g.font = font; return g.measureText(s).width; });
  if (!layout) return;
  const k = W / FRAME.width;
  const { alpha, dy } = entrance(t);
  g.save();
  g.globalAlpha = alpha;
  g.translate(0, dy * k);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (layout.emoji) {
    g.font = `${Math.round(layout.emoji.size)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    g.shadowColor = 'rgba(0,0,0,0.25)';
    g.shadowBlur = 16 * k;
    g.fillText(layout.emoji.char, layout.x, layout.emoji.y);
  }
  g.font = layout.font;
  if (o.style === 'moderne') {
    // Bandeau blanc derrière chaque ligne, texte vert très foncé.
    g.shadowColor = 'rgba(0,0,0,0.18)';
    g.shadowBlur = 12 * k;
    const padX = layout.fontSize * 0.36;
    const h = layout.lineHeight * 0.92;
    for (const l of layout.lines) {
      g.fillStyle = '#FFFFFF';
      roundRect(g, layout.x - l.width / 2 - padX, l.y - h / 2, l.width + padX * 2, h, 10 * k);
      g.fill();
    }
    g.shadowBlur = 0;
    g.fillStyle = '#1F2B24';
    for (const l of layout.lines) g.fillText(l.text, layout.x, l.y + layout.fontSize * 0.04);
  } else {
    g.fillStyle = '#FFFFFF';
    g.shadowColor = 'rgba(0,0,0,0.55)';
    g.shadowBlur = 22 * k;
    g.shadowOffsetY = 3 * k;
    for (const l of layout.lines) g.fillText(l.text, layout.x, l.y);
  }
  g.restore();
}

function roundRect(g: Ctx2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// ------------------------------------------------------------------ polices (navigateur)

let fontsLoading: Promise<void> | null = null;

/**
 * Charge les 3 polices du texte (Google Fonts), une seule fois. Si le réseau est lent,
 * on n'attend pas plus de 4 secondes : la police de secours prend le relais.
 */
export function loadOverlayFonts(): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve();
  if (!fontsLoading) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,800&family=Montserrat:wght@900&family=Caveat:wght@700&display=swap';
    document.head.appendChild(link);
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    const ready = new Promise<void>((ok) => {
      link.onload = () => {
        if (!fonts) return ok();
        Promise.all((Object.keys(STYLE_FONTS) as OverlayStyle[]).map((s) => fonts.load(fontCss(s), 'Aé'))).then(() => ok(), () => ok());
      };
      link.onerror = () => ok();
    });
    fontsLoading = Promise.race([ready, new Promise<void>((ok) => setTimeout(ok, 4000))]);
  }
  return fontsLoading;
}

/** Y a-t-il quelque chose à écrire sur l'image ? */
export const hasOverlay = (o: Overlay | null | undefined): o is Overlay => !!o && (!!o.text.trim() || !!o.emoji);
