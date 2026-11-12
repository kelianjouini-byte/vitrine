import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanOverlayText, parseOverlay } from '../supabase/functions/_shared/overlay.ts';
import { emptyOverlay, entrance, FRAME, hasOverlay, layoutOverlay, wrapLines, type Overlay } from '../src/lib/overlay.ts';

// Mesure factice : chaque lettre fait 0,6 fois la taille de la police (lue dans « 800 92px ... »).
const measure = (text: string, font: string) => text.length * Number(/(\d+)px/.exec(font)![1]) * 0.6;

test("l'IA donne une phrase courte et 4 emojis : on les garde", () => {
  const out = parseOverlay('{"text": "Tout juste sortis du four", "emojis": ["🥐", "🔥", "✨", "☀️", "🍞"]}');
  assert.deepEqual(out, { text: 'Tout juste sortis du four', emojis: ['🥐', '🔥', '✨', '☀️'] });
});

test('la phrase est nettoyée : sans emoji, hashtag, guillemets ni point final', () => {
  assert.equal(cleanOverlayText('« les pivoines sont là » 🌸 #fleurs.'), 'Les pivoines sont là');
  const out = parseOverlay('```json\n{"text": "prêt pour ce soir ?", "emojis": ["🍷", "pas un emoji"]}\n```');
  assert.deepEqual(out, { text: 'Prêt pour ce soir ?', emojis: ['🍷'] });
});

test('phrase trop longue, prix inventé ou mot « pub » : refusée (on redemande)', () => {
  assert.equal(parseOverlay('{"text": "Une phrase beaucoup trop longue pour être lue en une seconde sur la vidéo", "emojis": []}'), null);
  assert.equal(parseOverlay('{"text": "Croissants à 1,20 €", "emojis": []}'), null);
  assert.equal(parseOverlay('{"text": "Un bouquet sublime", "emojis": []}'), null);
  assert.equal(parseOverlay('pas du JSON'), null);
  // Le prix donné par le commerçant peut être repris.
  assert.ok(parseOverlay('{"text": "Croissants à 1,20 €", "emojis": []}', 'croissants à 1,20 €'));
});

test('le texte est coupé en lignes qui tiennent dans la largeur', () => {
  assert.deepEqual(wrapLines('Tout juste sortis du four', 1000, '800 92px X', measure), ['Tout juste sortis', 'du four']);
  assert.deepEqual(wrapLines('Bonjour', 600, '800 92px X', measure), ['Bonjour']);
});

test('mise en page : au plus 3 lignes dans la largeur, emoji au-dessus, centré', () => {
  const o: Overlay = { text: 'Les premières pivoines de la saison sont arrivées', emoji: '🌸', style: 'elegant', place: 'haut' };
  const l = layoutOverlay(o, FRAME.width, FRAME.height, measure)!;
  assert.ok(l.lines.length <= 3);
  for (const line of l.lines) assert.ok(line.width <= FRAME.width * 0.84 + 0.01);
  assert.equal(l.x, FRAME.width / 2);
  assert.ok(l.emoji && l.emoji.y < l.lines[0].y);
  // « Moderne » : en majuscules.
  const m = layoutOverlay({ ...o, style: 'moderne' }, FRAME.width, FRAME.height, measure)!;
  assert.equal(m.lines.join(' ').includes('pivoines'), false);
  assert.ok(m.lines.map((x) => x.text).join(' ').includes('PIVOINES'));
});

test('mise en page : haut, milieu, bas, et à toutes les tailles (aperçu = vidéo publiée)', () => {
  const o: Overlay = { text: 'Tout juste sortis du four', emoji: null, style: 'manuscrit', place: 'haut' };
  const y = (place: Overlay['place']) => layoutOverlay({ ...o, place }, FRAME.width, FRAME.height, measure)!.lines[0].y;
  assert.ok(y('haut') < y('milieu') && y('milieu') < y('bas'));
  // Le même texte à la taille de l'aperçu : mêmes lignes, positions proportionnelles.
  const big = layoutOverlay(o, FRAME.width, FRAME.height, measure)!;
  const small = layoutOverlay(o, FRAME.width / 4, FRAME.height / 4, measure)!;
  assert.deepEqual(small.lines.map((l) => l.text), big.lines.map((l) => l.text));
  assert.ok(Math.abs(small.lines[0].y * 4 - big.lines[0].y) < 2);
});

test('rien à écrire : pas de mise en page', () => {
  assert.equal(layoutOverlay(emptyOverlay(), FRAME.width, FRAME.height, measure), null);
  assert.equal(hasOverlay(emptyOverlay()), false);
  assert.equal(hasOverlay({ ...emptyOverlay(), emoji: '✨' }), true);
  assert.equal(hasOverlay({ ...emptyOverlay(), text: '   ' }), false);
});

test("le texte apparaît en douceur au début de la vidéo, et tout de suite sur une photo", () => {
  assert.deepEqual(entrance(null), { alpha: 1, dy: 0 });
  assert.equal(entrance(0).alpha, 0);
  assert.ok(entrance(0.4).alpha > 0 && entrance(0.4).alpha < 1);
  assert.deepEqual(entrance(2), { alpha: 1, dy: 0 });
});
