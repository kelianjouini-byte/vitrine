/** Prise de photo ou de vidéo, cadrage automatique et préparation avant l'envoi (accueil, idées, création, story). */
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { FriendlyError } from './api';
import { videoDuration } from './media';
import { CENTERED, cropRect, FORMATS, type Framing, type PhotoFormat } from './crop';
export * from './crop';

/** Photo telle que prise, avant recadrage (taille déjà raisonnable, orientation corrigée). */
export type RawPhoto = { uri: string; width: number; height: number };

/** Photo recadrée, prête à être envoyée. */
export type PickedPhoto = { uri: string; base64: string | null };

/** Nombre maximum de photos dans un carrousel (Instagram et Facebook). */
export const MAX_PHOTOS = 10;

/**
 * Ouvre l'appareil photo (une photo) ou la galerie (plusieurs photos possibles, jusqu'à `limit`).
 * Retourne une liste vide si la personne annule.
 */
export async function takePhotos(source: 'camera' | 'library', limit = MAX_PHOTOS): Promise<RawPhoto[]> {
  const multiple = source === 'library' && limit > 1;
  const opts: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: 0.9,
    ...(multiple ? { allowsMultipleSelection: true, selectionLimit: limit, orderedSelection: true } : {}),
  };
  if (source === 'camera' && Platform.OS !== 'web') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new FriendlyError("Vitrine a besoin de l'appareil photo. Vous pouvez aussi choisir une photo dans la galerie.");
  }
  let res: ImagePicker.ImagePickerResult;
  try {
    res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  } catch {
    throw new FriendlyError("La photo n'a pas pu être ouverte. Réessayez.");
  }
  if (res.canceled || !res.assets?.length) return [];
  const out: RawPhoto[] = [];
  for (const a of res.assets.slice(0, limit)) out.push(await normalize(a));
  return out;
}

/** Une seule photo à l'appareil photo (bouton de l'accueil et des idées). */
export async function takePhoto(): Promise<RawPhoto | null> {
  return (await takePhotos('camera', 1))[0] ?? null;
}

/** Au-delà, le recadrage est plus lent pour rien : 2 fois la taille finale suffit pour zoomer. */
const WORK_SIZE = 2160;

/**
 * Prépare la photo pour le recadrage : on la redessine une fois (orientation du téléphone corrigée,
 * vraie largeur et hauteur connues) et on la réduit si elle est énorme (souvent 4000 px).
 */
async function normalize(a: Pick<ImagePicker.ImagePickerAsset, 'uri' | 'width' | 'height'>): Promise<RawPhoto> {
  try {
    const ctx = ImageManipulator.manipulate(a.uri);
    const big = Math.max(a.width || 0, a.height || 0);
    if (!big || big > WORK_SIZE) {
      ctx.resize(!a.width || !a.height || a.width >= a.height ? { width: WORK_SIZE } : { height: WORK_SIZE });
    }
    const img = await ctx.renderAsync();
    const saved = await img.saveAsync({ compress: 0.9, format: SaveFormat.JPEG });
    if (saved.width && saved.height) return { uri: saved.uri, width: saved.width, height: saved.height };
  } catch {
    /* on garde la photo d'origine */
  }
  if (!a.width || !a.height) throw new FriendlyError("La photo n'a pas pu être lue. Essayez-en une autre.");
  return { uri: a.uri, width: a.width, height: a.height };
}

/**
 * Découpe la photo et la met à la taille Instagram du format choisi (1080 px de large) :
 * même rendu sur Instagram, mais un envoi et une réponse de l'IA beaucoup plus rapides.
 */
export async function renderCrop(photo: RawPhoto, format: PhotoFormat, framing: Framing): Promise<PickedPhoto> {
  try {
    const { width, height } = FORMATS[format];
    const img = await ImageManipulator.manipulate(photo.uri).crop(cropRect(photo, format, framing)).resize({ width, height }).renderAsync();
    const out = await img.saveAsync({ compress: 0.8, format: SaveFormat.JPEG, base64: true });
    if (out.base64) return { uri: out.uri, base64: out.base64 };
  } catch {
    /* message ci-dessous */
  }
  throw new FriendlyError("La photo n'a pas pu être préparée. Réessayez ou choisissez-en une autre.");
}

/** Photo cadrée automatiquement, au centre (plus de page de recadrage : on gagne du temps). */
export const autoCrop = (photo: RawPhoto, format: PhotoFormat) => renderCrop(photo, format, CENTERED);

/**
 * Galerie, version web : on ouvre nous-mêmes le sélecteur de fichiers du téléphone.
 * Celui d'expo-image-picker attend la durée de la vidéo, et l'iPhone (Safari) ne la donne jamais :
 * la vidéo choisie restait bloquée, rien ne se passait. Ici, la durée est mesurée ensuite (« Où la publier ? »).
 * Le sélecteur doit s'ouvrir tout de suite après le toucher (sinon Safari le bloque) : pas d'attente avant.
 */
function pickFileWeb(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    document.body.appendChild(input);
    let done = false;
    const finish = (f: File | null) => {
      if (done) return;
      done = true;
      input.remove();
      resolve(f);
    };
    input.addEventListener('change', () => finish(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => finish(null));
    input.click();
  });
}

/** Plusieurs fichiers d'un coup (vidéos de la galerie, pour un Reel en plusieurs bouts). */
function pickFilesWeb(accept: string): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = true;
    input.style.display = 'none';
    document.body.appendChild(input);
    let done = false;
    const finish = (f: File[]) => {
      if (done) return;
      done = true;
      input.remove();
      resolve(f);
    };
    input.addEventListener('change', () => finish(Array.from(input.files ?? [])));
    input.addEventListener('cancel', () => finish([]));
    input.click();
  });
}

const isVideoFile = (f: File) => f.type.startsWith('video/') || /\.(mov|mp4|m4v|webm)$/i.test(f.name);

// ---------------------------------------------------------------- story

/** Limites d'une story vidéo sur Instagram (les plus strictes des deux réseaux). */
export const STORY_MAX_SECONDS = 60;
const STORY_MAX_BYTES = 100 * 1024 * 1024;

/** Ce qui vient d'être pris avec les boutons « Photo » et « Vidéo » de l'accueil. */
export type Captured =
  | { kind: 'photo'; raw: RawPhoto }
  | { kind: 'video'; uri: string; seconds: number | null };

/** Durées d'un Reel : Facebook les accepte de 3 à 90 secondes. */
export const REEL_MIN_SECONDS = 3;
export const REEL_MAX_SECONDS = 90;

/** Ce qu'on met en story : une photo plein écran (déjà cadrée en 9:16) ou une vidéo. */
export type StoryMedia =
  | { kind: 'photo'; photo: PickedPhoto }
  | { kind: 'video'; uri: string; seconds: number | null };

/**
 * Story : prendre une photo, filmer une vidéo, ou choisir l'une ou l'autre dans la galerie.
 * Retourne null si la personne annule.
 */
export async function takeStoryMedia(source: 'photo' | 'video' | 'library'): Promise<StoryMedia | null> {
  if (source === 'library' && Platform.OS === 'web') {
    const f = await pickFileWeb('image/*,video/*');
    if (!f) return null;
    if (isVideoFile(f)) {
      if (f.size > STORY_MAX_BYTES) throw new FriendlyError('Cette vidéo est trop lourde (plus de 100 Mo). Choisissez une vidéo plus courte.');
      const uri = URL.createObjectURL(f);
      // Durée mesurée ici (4 s au plus : si le navigateur ne répond pas, on continue sans).
      const d = await Promise.race([videoDuration(uri), new Promise<null>((ok) => setTimeout(() => ok(null), 4000))]);
      const seconds = d ? Math.round(d) : null;
      if (seconds && seconds > STORY_MAX_SECONDS) {
        throw new FriendlyError(`Cette vidéo dure ${seconds} secondes. Une story vidéo dure ${STORY_MAX_SECONDS} secondes au maximum : choisissez une vidéo plus courte.`);
      }
      return { kind: 'video', uri, seconds };
    }
    const raw = await normalize({ uri: URL.createObjectURL(f), width: 0, height: 0 });
    return { kind: 'photo', photo: await autoCrop(raw, 'story') };
  }
  const camera = source !== 'library';
  if (camera && Platform.OS !== 'web') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new FriendlyError("Vitrine a besoin de l'appareil photo. Vous pouvez aussi choisir dans la galerie.");
  }
  const opts: ImagePicker.ImagePickerOptions = {
    mediaTypes: source === 'photo' ? ['images'] : source === 'video' ? ['videos'] : ['images', 'videos'],
    quality: 0.9,
    videoMaxDuration: STORY_MAX_SECONDS,
    // Vidéo : toujours la meilleure qualité, sans recompression (iPhone).
    videoQuality: ImagePicker.UIImagePickerControllerQualityType.High,
    videoExportPreset: ImagePicker.VideoExportPreset.Passthrough,
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
  };
  let res: ImagePicker.ImagePickerResult;
  try {
    res = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  } catch {
    throw new FriendlyError("La photo ou la vidéo n'a pas pu être ouverte. Réessayez.");
  }
  const a = res.canceled ? null : res.assets?.[0];
  if (!a) return null;
  if (a.type === 'video' || a.mimeType?.startsWith('video/')) {
    // La durée est donnée en millisecondes sur téléphone, en secondes dans le navigateur.
    const seconds = a.duration ? Math.round(Platform.OS === 'web' ? a.duration : a.duration / 1000) : null;
    if (seconds && seconds > STORY_MAX_SECONDS) {
      throw new FriendlyError(`Cette vidéo dure ${seconds} secondes. Une story vidéo dure ${STORY_MAX_SECONDS} secondes au maximum : choisissez une vidéo plus courte.`);
    }
    if (a.fileSize && a.fileSize > STORY_MAX_BYTES) throw new FriendlyError('Cette vidéo est trop lourde (plus de 100 Mo). Choisissez une vidéo plus courte.');
    return { kind: 'video', uri: a.uri, seconds };
  }
  return { kind: 'photo', photo: await autoCrop(await normalize(a), 'story') };
}

/**
 * Bouton « Vidéo » : filmer (appli installée) ou choisir une vidéo dans la galerie.
 * La version web filme avec sa propre caméra (WebVideoRecorder) ; elle utilise ceci pour la galerie.
 * Retourne null si la personne annule.
 */
/**
 * Une ou plusieurs vidéos de la galerie (version web : plusieurs d'un coup, elles seront montées ensemble).
 * Sur l'appli installée, une seule vidéo.
 */
export async function takeVideos(): Promise<Extract<Captured, { kind: 'video' }>[]> {
  if (Platform.OS !== 'web') {
    const v = await takeVideo('library');
    return v ? [v] : [];
  }
  const files = (await pickFilesWeb('video/*')).filter(isVideoFile).slice(0, 10);
  if (files.some((f) => f.size > 300 * 1024 * 1024)) throw new FriendlyError('Une de ces vidéos est trop lourde. Choisissez des vidéos plus courtes.');
  if (files.length < 2) return files.map((f) => ({ kind: 'video' as const, uri: URL.createObjectURL(f), seconds: null }));
  const videos = await Promise.all(files.map(async (f) => {
    const uri = URL.createObjectURL(f);
    const d = await Promise.race([videoDuration(uri), new Promise<null>((ok) => setTimeout(() => ok(null), 4000))]);
    return { kind: 'video' as const, uri, seconds: d };
  }));
  const total = videos.reduce((s, v) => s + (v.seconds ?? 0), 0);
  if (total > REEL_MAX_SECONDS + 0.5) {
    throw new FriendlyError(`Ces vidéos durent ${Math.round(total)} secondes en tout. Un Reel dure ${REEL_MAX_SECONDS} secondes au maximum : choisissez-en moins, ou des plus courtes.`);
  }
  return videos;
}

export async function takeVideo(source: 'camera' | 'library', maxSeconds = REEL_MAX_SECONDS): Promise<Extract<Captured, { kind: 'video' }> | null> {
  if (source === 'library' && Platform.OS === 'web') {
    const f = await pickFileWeb('video/*');
    if (!f) return null;
    if (f.size > 300 * 1024 * 1024) throw new FriendlyError('Cette vidéo est trop lourde. Choisissez une vidéo plus courte.');
    return { kind: 'video', uri: URL.createObjectURL(f), seconds: null };
  }
  if (source === 'camera' && Platform.OS !== 'web') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new FriendlyError("Vitrine a besoin de l'appareil photo. Vous pouvez aussi choisir une vidéo dans la galerie.");
  }
  const opts: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['videos'],
    videoMaxDuration: maxSeconds,
    videoQuality: ImagePicker.UIImagePickerControllerQualityType.High,
    videoExportPreset: ImagePicker.VideoExportPreset.Passthrough,
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
  };
  let res: ImagePicker.ImagePickerResult;
  try {
    res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  } catch {
    throw new FriendlyError("La vidéo n'a pas pu être ouverte. Réessayez.");
  }
  const a = res.canceled ? null : res.assets?.[0];
  if (!a) return null;
  const seconds = a.duration ? Math.round(Platform.OS === 'web' ? a.duration : a.duration / 1000) : null;
  if (seconds && seconds > maxSeconds) {
    throw new FriendlyError(`Cette vidéo dure ${seconds} secondes. Choisissez une vidéo de ${maxSeconds} secondes au maximum.`);
  }
  if (a.fileSize && a.fileSize > 300 * 1024 * 1024) throw new FriendlyError('Cette vidéo est trop lourde. Choisissez une vidéo plus courte.');
  return { kind: 'video', uri: a.uri, seconds };
}
