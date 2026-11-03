// Moteur IA : analyse de la photo + rédaction. Sortie JSON stricte, validée ici.
import { env, HttpError } from './http.ts';
import { containsInventedFacts } from './guard.ts';
import { allowedFacts, buildIdeasPrompt, IDEAS_SYSTEM_PROMPT, parseIdeas, type IdeasContext, type PostIdea } from './ideas.ts';
export { containsInventedCommercialInfo } from './guard.ts';

export const PROMPT_VERSION = 'v1-2026-11';

export const SYSTEM_PROMPT = `Tu es le community manager professionnel d'un commerce local français.
Ta mission est de transformer une photo en publication attractive, naturelle et authentique.
Tu dois :
- Analyser les éléments visibles (produit, couleurs, ambiance, saison).
- Respecter l'identité du commerce et le ton demandé.
- Écrire dans un français naturel, concis, sans clichés ni répétitions.
- Ajouter quelques emojis pertinents (2 à 4).
- Proposer 5 à 10 hashtags : locaux (ville), métier, et saisonniers si pertinents.
- Terminer par un appel à l'action simple (passer en boutique, venir découvrir...).
Règles absolues :
- N'invente JAMAIS de prix, promotion, réduction, disponibilité, horaire, stock ou caractéristique invisible sur la photo.
- N'utilise que les informations fournies par le commerçant et ce qui est visible.
- Si la photo est inexploitable (floue, sans rapport), dis-le dans improvement_tip et reste prudent.
- Adapte le vocabulaire et ce que tu mets en valeur au métier exact du commerce.
- Si la photo montre le lieu, la devanture, l'atelier ou l'équipe plutôt qu'un produit, présente ce lieu ou cette équipe en lien avec le métier, sans inventer ce qui n'est pas visible.
Réponds uniquement en JSON selon le schéma fourni.
Le texte Instagram peut être un peu plus court et visuel ; le texte Facebook un peu plus descriptif.`;

export interface AiOutput {
  photo_description: string;
  instagram_caption: string;
  facebook_caption: string;
  call_to_action: string;
  hashtags: string[];
  improvement_tip: string | null;
}

const SCHEMA = {
  name: 'vitrine_post',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['photo_description', 'instagram_caption', 'facebook_caption', 'call_to_action', 'hashtags', 'improvement_tip'],
    properties: {
      photo_description: { type: 'string' },
      instagram_caption: { type: 'string' },
      facebook_caption: { type: 'string' },
      call_to_action: { type: 'string' },
      hashtags: { type: 'array', items: { type: 'string' } },
      improvement_tip: { type: ['string', 'null'] },
    },
  },
};

type Message = { role: 'system' | 'user'; content: unknown };
type Usage = { prompt_tokens: number; completion_tokens: number };

/** Réglages du fournisseur d'IA, lus dans les secrets du serveur. */
function aiConfig() {
  // Fournisseur au choix : OpenAI par défaut, ou tout service « compatible OpenAI »
  // (ex. offre gratuite Google Gemini ou Groq) via AI_BASE_URL + AI_API_KEY + AI_MODEL.
  const apiKey = env('AI_API_KEY') ?? env('OPENAI_API_KEY');
  if (!apiKey) throw new HttpError(503, 'openai_not_configured', "L'écriture par l'IA n'est pas encore configurée.");
  // Les clés OpenAI commencent par « sk- ». Toute autre clé est traitée comme une clé Google Gemini :
  // l'adresse et le modèle sont alors choisis automatiquement.
  const isGeminiKey = !apiKey.startsWith('sk-');
  const baseUrl = (env('AI_BASE_URL') ?? (isGeminiKey ? 'https://generativelanguage.googleapis.com/v1beta/openai' : 'https://api.openai.com/v1')).replace(
    /\/$/,
    '',
  );
  const model = env('AI_MODEL') ?? env('OPENAI_MODEL') ?? (isGeminiKey ? 'gemini-3.8-flash' : 'gpt-4.1-mini');
  // Si un modèle gratuit est saturé (503), limité (429) ou trop lent, on essaie le suivant.
  const models = env('AI_MODEL') || env('OPENAI_MODEL') ? [model] : isGeminiKey ? [model, 'gemini-3.5-flash-lite', 'gemini-2.5-flash'] : [model];
  // Certains fournisseurs ne gèrent pas json_schema : AI_JSON_MODE=object -> JSON simple, validé ici.
  const jsonMode = env('AI_JSON_MODE') ?? (isGeminiKey ? 'object' : 'schema');
  return { apiKey, isGeminiKey, baseUrl, models, jsonMode, isOpenAI: baseUrl.includes('api.openai.com') };
}

/** Appel « chat » avec modèles de secours. Retourne le texte de la réponse. */
async function chatCompletion(
  messages: Message[],
  opts: { responseFormat: unknown; maxTokens: number; temperature?: number },
): Promise<{ content: string; usage?: Usage }> {
  const { apiKey, isGeminiKey, baseUrl, models } = aiConfig();
  let res: Response | undefined;
  let timedOut = false;
  for (const m of models) {
    try {
      res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        // On n'attend jamais trop longtemps un modèle : au-delà, on passe au suivant.
        signal: AbortSignal.timeout(m === models[0] ? 40_000 : 30_000),
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: m,
          temperature: opts.temperature ?? 0.8,
          // Gemini « réfléchit » avant d'écrire : on limite cette réflexion pour aller vite.
          ...(isGeminiKey ? { reasoning_effort: 'low', max_tokens: Math.max(opts.maxTokens, 4000) } : { max_tokens: opts.maxTokens }),
          response_format: opts.responseFormat,
          messages,
        }),
      });
    } catch (e) {
      console.error('[vitrine] ia délai dépassé ou réseau', baseUrl, m, e instanceof Error ? e.name : '');
      timedOut = true;
      res = undefined;
      continue;
    }
    if (res.ok) break;
    console.error('[vitrine] ia', baseUrl, m, res.status, (await res.text()).slice(0, 300));
    // Erreur de clé ou de requête : inutile d'essayer un autre modèle.
    if (![404, 429, 500, 503].includes(res.status)) break;
  }
  if (!res) throw new HttpError(504, 'ai_timeout', "L'IA met trop de temps à répondre. Réessayez dans un instant.");
  if (!res.ok) {
    if ([429, 503].includes(res.status) || timedOut) {
      throw new HttpError(503, 'ai_busy', "L'IA gratuite est très demandée en ce moment. Réessayez dans une minute.");
    }
    throw new HttpError(502, 'ai_failed', "L'IA n'a pas pu écrire votre texte. Réessayez.");
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) console.error('[vitrine] ia réponse vide', JSON.stringify(data).slice(0, 300));
  return { content: String(content ?? ''), usage: data.usage };
}

function parseJson<T>(content: string): T {
  try {
    return JSON.parse(content.replace(/^```(json)?\s*|\s*```$/g, ''));
  } catch {
    throw new HttpError(502, 'ai_failed', "L'IA a donné une réponse illisible. Réessayez.");
  }
}

export async function generate(input: { imageUrl: string; context: string; avoid: string[] }): Promise<{ out: AiOutput; usage?: Usage }> {
  const { jsonMode, isOpenAI } = aiConfig();
  const responseFormat = jsonMode === 'object' ? { type: 'json_object' } : { type: 'json_schema', json_schema: SCHEMA };
  // On envoie la photo en « data URI » : tous les fournisseurs l'acceptent (certains refusent les liens).
  const img = await fetch(input.imageUrl);
  if (!img.ok) throw new HttpError(400, 'bad_image', 'La photo est introuvable. Reprenez-la.');
  const bytes = new Uint8Array(await img.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const dataUri = `data:${img.headers.get('content-type') ?? 'image/jpeg'};base64,${btoa(bin)}`;
  const avoid = input.avoid.length ? `\nTextes déjà publiés récemment (ne pas répéter les mêmes tournures) :\n- ${input.avoid.join('\n- ')}` : '';
  const { content, usage } = await chatCompletion([
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        { type: 'text', text: input.context + avoid + `\nRéponds en JSON avec exactement ces clés : ${SCHEMA.schema.required.join(', ')}.` },
        { type: 'image_url', image_url: isOpenAI ? { url: dataUri, detail: 'low' } : { url: dataUri } },
      ],
    },
  ], { responseFormat, maxTokens: 900 });
  const out = parseJson<AiOutput>(content);
  if (!out.instagram_caption?.trim() || !Array.isArray(out.hashtags)) throw new HttpError(502, 'ai_failed', "L'IA a donné une réponse incomplète. Réessayez.");
  out.hashtags = out.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`).replace(/\s+/g, '')).slice(0, 12);
  return { out, usage };
}

export interface FoundBusiness {
  trade: string | null;
  /** Produits ou spécialités trouvés en ligne (pré-remplissage, le commerçant corrige). */
  products: string | null;
  /** Ce qui rend la boutique unique (fait maison, bio, ancienneté...), seulement si c'est écrit en ligne. */
  strengths: string | null;
  audience: string | null;
}

const EMPTY_FOUND: FoundBusiness = { trade: null, products: null, strengths: null, audience: null };

/** Nettoie un champ trouvé en ligne : vide, « inconnu » ou trop long = rien. */
function cleanFound(v: unknown, max: number): string | null {
  const t = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
  if (!t || /^(inconnu|null|aucun|non trouvé|n\/a)\.?$/i.test(t)) return null;
  return t.slice(0, max);
}

/**
 * Cherche le commerce sur internet (recherche Google de Gemini) : son métier, et si c'est écrit en ligne,
 * ses produits, ce qui le rend unique et sa clientèle. Sert seulement à PRÉ-REMPLIR l'inscription.
 * Ne marche qu'avec une clé Gemini. Modèles 2.5 : la recherche y est gratuite (500 par jour).
 */
export async function searchBusiness(input: { name: string; city: string; postalCode: string }): Promise<FoundBusiness> {
  const { apiKey, isGeminiKey } = aiConfig();
  if (!isGeminiKey) return EMPTY_FOUND;
  const prompt = `Recherche sur internet le commerce « ${input.name} » situé à ${input.city} (${input.postalCode}), en France.
Réponds UNIQUEMENT avec ce JSON, en français, sans rien d'autre :
{"trade": "son métier en 1 à 4 mots (ex. Épicerie fine, Tatoueur, Boulangerie)",
 "products": "ses principaux produits ou services, 3 à 6 éléments séparés par des virgules",
 "strengths": "ce qui le rend unique, seulement si c'est écrit sur internet (ex. fait maison, bio, depuis 1985), en quelques mots",
 "audience": "sa clientèle, seulement si c'est évident (ex. familles du quartier), en quelques mots"}
Règles : n'invente rien. Pour chaque information que tu ne trouves pas avec certitude, mets "". Ne donne jamais de prix ni d'horaires.
Si tu ne trouves pas ce commerce précis avec certitude, réponds {"trade": "", "products": "", "strengths": "", "audience": ""}.`;
  for (const model of ['gemini-2.5-flash-lite', 'gemini-2.5-flash']) {
    let res: Response;
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        signal: AbortSignal.timeout(25_000),
        headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], tools: [{ google_search: {} }] }),
      });
    } catch (e) {
      console.error('[vitrine] recherche boutique délai dépassé', model, e instanceof Error ? e.name : '');
      continue;
    }
    if (!res.ok) {
      console.error('[vitrine] recherche boutique', model, res.status, (await res.text()).slice(0, 300));
      if ([404, 429, 500, 503].includes(res.status)) continue;
      return EMPTY_FOUND;
    }
    const data = await res.json();
    const parts: { text?: string }[] = data.candidates?.[0]?.content?.parts ?? [];
    const text = parts.map((p) => p.text ?? '').join(' ');
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return EMPTY_FOUND;
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(match[0]);
    } catch {
      return EMPTY_FOUND;
    }
    const trade = cleanFound(raw.trade, 40);
    if (!trade || trade.split(/\s+/).length > 5) return EMPTY_FOUND; // commerce pas trouvé : on ne garde rien
    const found = { trade, products: cleanFound(raw.products, 300), strengths: cleanFound(raw.strengths, 200), audience: cleanFound(raw.audience, 200) };
    // Jamais de prix ni d'horaires dans ce qu'on pré-remplit.
    for (const k of ['products', 'strengths', 'audience'] as const) {
      if (found[k] && containsInventedFacts(found[k]!, '')) found[k] = null;
    }
    return found;
  }
  return EMPTY_FOUND;
}

/** Trois idées de publications adaptées à la boutique. Les idées douteuses (prix, horaires...) sont écartées. */
export async function suggestIdeas(ctx: IdeasContext): Promise<PostIdea[]> {
  const allowed = allowedFacts(ctx);
  const ask = async (extra: string) => {
    const { content } = await chatCompletion([
      { role: 'system', content: IDEAS_SYSTEM_PROMPT },
      { role: 'user', content: buildIdeasPrompt(ctx) + extra },
    ], { responseFormat: { type: 'json_object' }, maxTokens: 900, temperature: 0.9 });
    return parseIdeas(content, allowed);
  };
  let ideas = await ask('');
  if (ideas.length < 3) {
    // Une seconde chance : l'IA a donné trop peu d'idées valables.
    const again = await ask('\nATTENTION : donne bien 3 idées complètes, sans aucun prix, promotion ni horaire.');
    const titles = new Set(ideas.map((i) => i.title.toLowerCase()));
    ideas = [...ideas, ...again.filter((i) => !titles.has(i.title.toLowerCase()))].slice(0, 3);
  }
  if (!ideas.length) throw new HttpError(502, 'ai_failed', "L'IA n'a pas trouvé d'idées cette fois. Réessayez.");
  return ideas;
}

/** Choisit, dans la liste des occasions, celles qui conviennent à un métier hors catalogue. */
export async function pickOccasions(trade: string, catalog: { key: string; name: string; description: string }[]): Promise<string[]> {
  const list = catalog.map((o) => `- ${o.key} : ${o.name} (${o.description})`).join('\n');
  const { content } = await chatCompletion([
    { role: 'system', content: 'Tu aides un petit commerce français à savoir à quelles occasions commerciales il peut publier sur ses réseaux sociaux.' },
    {
      role: 'user',
      content: `Métier du commerce : ${trade}.
Voici les occasions possibles (clé : nom) :
${list}
Choisis uniquement les occasions où ce commerce a vraiment quelque chose à montrer ou à proposer.
Réponds en JSON : {"keys": ["cle1", "cle2", ...]} avec seulement des clés de la liste.`,
    },
  ], { responseFormat: { type: 'json_object' }, maxTokens: 600, temperature: 0.2 });
  const out = parseJson<{ keys?: unknown }>(content);
  const allowed = new Set(catalog.map((o) => o.key));
  return Array.isArray(out.keys) ? [...new Set(out.keys.filter((k): k is string => typeof k === 'string' && allowed.has(k)))] : [];
}
