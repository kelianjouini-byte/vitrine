/**
 * Musique et petit texte des vidéos (stories et Reels), dans le navigateur (version web) :
 * - écoute de la musique pendant l'aperçu, calée sur la vidéo ;
 * - fabrication de la vidéo finale, avec la musique et le petit texte collés dedans.
 *
 * La musique et le texte doivent être DANS le fichier : Instagram ne laisse pas une appli ajouter les siens.
 * Tout se fait sur le téléphone (rien n'est envoyé à un serveur pour le mélange).
 * Sur l'appli installée (iOS / Android), le mélange viendra plus tard : le bouton n'y est pas proposé.
 */
import { Platform } from 'react-native';
import { Asset } from 'expo-asset';
import { FADE_IN_SECONDS, musicVolumeAt } from './music';
import { drawOverlay, FRAME, hasOverlay, loadOverlayFonts, type Overlay } from './overlay';
import { MAX_VIDEO_BYTES } from './api';

/** Les fichiers des musiques (assets/sons). Le navigateur ne les charge qu'au moment où on les écoute. */
const FILES: Record<string, number> = {
  'cocooning': require('../../assets/sons/cocooning.mp3'),
  'douce': require('../../assets/sons/douce.mp3'),
  'joyeuse': require('../../assets/sons/joyeuse.mp3'),
  'elegante': require('../../assets/sons/elegante.mp3'),
  'cafe': require('../../assets/sons/cafe.mp3'),
  'entrainante': require('../../assets/sons/entrainante.mp3'),
  'nouvel-an': require('../../assets/sons/nouvel-an.mp3'),
  'epiphanie': require('../../assets/sons/epiphanie.mp3'),
  'soldes': require('../../assets/sons/soldes.mp3'),
  'chandeleur': require('../../assets/sons/chandeleur.mp3'),
  'saint-valentin': require('../../assets/sons/saint-valentin.mp3'),
  'mardi-gras': require('../../assets/sons/mardi-gras.mp3'),
  'grands-parents': require('../../assets/sons/grands-parents.mp3'),
  'journee-des-femmes': require('../../assets/sons/journee-des-femmes.mp3'),
  'saint-patrick': require('../../assets/sons/saint-patrick.mp3'),
  'printemps': require('../../assets/sons/printemps.mp3'),
  'poisson-d-avril': require('../../assets/sons/poisson-d-avril.mp3'),
  'paques': require('../../assets/sons/paques.mp3'),
  'livre': require('../../assets/sons/livre.mp3'),
  'muguet': require('../../assets/sons/muguet.mp3'),
  'boulangerie': require('../../assets/sons/boulangerie.mp3'),
  'fete-des-meres': require('../../assets/sons/fete-des-meres.mp3'),
  'fete-des-peres': require('../../assets/sons/fete-des-peres.mp3'),
  'fete-de-la-musique': require('../../assets/sons/fete-de-la-musique.mp3'),
  'ete': require('../../assets/sons/ete.mp3'),
  'jardin': require('../../assets/sons/jardin.mp3'),
  'rentree': require('../../assets/sons/rentree.mp3'),
  'mer': require('../../assets/sons/mer.mp3'),
  'automne': require('../../assets/sons/automne.mp3'),
  'halloween': require('../../assets/sons/halloween.mp3'),
  'toussaint': require('../../assets/sons/toussaint.mp3'),
  'movember': require('../../assets/sons/movember.mp3'),
  'beaujolais': require('../../assets/sons/beaujolais.mp3'),
  'black-friday': require('../../assets/sons/black-friday.mp3'),
  'saint-nicolas': require('../../assets/sons/saint-nicolas.mp3'),
  'noel': require('../../assets/sons/noel.mp3'),
  'reveillon': require('../../assets/sons/reveillon.mp3'),
};

/** La musique n'est proposée que dans le navigateur pour l'instant (voir en haut du fichier). */
export const musicSupported = Platform.OS === 'web' && typeof window !== 'undefined' && 'AudioContext' in window && 'MediaRecorder' in window;

export const trackUrl = (id: string) => Asset.fromModule(FILES[id]).uri;

/** Le son de la vidéo, quand il y a de la musique : baissé pour qu'on entende la musique. */
export const VIDEO_VOLUME_WITH_MUSIC = 0.3;

// ------------------------------------------------------------------ outils audio

const cache = new Map<string, Promise<AudioBuffer>>();

/** Télécharge et décode une musique (une seule fois par musique). */
function loadTrack(ctx: AudioContext, id: string): Promise<AudioBuffer> {
  const key = id;
  if (!cache.has(key)) {
    cache.set(key, fetch(trackUrl(id)).then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b)));
  }
  const p = cache.get(key)!;
  p.catch(() => cache.delete(key));
  return p;
}

/** Le son d'origine de la vidéo (null si la vidéo n'a pas de son ou si le navigateur ne sait pas le lire). */
async function loadVideoSound(ctx: AudioContext, videoUri: string): Promise<AudioBuffer | null> {
  try {
    const bytes = await (await fetch(videoUri)).arrayBuffer();
    return await ctx.decodeAudioData(bytes);
  } catch {
    return null;
  }
}

let shared: AudioContext | null = null;
/** Un seul « moteur audio » pour toute l'appli. À appeler pendant un appui (règle des navigateurs). */
export function audioContext(): AudioContext {
  if (!shared || shared.state === 'closed') shared = new AudioContext();
  if (shared.state === 'suspended') shared.resume().catch(() => {});
  return shared;
}

// ------------------------------------------------------------------ aperçu

/**
 * Écoute de la musique pendant l'aperçu : elle suit la vidéo (qui tourne en boucle, sans le son),
 * repart du début à chaque tour et redescend à la fin, comme dans la story finale.
 * Retourne une fonction pour arrêter.
 */
export function startPreview(video: HTMLVideoElement, trackId: string, duration: number): () => void {
  const ctx = audioContext();
  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(ctx.destination);
  let source: AudioBufferSourceNode | null = null;
  let stopped = false;
  let frame = 0;
  let lastTime = 0;

  loadTrack(ctx, trackId).then((buffer) => {
    if (stopped) return;
    const startAt = (offset: number) => {
      source?.stop();
      source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(gain);
      source.start(0, offset % buffer.duration);
    };
    startAt(video.currentTime);
    const tick = () => {
      if (stopped) return;
      const t = video.currentTime;
      if (t + 0.25 < lastTime) startAt(t); // la vidéo est repartie au début
      lastTime = t;
      gain.gain.setTargetAtTime(musicVolumeAt(t, duration), ctx.currentTime, 0.05);
      frame = requestAnimationFrame(tick);
    };
    tick();
  }).catch(() => {});

  return () => {
    stopped = true;
    cancelAnimationFrame(frame);
    try { source?.stop(); } catch { /* déjà arrêtée */ }
    gain.disconnect();
  };
}

/** Écoute d'une musique seule (liste « Changer la musique ») : 15 secondes, avec une fin douce. */
export function playSample(trackId: string): () => void {
  const ctx = audioContext();
  const gain = ctx.createGain();
  gain.connect(ctx.destination);
  let source: AudioBufferSourceNode | null = null;
  let stopped = false;
  loadTrack(ctx, trackId).then((buffer) => {
    if (stopped) return;
    source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + 0.5);
    gain.gain.setValueAtTime(1, now + 13);
    gain.gain.linearRampToValueAtTime(0, now + 15);
    source.start(now, 0, 15);
  }).catch(() => {});
  return () => {
    stopped = true;
    try { source?.stop(); } catch { /* déjà arrêtée */ }
    gain.disconnect();
  };
}

// ------------------------------------------------------------------ vidéo finale

/**
 * Le premier format que le navigateur sait enregistrer. MP4 d'abord (H.264 + son AAC) :
 * c'est le seul qu'Instagram et Facebook acceptent. Le webm (anciens navigateurs) est refusé à l'envoi.
 */
export function recordingMimeType(): string | undefined {
  const MR = (globalThis as { MediaRecorder?: typeof MediaRecorder }).MediaRecorder;
  if (!MR) return undefined;
  return ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].find((t) => MR.isTypeSupported(t));
}

/** Le texte sur la vidéo et la vidéo finale ne sont fabriqués que dans le navigateur (comme la musique). */
export const videoEditSupported = musicSupported && typeof HTMLCanvasElement !== 'undefined' && 'captureStream' in HTMLCanvasElement.prototype;

/**
 * Fabrique la vidéo finale (story ou Reel) : image plein écran 1080 x 1920, petit texte qui apparaît
 * en douceur, et musique (facultative) qui entre doucement et redescend pile à la fin.
 * Avec musique, le son de la vidéo est baissé ; sans musique, il est gardé tel quel.
 * Ça prend le temps de la vidéo (elle est rejouée une fois, sans le son, pour être enregistrée).
 * `onProgress` reçoit un nombre de 0 à 1.
 */
export async function makeFinalVideo(
  videoUri: string,
  opts: { trackId: string | null; overlay: Overlay | null },
  onProgress: (p: number) => void = () => {},
): Promise<{ blob: Blob; uri: string; mimeType: string }> {
  const { trackId, overlay } = opts;
  const ctx = audioContext();
  const mimeType = recordingMimeType();
  if (!mimeType) throw new Error('enregistrement impossible sur ce navigateur');

  const video = document.createElement('video');
  video.src = videoUri;
  video.muted = true; // le son d'origine passe par le moteur audio, réglé plus bas
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.preload = 'auto';
  await new Promise<void>((ok, ko) => {
    video.onloadeddata = () => ok();
    video.onerror = () => ko(new Error('vidéo illisible'));
  });

  const [music, sound] = await Promise.all([trackId ? loadTrack(ctx, trackId) : Promise.resolve(null), loadVideoSound(ctx, videoUri), overlay ? loadOverlayFonts() : Promise.resolve()]);
  // Une vidéo filmée dans le navigateur n'annonce pas toujours sa durée : on prend celle de son son.
  const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : sound?.duration ?? 0;
  if (!duration) throw new Error('durée inconnue');

  // Image : plein écran vertical, la vidéo est recadrée au centre si besoin.
  const canvas = document.createElement('canvas');
  canvas.width = FRAME.width;
  canvas.height = FRAME.height;
  const g = canvas.getContext('2d')!;
  const draw = () => {
    const vw = video.videoWidth || FRAME.width;
    const vh = video.videoHeight || FRAME.height;
    const scale = Math.max(canvas.width / vw, canvas.height / vh);
    const w = vw * scale;
    const h = vh * scale;
    g.drawImage(video, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    if (overlay) drawOverlay(g, overlay, canvas.width, canvas.height, video.currentTime);
  };
  draw();

  // Son : musique + son de la vidéo baissé, vers l'enregistreur seulement (rien dans le haut-parleur).
  const dest = ctx.createMediaStreamDestination();
  const musicGain = ctx.createGain();
  musicGain.connect(dest);
  let musicSource: AudioBufferSourceNode | null = null;
  if (music) {
    musicSource = ctx.createBufferSource();
    musicSource.buffer = music;
    musicSource.loop = true;
    musicSource.connect(musicGain);
  }
  let soundSource: AudioBufferSourceNode | null = null;
  if (sound) {
    const soundGain = ctx.createGain();
    soundGain.gain.value = music ? VIDEO_VOLUME_WITH_MUSIC : 1;
    soundGain.connect(dest);
    soundSource = ctx.createBufferSource();
    soundSource.buffer = sound;
    soundSource.connect(soundGain);
  }

  // Son d'origine illisible d'avance (certains formats) : on le prend directement pendant la lecture,
  // envoyé vers l'enregistreur seulement (rien dans le haut-parleur).
  let liveSound = false;
  if (!sound) {
    try {
      const el = ctx.createMediaElementSource(video);
      const g2 = ctx.createGain();
      g2.gain.value = music ? VIDEO_VOLUME_WITH_MUSIC : 1;
      el.connect(g2);
      g2.connect(dest);
      video.muted = false;
      liveSound = true;
    } catch {
      /* tant pis : vidéo sans son d'origine */
    }
  }
  const audio = music || sound || liveSound ? dest.stream.getAudioTracks() : [];
  const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...audio]);
  // Qualité d'une vidéo de téléphone (8 Mbit/s), réduite pour les vidéos longues : le fichier doit rester
  // sous 50 Mo (limite du stockage). 90 secondes : environ 3,5 Mbit/s, encore net sur un téléphone.
  const videoBitsPerSecond = Math.max(2_500_000, Math.min(8_000_000, Math.floor((42 * 8 * 1024 * 1024) / duration) - 160_000));
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise<void>((ok) => { recorder.onstop = () => ok(); });

  recorder.start(1000);
  try {
    await video.play();
  } catch {
    // Lecture avec le son refusée par le navigateur : on rejoue sans le son d'origine.
    video.muted = true;
    await video.play();
  }
  const t0 = ctx.currentTime;
  // Volume de la musique : entrée douce, puis redescente pendant les dernières secondes.
  const fadeOut = Math.min(3, duration / 3);
  const fadeIn = Math.min(FADE_IN_SECONDS, duration / 4);
  musicGain.gain.setValueAtTime(0, t0);
  musicGain.gain.linearRampToValueAtTime(1, t0 + fadeIn);
  musicGain.gain.setValueAtTime(1, t0 + duration - fadeOut);
  musicGain.gain.linearRampToValueAtTime(0, t0 + duration);
  musicSource?.start(t0);
  soundSource?.start(t0);

  await new Promise<void>((ok) => {
    let frame = 0;
    const loop = () => {
      draw();
      onProgress(Math.min(1, video.currentTime / duration));
      if (video.ended || video.currentTime >= duration) return ok();
      frame = requestAnimationFrame(loop);
    };
    video.onended = () => { cancelAnimationFrame(frame); ok(); };
    loop();
  });

  // Une dernière image, puis on arrête tout.
  draw();
  try { musicSource?.stop(); soundSource?.stop(); } catch { /* déjà arrêtés */ }
  recorder.stop();
  await done;
  stream.getTracks().forEach((t) => t.stop());
  video.removeAttribute('src');
  onProgress(1);
  const blob = new Blob(chunks, { type: mimeType.split(';')[0] });
  return { blob, uri: URL.createObjectURL(blob), mimeType: blob.type };
}

/**
 * Donne la vidéo au commerçant : sur iPhone, le menu « Partager » permet de l'enregistrer
 * dans Photos ou de l'envoyer ; sinon, simple téléchargement.
 */
export async function saveVideo(blob: Blob, name = 'video-vitrine'): Promise<void> {
  const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
  const file = new File([blob], `${name}.${ext}`, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file] });
      return;
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return; // la personne a fermé le menu
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * La vidéo qui part sur les réseaux : refabriquée avec le texte et la musique s'il y en a,
 * ou si elle est trop lourde pour le stockage (elle est alors un peu compressée).
 * Retourne undefined quand la vidéo d'origine convient telle quelle (ou sur l'appli installée).
 */
export async function prepareVideo(
  uri: string,
  opts: { overlay: Overlay | null; trackId: string | null },
  onProgress: (p: number) => void,
): Promise<Blob | undefined> {
  if (!videoEditSupported) return undefined;
  const overlay = hasOverlay(opts.overlay) ? opts.overlay : null;
  if (!overlay && !opts.trackId) {
    const original = await (await fetch(uri)).blob().catch(() => null);
    if (!original || original.size <= MAX_VIDEO_BYTES) return undefined;
  }
  return (await makeFinalVideo(uri, { trackId: opts.trackId, overlay }, onProgress)).blob;
}
