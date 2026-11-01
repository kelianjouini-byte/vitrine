import AsyncStorage from '@react-native-async-storage/async-storage';

/** Petit stockage local tolérant aux erreurs (navigation privée, stockage bloqué...). */
export async function load<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(`vitrine:${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function save<T>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(`vitrine:${key}`, JSON.stringify(value));
  } catch {
    // Stockage indisponible : l'app continue de fonctionner pour la session en cours.
  }
}

export async function clearAll(): Promise<void> {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith('vitrine:'));
    await AsyncStorage.multiRemove(keys);
  } catch {
    /* rien */
  }
}
