// POST { image_paths[] (ou image_path), post_id?, occasion?, merchant_note?, trade_hint?, idea?, tone?, format? }
// -> { postId, instagramCaption, facebookCaption, hashtags, callToAction, photoDescription, improvementTip }
// format = 'reel' : la photo est une image tirée d'une vidéo courte (Reel).
// POST { mode: 'overlay', image_path, occasion?, merchant_note?, trade_hint? } -> { text, emojis }
// Petit texte posé sur la photo ou la vidéo (story, Reel). Aucun post n'est créé.
import { requireAccess } from '../_shared/access.ts';
import { handler, json, HttpError } from '../_shared/http.ts';
import { requireMerchant, rateLimit } from '../_shared/db.ts';
import { generate, PROMPT_VERSION, containsInventedCommercialInfo, writeOverlay } from '../_shared/openai.ts';
import { readImagePaths } from '../_shared/photos.ts';
import { findAdWords, toTone } from '../_shared/prompts.ts';

/** Nombre de photos envoyées à l'IA (les suivantes sont publiées mais pas analysées). */
const AI_MAX_IMAGES = 3;

Deno.serve(handler(async (req) => {
  const { db, userId, business, company } = await requireMerchant(req);
  await requireAccess(db, company);
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
  // Ton : celui choisi sur la page photo (« Changer le ton »), sinon celui de la boutique, sinon Premium.
  const tone = toTone(body.tone ?? business.tone);

  // Limitation des coûts : 40 appels à l'IA / heure / boutique (texte du post + petit texte sur l'image).
  await rateLimit(db, 'ai_generations', business.id, 40, 60);

  if (body.mode === 'overlay') {
    const { data: signed } = await db.storage.from('post-images').createSignedUrl(imagePath, 600);
    if (!signed?.signedUrl) throw new HttpError(400, 'bad_image', 'La photo est introuvable. Reprenez-la.');
    const context = [
      `Commerce : ${business.business_name} à ${business.city}.`,
      `Métier exact : ${business.trade || business.business_type}.`,
      tradeHint ? `Ce que ce métier met en valeur : ${tradeHint}` : '',
      body.occasion?.name ? `Occasion commerciale : ${String(body.occasion.name).slice(0, 80)}.` : '',
      merchantNote ? `Idées du commerçant : « ${merchantNote} ».` : '',
      body.format === 'video' ? 'L\'image est tirée d\'une vidéo courte.' : '',
    ].filter(Boolean).join('\n');
    const inputData = { mode: 'overlay', image_path: imagePath, merchant_note: merchantNote };
    try {
      const out = await writeOverlay({ imageUrl: signed.signedUrl, context, merchantNote });
      await db.from('ai_generations').insert({ business_id: business.id, prompt_version: 'overlay-v1', input_data: inputData, output_data: out });
      return json(out);
    } catch (e) {
      await db.from('ai_generations').insert({ business_id: business.id, prompt_version: 'overlay-v1', input_data: inputData, error: e instanceof Error ? e.message : 'erreur' });
      throw e;
    }
  }

  // L'IA regarde les 3 premières photos : assez pour comprendre le carrousel, et ça reste rapide et gratuit.
  const seen = imagePaths.slice(0, AI_MAX_IMAGES);
  const { data: signedList, error: signErr } = await db.storage.from('post-images').createSignedUrls(seen, 600);
  const imageUrls = (signedList ?? []).map((x) => x.signedUrl).filter((u): u is string => !!u);
  if (signErr || imageUrls.length !== seen.length) throw new HttpError(400, 'bad_image', 'Une photo est introuvable. Reprenez-la.');

  // Post : on crée le brouillon ou on réutilise celui qui existe (bouton « Refaire »).
  let postId: string | undefined = body.post_id;
  const { data: existing } = postId ? await db.from('posts').select('id').eq('id', postId).eq('business_id', business.id).maybeSingle() : { data: null };
  if (!existing) {
    const { data: created, error } = await db.from('posts').insert({ ...(postId && /^[0-9a-f-]{36}$/.test(postId) ? { id: postId } : {}), business_id: business.id, created_by: userId, image_url: imagePath, image_urls: imagePaths, status: 'generating', occasion: body.occasion?.name ?? null }).select('id').single();
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
    business.specialties ? `Produits et spécialités : ${business.specialties}.` : '',
    business.strengths ? `Ce qui rend la boutique unique : ${business.strengths}.` : '',
    business.description ? `Présentation : ${business.description}.` : '',
    business.audience ? `Clientèle : ${business.audience}.` : '',
    body.format === 'reel'
      ? 'Publication VIDÉO courte (Reel) : l\'image est tirée de la vidéo. Écris le texte qui accompagne la vidéo, sans dire « photo », sans parler de ce que tu ne vois pas, et sans écrire les mots « Reel » ou « vidéo ».'
      : '',
    imagePaths.length > 1
      ? `Publication en carrousel de ${imagePaths.length} photos qui défilent${imagePaths.length > seen.length ? ` (tu vois les ${seen.length} premières)` : ''} : écris UN texte qui présente l'ensemble, sans décrire les photos une par une ni parler de ce que tu ne vois pas.`
      : '',
    idea?.title ? `Idée de publication choisie par le commerçant (le texte doit suivre cette idée, si la photo y correspond) : ${idea.title}${idea.why ? ` — ${idea.why}` : ''}` : '',
    body.occasion ? `Occasion commerciale : ${body.occasion.name} (${body.occasion.date}).` : 'Pas d\'occasion particulière.',
    merchantNote
      ? `Idées du commerçant pour ce post, écrites en vrac : « ${merchantNote} ».\nIntègre TOUTES ces idées dans le texte, reformulées avec tes mots et dans le ton demandé (pas besoin de reprendre ses mots exacts).\nExceptions : recopie exactement les prix, dates, horaires et promotions qu'il donne. Ce sont les seules infos commerciales autorisées.`
      : 'Le commerçant n\'a donné aucune idée ni information commerciale (prix, promo...).',
    `Date du jour : ${new Date().toISOString().slice(0, 10)}.`,
  ].filter(Boolean).join('\n');

  const inputData = { image_path: imagePath, image_paths: imagePaths, occasion: body.occasion ?? null, merchant_note: merchantNote, idea, tone };
  try {
    let { out, usage } = await generate({ imageUrls, context, avoid, tone });
    // Contrôle du contenu : une seconde tentative si l'IA a inventé un prix / une promo, ou utilisé des mots « pub ».
    const textOf = (o: typeof out) => o.instagram_caption + '\n' + o.facebook_caption;
    const invented = containsInventedCommercialInfo(textOf(out), merchantNote);
    const adWords = findAdWords(textOf(out));
    if (invented || adWords.length) {
      const fix = [
        invented ? 'ta proposition précédente mentionnait un prix ou une promotion. Retire toute information commerciale.' : '',
        adWords.length ? `ta proposition précédente utilisait des mots interdits (${adWords.join(', ')}). Réécris sans eux, avec des mots précis et concrets.` : '',
      ].filter(Boolean).join(' Et ');
      // Seulement des mots « pub » : si le second essai échoue, on garde le premier texte (le commerçant peut le modifier).
      const second = await generate({ imageUrls, context: context + `\nATTENTION : ${fix}`, avoid, tone }).catch((e) => { if (invented) throw e; return null; });
      if (second) {
        const secondInvented = containsInventedCommercialInfo(textOf(second.out), merchantNote);
        if (invented && secondInvented) throw new HttpError(502, 'ai_failed', "L'IA n'a pas proposé un texte satisfaisant. Réessayez.");
        // On garde le meilleur des deux essais.
        if (invented || (!secondInvented && findAdWords(textOf(second.out)).length <= adWords.length)) ({ out, usage } = second);
      }
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
