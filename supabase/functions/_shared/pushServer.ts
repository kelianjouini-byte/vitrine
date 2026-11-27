// Côté serveur des notifications : clés VAPID gardées dans la base, choix et envoi du rappel du jour.
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { generateVapidKeys, sendWebPush, type VapidKeys } from './webpush.ts';
import { parisDayStart, parisNow, pickNudge, type Nudge } from './nudges.ts';
import { accessState } from './billing.ts';

export const PUSH_SUBJECT = 'mailto:contact@vitrineappli.fr';
/** Où mène un appui sur la notification : l'accueil, choix Photo / Vidéo ouvert. */
export const OPEN_URL = '/app/?ouvrir=creer';

// deno-lint-ignore no-explicit-any
type Row = any;

/** Clés VAPID du serveur : créées automatiquement au premier usage, puis toujours les mêmes. */
export async function vapidKeys(db: SupabaseClient): Promise<VapidKeys> {
  const read = async () => {
    const { data } = await db.from('app_secrets').select('value').eq('name', 'vapid_keys').maybeSingle();
    return data?.value ? JSON.parse(data.value) as VapidKeys : null;
  };
  const existing = await read();
  if (existing) return existing;
  const fresh = await generateVapidKeys();
  // Si deux appels arrivent en même temps, le premier gagne : on relit ensuite.
  await db.from('app_secrets').insert({ name: 'vapid_keys', value: JSON.stringify(fresh) });
  return (await read()) ?? fresh;
}

/** Prépare le texte du jour pour un abonnement (boutique, dernier post, prochaine occasion, textes récents). */
export async function nudgeFor(db: SupabaseClient, sub: Row, business: Row, now: Date): Promise<Nudge> {
  const p = parisNow(now);
  const { data: last } = await db.from('posts').select('published_at')
    .eq('business_id', business.id).in('status', ['published', 'partially_published']).not('published_at', 'is', null)
    .order('published_at', { ascending: false }).limit(1).maybeSingle();
  const today = new Date(`${p.day}T12:00:00Z`).getTime();
  const daysSincePost = last?.published_at ? Math.max(0, Math.round((today - new Date(String(last.published_at).slice(0, 10) + 'T12:00:00Z').getTime()) / 86_400_000)) : null;

  // Prochaine occasion (dans les 10 jours) parmi celles envoyées par l'appli.
  const occasions = (Array.isArray(sub.occasions) ? sub.occasions : []) as { name?: string; date?: string }[];
  const occasion = occasions
    .filter((o) => o.name && /^\d{4}-\d{2}-\d{2}$/.test(o.date ?? ''))
    .map((o) => ({ name: String(o.name).slice(0, 50), inDays: Math.round((new Date(`${o.date}T12:00:00Z`).getTime() - today) / 86_400_000) }))
    .filter((o) => o.inDays >= 0 && o.inDays <= 10)
    .sort((a, b) => a.inDays - b.inDays)[0] ?? null;

  const { data: recent } = await db.from('daily_nudges').select('text_id').eq('subscription_id', sub.id).order('day', { ascending: false }).limit(25);
  return pickNudge({
    firstName: business.owner_first_name, businessName: business.business_name, businessType: business.business_type, city: business.city,
    daysSincePost, occasion, weekday: p.weekday, seed: `${sub.id}:${p.day}`, recent: (recent ?? []).map((r) => r.text_id as string),
  });
}

/** A-t-on déjà publié aujourd'hui (heure de Paris) ? Un post préparé ou envoyé compte aussi. */
export async function postedToday(db: SupabaseClient, businessId: string, now: Date): Promise<boolean> {
  const start = parisDayStart(now).toISOString();
  const { count } = await db.from('posts').select('id', { count: 'exact', head: true })
    .eq('business_id', businessId).not('status', 'in', '(draft,failed,cancelled)')
    .or(`created_at.gte.${start},published_at.gte.${start}`);
  return (count ?? 0) > 0;
}

/** L'appli est-elle ouverte pour cette boutique (essai en cours, abonnement payé ou offert) ? */
export async function hasAccess(db: SupabaseClient, business: Row, now: Date): Promise<boolean> {
  let company = business;
  if (business.main_business_id) {
    const { data } = await db.from('businesses').select('id, created_at').eq('id', business.main_business_id).maybeSingle();
    if (data) company = data;
  }
  const { data: sub } = await db.from('subscriptions').select('status, stripe_subscription_id').eq('business_id', company.id).maybeSingle();
  return accessState(company.created_at, sub, now) !== 'expired';
}

/** Envoie une notification à un abonnement ; le supprime s'il n'existe plus chez le navigateur. */
export async function pushTo(db: SupabaseClient, keys: VapidKeys, sub: Row, nudge: Nudge): Promise<'ok' | 'gone' | 'failed'> {
  const { result, status } = await sendWebPush(
    { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
    { title: nudge.title, body: nudge.body, url: OPEN_URL, tag: 'vitrine-rappel' },
    keys,
    // Valable jusqu'à 4 h : un téléphone éteint toute la journée ne reçoit pas un vieux rappel le soir.
    { subject: PUSH_SUBJECT, ttlSeconds: 4 * 3600, topic: 'rappel-du-jour' },
  );
  if (result === 'gone') await db.from('push_subscriptions').delete().eq('id', sub.id);
  if (result === 'failed') console.error('[vitrine] notification refusée', status);
  return result;
}
