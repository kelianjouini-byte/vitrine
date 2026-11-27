// POST (appelée une fois par jour par pg_cron, en-tête x-cron-secret = app_secrets 'trial_emails_cron') -> { sent, skipped, failed }
// POST {action:'resend'} (appli, patron connecté) : renvoie tout de suite l'e-mail de fin d'essai au créateur du compte
//   -> { email }. Bouton « Renvoyer l'e-mail » des applis App Store / Google Play, qui n'affichent ni prix ni paiement.
//   3 fois par heure au plus (table trial_email_resends).
// E-mails de fin d'essai : rappel quelques jours avant la fin, puis « essai terminé » le jour même.
// Envoi par l'API Brevo (expéditeur Vitrine <contact@vitrineappli.fr>, domaine authentifié chez Brevo).
// Jamais deux fois le même e-mail : la ligne trial_emails est écrite AVANT l'envoi (clé unique boutique + type).
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { env, handler, HttpError, json } from '../_shared/http.ts';
import { accessState, founderOffer } from '../_shared/billing.ts';
import { rateLimit, requireMerchant, requirePatron } from '../_shared/db.ts';
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { trialEmail, trialEmailDue } from '../_shared/trialEmails.ts';

const SENDER = { name: 'Vitrine', email: 'contact@vitrineappli.fr' };

async function sendBrevo(apiKey: string, to: string, name: string, mail: { subject: string; html: string; text: string }, tag: string) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: SENDER, replyTo: SENDER, to: [{ email: to, name: name || undefined }],
      subject: mail.subject, htmlContent: mail.html, textContent: mail.text, tags: [tag],
    }),
  });
  if (!res.ok) throw new Error(`brevo ${res.status}`);
}

const APP_URL = 'https://vitrineappli.fr/app/';

// deno-lint-ignore no-explicit-any
type Row = any;

/** Places restantes de l'offre fondateur (0 si fermée ou complète). */
async function founderPlacesLeft(db: SupabaseClient): Promise<number> {
  const { data: plan } = await db.from('plans').select('active, places').eq('id', 'founder').maybeSingle();
  const { count: taken } = await db.from('subscriptions').select('id', { count: 'exact', head: true })
    .eq('plan', 'founder').not('stripe_subscription_id', 'is', null).in('status', ['trialing', 'active', 'past_due', 'unpaid', 'paused']);
  return founderOffer(plan, taken ?? 0, null).left;
}

/** L'e-mail d'une entreprise (boutique principale) : ses résultats pendant l'essai + les offres. */
async function buildMail(db: SupabaseClient, c: Row, kind: 'reminder' | 'ended', founderLeft: number, now: Date) {
  const { data: shops } = await db.from('businesses').select('id').eq('main_business_id', c.id);
  const shopIds = [c.id, ...(shops ?? []).map((s) => s.id)];
  const { count: published } = await db.from('posts').select('id', { count: 'exact', head: true })
    .in('business_id', shopIds).in('status', ['published', 'partially_published']).gte('published_at', c.created_at);
  const { data: stats } = await db.from('post_stats').select('views').in('business_id', shopIds);
  const views = (stats ?? []).reduce((s, r) => s + (r.views ?? 0), 0);
  return trialEmail(kind, {
    firstName: c.owner_first_name, businessName: c.business_name, businessCreatedAt: c.created_at,
    published: published ?? 0, views, founderLeft, appUrl: APP_URL,
  }, now);
}

/** Bouton « Renvoyer l'e-mail » de l'appli : l'e-mail part au créateur du compte (celui qui paie). */
async function resend(req: Request): Promise<Response> {
  const { db, company, member } = await requireMerchant(req);
  requirePatron(member);
  const apiKey = env('BREVO_API_KEY');
  if (!apiKey) throw new HttpError(503, 'not_configured', "L'envoi d'e-mails n'est pas encore branché.");
  const { data: sub } = await db.from('subscriptions').select('status, stripe_subscription_id').eq('business_id', company.id).maybeSingle();
  const access = accessState(company.created_at, sub);
  if (access === 'paid' || access === 'free') throw new HttpError(409, 'already_subscribed', 'Votre abonnement est déjà en place.');
  const { data: owner } = await db.auth.admin.getUserById(company.owner_id);
  const email = owner?.user && !owner.user.is_anonymous ? owner.user.email : null;
  if (!email) throw new HttpError(400, 'no_email', "Ce compte n'a pas d'adresse e-mail.");
  await rateLimit(db, 'trial_email_resends', company.id, 3, 60);
  const now = new Date();
  const mail = await buildMail(db, company, access === 'trial' ? 'reminder' : 'ended', await founderPlacesLeft(db), now);
  await db.from('trial_email_resends').insert({ business_id: company.id });
  try {
    await sendBrevo(apiKey, email, company.owner_first_name, mail, 'trial-resend');
  } catch (e) {
    console.error("[vitrine] e-mail renvoyé non parti", e instanceof Error ? e.message : String(e));
    throw new HttpError(502, 'mail_failed', "L'e-mail n'a pas pu partir. Réessayez dans un instant.");
  }
  return json({ email });
}

Deno.serve(handler(async (req) => {
  const body = await req.clone().json().catch(() => ({}));
  if (body?.action === 'resend') return resend(req);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  // Mot de passe de la tâche pg_cron : tiré au hasard dans la base (table app_secrets, jamais lisible par l'appli).
  const { data: row } = await db.from('app_secrets').select('value').eq('name', 'trial_emails_cron').maybeSingle();
  const given = req.headers.get('x-cron-secret') ?? '';
  if (!row?.value || given !== row.value) throw new HttpError(401, 'unauthorized', 'Accès refusé.');
  const apiKey = env('BREVO_API_KEY');
  if (!apiKey) throw new HttpError(503, 'not_configured', 'Brevo n\'est pas configuré (BREVO_API_KEY).');
  const dryRun = new URL(req.url).searchParams.get('dry') === '1';
  // Un appel par jour garde la clé Brevo active (elle expire après 90 jours sans usage) et prévient si elle ne marche plus.
  const check = await fetch('https://api.brevo.com/v3/account', { headers: { 'api-key': apiKey, Accept: 'application/json' } });
  if (!check.ok) console.error('[vitrine] clé Brevo refusée', check.status);
  const brevoOk = check.ok;

  const now = new Date();

  // Seules les boutiques créées il y a 10 à 19 jours peuvent être concernées (essai de 15 jours).
  const from = new Date(now.getTime() - 19 * 86_400_000).toISOString();
  const to = new Date(now.getTime() - 10 * 86_400_000).toISOString();
  const { data: companies, error } = await db.from('businesses')
    .select('id, owner_id, owner_first_name, business_name, created_at')
    .is('main_business_id', null).not('owner_id', 'is', null)
    .gte('created_at', from).lte('created_at', to);
  if (error) throw error;

  const founderLeft = await founderPlacesLeft(db);

  let sent = 0, skipped = 0, failed = 0;
  const due: string[] = [];
  for (const c of companies ?? []) {
    const { data: sub } = await db.from('subscriptions').select('status, stripe_subscription_id').eq('business_id', c.id).maybeSingle();
    const kind = trialEmailDue(c.created_at, accessState(c.created_at, sub, now), now);
    if (!kind) { skipped++; continue; }
    const { data: user } = await db.from('users').select('email').eq('id', c.owner_id).maybeSingle();
    if (!user?.email) { skipped++; continue; }

    const mail = await buildMail(db, c, kind, founderLeft, now);
    if (dryRun) { due.push(`${kind}:${c.id}`); continue; }

    // Réserve l'envoi d'abord : si la ligne existe déjà, l'e-mail est déjà parti.
    const { error: claim } = await db.from('trial_emails').insert({ business_id: c.id, kind, email: user.email });
    if (claim) { skipped++; continue; }
    try {
      await sendBrevo(apiKey, user.email, c.owner_first_name, mail, `trial-${kind}`);
      sent++;
    } catch (e) {
      // Échec : on libère la ligne pour réessayer demain.
      await db.from('trial_emails').delete().eq('business_id', c.id).eq('kind', kind);
      console.error('[vitrine] e-mail fin d\'essai non envoyé', e instanceof Error ? e.message : String(e));
      failed++;
    }
  }
  return json(dryRun ? { dryRun: true, brevoOk, due } : { brevoOk, sent, skipped, failed });
}));
