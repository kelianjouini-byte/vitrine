// Équipe et plusieurs boutiques. POST {action}
//  Sans connexion :
//   - 'login'       : {email, code} -> {access_token, refresh_token}  (l'employé se connecte avec le code donné par son patron)
//  Connecté (tout le monde) :
//   - 'context'     : rôle, prénom, boutiques accessibles, posts à valider / en attente
//   - 'submit'      : un employé envoie son post (ou sa story) au patron
//  Patrons seulement :
//   - 'members'     : l'équipe, avec le code de chaque personne
//   - 'add'         : {firstName, email, role, shopIds} -> la personne et son code
//   - 'update'      : {memberId, shopIds?, canPublish?}
//   - 'new_code'    : {memberId} -> un nouveau code (l'ancien ne marche plus)
//   - 'remove'      : {memberId} (son accès est supprimé ; ses posts restent dans la boutique)
//   - 'pending'     : les posts envoyés par les employés, à valider
//   - 'approve'     : {post_id, caption?} -> publie (texte éventuellement modifié par le patron)
//   - 'reject'      : {post_id, note?}
//   - 'add_shop'    : {businessName, businessType, trade?, city, postalCode} -> la boutique ajoutée (prix mis à jour chez Stripe)
//   - 'remove_shop' : {shopId}
// Déployée avec verify_jwt = false (à cause de 'login') : le jeton est vérifié ici pour toutes les autres actions.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { handler, json, HttpError, env } from '../_shared/http.ts';
import { admin, requireMerchant, requirePatron } from '../_shared/db.ts';
import { accessState } from '../_shared/billing.ts';
import { requireAccess } from '../_shared/access.ts';
import { metaConfig } from '../_shared/meta.ts';
import { readImagePaths, postImagePaths } from '../_shared/photos.ts';
import { readPlatforms } from '../_shared/publish.ts';
import { publishSavedPost, publishSavedStory } from '../_shared/publishCore.ts';
import { decryptCode, encryptCode, newLoginCode, strongPassword, syncExtraShops } from '../_shared/teamServer.ts';
import { isLockedOut, isPatron, LOCK_MINUTES, looksLikeEmail, looksLikeLoginCode, normalizeEmail, normalizeLoginCode, sameCode } from '../_shared/team.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_MEMBERS = 50;
const MAX_SHOPS = 30;
const str = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

Deno.serve(handler(async (req) => {
  const body = await req.json().catch(() => ({}));
  if (body.action === 'login') return login(body);

  const ctx = await requireMerchant(req);
  const { db, userId, company, member } = ctx;
  const action = String(body.action ?? '');

  if (action === 'context') return json(await context(ctx));
  if (action === 'submit') return json(await submit(ctx, body));

  requirePatron(member);

  if (action === 'members') {
    const { data: rows } = await db.from('team_members').select('*').eq('company_id', company.id).order('created_at');
    const { data: owner } = await db.auth.admin.getUserById(company.owner_id);
    const list = await Promise.all((rows ?? []).map(async (r) => ({
      id: r.id, firstName: r.first_name, email: r.email, role: r.role, shopIds: r.shop_ids ?? [], canPublish: r.can_publish,
      code: await decryptCode(r.encrypted_code), isMe: r.user_id === userId,
    })));
    return json({
      owner: { firstName: company.owner_first_name, email: owner?.user?.email ?? null, isMe: company.owner_id === userId },
      members: list,
    });
  }

  if (action === 'add') {
    const firstName = str(body.firstName, 60);
    const email = normalizeEmail(body.email);
    const role = body.role === 'patron' ? 'patron' : 'employe';
    if (!firstName) throw new HttpError(400, 'bad_name', 'Écrivez son prénom.');
    if (!looksLikeEmail(email)) throw new HttpError(400, 'bad_email', 'Cette adresse e-mail n\'est pas valide.');
    const shopIds = await validShopIds(ctx, body.shopIds);
    const { count } = await db.from('team_members').select('id', { count: 'exact', head: true }).eq('company_id', company.id);
    if ((count ?? 0) >= MAX_MEMBERS) throw new HttpError(400, 'too_many', 'Votre équipe est déjà complète.');
    const { data: same } = await db.from('team_members').select('id').eq('company_id', company.id).eq('email', email).maybeSingle();
    if (same) throw new HttpError(409, 'already_member', 'Cette personne fait déjà partie de votre équipe.');

    const code = newLoginCode();
    const { data: created, error } = await db.auth.admin.createUser({ email, password: strongPassword(), email_confirm: true, user_metadata: { vitrine_team: true } });
    if (error || !created.user) {
      if (/already|exists|registered/i.test(error?.message ?? '')) {
        throw new HttpError(409, 'email_taken', 'Cette adresse a déjà un compte Vitrine. Utilisez une autre adresse pour cette personne.');
      }
      throw new HttpError(500, 'create_failed', 'La personne n\'a pas pu être ajoutée. Réessayez.');
    }
    const { data: row, error: e2 } = await db.from('team_members').insert({
      company_id: company.id, user_id: created.user.id, first_name: firstName, email, role, shop_ids: role === 'patron' ? [] : shopIds,
      can_publish: false, encrypted_code: await encryptCode(code), created_by: userId,
    }).select('id').single();
    if (e2 || !row) {
      await db.auth.admin.deleteUser(created.user.id);
      throw new HttpError(500, 'create_failed', 'La personne n\'a pas pu être ajoutée. Réessayez.');
    }
    return json({ id: row.id, code });
  }

  if (action === 'update' || action === 'new_code' || action === 'remove') {
    const { data: m } = await db.from('team_members').select('*').eq('id', String(body.memberId ?? '')).eq('company_id', company.id).maybeSingle();
    if (!m) throw new HttpError(404, 'not_found', 'Cette personne ne fait plus partie de l\'équipe.');

    if (action === 'update') {
      const patch: Record<string, unknown> = {};
      if (Array.isArray(body.shopIds)) patch.shop_ids = await validShopIds(ctx, body.shopIds);
      if (typeof body.canPublish === 'boolean') patch.can_publish = body.canPublish;
      if (Object.keys(patch).length) await db.from('team_members').update(patch).eq('id', m.id);
      return json({ ok: true });
    }
    if (action === 'new_code') {
      const code = newLoginCode();
      await db.from('team_members').update({ encrypted_code: await encryptCode(code) }).eq('id', m.id);
      return json({ code });
    }
    // remove : on supprime son compte (il ne peut plus se connecter). Ses posts restent dans la boutique.
    if (m.user_id === userId) throw new HttpError(400, 'self', 'Vous ne pouvez pas vous retirer vous-même.');
    const { error } = await db.auth.admin.deleteUser(m.user_id);
    if (error) throw new HttpError(500, 'remove_failed', 'Le retrait a échoué. Réessayez.');
    return json({ ok: true });
  }

  if (action === 'pending') return json({ posts: await pendingPosts(ctx) });

  if (action === 'approve' || action === 'reject') {
    const { data: post } = await db.from('posts').select('*').eq('id', String(body.post_id ?? '')).in('business_id', member.shopIds).maybeSingle();
    if (!post || post.review_state !== 'pending') throw new HttpError(404, 'not_found', 'Ce post a déjà été traité.');

    if (action === 'reject') {
      await db.from('posts').update({ review_state: 'rejected', review_note: str(body.note, 300) || null, reviewed_by: userId, status: 'cancelled' }).eq('id', post.id);
      return json({ ok: true });
    }

    metaConfig(); // lève meta_not_configured si la publication n'est pas encore branchée (jamais de faux succès)
    await requireAccess(db, company);
    const platforms = readPlatforms(post.platforms);
    if (!platforms.length) throw new HttpError(400, 'bad_request', 'Aucun réseau choisi pour ce post.');
    const key = (post.idempotency_key as string | null) ?? crypto.randomUUID();
    const publications = post.kind === 'story'
      ? await publishSavedStory({ db, businessId: post.business_id, postId: post.id, path: post.image_url, kind: post.media_type === 'video' ? 'video' : 'photo', platforms, key })
      : await publishSavedPost({
        db, businessId: post.business_id, postId: post.id, platforms, key, paths: [],
        caption: str(body.caption, 2000) || post.instagram_caption || '', hashtags: post.hashtags ?? [],
      });
    const ok = publications.some((p) => p.status === 'published');
    // Rien n'est parti (réseau pas connecté…) : le post reste à valider, le patron pourra réessayer.
    await db.from('posts').update(ok ? { review_state: 'approved', reviewed_by: userId } : { status: 'awaiting_approval' }).eq('id', post.id);
    return json({ publications });
  }

  if (action === 'add_shop') {
    const { data: sub } = await db.from('subscriptions').select('status, stripe_subscription_id').eq('business_id', company.id).maybeSingle();
    const access = accessState(company.created_at, sub);
    if (access !== 'paid' && access !== 'free') throw new HttpError(402, 'needs_plan', 'Choisissez d\'abord votre offre pour ajouter une boutique.');
    const { count } = await db.from('businesses').select('id', { count: 'exact', head: true }).eq('main_business_id', company.id);
    if ((count ?? 0) >= MAX_SHOPS) throw new HttpError(400, 'too_many', 'Vous avez déjà beaucoup de boutiques : écrivez-nous pour en ajouter.');
    const row = {
      main_business_id: company.id,
      owner_first_name: company.owner_first_name,
      business_name: str(body.businessName, 120),
      business_type: str(body.businessType, 40) || company.business_type,
      trade: str(body.trade, 80) || null,
      city: str(body.city, 120),
      postal_code: str(body.postalCode, 5),
      tone: company.tone,
    };
    if (!row.business_name || !row.city || !/^\d{5}$/.test(row.postal_code)) throw new HttpError(400, 'bad_shop', 'Écrivez le nom, la ville et le code postal de la boutique.');
    const { data: shop, error } = await db.from('businesses').insert(row).select('*').single();
    if (error || !shop) throw new HttpError(500, 'db', 'La boutique n\'a pas pu être ajoutée. Réessayez.');
    try {
      await syncExtraShops(db, company.id);
    } catch (e) {
      // Le prix n'a pas pu être mis à jour : on annule l'ajout plutôt que d'offrir une boutique par erreur.
      await db.from('businesses').delete().eq('id', shop.id);
      throw e;
    }
    return json({ shop });
  }

  if (action === 'remove_shop') {
    const id = String(body.shopId ?? '');
    const { data: shop } = await db.from('businesses').select('id').eq('id', id).eq('main_business_id', company.id).maybeSingle();
    if (!shop) throw new HttpError(404, 'not_found', 'Cette boutique est introuvable.');
    await db.from('businesses').delete().eq('id', id);
    await syncExtraShops(db, company.id);
    // On retire la boutique de la liste des employés qui y travaillaient.
    // Un employé qui n'avait QUE cette boutique la garde dans sa liste : comme elle n'existe plus, il n'a
    // accès à rien (une liste vide voudrait dire « toutes les boutiques »). Le patron lui en redonne une.
    const { data: rows } = await db.from('team_members').select('id, shop_ids').eq('company_id', company.id);
    for (const r of rows ?? []) {
      const ids: string[] = r.shop_ids ?? [];
      const left = ids.filter((s) => s !== id);
      if (ids.includes(id) && left.length) await db.from('team_members').update({ shop_ids: left }).eq('id', r.id);
    }
    return json({ ok: true });
  }

  throw new HttpError(400, 'bad_action', 'Action inconnue.');
}));

type Ctx = Awaited<ReturnType<typeof requireMerchant>>;

/** Boutiques choisies par le patron : seulement celles de son entreprise (vide = toutes). */
async function validShopIds(ctx: Ctx, raw: unknown): Promise<string[]> {
  const all = ctx.member.shopIds;
  const ids = (Array.isArray(raw) ? raw : []).map(String).filter((id) => UUID.test(id) && all.includes(id));
  return [...new Set(ids)].length >= all.length ? [] : [...new Set(ids)];
}

/** Ce que l'appli doit savoir au démarrage : qui je suis, mes boutiques, ce qui attend. */
async function context({ db, userId, company, member }: Ctx) {
  const { data: shops } = await db.from('businesses').select('*').in('id', member.shopIds);
  const ordered = member.shopIds.map((id) => (shops ?? []).find((s) => s.id === id)).filter(Boolean);
  let pending = 0;
  let mine = { pending: 0, rejected: 0 };
  if (isPatron(member.role)) {
    const { count } = await db.from('posts').select('id', { count: 'exact', head: true }).in('business_id', member.shopIds).eq('review_state', 'pending');
    pending = count ?? 0;
  } else {
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const [{ count: p }, { count: r }] = await Promise.all([
      db.from('posts').select('id', { count: 'exact', head: true }).eq('created_by', userId).eq('review_state', 'pending'),
      db.from('posts').select('id', { count: 'exact', head: true }).eq('created_by', userId).eq('review_state', 'rejected').gte('updated_at', since),
    ]);
    mine = { pending: p ?? 0, rejected: r ?? 0 };
  }
  const { count: team } = await db.from('team_members').select('id', { count: 'exact', head: true }).eq('company_id', company.id);
  return {
    role: member.role,
    firstName: member.firstName,
    canPublish: member.canPublish,
    companyId: company.id,
    ownerFirstName: company.owner_first_name,
    shops: ordered,
    pending,
    mine,
    teamSize: team ?? 0,
  };
}

/** Posts envoyés par les employés et pas encore traités, avec leurs photos (liens valables 1 heure). */
async function pendingPosts({ db, company, member }: Ctx) {
  const { data: posts } = await db.from('posts').select('*').in('business_id', member.shopIds).eq('review_state', 'pending').order('submitted_at', { ascending: true }).limit(30);
  if (!posts?.length) return [];
  const { data: shops } = await db.from('businesses').select('id, business_name, city').in('id', member.shopIds);
  const { data: people } = await db.from('team_members').select('user_id, first_name').eq('company_id', company.id);
  const nameOf = (uid: string | null) => (people ?? []).find((p) => p.user_id === uid)?.first_name ?? (uid === company.owner_id ? company.owner_first_name : 'Un employé');
  return Promise.all(posts.map(async (p) => {
    const paths = p.kind === 'story' ? [p.image_url] : postImagePaths(p);
    const { data: signed } = await db.storage.from('post-images').createSignedUrls(paths, 3600);
    const shop = (shops ?? []).find((s) => s.id === p.business_id);
    return {
      id: p.id, kind: p.kind, mediaType: p.media_type, caption: p.instagram_caption ?? '', hashtags: p.hashtags ?? [], platforms: p.platforms ?? [],
      submittedAt: p.submitted_at, by: nameOf(p.created_by), shopId: p.business_id, shopName: shop ? `${shop.business_name} · ${shop.city}` : '',
      mediaUrls: (signed ?? []).map((s) => s.signedUrl).filter(Boolean),
    };
  }));
}

/** Un employé envoie son post (ou sa story) au patron. Rien n'est publié ici. */
async function submit({ db, userId, business, company }: Ctx, body: Record<string, unknown>) {
  const platforms = readPlatforms(body.platforms);
  const key = String(body.idempotency_key ?? '');
  if (!platforms.length || key.length < 16) throw new HttpError(400, 'bad_request', 'Choisissez au moins un réseau.');
  await requireAccess(db, company);
  const base = { business_id: business.id, platforms, idempotency_key: key, review_state: 'pending', review_note: null, submitted_at: new Date().toISOString(), status: 'awaiting_approval' };

  if (body.kind === 'story') {
    const id = String(body.story_id ?? '');
    const path = String(body.media_path ?? '');
    if (!UUID.test(id)) throw new HttpError(400, 'bad_request', 'Story incomplète.');
    if (!path.startsWith(`${userId}/`) || path.includes('..') || path.length > 200) throw new HttpError(400, 'bad_media', 'Fichier invalide.');
    const { data: existing } = await db.from('posts').select('id, business_id, status').eq('id', id).maybeSingle();
    if (existing && (existing.business_id !== business.id || existing.status === 'published')) throw new HttpError(409, 'already_done', 'Cette story est déjà publiée.');
    const { error } = await db.from('posts').upsert({ id, ...base, kind: 'story', media_type: body.media_type === 'video' ? 'video' : 'photo', image_url: path, created_by: userId });
    if (error) throw new HttpError(500, 'db', 'La story n\'a pas pu être envoyée. Réessayez.');
    return { ok: true };
  }

  const id = String(body.post_id ?? '');
  const caption = str(body.caption, 2000);
  const hashtags = (Array.isArray(body.hashtags) ? body.hashtags : []).map(String).slice(0, 30);
  if (!UUID.test(id) || !caption) throw new HttpError(400, 'bad_request', 'Post incomplet.');
  const paths = readImagePaths(body, userId, false);
  const { data: existing } = await db.from('posts').select('id, business_id, status, created_by').eq('id', id).maybeSingle();
  if (existing && (existing.business_id !== business.id || existing.status === 'published' || existing.status === 'publishing')) {
    throw new HttpError(409, 'already_done', 'Ce post est déjà publié.');
  }
  const fields = { ...base, kind: 'post', instagram_caption: caption, facebook_caption: caption, hashtags, ...(paths.length ? { image_url: paths[0], image_urls: paths } : {}) };
  if (existing) {
    await db.from('posts').update({ ...fields, created_by: existing.created_by ?? userId }).eq('id', id);
  } else {
    if (!paths.length) throw new HttpError(400, 'bad_image', 'Ajoutez au moins une photo.');
    const { error } = await db.from('posts').insert({ id, ...fields, created_by: userId });
    if (error) throw new HttpError(500, 'db', 'Le post n\'a pas pu être envoyé. Réessayez.');
  }
  return { ok: true };
}

/** Connexion d'un membre de l'équipe : e-mail + code. Bloquée après 5 erreurs en 15 minutes. */
async function login(body: Record<string, unknown>) {
  const db = admin();
  const email = normalizeEmail(body.email);
  const code = normalizeLoginCode(body.code);
  const wrong = new HttpError(400, 'bad_login', 'E-mail ou code incorrect.');
  if (!looksLikeEmail(email)) throw wrong;
  // Pas un membre d'une équipe : l'appli essaiera le mot de passe normal (rien n'est compté ici).
  const { data: m } = await db.from('team_members').select('user_id, encrypted_code').eq('email', email).maybeSingle();
  if (!m) throw wrong;
  const since = new Date(Date.now() - LOCK_MINUTES * 60_000).toISOString();
  const { count } = await db.from('team_login_attempts').select('id', { count: 'exact', head: true }).eq('email', email).eq('ok', false).gte('created_at', since);
  if (isLockedOut(count ?? 0)) throw new HttpError(429, 'locked', `Trop d'essais. Réessayez dans ${LOCK_MINUTES} minutes, ou demandez un nouveau code à votre patron.`);

  const real = await decryptCode(m.encrypted_code);
  const ok = Boolean(real && looksLikeLoginCode(code) && sameCode(code, real));
  await db.from('team_login_attempts').insert({ email, ok });
  if (!ok) throw wrong;

  // Le vrai mot de passe du compte est long, aléatoire et changé à chaque connexion :
  // le code de 6 caractères ne marche donc QUE par ici (où les essais sont limités).
  const password = strongPassword();
  const { error } = await db.auth.admin.updateUserById(m.user_id, { password });
  if (error) throw new HttpError(500, 'login_failed', 'Connexion impossible pour le moment. Réessayez.');
  const anon = createClient(Deno.env.get('SUPABASE_URL')!, env('SUPABASE_ANON_KEY') ?? '', { auth: { persistSession: false } });
  const { data: s, error: e2 } = await anon.auth.signInWithPassword({ email, password });
  if (e2 || !s.session) throw new HttpError(500, 'login_failed', 'Connexion impossible pour le moment. Réessayez.');
  return json({ access_token: s.session.access_token, refresh_token: s.session.refresh_token });
}

