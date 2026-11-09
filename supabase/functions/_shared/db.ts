import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { HttpError } from './http.ts';
import { canPublishDirectly, isPatron, memberShopIds, type Role } from './team.ts';

/** Client serveur (service role) : contourne la RLS, à n'utiliser QUE côté serveur. */
export function admin(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
}

/** Qui est connecté, dans quelle équipe, avec quels droits. */
export interface Member {
  role: Role;
  /** Prénom affiché (« Bonjour Julie ») ; celui de la fiche boutique pour le créateur du compte. */
  firstName: string;
  canPublish: boolean;
  /** Ligne team_members (null pour le créateur du compte). */
  memberId: string | null;
  /** Boutiques que ce compte peut ouvrir (la principale en premier). */
  shopIds: string[];
}

// deno-lint-ignore no-explicit-any
type Row = any;

/** Entreprise d'un compte : sa boutique principale, ou celle de son équipe. null = pas encore de boutique. */
export async function companyOf(db: SupabaseClient, userId: string): Promise<{ company: Row; member: Member } | null> {
  const { data: own } = await db.from('businesses').select('*').eq('owner_id', userId).is('main_business_id', null).maybeSingle();
  let company: Row | null = own;
  let role: Role = 'owner';
  let tm: Row | null = null;
  if (!company) {
    const { data: t } = await db.from('team_members').select('*').eq('user_id', userId).maybeSingle();
    if (!t) return null;
    tm = t;
    role = t.role === 'patron' ? 'patron' : 'employe';
    const { data: c } = await db.from('businesses').select('*').eq('id', t.company_id).maybeSingle();
    company = c;
  }
  if (!company) return null;
  const { data: extra } = await db.from('businesses').select('id').eq('main_business_id', company.id).order('created_at');
  const all = [company.id as string, ...((extra ?? []).map((r) => r.id as string))];
  return {
    company,
    member: {
      role,
      firstName: tm?.first_name ?? company.owner_first_name,
      canPublish: canPublishDirectly(role, Boolean(tm?.can_publish)),
      memberId: tm?.id ?? null,
      shopIds: memberShopIds(role, (tm?.shop_ids ?? []) as string[], all),
    },
  };
}

/**
 * Vérifie le jeton de l'utilisateur et retourne son id, la boutique ouverte dans l'appli et son entreprise.
 * La boutique ouverte vient de l'en-tête « x-vitrine-shop » (bouton de choix de boutique), toujours vérifiée ici.
 * business = la boutique ouverte · company = la boutique principale (abonnement, essai, parrainage).
 */
export async function requireMerchant(req: Request) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'unauthenticated', 'Veuillez vous connecter.');
  const db = admin();
  const { data: u, error } = await db.auth.getUser(token);
  if (error || !u.user) throw new HttpError(401, 'unauthenticated', 'Veuillez vous reconnecter.');
  const found = await companyOf(db, u.user.id);
  if (!found) throw new HttpError(400, 'no_business', 'Votre boutique n\'est pas encore enregistrée.');
  if (!found.member.shopIds.length) throw new HttpError(403, 'no_shop', 'Votre patron ne vous a pas encore donné de boutique. Demandez-lui.');
  const { company, member } = found;
  const wanted = req.headers.get('x-vitrine-shop') ?? '';
  const shopId = member.shopIds.includes(wanted) ? wanted : member.shopIds[0];
  let business: Row = company;
  if (shopId !== company.id) {
    const { data: shop } = await db.from('businesses').select('*').eq('id', shopId).single();
    business = shop;
  }
  return { db, userId: u.user.id, user: u.user, business, company, member };
}

/** Réservé aux patrons (abonnement, équipe, boutiques, réseaux, validation). */
export function requirePatron(member: Member) {
  if (!isPatron(member.role)) throw new HttpError(403, 'patron_only', 'Seul un patron peut faire cela.');
}

/** Limitation de débit simple, basée sur l'historique en base. */
export async function rateLimit(db: SupabaseClient, table: string, businessId: string, max: number, minutes: number) {
  const since = new Date(Date.now() - minutes * 60_000).toISOString();
  const { count } = await db.from(table).select('id', { count: 'exact', head: true }).eq('business_id', businessId).gte('created_at', since);
  if ((count ?? 0) >= max) throw new HttpError(429, 'rate_limited', 'Vous allez un peu vite ! Réessayez dans quelques minutes.');
}
