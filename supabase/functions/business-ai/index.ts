// POST { action: 'detect', business_name, city, postal_code } -> { trade, products, strengths, audience } (chaque champ : texte ou null)
// POST { action: 'occasions', trade, catalog: [{ key, name, description }] } -> { keys: string[] }
// Utilisé à l'inscription, avant que la boutique existe : on vérifie seulement la session.
import { handler, HttpError, json } from '../_shared/http.ts';
import { admin } from '../_shared/db.ts';
import { pickOccasions, searchBusiness } from '../_shared/openai.ts';

const MAX_PER_HOUR = 15;

Deno.serve(handler(async (req) => {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'unauthenticated', 'Veuillez vous connecter.');
  const db = admin();
  const { data: u, error } = await db.auth.getUser(token);
  if (error || !u.user) throw new HttpError(401, 'unauthenticated', 'Veuillez vous reconnecter.');
  const userId = u.user.id;

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? '');
  if (action !== 'detect' && action !== 'occasions') throw new HttpError(400, 'bad_request', 'Action inconnue.');

  // Limite simple : 15 recherches par heure et par compte (protège le quota gratuit).
  const since = new Date(Date.now() - 3_600_000).toISOString();
  const { count } = await db.from('ai_lookups').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', since);
  if ((count ?? 0) >= MAX_PER_HOUR) throw new HttpError(429, 'rate_limited', 'Vous allez un peu vite ! Réessayez dans quelques minutes.');
  await db.from('ai_lookups').insert({ user_id: userId, kind: action });

  if (action === 'detect') {
    const name = String(body.business_name ?? '').trim().slice(0, 120);
    const city = String(body.city ?? '').trim().slice(0, 120);
    const postalCode = String(body.postal_code ?? '').trim().slice(0, 5);
    if (name.length < 2 || city.length < 2) throw new HttpError(400, 'bad_request', 'Nom ou ville manquant.');
    return json(await searchBusiness({ name, city, postalCode }));
  }

  const trade = String(body.trade ?? '').trim().slice(0, 80);
  const catalog = (Array.isArray(body.catalog) ? body.catalog : []).slice(0, 80).map((o: Record<string, unknown>) => ({
    key: String(o.key ?? '').slice(0, 60),
    name: String(o.name ?? '').slice(0, 80),
    description: String(o.description ?? '').slice(0, 160),
  })).filter((o: { key: string }) => /^[a-z0-9-]+$/.test(o.key));
  if (!trade || catalog.length === 0) throw new HttpError(400, 'bad_request', 'Métier manquant.');
  return json({ keys: await pickOccasions(trade, catalog) });
}));
