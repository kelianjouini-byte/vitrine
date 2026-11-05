// Callback « Suppression des données » exigé par Meta.
// Meta envoie un signed_request (HMAC-SHA256 avec le secret de l'app). On supprime les connexions
// de cet utilisateur Meta et on renvoie l'URL de suivi + un code de confirmation.
import { handler, json, HttpError } from '../_shared/http.ts';
import { admin } from '../_shared/db.ts';
import { hmac } from '../_shared/crypto.ts';
import { metaConfig } from '../_shared/meta.ts';

Deno.serve(handler(async (req) => {
  const { appSecret } = metaConfig();
  const form = await req.formData();
  const [sig, payload] = String(form.get('signed_request') ?? '').split('.');
  if (!sig || !payload || sig !== (await hmac(payload, appSecret))) throw new HttpError(400, 'bad_signature', 'Requête invalide.');
  const data = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  const code = crypto.randomUUID();
  await admin().from('social_accounts').delete().eq('meta_user_id', String(data.user_id));
  console.log('[vitrine] suppression Meta traitée', code);
  return json({ url: `${Deno.env.get('PUBLIC_SITE_URL') ?? ''}/suppression/?code=${code}`, confirmation_code: code });
}));
