/** Prise de photo, recadrage et préparation avant l'envoi (accueil, idées, création). */
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { FriendlyError } from './api';
import { cropRect, FORMATS, type Framing, type PhotoFormat } from './crop';
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
  throw new FriendlyError("La photo n'a pas pu être recadrée. Réessayez ou choisissez-en une autre.");
}
