/**
 * Fabrication rapide de la vidéo finale (Reel ou story), image par image, avec Mediabunny (WebCodecs).
 * Chargé seulement au moment de fabriquer une vidéo (fichier à part, pour ne pas alourdir l'ouverture de l'appli).
 */
import { ALL_FORMATS, AudioBufferSource, BlobSource, BufferTarget, canEncodeAudio, canEncodeVideo, Conversion, Input, Mp4OutputFormat, Output } from 'mediabunny';
import { registerAacEncoder } from '@mediabunny/aac-encoder';
import { FADE_IN_SECONDS } from './music';
import { drawOverlay, FRAME, loadOverlayFonts, type Overlay } from './overlay';
import { audioContext, loadTrack, loadVideoSound, VIDEO_VOLUME_WITH_MUSIC } from './videoMusic';


/**
 * Méthode rapide : la vidéo est lue image par image (sans la rejouer), le texte est dessiné sur chaque image,
 * puis tout est réenregistré en MP4 (H.264 + AAC), en haute qualité. Aucune image n'est perdue, même si le
 * téléphone ralentit, et c'est en général bien plus rapide que la durée de la vidéo.
 * Sans musique, le son d'origine est recopié tel quel. Avec musique, le son est mélangé d'avance.
 * Fonctionne sur iPhone (iOS 16.4 et plus) et Android (Chrome) ; sinon retourne null.
 */
export async function makeFinalVideoFast(
  videoUri: string,
  opts: { trackId: string | null; overlay: Overlay | null },
  onProgress: (p: number) => void,
): Promise<Blob | null> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoDecoder === 'undefined') return null;
  const { width: W, height: H } = FRAME;
  if (!(await canEncodeVideo('avc', { width: W, height: H, bitrate: 8_000_000 }))) return null;

  const { trackId, overlay } = opts;
  const file = await (await fetch(videoUri)).blob();
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const videoTrack = await input.getPrimaryVideoTrack();
  if (!videoTrack || !(await videoTrack.canDecode())) return null;
  const start = await videoTrack.getFirstTimestamp();
  const duration = (await input.computeDuration()) - start;
  if (!(duration > 0)) return null;

  // Son : sans musique, on garde celui de la vidéo ; avec musique, on mélange tout d'avance.
  const ctx = trackId ? audioContext() : null;
  const music = ctx && trackId ? await loadTrack(ctx, trackId) : null;
  const mixed = ctx && music ? await mixSound(music, await loadVideoSound(ctx, videoUri), duration) : null;
  const audioTrack = await input.getPrimaryAudioTrack();
  if ((mixed || (audioTrack && audioTrack.codec !== 'aac')) && !(await canEncodeAudio('aac'))) {
    // Pas d'encodeur AAC dans ce navigateur : on utilise le nôtre (seulement dans ce cas).
    registerAacEncoder();
  }
  if (overlay) await loadOverlayFonts();

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d')!;
  // Qualité haute, mais le fichier doit rester sous 50 Mo (limite du stockage) : 12 Mbit/s au plus.
  const bitrate = Math.max(4_000_000, Math.min(12_000_000, Math.floor((44 * 8 * 1024 * 1024) / duration) - 200_000));

  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
  const conversion = await Conversion.init({
    input,
    output,
    composable: !!mixed,
    tracks: 'primary',
    showWarnings: false,
    video: {
      width: W,
      height: H,
      fit: 'cover',
      codec: 'avc',
      bitrate,
      frameRate: 30,
      forceTranscode: true,
      allowTransformationMetadata: false,
      process: overlay
        ? (sample) => {
          sample.draw(g, 0, 0, W, H);
          drawOverlay(g, overlay, W, H, Math.max(0, sample.timestamp - start));
          return canvas;
        }
        : undefined,
    },
    // Sans musique : le son d'origine est recopié tel quel (pas de réglage de qualité, sinon il serait réencodé).
    audio: mixed ? { discard: true } : { codec: 'aac' },
  });
  if (!conversion.utilizedTracks.some((t) => t.isVideoTrack())) return null;
  // Le son de la vidéo ne doit jamais disparaître en route : sinon, ancienne méthode.
  if (audioTrack && !mixed && !conversion.utilizedTracks.some((t) => t.isAudioTrack())) return null;

  let audioSource: AudioBufferSource | null = null;
  if (mixed) {
    audioSource = new AudioBufferSource({ codec: 'aac', bitrate: 160_000 });
    output.addAudioTrack(audioSource);
    await output.start();
  }
  conversion.onProgress = (p) => onProgress(Math.min(0.98, p));
  await Promise.all([
    conversion.execute(),
    audioSource && mixed ? audioSource.add(mixed).then(() => audioSource!.close()) : null,
  ]);
  if (mixed) await output.finalize();
  const buffer = output.target.buffer;
  if (!buffer) return null;
  onProgress(1);
  return new Blob([buffer], { type: 'video/mp4' });
}

/** Le son final quand il y a une musique : musique (entrée et fin douces) + son de la vidéo baissé. */
async function mixSound(music: AudioBuffer, sound: AudioBuffer | null, duration: number): Promise<AudioBuffer> {
  const rate = 48_000;
  const off = new OfflineAudioContext(2, Math.ceil(duration * rate), rate);
  const gain = off.createGain();
  gain.connect(off.destination);
  const fadeOut = Math.min(3, duration / 3);
  const fadeIn = Math.min(FADE_IN_SECONDS, duration / 4);
  gain.gain.setValueAtTime(0, 0);
  gain.gain.linearRampToValueAtTime(1, fadeIn);
  gain.gain.setValueAtTime(1, duration - fadeOut);
  gain.gain.linearRampToValueAtTime(0, duration);
  const m = off.createBufferSource();
  m.buffer = music;
  m.loop = true;
  m.connect(gain);
  m.start(0);
  if (sound) {
    const sg = off.createGain();
    sg.gain.value = VIDEO_VOLUME_WITH_MUSIC;
    sg.connect(off.destination);
    const s = off.createBufferSource();
    s.buffer = sound;
    s.connect(sg);
    s.start(0);
  }
  return off.startRendering();
}

