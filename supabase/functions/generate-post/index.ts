// POST { image_paths[] (ou image_path), post_id?, occasion?, merchant_note?, trade_hint?, idea? }
// -> { postId, instagramCaption, facebookCaption, hashtags, callToAction, photoDescription, improvementTip }
import { handler, json, HttpError } from '../_shared/http.ts';
import { requireMerchant, rateLimit } from '../_shared/db.ts';
import { generate, PROMPT_VERSION, containsInventedCommercialInfo } from '../_shared/openai.ts';
import { readImagePaths } from '../_shared/photos.ts';

/** Nombre de photos envoyées à l'IA (les suivantes sont publiées mais pas analysées). */
const AI_MAX_IMAGES = 3;

Deno.serve(handler(async (req) => {
  const { db, userId, business } = await requireMerchant(req);
  const body = await req.json().catch(() => ({}));
  // Photos du carrousel, dans l'ordre (une seule pour un post classique).
  const imagePaths = readImagePaths(body, userId);
  const imagePath = imagePaths[0];
  const merchantNote = String(body.merchant_note ?? '').slice(0, 500);
  // Consigne du catalogue des métiers (src/lib/trades.ts), envoyée par l'app.
  const tradeHint = String(body.trade_hint ?? '').slice(0, 300);
  // Idée choisie dans l'assistant « Je ne sais pas quoi poster » : le texte suit cette idée.
  const idea = body.idea && typeof body.idea === 'object'
    ? { title: String(body.idea.title ?? '').slice(0, 80), why: String(body.idea.why ?? '').slice(0, 240) }
    : null;

  // Limitation des coûts : 20 générations / heure / boutique (les limites par offre viendront de public.plans).
  await rateLimit(db, 'ai_generations', business.id, 20, 60);

  // L'IA regarde les 3 premières photos : assez pour comprendre le carrousel, et ça reste rapide et gratuit.
  const seen = imagePaths.slice(0, AI_MAX_IMAGES);
  const { data: signedList, error: signErr } = await db.storage.from('post-images').createSignedUrls(seen, 600);
  const imageUrls = (signedList ?? []).map((x) => x.signedUrl).filter((u): u is string => !!u);
  if (signErr || imageUrls.length !== seen.length) throw new HttpError(400, 'bad_image', 'Une photo est introuvable. Reprenez-la.');

  // Post : on crée le brouillon ou on réutilise celui qui existe (bouton « Refaire »).
  let postId: string | undefined = body.post_id;
  const { data: existing } = postId ? await db.from('posts').select('id').eq('id', postId).eq('business_id', business.id).maybeSingle() : { data: null };
  if (!existing) {
    const { data: created, error } = await db.from('posts').insert({ ...(postId && /^[0-9a-f-]{36}$/.test(postId) ? { id: postId } : {}), business_id: business.id, image_url: imagePath, image_urls: imagePaths, status: 'generating', occasion: body.occasion?.name ?? null }).select('id').single();
    if (error) throw new HttpError(500, 'db', 'Impossible de préparer la publication.');
    postId = created.id;
  } else {
    // Le commerçant a pu changer les photos avant de demander un nouveau texte.
    await db.from('posts').update({ status: 'generating', image_url: imagePath, image_urls: imagePaths }).eq('id', postId);
  }

  // Personnalisation progressive : on évite de répéter les derniers textes.
  const { data: recent } = await db.from('posts').select('instagram_caption').eq('business_id', business.id).not('instagram_caption', 'is', null).order('created_at', { ascending: false }).limit(5);
  const avoid = (recent ?? []).map((r) => String(r.instagram_caption).slice(0, 140));

  const context = [
    `Commerce : ${business.business_name} à ${business.city} (${business.postal_code}).`,
    `Métier exact : ${business.trade || business.business_type}.`,
    tradeHint ? `Ce que ce métier met en valeur : ${tradeHint}` : '',
    `Ton souhaité : ${business.tone}.`,
    business.specialties ? `Produits et spécialités : ${business.specialties}.` : '',
    business.strengths ? `Ce qui rend la boutique unique : ${business.strengths}.` : '',
    business.description ? `Présentation : ${business.description}.` : '',
    business.audience ? `Clientèle : ${business.audience}.` : '',
    imagePaths.length > 1
      ? `Publication en carrousel de ${imagePaths.length} photos qui défilent${imagePaths.length > seen.length ? ` (tu vois les ${seen.length} premières)` : ''} : écris UN texte qui présente l'ensemble, sans décrire les photos une par une ni parler de ce que tu ne vois pas.`
      : '',
    idea?.title ? `Idée de publication choisie par le commerçant (le texte doit suivre cette idée, si la photo y correspond) : ${idea.title}${idea.why ? ` — ${idea.why}` : ''}` : '',
    body.occasion ? `Occasion commerciale : ${body.occasion.name} (${body.occasion.date}).` : 'Pas d\'occasion particulière.',
    merchantNote ? `Informations données par le commerçant (seules infos commerciales autorisées) : ${merchantNote}` : 'Le commerçant n\'a donné aucune information commerciale (prix, promo...).',
    `Date du jour : ${new Date().toISOString().slice(0, 10)}.`,
  ].filter(Boolean).join('\n');

  const inputData = { image_path: imagePath, image_paths: imagePaths, occasion: body.occasion ?? null, merchant_note: merchantNote, idea };
  try {
    let { out, usage } = await generate({ imageUrls, context, avoid });
    // Contrôle du contenu : une seconde tentative si l'IA a inventé un prix / une promo.
    if (containsInventedCommercialInfo(out.instagram_caption + out.facebook_caption, merchantNote)) {
      ({ out, usage } = await generate({ imageUrls, context: context + '\nATTENTION : ta proposition précédente mentionnait un prix ou une promotion. Retire toute information commerciale.', avoid }));
      if (containsInventedCommercialInfo(out.instagram_caption + out.facebook_caption, merchantNote)) throw new HttpError(502, 'ai_failed', "L'IA n'a pas proposé un texte satisfaisant. Réessayez.");
    }
    await db.from('ai_generations').insert({ business_id: business.id, post_id: postId, prompt_version: PROMPT_VERSION, input_data: inputData, output_data: out, tokens_in: usage?.prompt_tokens, tokens_out: usage?.completion_tokens });
    await db.from('posts').update({ instagram_caption: out.instagram_caption, facebook_caption: out.facebook_caption, hashtags: out.hashtags, status: 'awaiting_approval' }).eq('id', postId);
    return json({
      postId,
      instagramCaption: out.instagram_caption,
      facebookCaption: out.facebook_caption,
      hashtags: out.hashtags,
      callToAction: out.call_to_action,
      photoDescription: out.photo_description,
      improvementTip: out.improvement_tip,
    });
  } catch (e) {
    await db.from('ai_generations').insert({ business_id: business.id, post_id: postId, prompt_version: PROMPT_VERSION, input_data: inputData, error: e instanceof Error ? e.message : 'erreur' });
    await db.from('posts').update({ status: 'draft' }).eq('id', postId);
    throw e;
  }
}));
