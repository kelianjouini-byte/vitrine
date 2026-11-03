// Moteur IA : analyse de la photo + rédaction. Sortie JSON stricte, validée ici.
import { env, HttpError } from './http.ts';
import { containsInventedFacts } from './guard.ts';
import { buildReportPrompt, parseAdvice, REPORT_SYSTEM_PROMPT, type ReportContext } from './report.ts';
import { allowedFacts, buildIdeasPrompt, IDEAS_SYSTEM_PROMPT, parseIdeas, type IdeasContext, type PostIdea } from './ideas.ts';
export { containsInventedCommercialInfo } from './guard.ts';
import { normalizePost, type AiOutput } from './post.ts';
import { buildPostSystemPrompt } from './prompts.ts';
export type { AiOutput } from './post.ts';

export const PROMPT_VERSION = 'v2-2026-11';

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

/** Un « chemin » vers une IA : une adresse, une clé, un modèle. */
type Route = { label: string; baseUrl: string; apiKey: string; model: string; gemini: boolean; extra?: Record<string, unknown> };

/**
 * Réglages des IA, lus dans les secrets du serveur. Plusieurs IA peuvent être branchées :
 * elles sont essayées dans l'ordre (la suivante démarre si la précédente échoue ou tarde).
 * - GROQ_API_KEY (facultatif, gratuit) : Groq en premier, très rapide. Modèle : GROQ_MODEL.
 * - AI_API_KEY : Google Gemini (clé qui ne commence pas par « sk- ») ou OpenAI (« sk- »),
 *   ou tout service « compatible OpenAI » via AI_BASE_URL + AI_MODEL.
 */
function aiConfig() {
  const routes: Route[] = [];
  const groqKey = env('GROQ_API_KEY');
  if (groqKey) {
    routes.push({ label: 'groq', baseUrl: 'https://api.groq.com/openai/v1', apiKey: groqKey, model: env('GROQ_MODEL') ?? 'qwen/qwen3.8-27b', gemini: false,
      // Le modèle Qwen « réfléchit » avant d'écrire : on cache cette réflexion (réponse JSON propre).
      extra: { reasoning_format: 'hidden' } });
  }
  const apiKey = env('AI_API_KEY') ?? env('OPENAI_API_KEY');
  // Les clés OpenAI commencent par « sk- ». Toute autre clé est traitée comme une clé Google Gemini.
  const isGeminiKey = !!apiKey && !apiKey.startsWith('sk-');
  if (apiKey) {
    const baseUrl = (env('AI_BASE_URL') ?? (isGeminiKey ? 'https://generativelanguage.googleapis.com/v1beta/openai' : 'https://api.openai.com/v1')).replace(/\/$/, '');
    const gemini = baseUrl.includes('generativelanguage.googleapis.com');
    const model = env('AI_MODEL') ?? env('OPENAI_MODEL') ?? (gemini ? 'gemini-3.8-flash' : 'gpt-4.1-mini');
    routes.push({ label: 'principal', baseUrl, apiKey, model, gemini });
    // Modèle de secours du même fournisseur (AI_FALLBACK_MODEL ; Gemini : gemini-3.5-flash-lite par défaut).
    const fallback = env('AI_FALLBACK_MODEL') ?? (gemini && !env('AI_MODEL') && !env('OPENAI_MODEL') ? 'gemini-3.5-flash-lite' : undefined);
    if (fallback && fallback !== model) routes.push({ label: 'secours', baseUrl, apiKey, model: fallback, gemini });
  }
  if (!routes.length) throw new HttpError(503, 'openai_not_configured', "L'écriture par l'IA n'est pas encore configurée.");
  // json_schema n'est compris que par OpenAI : ailleurs, JSON simple validé ici (AI_JSON_MODE=object pour forcer).
  const onlyOpenAI = routes.every((r) => r.baseUrl.includes('api.openai.com'));
  const jsonMode = env('AI_JSON_MODE') ?? (onlyOpenAI ? 'schema' : 'object');
  return { routes, jsonMode, geminiKey: isGeminiKey ? apiKey! : undefined };
}

/** Au-delà de ce délai sans réponse, on lance aussi le modèle de secours (le premier qui répond bien gagne). */
const HEDGE_AFTER_MS = 7_000;
/** Délai maximum pour un modèle. */
const MODEL_TIMEOUT_MS = 20_000;

type Attempt = { ok: true; content: string; usage?: Usage } | { ok: false; status: number | 'timeout' };

/**
 * Appel « chat » rapide et fiable :
 * - on interroge la première IA branchée (Groq si sa clé existe, sinon Gemini) ;
 * - s'il échoue (saturé, réponse illisible...) ou n'a pas répondu après 7 s, on interroge aussi la suivante, et ainsi de suite ;
 * - la première réponse VALIDE est gardée, l'autre appel est annulé.
 * `valid` vérifie la réponse : une réponse incomplète compte comme un échec (on passe au modèle suivant).
 */
async function chatCompletion(
  messages: Message[],
  opts: { responseFormat: unknown; maxTokens: number; temperature?: number; valid?: (content: string) => boolean },
): Promise<{ content: string; usage?: Usage }> {
  const { routes } = aiConfig();
  const controllers = routes.map(() => new AbortController());
  const t0 = Date.now();

  const call = async (i: number): Promise<Attempt> => {
    const { baseUrl, apiKey, model: m, gemini, label, extra } = routes[i];
    const timer = setTimeout(() => controllers[i].abort(), MODEL_TIMEOUT_MS);
    const send = (withExtra: boolean) => fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controllers[i].signal,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: m,
        temperature: opts.temperature ?? 0.8,
        // Gemini « réfléchit » avant d'écrire : on limite cette réflexion pour aller vite.
        ...(gemini ? { reasoning_effort: 'low', max_tokens: Math.max(opts.maxTokens, 4000) } : { max_tokens: Math.max(opts.maxTokens, 2000) }),
        ...(withExtra ? extra : {}),
        response_format: opts.responseFormat,
        messages,
      }),
    });
    try {
      let res = await send(true);
      // Réglage refusé par le modèle (400) : on réessaie une fois sans ce réglage.
      if (res.status === 400 && extra) {
        console.error('[vitrine] ia', label, m, '400 avec réglages, nouvel essai sans', (await res.text()).slice(0, 200));
        res = await send(false);
      }
      if (!res.ok) {
        console.error('[vitrine] ia', label, m, res.status, `${Date.now() - t0} ms`, (await res.text()).slice(0, 200));
        return { ok: false, status: res.status };
      }
      const data = await res.json();
      // Certains modèles écrivent leur réflexion entre <think> et </think> avant la réponse : on la retire.
      const content = String(data.choices?.[0]?.message?.content ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      if (!content || (opts.valid && !opts.valid(content))) {
        console.error('[vitrine] ia réponse inutilisable', label, m, `${Date.now() - t0} ms`, content.slice(0, 200));
        return { ok: false, status: 502 };
      }
      console.log('[vitrine] ia ok', label, m, `${Date.now() - t0} ms`);
      return { ok: true, content, usage: data.usage };
    } catch (e) {
      console.error('[vitrine] ia délai dépassé ou réseau', label, m, `${Date.now() - t0} ms`, e instanceof Error ? e.name : '');
      return { ok: false, status: 'timeout' };
    } finally {
      clearTimeout(timer);
    }
  };

  return await new Promise((resolve, reject) => {
    const failures: Attempt[] = [];
    let started = 0;
    let settled = false;
    let hedge: ReturnType<typeof setTimeout> | undefined;
    const startNext = () => {
      if (settled || started >= routes.length) return;
      const i = started++;
      clearTimeout(hedge);
      // Si cette IA n'a pas répondu à temps, on lance aussi la suivante (la première bonne réponse gagne).
      hedge = setTimeout(startNext, HEDGE_AFTER_MS);
      call(i).then((r) => {
        if (settled) return;
        if (r.ok) {
          settled = true;
          clearTimeout(hedge);
          controllers.forEach((c, j) => j !== i && c.abort());
          resolve({ content: r.content, usage: r.usage });
          return;
        }
        failures.push(r);
        // Une erreur de clé sur une IA n'empêche pas d'essayer les autres (elles ont leur propre clé).
        if (started < routes.length) return startNext();
        if (failures.length >= started) {
          settled = true;
          clearTimeout(hedge);
          const busy = failures.some((f) => !f.ok && (f.status === 429 || f.status === 503 || f.status === 'timeout'));
          reject(busy
            ? new HttpError(503, 'ai_busy', "L'IA gratuite est très demandée en ce moment. Réessayez dans une minute.")
            : new HttpError(502, 'ai_failed', "L'IA n'a pas pu écrire votre texte. Réessayez."));
        }
      });
    };
    startNext();
  });
}

function parseJson<T>(content: string): T {
  try {
    return JSON.parse(content.replace(/^```(json)?\s*|\s*```$/g, ''));
  } catch {
    throw new HttpError(502, 'ai_failed', "L'IA a donné une réponse illisible. Réessayez.");
  }
}

export async function generate(input: { imageUrls: string[]; context: string; avoid: string[]; tone: string }): Promise<{ out: AiOutput; usage?: Usage }> {
  const { jsonMode, routes } = aiConfig();
  const isOpenAI = routes[0].baseUrl.includes('api.openai.com');
  const responseFormat = jsonMode === 'object' ? { type: 'json_object' } : { type: 'json_schema', json_schema: SCHEMA };
  // On envoie les photos en « data URI » : tous les fournisseurs l'acceptent (certains refusent les liens).
  const dataUris = await Promise.all(input.imageUrls.map(toDataUri));
  const avoid = input.avoid.length ? `\nTextes déjà publiés récemment (ne pas répéter les mêmes tournures) :\n- ${input.avoid.join('\n- ')}` : '';
  const { content, usage } = await chatCompletion([
    { role: 'system', content: buildPostSystemPrompt(input.tone) },
    {
      role: 'user',
      content: [
        { type: 'text', text: input.context + avoid + `\nRéponds en JSON avec exactement ces clés : ${SCHEMA.schema.required.join(', ')}.` },
        ...dataUris.map((url) => ({ type: 'image_url', image_url: isOpenAI ? { url, detail: 'low' } : { url } })),
      ],
    },
  ], { responseFormat, maxTokens: 900, valid: (c) => normalizePost(c) !== null });
  // Une réponse inutilisable a déjà été écartée : on passe alors au modèle de secours.
  const out = normalizePost(content);
  if (!out) throw new HttpError(502, 'ai_failed', "L'IA n'a pas pu écrire votre texte. Réessayez.");
  return { out, usage };
}

/** Télécharge une photo du stockage et la transforme en « data URI ». */
async function toDataUri(url: string): Promise<string> {
  const img = await fetch(url);
  if (!img.ok) throw new HttpError(400, 'bad_image', 'La photo est introuvable. Reprenez-la.');
  const bytes = new Uint8Array(await img.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${img.headers.get('content-type') ?? 'image/jpeg'};base64,${btoa(bin)}`;
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
 * Ne marche qu'avec une clé Gemini.
 */
export async function searchBusiness(input: { name: string; city: string; postalCode: string }): Promise<FoundBusiness> {
  const { geminiKey: apiKey } = aiConfig();
  if (!apiKey) return EMPTY_FOUND;
  const prompt = `Recherche sur internet le commerce « ${input.name} » situé à ${input.city} (${input.postalCode}), en France.
Réponds UNIQUEMENT avec ce JSON, en français, sans rien d'autre :
{"trade": "son métier en 1 à 4 mots (ex. Épicerie fine, Tatoueur, Boulangerie)",
 "products": "ses principaux produits ou services, 3 à 6 éléments séparés par des virgules",
 "strengths": "ce qui le rend unique, seulement si c'est écrit sur internet (ex. fait maison, bio, depuis 1985), en quelques mots",
 "audience": "sa clientèle, seulement si c'est évident (ex. familles du quartier), en quelques mots"}
Règles : n'invente rien. Pour chaque information que tu ne trouves pas avec certitude, mets "". Ne donne jamais de prix ni d'horaires.
Si tu ne trouves pas ce commerce précis avec certitude, réponds {"trade": "", "products": "", "strengths": "", "audience": ""}.`;
  // Les modèles 2.5 ne sont plus ouverts aux nouveaux comptes (erreur 404 constatée le 3 nov. 2026).
  for (const model of ['gemini-3.5-flash-lite', 'gemini-3.8-flash']) {
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
    ], { responseFormat: { type: 'json_object' }, maxTokens: 900, temperature: 0.9, valid: (c) => parseIdeas(c, allowed).length > 0 });
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
  ], { responseFormat: { type: 'json_object' }, maxTokens: 600, temperature: 0.2, valid: (c) => { try { return Array.isArray(JSON.parse(c.replace(/^```(json)?\s*|\s*```$/g, '')).keys); } catch { return false; } } });
  const out = parseJson<{ keys?: unknown }>(content);
  const allowed = new Set(catalog.map((o) => o.key));
  return Array.isArray(out.keys) ? [...new Set(out.keys.filter((k): k is string => typeof k === 'string' && allowed.has(k)))] : [];
}

/** « Mon bilan » : un conseil simple pour le mois suivant. Un conseil douteux (chiffre inventé, prix...) est écarté. */
export async function writeAdvice(ctx: ReportContext): Promise<string> {
  const { content } = await chatCompletion([
    { role: 'system', content: REPORT_SYSTEM_PROMPT },
    { role: 'user', content: buildReportPrompt(ctx) },
  ], { responseFormat: { type: 'json_object' }, maxTokens: 400, temperature: 0.7, valid: (c) => parseAdvice(c, ctx) !== null });
  const advice = parseAdvice(content, ctx);
  if (!advice) throw new HttpError(502, 'ai_failed', "L'IA n'a pas pu écrire votre conseil. Réessayez.");
  return advice;
}
