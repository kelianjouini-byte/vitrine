import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPostSystemPrompt, DEFAULT_TONE, findAdWords, MAIN_PROMPT, TONE_PROMPTS, toTone } from '../supabase/functions/_shared/prompts.ts';

/** Les 7 tons de l'appli (src/lib/types.ts, Tone). */
const TONES = ['premium', 'elegant', 'chaleureux', 'dynamique', 'humoristique', 'familial', 'traditionnel'].map((id) => ({ id }));

test('chaque ton de l\'appli a sa petite consigne', () => {
  for (const t of TONES) assert.ok(TONE_PROMPTS[t.id as keyof typeof TONE_PROMPTS], t.id);
  assert.equal(Object.keys(TONE_PROMPTS).length, TONES.length);
});

test('la consigne = principale + le ton choisi seulement + format JSON', () => {
  const p = buildPostSystemPrompt('elegant');
  assert.ok(p.startsWith(MAIN_PROMPT));
  assert.ok(p.includes('TON : ÉLÉGANT.'));
  assert.ok(!p.includes('TON : PREMIUM.'));
  assert.ok(p.includes('JSON'));
});

test('ton inconnu ou absent = Premium', () => {
  assert.equal(DEFAULT_TONE, 'premium');
  assert.equal(toTone(undefined), 'premium');
  assert.equal(toTone('nimporte'), 'premium');
  assert.equal(toTone('constructor'), 'premium');
  assert.equal(toTone('familial'), 'familial');
  assert.ok(buildPostSystemPrompt(null).includes('TON : PREMIUM.'));
});

test('l\'humour reste une seule touche légère', () => {
  assert.match(TONE_PROMPTS.humoristique, /UNE seule touche/);
  for (const t of ['premium', 'elegant', 'traditionnel'] as const) assert.match(TONE_PROMPTS[t], /Aucun humour/);
});

test('mots « pub » repérés', () => {
  assert.deepEqual(findAdWords('Découvrez nos sublimes bouquets ! N\'attendez plus.'), ['découvrez', 'sublimes', "n'attendez plus"]);
  assert.deepEqual(findAdWords('Une pépite incontournable, lien en bio'), ['pépite', 'incontournable', 'lien en bio']);
  assert.deepEqual(findAdWords('Un rose poudré, des pétales qui s\'ouvrent lentement. Venez les voir de près.'), []);
  // « découvrir » au milieu d'une phrase reste permis
  assert.deepEqual(findAdWords('Un vin à découvrir sur place.'), []);
});
