// POST { story_id, media_path, media_type: 'photo'|'video', platforms[], idempotency_key }
// -> { publications: [{ platform, status, url, error, publishedAt }] }
// background: true -> réponse immédiate (status « pending ») ; le serveur finit l'envoi tout seul.
// La story (photo ou vidéo) a déjà été envoyée par l'appli dans le stockage privé (dossier de l'utilisateur).
// Meta va la chercher grâce à une adresse signée valable 1 heure. Idempotent comme publish-post.
import { requireAccess } from '../_shared/access.ts';
import { handler, json, HttpError } from '../_shared/http.ts';
import { requireMerchant } from '../_shared/db.ts';
import { metaConfig } from '../_shared/meta.ts';
import { readPlatforms } from '../_shared/publish.ts';
import { publishSavedStory } from '../_shared/publishCore.ts';
import { needsApproval } from '../_shared/teamServer.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(handler(async (req) => {
  metaConfig(); // lève meta_not_configured si les secrets Meta manquent
  const { db, userId, business, company, member } = await requireMerchant(req);
  needsApproval(member);
  await requireAccess(db, company);
  const body = await req.json().catch(() => ({}));
  const platforms = readPlatforms(body.platforms);
  const key = String(body.idempotency_key ?? '');
  const storyId = String(body.story_id ?? '');
  const kind = body.media_type === 'video' ? 'video' : 'photo';
  const path = String(body.media_path ?? '');
  if (!platforms.length || key.length < 16 || !UUID.test(storyId)) throw new HttpError(400, 'bad_request', 'Story incomplète.');
  if (!path.startsWith(`${userId}/`) || path.includes('..') || path.length > 200) throw new HttpError(400, 'bad_media', 'Fichier invalide.');

  // La story est enregistrée comme une publication (kind = 'story'), avec le même id que dans l'appli.
  await db.from('posts').upsert({ id: storyId, business_id: business.id, image_url: path, kind: 'story', media_type: kind, status: 'draft', created_by: userId }, { onConflict: 'id', ignoreDuplicates: true });
  const { data: post } = await db.from('posts').select('id').eq('id', storyId).eq('business_id', business.id).maybeSingle();
  if (!post) throw new HttpError(404, 'not_found', 'Story introuvable.');

  const publications = await publishSavedStory({ db, businessId: business.id, postId: post.id, path, kind, platforms, key, background: body.background === true });
  return json({ publications });
}));
