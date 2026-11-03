import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowedFacts, buildIdeasPrompt, parseIdeas, type IdeasContext } from '../supabase/functions/_shared/ideas.ts';
import { containsInventedCommercialInfo, containsInventedFacts } from '../supabase/functions/_shared/guard.ts';
import { basicIdeas, toggleVote } from '../src/lib/ideas.ts';

const ctx: IdeasContext = {
  businessName: 'Fleurs de Marie', trade: 'Fleuriste', city: 'Lyon', tone: 'chaleureux',
  products: 'Bouquets de saison, plantes', strengths: 'Fleurs françaises', audience: 'Familles du quartier', description: null,
  tradeHint: null, occasions: [{ name: "Soldes d'hiver", date: '2027-01-13' }, { name: 'Noël', date: '2026-12-25' }],
  recentPosts: ['Nos tulipes sont arrivées'], liked: ['Les coulisses'], disliked: ['Votre vitrine'], today: '2026-11-03',
};

test('la consigne contient la carte d\'identité, les fêtes, l\'historique et les avis', () => {
  const p = buildIdeasPrompt(ctx);
  for (const part of ['Bouquets de saison', 'Fleurs françaises', 'Familles du quartier', 'Noël (2026-12-25)', 'Nos tulipes', 'Les coulisses', 'Votre vitrine']) {
    assert.ok(p.includes(part), part);
  }
});

test('lecture de la réponse : 3 idées complètes maximum, sans doublon', () => {
  const ideas = parseIdeas('```json\n' + JSON.stringify({ ideas: [
    { title: 'Le bouquet du jour', photo: 'Le bouquet sur le comptoir', why: 'Ça donne envie' },
    { title: 'le bouquet du jour', photo: 'doublon', why: '' },
    { title: 'Sans photo', photo: '' },
    { title: 'Les coulisses', photo: 'Vos mains qui composent', why: 'Le savoir-faire' },
    { title: 'Noël approche', photo: 'Une couronne de porte', why: 'On y pense déjà' },
    { title: 'En trop', photo: 'Une 4e idée', why: '' },
  ] }) + '\n```');
  assert.deepEqual(ideas.map((i) => i.title), ['Le bouquet du jour', 'Les coulisses', 'Noël approche']);
  assert.deepEqual(parseIdeas('pas du json'), []);
});

test('jamais de prix, promo ou horaire inventé', () => {
  const ideas = parseIdeas(JSON.stringify({ ideas: [
    { title: 'Bouquet à 25 €', photo: 'Le bouquet', why: '' },
    { title: 'Promo de la semaine', photo: 'La vitrine', why: '' },
    { title: 'Ouvert dimanche', photo: 'La devanture', why: '' },
    { title: 'Ouverture à 9h', photo: 'La devanture', why: '' },
    { title: 'Les soldes commencent', photo: 'Le rayon', why: 'Les clients attendent les soldes' },
  ] }), allowedFacts(ctx));
  // Seule l'idée « soldes » passe : les Soldes d'hiver sont une occasion du calendrier.
  assert.deepEqual(ideas.map((i) => i.title), ['Les soldes commencent']);
  assert.equal(containsInventedFacts('-20 % sur tout', ''), true);
  assert.equal(containsInventedFacts('Un bouquet de pivoines', ''), false);
  assert.equal(containsInventedCommercialInfo('Bouquet à 30 euros', 'Bouquet à 30 euros'), false);
});

test('idées de base (sans IA) : 3 idées, occasion et produit en tête', () => {
  const ideas = basicIdeas({ products: 'Baguette tradition, croissants', occasion: { name: 'Noël', emoji: '🎄' } });
  assert.equal(ideas.length, 3);
  assert.ok(ideas[0].title.includes('Noël'));
  assert.ok(ideas[1].title.includes('baguette tradition'));
  assert.equal(basicIdeas({}).length, 3);
});

test('👍 / 👎 : un 2e appui retire l\'avis', () => {
  let v = toggleVote({}, 'A', 1);
  assert.deepEqual(v, { A: 1 });
  v = toggleVote(v, 'A', -1);
  assert.deepEqual(v, { A: -1 });
  assert.deepEqual(toggleVote(v, 'A', -1), {});
});
