// POST { image_path, post_id?, occasion?, merchant_note? }
// -> { postId, instagramCaption, facebookCaption, hashtags, callToAction, photoDescription, improvementTip }
import { handler, json, HttpError } from '../_shared/http.ts';
import { requireMerchant, rateLimit } from '../_shared/db.ts';
import { generate, PROMPT_VERSION, containsInventedCommercialInfo } from '../_shared/openai.ts';

Deno.serve(handler(async (req) => {
  const { db, userId, business } = await requireMerchant(req);
  const body = await req.json().catch(() => ({}));
  const imagePath = String(body.image_path ?? '');
  // L'image doit être dans le dossier de l'utilisateur (validation d'accès).
  if (!imagePath.startsWith(`${userId}/`) || imagePath.includes('..')) throw new HttpError(400, 'bad_image', 'Photo invalide.');
  const merchantNote = String(body.merchant_note ?? '').slice(0, 500);
  // Consigne du catalogue des métiers (src/lib/trades.ts), envoyée par l'app.
  const tradeHint = String(body.trade_hint ?? '').slice(0, 300);

  // Limitation des coûts : 20 générations / heure / boutique (les limites par offre viendront de public.plans).
  await rateLimit(db, 'ai_generations', business.id, 20, 60);

  const { data: signed, error: signErr } = await db.storage.from('post-images').createSignedUrl(imagePath, 600);
  if (signErr || !signed) throw new HttpError(400, 'bad_image', 'La photo est introuvable. Reprenez-la.');

  // Post : on crée le brouillon ou on réutilise celui qui existe (bouton « Refaire »).
  let postId: string | undefined = body.post_id;
  const { data: existing } = postId ? await db.from('posts').select('id').eq('id', postId).eq('business_id', business.id).maybeSingle() : { data: null };
  if (!existing) {
    const { data: created, error } = await db.from('posts').insert({ ...(postId && /^[0-9a-f-]{36}$/.test(postId) ? { id: postId } : {}), business_id: business.id, image_url: imagePath, status: 'generating', occasion: body.occasion?.name ?? null }).select('id').single();
    if (error) throw new HttpError(500, 'db', 'Impossible de préparer la publication.');
    postId = created.id;
  } else {
    await db.from('posts').update({ status: 'generating' }).eq('id', postId);
  }

  // Personnalisation progressive : on évite de répéter les derniers textes.
  const { data: recent } = await db.from('posts').select('instagram_caption').eq('business_id', business.id).not('instagram_caption', 'is', null).order('created_at', { ascending: false }).limit(5);
  const avoid = (recent ?? []).map((r) => String(r.instagram_caption).slice(0, 140));

  const context = [
    `Commerce : ${business.business_name} à ${business.city} (${business.postal_code}).`,
    `Métier exact : ${business.trade || business.business_type}.`,
    tradeHint ? `Ce que ce métier met en valeur : ${tradeHint}` : '',
    `Ton souhaité : ${business.tone}.`,
    business.specialties ? `Spécialités : ${business.specialties}.` : '',
    business.description ? `Présentation : ${business.description}.` : '',
    business.audience ? `Clientèle : ${business.audience}.` : '',
    body.occasion ? `Occasion commerciale : ${body.occasion.name} (${body.occasion.date}).` : 'Pas d\'occasion particulière.',
    merchantNote ? `Informations données par le commerçant (seules infos commerciales autorisées) : ${merchantNote}` : 'Le commerçant n\'a donné aucune information commerciale (prix, promo...).',
    `Date du jour : ${new Date().toISOString().slice(0, 10)}.`,
  ].filter(Boolean).join('\n');

  const inputData = { image_path: imagePath, occasion: body.occasion ?? null, merchant_note: merchantNote };
  try {
    let { out, usage } = await generate({ imageUrl: signed.signedUrl, context, avoid });
    // Contrôle du contenu : une seconde tentative si l'IA a inventé un prix / une promo.
    if (containsInventedCommercialInfo(out.instagram_caption + out.facebook_caption, merchantNote)) {
      ({ out, usage } = await generate({ imageUrl: signed.signedUrl, context: context + '\nATTENTION : ta proposition précédente mentionnait un prix ou une promotion. Retire toute information commerciale.', avoid }));
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
