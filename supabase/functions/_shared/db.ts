import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { HttpError } from './http.ts';

/** Client serveur (service role) : contourne la RLS, à n'utiliser QUE côté serveur. */
export function admin(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
}

/** Vérifie le jeton de l'utilisateur et retourne son id + sa boutique. */
export async function requireMerchant(req: Request) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'unauthenticated', 'Veuillez vous connecter.');
  const db = admin();
  const { data: u, error } = await db.auth.getUser(token);
  if (error || !u.user) throw new HttpError(401, 'unauthenticated', 'Veuillez vous reconnecter.');
  const { data: business } = await db.from('businesses').select('*').eq('owner_id', u.user.id).maybeSingle();
  if (!business) throw new HttpError(400, 'no_business', 'Votre boutique n\'est pas encore enregistrée.');
  return { db, userId: u.user.id, user: u.user, business };
}

/** Limitation de débit simple, basée sur l'historique en base. */
export async function rateLimit(db: SupabaseClient, table: string, businessId: string, max: number, minutes: number) {
  const since = new Date(Date.now() - minutes * 60_000).toISOString();
  const { count } = await db.from(table).select('id', { count: 'exact', head: true }).eq('business_id', businessId).gte('created_at', since);
  if ((count ?? 0) >= max) throw new HttpError(429, 'rate_limited', 'Vous allez un peu vite ! Réessayez dans quelques minutes.');
}
