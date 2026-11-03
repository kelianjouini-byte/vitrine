/** Prise de photo partagée par l'accueil et l'écran de création. */
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { FriendlyError } from './api';

export type PickedPhoto = { uri: string; base64: string | null };

/** Ouvre l'appareil photo (ou la galerie). Retourne null si la personne annule. */
export async function takePhoto(source: 'camera' | 'library'): Promise<PickedPhoto | null> {
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [4, 5], quality: 0.8, base64: true };
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
  if (res.canceled || !res.assets?.[0]) return null;
  return shrink(res.assets[0]);
}

/** Taille d'une photo Instagram : au-delà, l'envoi et l'IA sont plus lents pour rien. */
const MAX_WIDTH = 1080;

/**
 * Réduit la photo (souvent 4000 px et 4 Mo) à 1080 px de large avant l'envoi :
 * même rendu sur Instagram, mais un envoi et une réponse de l'IA beaucoup plus rapides.
 */
async function shrink(a: ImagePicker.ImagePickerAsset): Promise<PickedPhoto> {
  try {
    const ctx = ImageManipulator.manipulate(a.uri);
    if (!a.width || a.width > MAX_WIDTH) ctx.resize({ width: MAX_WIDTH });
    const img = await ctx.renderAsync();
    const out = await img.saveAsync({ compress: 0.75, format: SaveFormat.JPEG, base64: true });
    if (out.base64) return { uri: out.uri, base64: out.base64 };
  } catch {
    /* on garde la photo d'origine */
  }
  const b64 = a.base64 ?? (a.uri.startsWith('data:') ? a.uri.split(',')[1] : null);
  return { uri: a.uri, base64: b64 };
}
