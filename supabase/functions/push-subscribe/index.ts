// POST { action: 'key' }                         -> { publicKey }  (clé publique VAPID pour s'abonner)
// POST { action: 'save', subscription, settings } -> { ok }        (ce téléphone + heure du rappel + jours fermés)
// POST { action: 'remove', endpoint }             -> { ok }        (plus de notifications sur ce téléphone)
// POST { action: 'test', endpoint }               -> { ok, title, body } (envoie tout de suite un exemple)
// « Le petit rappel du jour » : voir daily-nudge pour l'envoi quotidien.
import { handler, HttpError, json } from '../_shared/http.ts';
import { requireMerchant } from '../_shared/db.ts';
import { isPushEndpoint } from '../_shared/webpush.ts';
import { nudgeFor, pushTo, vapidKeys } from '../_shared/pushServer.ts';
import { DEFAULT_NUDGE_HOUR } from '../_shared/nudges.ts';

const hourOf = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};

Deno.serve(handler(async (req) => {
  const { db, userId, business } = await requireMerchant(req);
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? '');

  if (action === 'key') return json({ publicKey: (await vapidKeys(db)).publicKey });

  if (action === 'save') {
    const s = body.subscription ?? {};
    const endpoint = String(s.endpoint ?? '');
    const p256dh = String(s.keys?.p256dh ?? '');
    const auth = String(s.keys?.auth ?? '');
    if (!isPushEndpoint(endpoint) || endpoint.length > 1000) throw new HttpError(400, 'bad_endpoint', 'Ce navigateur ne peut pas recevoir de notifications.');
    if (!/^[A-Za-z0-9_-]{80,100}$/.test(p256dh) || !/^[A-Za-z0-9_-]{16,40}$/.test(auth)) throw new HttpError(400, 'bad_keys', 'Abonnement invalide.');
    const st = body.settings ?? {};
    const days = (Array.isArray(st.closedDays) ? st.closedDays : []).map(Number).filter((d: number) => Number.isInteger(d) && d >= 0 && d <= 6);
    const dates = (Array.isArray(st.closedDates) ? st.closedDates : []).map(String).filter((d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d)).slice(0, 30);
    const occasions = (Array.isArray(st.occasions) ? st.occasions : []).slice(0, 12)
      .map((o: Record<string, unknown>) => ({ name: String(o.name ?? '').slice(0, 50), date: String(o.date ?? '').slice(0, 10) }))
      .filter((o: { name: string; date: string }) => o.name && /^\d{4}-\d{2}-\d{2}$/.test(o.date));
    const row = {
      user_id: userId, business_id: business.id, kind: 'web', endpoint, p256dh, auth,
      enabled: st.enabled !== false,
      hour: hourOf(st.hour, 6, 21, DEFAULT_NUDGE_HOUR),
      closed_days: [...new Set(days)], closed_dates: dates, occasions,
      updated_at: new Date().toISOString(),
    };
    const { error } = await db.from('push_subscriptions').upsert(row, { onConflict: 'endpoint' });
    if (error) throw error;
    return json({ ok: true });
  }

  const endpoint = String(body.endpoint ?? '');
  if (action === 'remove') {
    await db.from('push_subscriptions').delete().eq('endpoint', endpoint).eq('user_id', userId);
    return json({ ok: true });
  }

  if (action === 'test') {
    const { data: sub } = await db.from('push_subscriptions').select('*').eq('endpoint', endpoint).eq('user_id', userId).maybeSingle();
    if (!sub) throw new HttpError(404, 'no_subscription', 'Les notifications ne sont pas activées sur ce téléphone.');
    // L'essai montre le texte du jour ; il ne compte pas comme le rappel du jour.
    const nudge = await nudgeFor(db, sub, business, new Date());
    const result = await pushTo(db, await vapidKeys(db), sub, nudge);
    if (result !== 'ok') throw new HttpError(502, 'push_failed', 'La notification n\'est pas partie. Réessayez dans un instant.');
    return json({ ok: true, title: nudge.title, body: nudge.body });
  }

  throw new HttpError(400, 'bad_action', 'Action inconnue.');
}));
