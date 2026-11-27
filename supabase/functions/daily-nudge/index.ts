// POST (appelée toutes les heures par pg_cron, en-tête x-cron-secret = app_secrets 'daily_nudge_cron') -> { sent, skipped, failed }
// « Le petit rappel du jour » : une notification différente chaque jour pour donner envie de publier.
// Seulement les jours d'ouverture, pendant les horaires de la boutique, à l'heure choisie (heure de Paris),
// une seule fois par jour, et rien si le commerçant a déjà publié aujourd'hui ou si son essai est terminé.
// ?dry=1 : dit seulement à qui ce serait envoyé, sans rien envoyer.
import { handler, HttpError, json } from '../_shared/http.ts';
import { admin } from '../_shared/db.ts';
import { nudgeDue, parisNow } from '../_shared/nudges.ts';
import { hasAccess, nudgeFor, postedToday, pushTo, vapidKeys } from '../_shared/pushServer.ts';

Deno.serve(handler(async (req) => {
  const db = admin();
  const { data: secret } = await db.from('app_secrets').select('value').eq('name', 'daily_nudge_cron').maybeSingle();
  if (!secret?.value || (req.headers.get('x-cron-secret') ?? '') !== secret.value) throw new HttpError(401, 'unauthorized', 'Accès refusé.');
  const dryRun = new URL(req.url).searchParams.get('dry') === '1';
  const now = new Date();
  const { day } = parisNow(now);

  const { data: subs, error } = await db.from('push_subscriptions').select('*').eq('enabled', true).limit(5000);
  if (error) throw error;
  const keys = await vapidKeys(db);
  let sent = 0, skipped = 0, failed = 0;
  const reasons: Record<string, number> = {};
  const skip = (why: string) => { skipped++; reasons[why] = (reasons[why] ?? 0) + 1; };

  for (const sub of subs ?? []) {
    try {
      // Vérifications rapides d'abord (heure, jour fermé), la base ensuite.
      const hours = { openHour: sub.open_hour, closeHour: sub.close_hour, hour: sub.hour, closedDays: sub.closed_days ?? [], closedDates: sub.closed_dates ?? [] };
      const early = nudgeDue(hours, now, { sentToday: false, postedToday: false });
      if (early !== true) { skip(early); continue; }
      const { data: already } = await db.from('daily_nudges').select('day').eq('subscription_id', sub.id).eq('day', day).maybeSingle();
      if (already) { skip('already_sent'); continue; }
      const { data: business } = await db.from('businesses').select('*').eq('id', sub.business_id).maybeSingle();
      if (!business) { skip('no_business'); continue; }
      if (await postedToday(db, business.id, now)) { skip('already_posted'); continue; }
      if (!(await hasAccess(db, business, now))) { skip('trial_over'); continue; }

      const nudge = await nudgeFor(db, sub, business, now);
      if (dryRun) { sent++; continue; }
      // Réserve le jour d'abord : si la ligne existe déjà, le rappel est déjà parti (jamais deux).
      const { error: claim } = await db.from('daily_nudges').insert({ subscription_id: sub.id, day, text_id: nudge.id });
      if (claim) { skip('already_sent'); continue; }
      const result = await pushTo(db, keys, sub, nudge);
      if (result === 'ok') sent++;
      else {
        failed++;
        if (result === 'failed') await db.from('daily_nudges').update({ status: 'failed' }).eq('subscription_id', sub.id).eq('day', day);
      }
    } catch (e) {
      failed++;
      console.error('[vitrine] rappel du jour', e instanceof Error ? e.message : String(e));
    }
  }
  return json({ sent, skipped, failed, reasons, dry: dryRun });
}));
