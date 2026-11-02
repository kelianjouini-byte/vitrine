// Moteur IA : analyse de la photo + rédaction. Sortie JSON stricte, validée ici.
import { env, HttpError } from './http.ts';

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

const PRICE_PATTERN = /(\d+[.,]?\d*\s?(€|euros?)|-\s?\d+\s?%|\d+\s?%\s?(de réduction|offerts?)|promo(tion)?s?\b|soldes?\b|gratuit)/i;

/** Contrôle du contenu : refuse un texte qui contient un prix/promo non fourni par le commerçant. */
export function containsInventedCommercialInfo(text: string, merchantNote: string): boolean {
  return PRICE_PATTERN.test(text) && !PRICE_PATTERN.test(merchantNote);
}

export async function generate(
  input: { imageUrl: string; context: string; avoid: string[] },
): Promise<{ out: AiOutput; usage?: { prompt_tokens: number; completion_tokens: number } }> {
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
  // Certains fournisseurs ne gèrent pas json_schema : AI_JSON_MODE=object -> JSON simple, validé ici.
  const jsonMode = env('AI_JSON_MODE') ?? (isGeminiKey ? 'object' : 'schema');
  const responseFormat = jsonMode === 'object' ? { type: 'json_object' } : { type: 'json_schema', json_schema: SCHEMA };
  // On envoie la photo en « data URI » : tous les fournisseurs l'acceptent (certains refusent les liens).
  const img = await fetch(input.imageUrl);
  if (!img.ok) throw new HttpError(400, 'bad_image', 'La photo est introuvable. Reprenez-la.');
  const bytes = new Uint8Array(await img.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const dataUri = `data:${img.headers.get('content-type') ?? 'image/jpeg'};base64,${btoa(bin)}`;
  const isOpenAI = baseUrl.includes('api.openai.com');
  const avoid = input.avoid.length ? `\nTextes déjà publiés récemment (ne pas répéter les mêmes tournures) :\n- ${input.avoid.join('\n- ')}` : '';
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      // On n'attend jamais plus de 45 secondes : au-delà, on affiche une erreur claire.
      signal: AbortSignal.timeout(45_000),
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0.8,
        // Gemini « réfléchit » avant d'écrire : on limite cette réflexion pour aller vite.
        ...(isGeminiKey ? { reasoning_effort: 'low', max_tokens: 4000 } : { max_tokens: 900 }),
        response_format: responseFormat,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: input.context + avoid + `\nRéponds en JSON avec exactement ces clés : ${SCHEMA.schema.required.join(', ')}.` },
              { type: 'image_url', image_url: isOpenAI ? { url: dataUri, detail: 'low' } : { url: dataUri } },
            ],
          },
        ],
      }),
    });
  } catch (e) {
    console.error('[vitrine] ia délai dépassé ou réseau', baseUrl, model, e instanceof Error ? e.name : '');
    throw new HttpError(504, 'ai_timeout', "L'IA met trop de temps à répondre. Réessayez dans un instant.");
  }
  if (!res.ok) {
    console.error('[vitrine] ia', baseUrl, model, res.status, (await res.text()).slice(0, 300));
    throw new HttpError(502, 'ai_failed', "L'IA n'a pas pu écrire votre texte. Réessayez.");
  }
  const data = await res.json();
  if (!data.choices?.[0]?.message?.content) console.error('[vitrine] ia réponse vide', model, JSON.stringify(data).slice(0, 300));
  let out: AiOutput;
  try {
    out = JSON.parse(String(data.choices[0].message.content).replace(/^```(json)?\s*|\s*```$/g, ''));
  } catch {
    throw new HttpError(502, 'ai_failed', "L'IA a donné une réponse illisible. Réessayez.");
  }
  if (!out.instagram_caption?.trim() || !Array.isArray(out.hashtags)) throw new HttpError(502, 'ai_failed', "L'IA a donné une réponse incomplète. Réessayez.");
  out.hashtags = out.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`).replace(/\s+/g, '')).slice(0, 12);
  return { out, usage: data.usage };
}
