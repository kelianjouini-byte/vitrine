import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { upcomingEvents, type CommercialEvent } from './events';
import type { Business, NotificationPrefs } from './types';

/** Les rappels de fêtes sont des notifications LOCALES programmées sur le téléphone :
 *  elles fonctionnent même sans serveur. Les notifications serveur (publication en ligne,
 *  compte à reconnecter) passeront par Expo Push en phase 2. */
export const notificationsSupported = Platform.OS !== 'web';

if (notificationsSupported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}

export async function askPermission(): Promise<boolean> {
  if (!notificationsSupported) return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

export function reminderText(e: CommercialEvent): { title: string; body: string } {
  return {
    title: `${e.emoji} ${e.name} approche !`,
    body: "C'est le moment idéal pour mettre votre boutique en avant. Envoyez une photo, Vitrine prépare votre publication.",
  };
}

/** Reprogramme tous les rappels selon les préférences. Retourne le nombre de rappels programmés. */
export async function scheduleReminders(b: Business, prefs: NotificationPrefs): Promise<number> {
  if (!notificationsSupported) return 0;
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!prefs.enabled) return 0;
  if (!(await askPermission())) return 0;
  const now = new Date();
  let count = 0;
  for (const e of upcomingEvents(b, now, 12, b.postalCode)) {
    const when = new Date(e.date.getFullYear(), e.date.getMonth(), e.date.getDate() - Math.max(prefs.daysBefore, 1), prefs.hour, 0);
    if (when <= now) continue;
    await Notifications.scheduleNotificationAsync({
      content: { ...reminderText(e), data: { eventId: e.id } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when },
    });
    count++;
  }
  return count;
}
