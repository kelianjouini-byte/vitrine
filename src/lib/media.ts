/**
 * Outils images et vidéos du navigateur (version web) pour les stories et les Reels :
 * image tirée d'une vidéo (pour l'IA et la vignette), durée d'une vidéo, photo avec son petit texte.
 */
import { Platform } from 'react-native';
import { drawOverlay, FRAME, loadOverlayFonts, type Overlay } from './overlay';

const web = Platform.OS === 'web' && typeof document !== 'undefined';

function loadVideo(uri: string): Promise<HTMLVideoElement> {
  return new Promise((ok, ko) => {
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.preload = 'auto';
    v.onloadeddata = () => ok(v);
    v.onerror = () => ko(new Error('vidéo illisible'));
    v.src = uri;
    v.load();
  });
}

/** Durée d'une vidéo en secondes (null si le navigateur ne la donne pas). */
export async function videoDuration(uri: string): Promise<number | null> {
  if (!web) return null;
  try {
    const v = await loadVideo(uri);
    const d = v.duration;
    v.removeAttribute('src');
    return Number.isFinite(d) && d > 0 ? d : null;
  } catch {
    return null;
  }
}

/**
 * Une image de la vidéo (vers `at` secondes), recadrée en vertical 9:16, en JPEG (base64 sans en-tête).
 * Sert à l'IA (elle « regarde » cette image) et de vignette dans « Mes posts ».
 */
export async function videoFrame(uri: string, at = 1, width = 720): Promise<string | null> {
  if (!web) return null;
  try {
    const v = await loadVideo(uri);
    const d = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : at * 2;
    await new Promise<void>((ok) => {
      const done = () => ok();
      v.onseeked = done;
      setTimeout(done, 2500);
      v.currentTime = Math.min(at, d / 2);
    });
    const height = Math.round((width * FRAME.height) / FRAME.width);
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const g = c.getContext('2d')!;
    const vw = v.videoWidth || width;
    const vh = v.videoHeight || height;
    const scale = Math.max(width / vw, height / vh);
    g.drawImage(v, (width - vw * scale) / 2, (height - vh * scale) / 2, vw * scale, vh * scale);
    v.removeAttribute('src');
    return c.toDataURL('image/jpeg', 0.82).split(',')[1] ?? null;
  } catch {
    return null;
  }
}

function loadImage(uri: string): Promise<HTMLImageElement> {
  return new Promise((ok, ko) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => ko(new Error('image illisible'));
    img.src = uri;
  });
}

/**
 * Photo de story (déjà au format 9:16) avec le petit texte dessiné dessus : c'est elle qui est publiée.
 * Retourne le JPEG en base64 (sans en-tête) et une adresse pour l'afficher.
 */
export async function photoWithText(photoUri: string, overlay: Overlay): Promise<{ base64: string; uri: string }> {
  await loadOverlayFonts();
  const img = await loadImage(photoUri);
  const c = document.createElement('canvas');
  c.width = FRAME.width;
  c.height = FRAME.height;
  const g = c.getContext('2d')!;
  const scale = Math.max(c.width / img.naturalWidth, c.height / img.naturalHeight);
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  g.drawImage(img, (c.width - w) / 2, (c.height - h) / 2, w, h);
  drawOverlay(g, overlay, c.width, c.height, null);
  const uri = c.toDataURL('image/jpeg', 0.88);
  return { base64: uri.split(',')[1], uri };
}
