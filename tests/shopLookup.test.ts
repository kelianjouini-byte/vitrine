import { test } from 'node:test';
import assert from 'node:assert/strict';
import { niceCase, parseShopResults, shopSearchUrl } from '../src/lib/shopLookup.ts';
import { guessTrade, tradeFromNaf, tradeFromName } from '../src/lib/trades.ts';

// Extrait réel (raccourci) de la réponse de recherche-entreprises.api.gouv.fr, 27 nov. 2026.
const SAMPLE = {
  results: [
    {
      nom_complet: 'BOULANGERIES PAUL', nom_raison_sociale: 'BOULANGERIES PAUL', activite_principale: '10.71A',
      complements: { est_entrepreneur_individuel: false },
      siege: { siret: '1', code_postal: '59000', libelle_commune: 'LILLE', adresse: '1 RUE X 59000 LILLE', etat_administratif: 'A' },
      matching_etablissements: [
        { siret: '2', adresse: '51 RUE ESPARIAT 13100 AIX-EN-PROVENCE', code_postal: '13100', libelle_commune: 'AIX-EN-PROVENCE', liste_enseignes: ['LE PANERIA'], nom_commercial: null, activite_principale: '56.10C', etat_administratif: 'A' },
        { siret: '3', adresse: 'LES TOURELLES 13100 AIX-EN-PROVENCE', code_postal: '13100', libelle_commune: 'AIX-EN-PROVENCE', liste_enseignes: ['LA PANERIA'], activite_principale: '55.3B', etat_administratif: 'F' },
      ],
    },
    {
      nom_complet: 'CHRISTELE FLEUR', nom_raison_sociale: null, activite_principale: '47.76Z',
      complements: { est_entrepreneur_individuel: true },
      dirigeants: [{ nom: 'FLEUR', prenoms: 'CHRISTELE' }],
      siege: { siret: '4', adresse: '2 B AVENUE DU PARC 13100 AIX-EN-PROVENCE', code_postal: '13100', libelle_commune: 'AIX-EN-PROVENCE', liste_enseignes: null, activite_principale: '47.76Z', etat_administratif: 'A' },
      matching_etablissements: [],
    },
  ],
};

test("adresse de recherche : nom + code postal, établissements ouverts", () => {
  const u = new URL(shopSearchUrl({ name: 'Fleurs de Marie', postalCode: '13100', city: 'Aix' }));
  assert.equal(u.searchParams.get('q'), 'Fleurs de Marie');
  assert.equal(u.searchParams.get('code_postal'), '13100');
  assert.equal(u.searchParams.get('etat_administratif'), 'A');
  // Sans code postal : la ville rejoint le nom.
  const v = new URL(shopSearchUrl({ name: 'Fleurs de Marie', postalCode: '131', city: 'Aix' }));
  assert.equal(v.searchParams.get('q'), 'Fleurs de Marie Aix');
  assert.equal(v.searchParams.get('code_postal'), null);
});

test('réponse de l\'annuaire : seulement le bon code postal, seulement ouvert, joli format', () => {
  const r = parseShopResults(SAMPLE, '13100');
  assert.deepEqual(r.map((s) => s.siret), ['2', '4']);
  assert.equal(r[0].name, 'Le Paneria');
  assert.equal(r[0].address, '51 Rue Espariat, 13100 Aix-en-Provence');
  assert.equal(r[0].city, 'Aix-en-Provence');
  assert.equal(r[1].address, '2 B Avenue du Parc, 13100 Aix-en-Provence');
  // Entrepreneur individuel : son nom de personne ne sert pas à deviner le métier.
  assert.deepEqual(r[1].names, []);
  assert.equal(JSON.stringify(r).includes('dirigeants'), false);
});

test('réponse vide ou cassée : liste vide', () => {
  assert.deepEqual(parseShopResults(null), []);
  assert.deepEqual(parseShopResults({ results: 'x' }), []);
});

test('métier deviné : le nom parlant passe avant le code officiel', () => {
  assert.equal(tradeFromNaf('47.76Z')?.id, 'fleuriste');
  assert.equal(tradeFromNaf('43.22A')?.id, 'batiment');
  assert.equal(tradeFromNaf('70.22Z'), undefined);
  assert.equal(tradeFromName('Fromagerie du Marché')?.id, 'fromagerie');
  assert.equal(tradeFromName('Chez Paul'), undefined);
  assert.equal(guessTrade(['La Cave de Jean'], '47.29Z')?.id, 'caviste');
  assert.equal(guessTrade(['Le Paneria'], '56.10C')?.id, 'snack');
});

test('majuscules : rue de l\'église', () => {
  assert.equal(niceCase("12 RUE DE L'EGLISE"), "12 Rue de l'Eglise");
  assert.equal(niceCase('SAINT-REMY-DE-PROVENCE'), 'Saint-Remy-de-Provence');
});
