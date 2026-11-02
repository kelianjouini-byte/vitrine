import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchTrade, searchTrades, TRADES } from '../src/lib/trades.ts';
import { eventsForYear, upcomingEvents, nthWeekday } from '../src/lib/events.ts';

test('catalogue : 30 métiers, identifiants uniques', () => {
  assert.equal(TRADES.length, 30);
  assert.equal(new Set(TRADES.map((t) => t.id)).size, 30);
});

test('recherche : vide = métiers courants, mots proches et accents', () => {
  assert.equal(searchTrades('').length, TRADES.filter((t) => t.featured).length);
  assert.equal(searchTrades('boulanger')[0].id, 'boulangerie');
  assert.equal(searchTrades('tattoo')[0].id, 'tatoueur');
  assert.equal(searchTrades('epicerie fine')[0].id, 'epicerie');
  assert.equal(searchTrades('Épicerie')[0].id, 'epicerie');
});

test("réponse de l'IA → métier du catalogue", () => {
  assert.equal(matchTrade('Épicerie fine')?.id, 'epicerie');
  assert.equal(matchTrade('Salon de tatouage')?.id, 'tatoueur');
  assert.equal(matchTrade('Fromager affineur')?.id, 'fromagerie');
  assert.equal(matchTrade('Agence immobilière'), undefined);
});

test('chaque métier a son calendrier', () => {
  const from = new Date(2027, 0, 1);
  const keys = (p: Parameters<typeof upcomingEvents>[0]) => upcomingEvents(p, from, 12).map((e) => e.key);
  assert.ok(keys('fleuriste').includes('fete-du-travail'));
  assert.ok(!keys('caviste').includes('fete-du-travail'));
  assert.ok(keys('caviste').includes('beaujolais-nouveau'));
  assert.ok(keys('boulangerie').includes('saint-honore'));
  assert.ok(keys('barbier').includes('movember'));
  assert.ok(!keys('librairie').includes('black-friday'));
  // Métier hors liste avec occasions choisies par l'IA : seulement celles-là (+ celles de tout le monde).
  const custom = keys({ businessType: 'autre', occasionKeys: ['halloween'] });
  assert.deepEqual([...new Set(custom)].sort(), ['halloween', 'noel', 'nouvel-an']);
});

test('nouvelles dates', () => {
  const y = eventsForYear(2027);
  const at = (k: string) => y.find((e) => e.key === k)!.date;
  assert.deepEqual(at('fete-des-grands-peres'), nthWeekday(2027, 10, 0, 1));
  assert.equal(at('fete-des-grands-peres').getDate(), 3); // 3 octobre 2027
  assert.equal(at('saint-honore').getMonth(), 4);
  assert.equal(at('saint-fiacre').getDate(), 30);
});
