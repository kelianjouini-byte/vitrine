import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { upcomingEvents, type CommercialEvent } from './events';
import type { Business, NotificationPrefs } from './types';
import { monthKey, reportReminderDates, reportReminderText } from './report';

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

export const WEEKLY_IDEAS_TEXT = {
  title: '💡 3 idées pour votre semaine',
  body: 'Vous ne savez pas quoi poster ? Vitrine vous propose 3 idées de photos pour votre boutique.',
};

/** Appelle fn quand le commerçant touche une notification. Retourne de quoi arrêter l'écoute. */
export function onNotificationTap(fn: (data: Record<string, unknown> | undefined) => void): () => void {
  if (!notificationsSupported) return () => {};
  const read = (r: Notifications.NotificationResponse) => fn(r.notification.request.content.data as Record<string, unknown> | undefined);
  // App ouverte par la notification alors qu'elle était fermée.
  Notifications.getLastNotificationResponseAsync().then((r) => r && read(r)).catch(() => {});
  const sub = Notifications.addNotificationResponseReceivedListener(read);
  return () => sub.remove();
}

/** Reprogramme tous les rappels selon les préférences. Retourne le nombre de rappels programmés. */
export async function scheduleReminders(b: Business, prefs: NotificationPrefs): Promise<number> {
  if (!notificationsSupported) return 0;
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!prefs.enabled) return 0;
  if (!(await askPermission())) return 0;
  const now = new Date();
  let count = 0;
  if (prefs.weeklyIdeas !== false) {
    // Chaque lundi (weekday 2 : 1 = dimanche pour Expo), à l'heure choisie.
    await Notifications.scheduleNotificationAsync({
      content: { ...WEEKLY_IDEAS_TEXT, data: { route: 'ideas' } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: 2, hour: prefs.hour, minute: 0 },
    });
    count++;
  }
  if (prefs.monthlyReport !== false) {
    // Le 1er de chaque mois : « Votre bilan d'octobre est prêt ». Programmé un an à l'avance
    // (le nom du mois change chaque fois : une notification par mois).
    for (const r of reportReminderDates(now, prefs.hour, 12)) {
      await Notifications.scheduleNotificationAsync({
        content: { ...reportReminderText(r.month), data: { route: 'report', month: monthKey(r.month) } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.date },
      });
      count++;
    }
  }
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
