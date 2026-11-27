import { Platform } from 'react-native';
import { trialReminders } from './billing';
import * as Notifications from 'expo-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { isStoreApp } from './native';
import { upcomingEvents, upcomingHolidays, type CommercialEvent } from './events';
import type { Business, NotificationPrefs, Post } from './types';
import { planReminders, type PlanChoices } from './planning';
import { monthKey, reportReminderDates, reportReminderText } from './report';

/** Les rappels (fêtes, planning, idées du lundi, bilan du mois, fin de l'essai) sont des notifications
 *  LOCALES programmées sur le téléphone : elles fonctionnent même sans serveur.
 *  - Appli des stores (iPhone / Android, Capacitor) : extension « local-notifications ».
 *  - Appli Expo native : expo-notifications.
 *  - Site internet : pas de rappels (les navigateurs ne savent pas les programmer à l'avance). */
const expoNative = Platform.OS !== 'web';
export const notificationsSupported = expoNative || isStoreApp;

if (expoNative) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}

export async function askPermission(): Promise<boolean> {
  if (isStoreApp) {
    const current = await LocalNotifications.checkPermissions();
    if (current.display === 'granted') return true;
    return (await LocalNotifications.requestPermissions()).display === 'granted';
  }
  if (!expoNative) return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

/** Un rappel à programmer : à une date précise, ou chaque semaine (weekday : 1 = dimanche, 2 = lundi…). */
type Reminder = { title: string; body: string; data: Record<string, unknown> } & ({ date: Date } | { weekly: { weekday: number; hour: number } });

/** iOS garde au plus 64 rappels programmés : on garde les premiers de la liste (les plus importants). */
const MAX_REMINDERS = 60;

async function cancelAll(): Promise<void> {
  if (isStoreApp) {
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
    return;
  }
  await Notifications.cancelAllScheduledNotificationsAsync();
}

async function scheduleAll(list: Reminder[]): Promise<void> {
  const kept = list.slice(0, MAX_REMINDERS);
  if (isStoreApp) {
    if (!kept.length) return;
    await LocalNotifications.schedule({
      notifications: kept.map((r, i) => ({
        id: i + 1,
        title: r.title,
        body: r.body,
        extra: r.data,
        schedule: 'date' in r
          ? { at: r.date, allowWhileIdle: true }
          : { on: { weekday: r.weekly.weekday, hour: r.weekly.hour, minute: 0 }, allowWhileIdle: true },
      })),
    });
    return;
  }
  for (const r of kept) {
    await Notifications.scheduleNotificationAsync({
      content: { title: r.title, body: r.body, data: r.data },
      trigger: 'date' in r
        ? { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.date }
        : { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: r.weekly.weekday, hour: r.weekly.hour, minute: 0 },
    });
  }
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
  if (isStoreApp) {
    const sub = LocalNotifications.addListener('localNotificationActionPerformed', (a) => fn(a.notification.extra as Record<string, unknown> | undefined));
    return () => { sub.then((h) => h.remove()).catch(() => {}); };
  }
  if (!expoNative) return () => {};
  const read = (r: Notifications.NotificationResponse) => fn(r.notification.request.content.data as Record<string, unknown> | undefined);
  // App ouverte par la notification alors qu'elle était fermée.
  Notifications.getLastNotificationResponseAsync().then((r) => r && read(r)).catch(() => {});
  const sub = Notifications.addNotificationResponseReceivedListener(read);
  return () => sub.remove();
}

/** Reprogramme tous les rappels selon les préférences. Retourne le nombre de rappels programmés. */
export async function scheduleReminders(b: Business, prefs: NotificationPrefs, plan?: { posts: Post[]; choices: PlanChoices; trialEndsAt?: string | null }): Promise<number> {
  if (!notificationsSupported) return 0;
  await cancelAll();
  if (!prefs.enabled) return 0;
  if (!(await askPermission())) return 0;
  const list = buildReminders(b, prefs, plan);
  await scheduleAll(list);
  return Math.min(list.length, MAX_REMINDERS);
}

/** Tous les rappels à programmer, du plus important au moins important. */
function buildReminders(b: Business, prefs: NotificationPrefs, plan?: { posts: Post[]; choices: PlanChoices; trialEndsAt?: string | null }, now = new Date()): Reminder[] {
  const list: Reminder[] = [];
  // Tout en premier : la fin de l'essai gratuit (le commerçant ne doit pas être surpris par le blocage).
  if (plan?.trialEndsAt) {
    for (const r of trialReminders(plan.trialEndsAt, prefs.hour, now, isStoreApp)) {
      list.push({ title: r.title, body: r.body, data: { route: 'offers' }, date: r.date });
    }
  }
  // Ensuite : les rappels du planning.
  if (plan && prefs.planReminders !== false) {
    for (const r of planReminders(b, plan.posts, plan.choices, upcomingEvents(b, now, 2, b.postalCode), prefs.hour, now, 14, upcomingHolidays(now, 12, b.postalCode))) {
      list.push({ title: r.title, body: r.body, data: { route: 'planDay', day: r.day }, date: r.date });
    }
  }
  if (prefs.weeklyIdeas !== false) {
    // Chaque lundi (weekday 2 : 1 = dimanche), à l'heure choisie.
    list.push({ ...WEEKLY_IDEAS_TEXT, data: { route: 'ideas' }, weekly: { weekday: 2, hour: prefs.hour } });
  }
  // Les fêtes du métier, quelques jours avant.
  for (const e of upcomingEvents(b, now, 12, b.postalCode)) {
    const when = new Date(e.date.getFullYear(), e.date.getMonth(), e.date.getDate() - Math.max(prefs.daysBefore, 1), prefs.hour, 0);
    if (when <= now) continue;
    list.push({ ...reminderText(e), data: { eventId: e.id }, date: when });
  }
  if (prefs.monthlyReport !== false) {
    // Le 1er de chaque mois : « Votre bilan d'octobre est prêt » (une notification par mois, un an à l'avance).
    for (const r of reportReminderDates(now, prefs.hour, 12)) {
      list.push({ ...reportReminderText(r.month), data: { route: 'report', month: monthKey(r.month) }, date: r.date });
    }
  }
  // Les rappels à date sont rangés par ordre d'importance ci-dessus ; s'il faut en couper, ce sont les plus lointains.
  return list;
}
