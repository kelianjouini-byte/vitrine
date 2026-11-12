// POST { post_id, caption, hashtags[], platforms[], image_paths[]?, video_path?, cover_path?, idempotency_key }
// video_path : Reel (vidéo courte, texte et musique déjà dedans) ; cover_path : image tirée de la vidéo.
// -> { publications: [{ platform, status, url, error, publishedAt }] }
// background: true -> réponse immédiate (status « pending ») ; le serveur finit l'envoi tout seul.
// Idempotent : une publication déjà réussie n'est JAMAIS renvoyée à Meta (voir _shared/publish.ts).
// Un employé sans « Publie seul » ne publie pas : il envoie le post à son patron (fonction team, action submit).
import { requireAccess } from '../_shared/access.ts';
import { handler, json, HttpError } from '../_shared/http.ts';
import { requireMerchant } from '../_shared/db.ts';
import { readImagePaths, readReelPaths } from '../_shared/photos.ts';
import { metaConfig } from '../_shared/meta.ts';
import { readPlatforms } from '../_shared/publish.ts';
import { publishSavedPost } from '../_shared/publishCore.ts';
import { needsApproval } from '../_shared/teamServer.ts';

Deno.serve(handler(async (req) => {
  metaConfig(); // lève meta_not_configured si les secrets Meta manquent
  const { db, userId, business, company, member } = await requireMerchant(req);
  needsApproval(member);
  await requireAccess(db, company);
  const body = await req.json().catch(() => ({}));
  const platforms = readPlatforms(body.platforms);
  const caption = String(body.caption ?? '').trim().slice(0, 2000);
  const hashtags = (Array.isArray(body.hashtags) ? body.hashtags : []).map(String).slice(0, 30);
  const key = String(body.idempotency_key ?? '');
  if (!platforms.length || !caption || key.length < 16) throw new HttpError(400, 'bad_request', 'Publication incomplète.');
  // Photos envoyées par l'appli : le commerçant a pu les changer (ordre, ajout, retrait) après le texte.
  const reel = readReelPaths(body, userId);
  const paths = reel ? [] : readImagePaths(body, userId, false);
  const publications = await publishSavedPost({ db, businessId: business.id, postId: String(body.post_id ?? ''), caption, hashtags, platforms, paths, reel, key, background: body.background === true, createdBy: userId });
  return json({ publications });
}));
