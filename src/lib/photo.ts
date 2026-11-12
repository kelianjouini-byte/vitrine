/** Prise de photo ou de vidéo, cadrage automatique et préparation avant l'envoi (accueil, idées, création, story). */
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { FriendlyError } from './api';
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
async function normalize(a: ImagePicker.ImagePickerAsset): Promise<RawPhoto> {
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
export async function takeVideo(source: 'camera' | 'library', maxSeconds = REEL_MAX_SECONDS): Promise<Extract<Captured, { kind: 'video' }> | null> {
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
