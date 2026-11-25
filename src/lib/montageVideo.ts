/**
 * Montage automatique d'un Reel filmé en plusieurs bouts : les bouts sont lus image par image (Mediabunny / WebCodecs),
 * collés avec un fondu très court, et réenregistrés en une seule vidéo MP4 verticale 1080 x 1920.
 * Le son de chaque bout suit, avec le même petit fondu. Ensuite, la vidéo continue son chemin comme une vidéo
 * filmée d'un coup (texte dessus, musique, publication).
 * Chargé seulement au moment du montage (fichier à part).
 */
import { ALL_FORMATS, AudioBufferSource, BlobSource, BufferTarget, CanvasSink, CanvasSource, canEncodeAudio, canEncodeVideo, Input, Mp4OutputFormat, Output, type WrappedCanvas } from 'mediabunny';
import { registerAacEncoder } from '@mediabunny/aac-encoder';
import { FRAME } from './overlay';
import { layersAt, planMontage, type MontagePlan } from './montage';
import { audioContext, loadVideoSound } from './videoMusic';

const FPS = 30;

/** Retourne la vidéo montée, ou null si ce téléphone ne sait pas faire (WebCodecs absent ou vidéo illisible). */
export async function makeMontage(uris: string[], onProgress: (p: number) => void): Promise<{ blob: Blob; seconds: number } | null> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoDecoder === 'undefined') return null;
  const { width: W, height: H } = FRAME;
  if (!(await canEncodeVideo('avc', { width: W, height: H, bitrate: 8_000_000 }))) return null;

  // 1. Ouvrir chaque bout et mesurer sa durée.
  const clips: { sink: CanvasSink; first: number; duration: number }[] = [];
  for (const uri of uris) {
    const input = new Input({ source: new BlobSource(await (await fetch(uri)).blob()), formats: ALL_FORMATS });
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) return null;
    const first = await track.getFirstTimestamp();
    const duration = (await input.computeDuration()) - first;
    if (!(duration > 0)) return null;
    clips.push({ sink: new CanvasSink(track, { width: W, height: H, fit: 'cover', poolSize: 4 }), first, duration });
  }
  const plan = planMontage(clips.map((c) => c.duration));
  const frames = Math.max(1, Math.round(plan.total * FPS));

  // 2. Pour chaque bout, la liste des instants dont on aura besoin (dans l'ordre) : chaque image n'est décodée qu'une fois.
  const need: number[][] = clips.map(() => []);
  for (let k = 0; k < frames; k++) {
    for (const l of layersAt(plan, k / FPS)) need[l.index].push(clips[l.index].first + l.local);
  }
  const readers = clips.map((c, i) => c.sink.canvasesAtTimestamps(need[i]));
  const last: (WrappedCanvas | null)[] = clips.map(() => null);

  // 3. Le son : chaque bout à sa place, avec le même petit fondu.
  const ctx = audioContext();
  const sounds = await Promise.all(uris.map((u) => loadVideoSound(ctx, u)));
  const mixed = sounds.some(Boolean) ? await mixSounds(sounds, plan) : null;
  if (mixed && !(await canEncodeAudio('aac'))) registerAacEncoder();

  // 4. Fabriquer la vidéo.
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d')!;
  const bitrate = Math.max(4_000_000, Math.min(12_000_000, Math.floor((44 * 8 * 1024 * 1024) / plan.total) - 200_000));
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
  const video = new CanvasSource(canvas, { codec: 'avc', bitrate });
  output.addVideoTrack(video, { frameRate: FPS });
  const audio = mixed ? new AudioBufferSource({ codec: 'aac', bitrate: 160_000 }) : null;
  if (audio) output.addAudioTrack(audio);
  await output.start();

  const drawFrames = async () => {
    for (let k = 0; k < frames; k++) {
      const t = k / FPS;
      g.globalAlpha = 1;
      g.fillStyle = '#000';
      g.fillRect(0, 0, W, H);
      for (const l of layersAt(plan, t)) {
        const r = await readers[l.index].next();
        const wc = (!r.done && r.value) || last[l.index];
        if (!r.done && r.value) last[l.index] = r.value;
        if (!wc) continue;
        g.globalAlpha = l.alpha;
        g.drawImage(wc.canvas, 0, 0, W, H);
      }
      await video.add(t, 1 / FPS);
      if (k % 5 === 0) onProgress(Math.min(0.98, k / frames));
    }
    video.close();
  };
  await Promise.all([drawFrames(), audio && mixed ? audio.add(mixed).then(() => audio.close()) : null]);
  await output.finalize();
  const buffer = output.target.buffer;
  if (!buffer) return null;
  onProgress(1);
  return { blob: new Blob([buffer], { type: 'video/mp4' }), seconds: plan.total };
}

async function mixSounds(sounds: (AudioBuffer | null)[], plan: MontagePlan): Promise<AudioBuffer> {
  const rate = 48_000;
  const off = new OfflineAudioContext(2, Math.max(1, Math.ceil(plan.total * rate)), rate);
  const f = plan.fade;
  sounds.forEach((s, i) => {
    if (!s) return;
    const start = plan.starts[i];
    const d = Math.min(plan.durations[i], s.duration);
    const gain = off.createGain();
    gain.connect(off.destination);
    gain.gain.setValueAtTime(i > 0 && f ? 0 : 1, start);
    if (i > 0 && f) gain.gain.linearRampToValueAtTime(1, start + f);
    if (i < sounds.length - 1 && f) {
      gain.gain.setValueAtTime(1, start + d - f);
      gain.gain.linearRampToValueAtTime(0, start + d);
    }
    const src = off.createBufferSource();
    src.buffer = s;
    src.connect(gain);
    src.start(start, 0, d);
  });
  return off.startRendering();
}
