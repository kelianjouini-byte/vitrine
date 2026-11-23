// E-mails de fin d'essai gratuit, avec les offres et des liens de paiement directs.
// Les applis App Store / Google Play ne montrent ni prix ni paiement : c'est cet e-mail qui le fait.
//  - POST {action:'resend'}            (appli, patron connecté) : renvoie l'e-mail tout de suite (3 fois par heure au plus)
//  - POST {action:'status'}            (appli) : l'envoi d'e-mails est-il branché ? à quelle adresse ?
//  - POST {action:'daily'} + en-tête x-cron-secret : tournée du jour (rappel 3 jours avant la fin, puis à la fin)
//  - GET  ?t=<lien signé>              (bouton de l'e-mail) : crée la page de paiement Stripe et y envoie le commerçant
// Déployer avec verify_jwt = false (les boutons de l'e-mail n'ont pas de jeton de connexion ; tout est vérifié ici).
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { env, handler, HttpError, json } from '../_shared/http.ts';
import { admin, rateLimit, requireMerchant, requirePatron } from '../_shared/db.ts';
import { accessState, isPlanId, trialEndsAt, TRIAL_DAYS, type PlanId } from '../_shared/billing.ts';
import { hmac } from '../_shared/crypto.ts';
import { createCheckout, founderFor } from '../_shared/checkout.ts';
import { stripeConfigured } from '../_shared/stripe.ts';
import { dueTrialEmail, trialEmailHtml, trialEmailSubject, trialEmailText, type EmailOffer, type TrialEmailKind } from '../_shared/trialEmail.ts';

// deno-lint-ignore no-explicit-any
type Row = any;

const SITE = () => (env('PUBLIC_SITE_URL') ?? 'https://vitrineappli.fr').replace(/\/$/, '');
/** Page « Merci » après le paiement (ou message si le lien ne marche plus). */
const thanks = (state: string) => `${SITE()}/app/merci/?etat=${state}`;
const LINK_DAYS = 30;

function mailReady(): boolean {
  return Boolean(env('BREVO_API_KEY')) && stripeConfigured();
}

/** Lien signé « telle boutique, telle offre », valable 30 jours. Signé avec la clé serveur (jamais connue du client). */
async function signedLink(businessId: string, plan: PlanId): Promise<string> {
  const payload = btoa(JSON.stringify({ b: businessId, p: plan, e: Date.now() + LINK_DAYS * 86_400_000 }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const sig = await hmac(`trial-link:${payload}`, env('SUPABASE_SERVICE_ROLE_KEY')!);
  return `${env('SUPABASE_URL')}/functions/v1/trial-emails?t=${payload}.${sig}`;
}

async function readLink(t: string): Promise<{ b: string; p: PlanId } | null> {
  const [payload, sig] = t.split('.');
  if (!payload || !sig) return null;
  if (sig !== await hmac(`trial-link:${payload}`, env('SUPABASE_SERVICE_ROLE_KEY')!)) return null;
  try {
    const data = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    if (typeof data.b !== 'string' || !isPlanId(data.p) || typeof data.e !== 'number') return null;
    return data.e > Date.now() ? { b: data.b, p: data.p } : null;
  } catch {
    return null;
  }
}

/** E-mail du créateur du compte (celui qui paie). */
async function ownerEmail(db: SupabaseClient, business: Row): Promise<string | null> {
  const { data } = await db.auth.admin.getUserById(business.owner_id);
  const u = data?.user;
  return u && !u.is_anonymous && u.email ? u.email : null;
}

/** Les offres de l'e-mail : l'offre fondateur (orange, très rare) s'il reste des places, puis Mensuel et Annuel. */
async function emailOffers(db: SupabaseClient, business: Row, sub: Row | null): Promise<EmailOffer[]> {
  const { data: plans } = await db.from('plans').select('id, name, monthly_price_cents, active').in('id', ['founder', 'monthly', 'annual']);
  const by = (id: string) => (plans ?? []).find((p) => p.id === id && p.active);
  const offers: EmailOffer[] = [];
  const founder = await founderFor(db, sub);
  const f = by('founder');
  if (f && founder?.eligible) {
    // Compteur réel des places restantes (jamais de fausse rareté).
    const rare = founder.left === 1 ? `Très rare : dernière place sur ${founder.places}` : `Très rare : plus que ${founder.left} places sur ${founder.places}`;
    offers.push({ name: 'Offre fondateur', priceCents: f.monthly_price_cents, detail: `Sans engagement, réservée aux ${founder.places} premières boutiques. Ce prix reste le vôtre tant que vous restez abonné.`, url: await signedLink(business.id, 'founder'), rare });
  }
  const m = by('monthly');
  if (m) offers.push({ name: 'Mensuel', priceCents: m.monthly_price_cents, detail: 'Sans engagement, arrêtable à tout moment.', url: await signedLink(business.id, 'monthly') });
  const a = by('annual');
  if (a) offers.push({ name: 'Annuel', priceCents: a.monthly_price_cents, detail: 'Engagement 1 an, payé chaque mois.', url: await signedLink(business.id, 'annual') });
  return offers;
}

async function sendMail(to: string, subject: string, html: string, text: string) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env('BREVO_API_KEY')!, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: 'Vitrine', email: env('MAIL_FROM') ?? 'contact@vitrineappli.fr' },
      replyTo: { email: env('MAIL_REPLY_TO') ?? env('MAIL_FROM') ?? 'contact@vitrineappli.fr' },
      to: [{ email: to }],
      subject, htmlContent: html, textContent: text,
      tags: ['fin-essai'],
    }),
  });
  if (!res.ok) {
    console.error('[vitrine] Brevo', res.status, (await res.text()).slice(0, 300));
    throw new HttpError(502, 'mail_failed', "L'e-mail n'a pas pu partir. Réessayez dans un instant.");
  }
}

/** Envoie l'e-mail de fin d'essai d'une entreprise. Renvoie l'adresse utilisée. */
async function sendTrialEmail(db: SupabaseClient, business: Row, kind: TrialEmailKind): Promise<string> {
  const email = await ownerEmail(db, business);
  if (!email) throw new HttpError(400, 'no_email', "Ce compte n'a pas d'adresse e-mail.");
  const { data: sub } = await db.from('subscriptions').select('*').eq('business_id', business.id).maybeSingle();
  const offers = await emailOffers(db, business, sub);
  if (!offers.length) throw new HttpError(503, 'no_offer', 'Aucune offre disponible pour le moment.');
  const input = { kind, shopName: business.business_name ?? 'votre boutique', firstName: business.owner_first_name, trialEnd: trialEndsAt(business.created_at), offers };
  await sendMail(email, trialEmailSubject(input), trialEmailHtml(input), trialEmailText(input));
  await db.from('trial_emails').insert({ business_id: business.id, kind });
  return email;
}

/** Bouton de l'e-mail : page de paiement Stripe de l'offre choisie. */
async function openCheckout(req: Request): Promise<Response> {
  const go = (url: string) => new Response(null, { status: 302, headers: { Location: url } });
  const link = await readLink(new URL(req.url).searchParams.get('t') ?? '');
  if (!link) return go(thanks('expire'));
  const db = admin();
  const { data: business } = await db.from('businesses').select('*').eq('id', link.b).is('main_business_id', null).maybeSingle();
  if (!business) return go(thanks('erreur'));
  const email = await ownerEmail(db, business);
  if (!email) return go(thanks('erreur'));
  const { data: sub } = await db.from('subscriptions').select('*').eq('business_id', business.id).maybeSingle();
  try {
    const url = await createCheckout(db, { business, email, sub, plan: link.p, back: thanks('paiement') });
    return go(url);
  } catch (e) {
    const code = e instanceof HttpError ? e.code : '';
    return go(thanks(code === 'already_subscribed' ? 'deja' : code === 'founder_full' ? 'complet' : 'erreur'));
  }
}

/** Tournée du jour : les essais qui finissent dans 3 jours, et ceux qui viennent de finir. */
async function daily(): Promise<Response> {
  const db = admin();
  const now = new Date();
  // Inscrits il y a entre 11 et 26 jours (fin d'essai entre « dans 4 jours » et « il y a 11 jours »).
  const from = new Date(now.getTime() - (TRIAL_DAYS + 11) * 86_400_000).toISOString();
  const to = new Date(now.getTime() - (TRIAL_DAYS - 4) * 86_400_000).toISOString();
  const { data: shops } = await db.from('businesses').select('*').is('main_business_id', null).gte('created_at', from).lte('created_at', to);
  let sent = 0, skipped = 0;
  for (const business of shops ?? []) {
    const kind = dueTrialEmail(trialEndsAt(business.created_at), now);
    if (!kind) { skipped++; continue; }
    const { data: sub } = await db.from('subscriptions').select('status, stripe_subscription_id').eq('business_id', business.id).maybeSingle();
    const access = accessState(business.created_at, sub, now);
    if (access === 'paid' || access === 'free') { skipped++; continue; }
    const { count } = await db.from('trial_emails').select('id', { count: 'exact', head: true }).eq('business_id', business.id).eq('kind', kind);
    if (count) { skipped++; continue; }
    try {
      await sendTrialEmail(db, business, kind);
      sent++;
    } catch (e) {
      console.error('[vitrine] e-mail de fin d\'essai', business.id, e instanceof Error ? e.message : String(e));
    }
  }
  return json({ sent, skipped });
}

Deno.serve(handler(async (req) => {
  if (req.method === 'GET') return openCheckout(req);
  const body = await req.json().catch(() => ({}));

  if (body.action === 'daily') {
    const secret = env('CRON_SECRET');
    if (!secret || req.headers.get('x-cron-secret') !== secret) throw new HttpError(401, 'unauthenticated', 'Accès refusé.');
    if (!mailReady()) return json({ sent: 0, configured: false });
    return daily();
  }

  const { db, user, company, member } = await requireMerchant(req);
  if (body.action === 'status') {
    const email = await ownerEmail(db, company);
    // L'employé ne voit pas l'adresse du patron.
    return json({ configured: mailReady(), email: member.role === 'employe' ? null : email ?? user.email ?? null });
  }
  if (body.action === 'resend') {
    requirePatron(member);
    if (!mailReady()) throw new HttpError(503, 'mail_not_configured', "L'envoi d'e-mails n'est pas encore branché.");
    await rateLimit(db, 'trial_emails', company.id, 3, 60);
    const email = await sendTrialEmail(db, company, 'resend');
    return json({ email });
  }
  throw new HttpError(400, 'bad_action', 'Action inconnue.');
}));
