/**
 * Recherche de la boutique dans l'annuaire public des entreprises (État français, gratuit, sans clé) :
 * https://recherche-entreprises.api.gouv.fr — le commerçant tape le nom et le code postal,
 * Vitrine propose les établissements qui correspondent, il choisit le sien.
 * Fichier « pur » (aucune dépendance React Native) : testé avec node --test.
 */

export interface ShopMatch {
  /** Identifiant unique de l'établissement (SIRET). */
  siret: string;
  /** Nom à afficher : enseigne, sinon nom commercial, sinon nom de l'entreprise. */
  name: string;
  /** Tous les noms connus (enseignes, nom commercial, raison sociale), pour deviner le métier. */
  names: string[];
  /** Adresse complète, ex. « 12 Rue Espariat, 13100 Aix-en-Provence ». */
  address: string;
  postalCode: string;
  city: string;
  /** Code d'activité officiel (NAF), ex. « 47.76Z ». */
  naf: string | null;
}

export const SHOP_SEARCH_URL = 'https://recherche-entreprises.api.gouv.fr/search';

/** Adresse de recherche : le nom (et la ville si pas de code postal), filtrée par code postal. */
export function shopSearchUrl(input: { name: string; postalCode?: string; city?: string }): string {
  const cp = /^\d{5}$/.test(input.postalCode?.trim() ?? '') ? input.postalCode!.trim() : '';
  const q = cp ? input.name.trim() : `${input.name.trim()} ${input.city?.trim() ?? ''}`.trim();
  const p = new URLSearchParams({ q, per_page: '10', etat_administratif: 'A' });
  if (cp) p.set('code_postal', cp);
  return `${SHOP_SEARCH_URL}?${p.toString()}`;
}

const SMALL = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'et', 'en', 'au', 'aux', 'sur', 'sous', "d'", "l'"]);

/** « 51 RUE ESPARIAT » → « 51 Rue Espariat » ; « AIX-EN-PROVENCE » → « Aix-en-Provence ». */
export function niceCase(s: string): string {
  return s.toLowerCase().replace(/[a-zà-ÿ]+/g, (w, i: number) => (i > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .replace(/\b([dl])'([a-zà-ÿ])/gi, (_m, a: string, b: string) => `${a.toLowerCase()}'${b.toUpperCase()}`)
    .replace(/^([dl])'/, (m) => m.toUpperCase());
}

type Raw = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/**
 * Transforme la réponse de l'annuaire en liste d'établissements ouverts.
 * Avec un code postal, on garde seulement les établissements de ce code postal
 * (une enseigne peut avoir des boutiques dans toute la France).
 * Jamais de nom de dirigeant : seulement les noms de la boutique.
 */
export function parseShopResults(json: unknown, postalCode?: string, limit = 6): ShopMatch[] {
  const results = (json as { results?: Raw[] } | null)?.results;
  if (!Array.isArray(results)) return [];
  const cp = /^\d{5}$/.test(postalCode?.trim() ?? '') ? postalCode!.trim() : '';
  const out: ShopMatch[] = [];
  const seen = new Set<string>();
  for (const r of results) {
    const company = str(r.nom_raison_sociale) ?? str(r.nom_complet);
    const isPerson = (r.complements as Raw | undefined)?.est_entrepreneur_individuel === true;
    const places = [...(Array.isArray(r.matching_etablissements) ? (r.matching_etablissements as Raw[]) : []), ...(r.siege ? [r.siege as Raw] : [])];
    for (const e of places) {
      const siret = str(e.siret);
      if (!siret || seen.has(siret)) continue;
      if (str(e.etat_administratif) && e.etat_administratif !== 'A') continue;
      const ecp = str(e.code_postal) ?? '';
      if (cp && ecp !== cp) continue;
      const signs = (Array.isArray(e.liste_enseignes) ? e.liste_enseignes : []).map(str).filter((x): x is string => Boolean(x));
      const commercial = str(e.nom_commercial);
      // Entrepreneur individuel sans enseigne : la raison sociale est son nom de personne. On l'affiche
      // quand même (c'est souvent ainsi que le commerçant se reconnaît) mais elle ne sert pas à deviner le métier.
      const shopNames = [...signs, ...(commercial ? [commercial] : [])];
      const names = isPerson ? shopNames : [...shopNames, ...(company ? [company] : [])];
      const display = shopNames[0] ?? company;
      if (!display) continue;
      const city = niceCase(str(e.libelle_commune) ?? '');
      const rawAddr = str(e.adresse) ?? '';
      // L'adresse de l'annuaire finit par « CP VILLE » : on la sépare pour l'afficher proprement.
      const street = rawAddr.replace(new RegExp(`\\s*${ecp}\\s+.*$`), '').trim();
      seen.add(siret);
      out.push({
        siret,
        name: niceCase(display),
        names,
        address: [niceCase(street), [ecp, city].filter(Boolean).join(' ')].filter(Boolean).join(', '),
        postalCode: ecp,
        city,
        naf: str(e.activite_principale) ?? str(r.activite_principale),
      });
      if (out.length >= limit) return out;
    }
  }
  return out;
}
