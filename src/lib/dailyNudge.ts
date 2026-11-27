/**
 * « Le petit rappel du jour » : une notification chaque jour où la boutique est ouverte, à l'heure choisie
 * (10 h par défaut), avec un texte différent. Rappels LOCAUX programmés sur le téléphone par l'application
 * (App Store / Google Play) : pas besoin de serveur ni de compte Firebase. Reprogrammés à chaque ouverture
 * de l'appli et à chaque post : celui du jour saute dès qu'un post est fait.
 */
import { upcomingEvents, upcomingHolidays } from './events';
import { dayKey } from './planning';
import type { Business, NotificationPrefs } from './types';
import { DEFAULT_NUDGE_HOUR, NUDGE_HOURS, pickNudge } from '../../supabase/functions/_shared/nudges';

/** Heure du rappel : celle choisie dans Réglages, 10 h sinon. */
export function nudgeHour(prefs: NotificationPrefs): number {
  const h = prefs.nudgeHour;
  return h !== undefined && (NUDGE_HOURS as readonly number[]).includes(h) ? h : DEFAULT_NUDGE_HOUR;
}

const noon = (key: string) => new Date(`${key}T12:00:00`).getTime();

/** Les rappels des prochains jours d'ouverture (14 par défaut), du plus proche au plus lointain. */
export function localNudges(b: Business, prefs: NotificationPrefs, posts: { createdAt: string; publishedAt?: string | null; status: string }[], now = new Date(), days = 14): { date: Date; title: string; body: string }[] {
  if (prefs.dailyNudge === false) return [];
  const hour = nudgeHour(prefs);
  const closedDays = b.closedDays ?? [];
  const closedDates = upcomingHolidays(now, 1, b.postalCode).filter((h) => b.holidays?.[h.id]?.open === false).map((h) => dayKey(h.date));
  const occasions = upcomingEvents(b, now, 1, b.postalCode).map((e) => ({ name: e.name, key: dayKey(e.date) }));
  const published = posts.filter((p) => p.status === 'published' || p.status === 'partially_published').map((p) => new Date(p.publishedAt ?? p.createdAt));
  const last = published.sort((x, y) => y.getTime() - x.getTime())[0];
  const today = dayKey(now);
  const postedToday = posts.some((p) => !['draft', 'failed', 'cancelled'].includes(p.status) && dayKey(new Date(p.createdAt)) === today);
  const out: { date: Date; title: string; body: string }[] = [];
  const used: string[] = [];
  for (let i = 0; i < days; i++) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, hour, 0);
    const key = dayKey(date);
    const weekday = (date.getDay() + 6) % 7;
    if (date <= now || closedDays.includes(weekday) || closedDates.includes(key)) continue;
    if (i === 0 && postedToday) continue;
    const occasion = occasions.map((o) => ({ name: o.name, inDays: Math.round((noon(o.key) - noon(key)) / 86_400_000) }))
      .filter((o) => o.inDays >= 0 && o.inDays <= 10).sort((x, y) => x.inDays - y.inDays)[0] ?? null;
    const daysSincePost = last ? Math.round((noon(key) - noon(dayKey(last))) / 86_400_000) : null;
    const n = pickNudge({
      firstName: b.ownerFirstName, businessName: b.businessName, businessType: b.businessType, city: b.city,
      daysSincePost, occasion, weekday, seed: `${b.id ?? b.businessName}:${key}`, recent: used,
    });
    used.push(n.id);
    out.push({ date, title: n.title, body: n.body });
  }
  return out;
}
