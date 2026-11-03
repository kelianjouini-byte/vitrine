// Lecture tolérante de la réponse de l'IA pour une publication.
// Fichier pur (aucune dépendance Deno) : testé avec node --test.

export interface AiOutput {
  photo_description: string;
  instagram_caption: string;
  facebook_caption: string;
  call_to_action: string;
  hashtags: string[];
  improvement_tip: string | null;
}

/** Trouve l'objet JSON dans la réponse, même entouré de ``` ou de texte. */
export function extractJson(content: string): Record<string, unknown> | null {
  const cleaned = content.replace(/^\s*```(json)?\s*|\s*```\s*$/g, '').trim();
  for (const candidate of [cleaned, cleaned.slice(cleaned.indexOf('{'), cleaned.lastIndexOf('}') + 1)]) {
    try {
      const v = JSON.parse(candidate);
      if (Array.isArray(v) && v[0] && typeof v[0] === 'object') return v[0] as Record<string, unknown>;
      if (v && typeof v === 'object') return v as Record<string, unknown>;
    } catch {
      /* on essaie la suite */
    }
  }
  return null;
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/**
 * Transforme la réponse de l'IA en publication utilisable, ou null si elle est vraiment inutilisable.
 * Accepte les petites variations des modèles (hashtags en texte, un seul des deux textes, objet imbriqué...).
 */
export function normalizePost(content: string): AiOutput | null {
  let raw = extractJson(content);
  if (!raw) return null;
  // Certains modèles emballent la réponse : { "post": { ... } }
  if (!raw.instagram_caption && !raw.facebook_caption) {
    const inner = Object.values(raw).find((v) => v && typeof v === 'object' && !Array.isArray(v)) as Record<string, unknown> | undefined;
    if (inner) raw = inner;
  }
  const ig = str(raw.instagram_caption) || str(raw.caption) || str(raw.text);
  const fb = str(raw.facebook_caption);
  const caption = ig || fb;
  if (caption.length < 10) return null;
  const rawTags = Array.isArray(raw.hashtags) ? raw.hashtags.map(String) : str(raw.hashtags).split(/[\s,]+/);
  const hashtags = [...new Set(rawTags.map((h) => h.trim().replace(/\s+/g, '')).filter((h) => h.replace('#', '').length > 1).map((h) => (h.startsWith('#') ? h : `#${h}`)))].slice(0, 12);
  return {
    photo_description: str(raw.photo_description),
    instagram_caption: caption,
    facebook_caption: fb || caption,
    call_to_action: str(raw.call_to_action),
    hashtags,
    improvement_tip: str(raw.improvement_tip) || null,
  };
}
