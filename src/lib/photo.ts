/** Prise de photo partagée par l'accueil et l'écran de création. */
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
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
  const a = res.assets[0];
  return { uri: a.uri, base64: a.base64 ?? (a.uri.startsWith('data:') ? a.uri.split(',')[1] : null) };
}
