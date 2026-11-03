// Assistant d'idées de posts : consignes pour l'IA + lecture de sa réponse.
// Fichier pur (aucune dépendance Deno) : testé avec node --test.
import { containsInventedFacts } from './guard.ts';

export const IDEAS_PROMPT_VERSION = 'ideas-v1-2026-11';

export interface PostIdea {
  /** Ce qu'on publie, en quelques mots (« Le pain du matin qui sort du four »). */
  title: string;
  /** Ce qu'il faut prendre en photo, concrètement. */
  photo: string;
  /** Pourquoi c'est une bonne idée maintenant. */
  why: string;
}

export interface IdeasContext {
  businessName: string;
  trade: string;
  city: string;
  tone: string;
  products?: string | null;
  strengths?: string | null;
  audience?: string | null;
  description?: string | null;
  tradeHint?: string | null;
  /** Prochaines occasions du calendrier Vitrine (nom + date AAAA-MM-JJ). */
  occasions: { name: string; date: string }[];
  /** Début des derniers textes publiés, du plus récent au plus ancien. */
  recentPosts: string[];
  liked: string[];
  disliked: string[];
  today: string;
}

export const IDEAS_SYSTEM_PROMPT = `Tu es le community manager d'un petit commerce local français.
Le commerçant ne sait pas quoi publier. Tu lui proposes exactement 3 idées de publications pour Instagram et Facebook.
Chaque idée doit être :
- faisable tout de suite avec une seule photo prise au téléphone, dans sa boutique ;
- adaptée à SON métier, SES produits, ce qui le rend unique et SA clientèle ;
- différente des deux autres (par exemple : un produit, les coulisses ou le savoir-faire, une occasion ou la saison) ;
- différente de ce qu'il a publié récemment.
Règles absolues :
- N'invente JAMAIS de prix, promotion, réduction, horaire, disponibilité ou stock.
- Ne cite un produit précis que s'il fait partie de ses produits ou qu'il est typique de son métier.
- Écris en français simple, chaleureux, sans jargon (pas de « engagement », « reach », « story », « hashtag »).
- Le titre fait moins de 60 caractères. « photo » dit concrètement quoi photographier (une phrase). « why » explique en une phrase pourquoi c'est le bon moment ou pourquoi les clients vont aimer.
Réponds uniquement en JSON : {"ideas": [{"title": "...", "photo": "...", "why": "..."}, ...]}`;

const clip = (s: string | null | undefined, n: number) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/** Message envoyé à l'IA : tout ce qu'elle doit savoir sur la boutique. */
export function buildIdeasPrompt(c: IdeasContext): string {
  return [
    `Commerce : ${clip(c.businessName, 120)} à ${clip(c.city, 120)}.`,
    `Métier : ${clip(c.trade, 80)}.`,
    c.tradeHint ? `Ce que ce métier met en valeur : ${clip(c.tradeHint, 300)}` : '',
    c.products ? `Ses produits et spécialités : ${clip(c.products, 500)}.` : '',
    c.strengths ? `Ce qui rend la boutique unique : ${clip(c.strengths, 500)}.` : '',
    c.audience ? `Sa clientèle : ${clip(c.audience, 300)}.` : '',
    c.description ? `Présentation : ${clip(c.description, 600)}.` : '',
    `Ton de la boutique : ${clip(c.tone, 30)}.`,
    `Date du jour : ${c.today}.`,
    c.occasions.length
      ? `Prochaines occasions à préparer : ${c.occasions.slice(0, 5).map((o) => `${clip(o.name, 60)} (${clip(o.date, 10)})`).join(', ')}.`
      : 'Pas d\'occasion particulière dans les prochaines semaines.',
    c.recentPosts.length ? `Publications récentes (ne pas refaire la même chose) :\n- ${c.recentPosts.slice(0, 8).map((p) => clip(p, 120)).join('\n- ')}` : 'Aucune publication récente.',
    c.liked.length ? `Idées que le commerçant a aimées (propose dans cet esprit) : ${c.liked.slice(0, 10).map((t) => clip(t, 80)).join(' ; ')}.` : '',
    c.disliked.length ? `Idées qu'il n'a pas aimées (évite ce genre) : ${c.disliked.slice(0, 10).map((t) => clip(t, 80)).join(' ; ')}.` : '',
  ].filter(Boolean).join('\n');
}

/** Ce que l'IA a le droit de mentionner : les noms des occasions (ex. « Soldes d'hiver »). */
export function allowedFacts(c: Pick<IdeasContext, 'occasions'>): string {
  return c.occasions.map((o) => o.name).join(' ');
}

/**
 * Lit la réponse de l'IA et ne garde que les idées complètes et honnêtes
 * (une idée qui mentionne un prix, une promo ou un horaire inventé est écartée).
 */
export function parseIdeas(content: string, allowed = ''): PostIdea[] {
  let data: unknown;
  try {
    data = JSON.parse(content.replace(/^\s*```(json)?\s*|\s*```\s*$/g, ''));
  } catch {
    return [];
  }
  const list = Array.isArray(data) ? data : (data as { ideas?: unknown })?.ideas;
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: PostIdea[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const idea = { title: clip(String(r.title ?? ''), 80), photo: clip(String(r.photo ?? ''), 240), why: clip(String(r.why ?? ''), 240) };
    if (idea.title.length < 3 || idea.photo.length < 3) continue;
    if (containsInventedFacts(`${idea.title} ${idea.photo} ${idea.why}`, allowed)) continue;
    const key = idea.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(idea);
  }
  return out.slice(0, 3);
}
