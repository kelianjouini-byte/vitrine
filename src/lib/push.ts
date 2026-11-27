/**
 * « Le petit rappel du jour » sur la version internet (navigateur, ou appli ajoutée à l'écran d'accueil).
 * Le téléphone s'abonne une fois ; ensuite c'est le serveur (fonction daily-nudge) qui envoie
 * le rappel chaque jour d'ouverture, pendant les horaires, même quand Vitrine est fermée.
 */
import { Platform } from 'react-native';
import { pushPublicKey, removePushSubscription, savePushSubscription, sendTestPush, type PushSettings } from './api';
import { upcomingEvents, upcomingHolidays } from './events';
import { dayKey } from './planning';
import type { Business, NotificationPrefs } from './types';
import { DEFAULT_HOURS, defaultNudgeHour, pickNudge } from '../../supabase/functions/_shared/nudges';

export type PushState =
  /** Prêt : ce téléphone reçoit le rappel. */
  | 'on'
  /** Possible, pas encore activé sur ce téléphone. */
  | 'off'
  /** iPhone : il faut d'abord ajouter Vitrine à l'écran d'accueil. */
  | 'ios-install'
  /** Refusé dans les réglages du navigateur ou du téléphone. */
  | 'denied'
  /** Ce navigateur ne sait pas recevoir de notifications. */
  | 'unsupported';

const isWeb = Platform.OS === 'web' && typeof window !== 'undefined' && typeof navigator !== 'undefined';

function isIos(): boolean {
  if (!isWeb) return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  if (!isWeb) return false;
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** Dossier de l'appli (« /app/ ») : le service worker y vit et ne s'occupe que de lui. */
function appBase(): string {
  return window.location.pathname.replace(/[^/]*$/, '') || '/';
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!isWeb || !('serviceWorker' in navigator)) return null;
  const base = appBase();
  return (await navigator.serviceWorker.getRegistration(base)) ?? null;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await registration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

export async function pushState(): Promise<PushState> {
  if (!isWeb) return 'unsupported';
  const capable = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (!capable) return isIos() && !isStandalone() ? 'ios-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') return 'off';
  return (await currentSubscription()) ? 'on' : 'off';
}

/** Heures de la boutique (9 h - 19 h si le commerçant ne les a pas encore données). */
export function shopHours(b: Business): { openHour: number; closeHour: number } {
  const openHour = b.openHour ?? DEFAULT_HOURS.openHour;
  return { openHour, closeHour: Math.max(openHour + 1, b.closeHour ?? DEFAULT_HOURS.closeHour) };
}

export function nudgeHour(b: Business, prefs: NotificationPrefs): number {
  const { openHour, closeHour } = shopHours(b);
  const h = prefs.nudgeHour;
  return h !== undefined && h >= openHour && h < closeHour ? h : defaultNudgeHour(openHour, closeHour);
}

/** Ce que le serveur doit savoir : horaires, jours fermés (y compris fériés où la boutique ferme), prochaines fêtes. */
export function pushSettings(b: Business, prefs: NotificationPrefs, now = new Date()): PushSettings {
  const closedDates = upcomingHolidays(now, 3, b.postalCode).filter((h) => b.holidays?.[h.id]?.open === false).map((h) => dayKey(h.date));
  const occasions = upcomingEvents(b, now, 2, b.postalCode).slice(0, 8).map((e) => ({ name: e.name, date: dayKey(e.date) }));
  return {
    enabled: prefs.dailyNudge !== false,
    hour: nudgeHour(b, prefs),
    ...shopHours(b),
    closedDays: b.closedDays ?? [],
    closedDates,
    occasions,
  };
}

function keyBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const pad = b64url.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64url.length + 3) % 4);
  const bin = atob(pad);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Active le rappel sur ce téléphone. À appeler depuis un bouton (le navigateur exige un geste).
 * Retourne le nouvel état.
 */
export async function enablePush(b: Business, prefs: NotificationPrefs): Promise<PushState> {
  const state = await pushState();
  if (state === 'unsupported' || state === 'ios-install' || state === 'denied') return state;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  const base = appBase();
  const reg = (await navigator.serviceWorker.getRegistration(base)) ?? (await navigator.serviceWorker.register(`${base}push-sw.js`, { scope: base }));
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(await pushPublicKey()) });
  await savePushSubscription(sub.toJSON(), pushSettings(b, { ...prefs, dailyNudge: true }));
  return 'on';
}

/** Met à jour les réglages côté serveur (horaires, heure, oui/non). Sans effet si ce téléphone n'est pas abonné. */
export async function syncPush(b: Business, prefs: NotificationPrefs): Promise<void> {
  if (!isWeb || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const sub = await currentSubscription();
  if (sub) await savePushSubscription(sub.toJSON(), pushSettings(b, prefs));
}

/** Plus aucune notification sur ce téléphone (déconnexion, suppression du compte). */
export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await removePushSubscription(sub.endpoint).catch(() => {});
  await sub.unsubscribe().catch(() => false);
}

export async function testPush(): Promise<{ title: string; body: string } | null> {
  const sub = await currentSubscription();
  return sub ? sendTestPush(sub.endpoint) : null;
}

/**
 * Appui sur une notification : Vitrine s'ouvre sur « ?ouvrir=creer » (ou reçoit un message si elle était déjà ouverte).
 * fn est appelée une fois par appui.
 */
export function onPushOpen(fn: () => void): () => void {
  if (!isWeb) return () => {};
  const url = new URL(window.location.href);
  if (url.searchParams.get('ouvrir') === 'creer') {
    url.searchParams.delete('ouvrir');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    setTimeout(fn, 0);
  }
  if (!('serviceWorker' in navigator)) return () => {};
  const onMessage = (e: MessageEvent) => { if (e.data?.type === 'vitrine-open') fn(); };
  navigator.serviceWorker.addEventListener('message', onMessage);
  return () => navigator.serviceWorker.removeEventListener('message', onMessage);
}

/**
 * Version téléphone (appli installée) : les rappels des 7 prochains jours d'ouverture sont programmés
 * sur le téléphone lui-même. Celui d'aujourd'hui est sauté si un post a déjà été fait.
 */
export function localNudges(b: Business, prefs: NotificationPrefs, posts: { createdAt: string; publishedAt?: string | null; status: string }[], now = new Date(), days = 7): { date: Date; title: string; body: string }[] {
  if (prefs.dailyNudge === false) return [];
  const settings = pushSettings(b, prefs, now);
  const published = posts.filter((p) => p.status === 'published' || p.status === 'partially_published').map((p) => new Date(p.publishedAt ?? p.createdAt));
  const last = published.sort((x, y) => y.getTime() - x.getTime())[0];
  const today = dayKey(now);
  const postedToday = posts.some((p) => !['draft', 'failed', 'cancelled'].includes(p.status) && dayKey(new Date(p.createdAt)) === today);
  const out: { date: Date; title: string; body: string }[] = [];
  const used: string[] = [];
  for (let i = 0; i < days; i++) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, settings.hour, 0);
    const key = dayKey(date);
    const weekday = (date.getDay() + 6) % 7;
    if (date <= now || settings.closedDays.includes(weekday) || settings.closedDates.includes(key)) continue;
    if (i === 0 && postedToday) continue;
    const occ = settings.occasions.map((o) => ({ name: o.name, inDays: Math.round((new Date(`${o.date}T12:00:00`).getTime() - new Date(`${key}T12:00:00`).getTime()) / 86_400_000) }))
      .filter((o) => o.inDays >= 0 && o.inDays <= 10).sort((x, y) => x.inDays - y.inDays)[0] ?? null;
    const daysSincePost = last ? Math.round((new Date(`${key}T12:00:00`).getTime() - new Date(`${dayKey(last)}T12:00:00`).getTime()) / 86_400_000) : null;
    const n = pickNudge({
      firstName: b.ownerFirstName, businessName: b.businessName, businessType: b.businessType, city: b.city,
      daysSincePost, occasion: occ, weekday, seed: `local:${b.id ?? b.businessName}:${key}`, recent: used,
    });
    used.push(n.id);
    out.push({ date, title: n.title, body: n.body });
  }
  return out;
}
