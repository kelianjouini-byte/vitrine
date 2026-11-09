import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CODE_ALPHABET, codePrefix, looksLikeCode, makeCode, normalizeCode, priceWithReferrals, referralsUntilFree, referrerCredit, samePayer,
} from '../supabase/functions/_shared/referral.ts';

test('le code commence par le nom de la boutique, sans accents', () => {
  assert.equal(codePrefix('Fleurs de Marie'), 'FLEURS');
  assert.equal(codePrefix('Boulangerie Été'), 'BOULAN');
  assert.equal(codePrefix('Chez Léa'), 'LEA');
  assert.equal(codePrefix('Le Fournil'), 'FOURNI');
  assert.equal(codePrefix('A B'), 'VITRINE');
});

test('le code a 5 caractères au hasard, sans O, 0, I, 1 ni L', () => {
  let i = 0;
  const seq = [0, 0.5, 0.99, 0.2, 0.7];
  const code = makeCode('Fleurs de Marie', () => seq[i++]);
  assert.match(code, /^FLEURS-[A-Z2-9]{5}$/);
  assert.ok(looksLikeCode(code));
  for (const c of 'O0I1L') assert.ok(!CODE_ALPHABET.includes(c));
  for (let n = 0; n < 200; n++) assert.ok(looksLikeCode(makeCode('Cave du Marché', Math.random)));
});

test('le code tapé est remis en forme', () => {
  assert.equal(normalizeCode(' fleurs-7k4q9 '), 'FLEURS-7K4Q9');
  assert.equal(normalizeCode('FLEURS – 7K4 Q9'), 'FLEURS-7K4Q9');
  assert.equal(normalizeCode(42), '');
  assert.ok(!looksLikeCode('FLEURS-7K4Q0'));
  assert.ok(!looksLikeCode('FLEURS'));
});

test('le parrain gagne 10 € par mois payé, sans jamais dépasser son prix', () => {
  assert.equal(referrerCredit(0, 2900), 1000);
  assert.equal(referrerCredit(2000, 2900), 900);
  assert.equal(referrerCredit(2900, 2900), 0);
  assert.equal(referrerCredit(5000, 2900), 0);
  assert.equal(referrerCredit(-500, 3900), 1000);
});

test('prix du parrain : 29, 19, 9, puis 0 €', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map((n) => priceWithReferrals(2900, n)), [2900, 1900, 900, 0, 0]);
  assert.deepEqual([0, 1, 2, 3, 4].map((n) => priceWithReferrals(3900, n)), [3900, 2900, 1900, 900, 0]);
  assert.equal(referralsUntilFree(2900, 1), 2);
  assert.equal(referralsUntilFree(3900, 0), 4);
  assert.equal(referralsUntilFree(2900, 5), 0);
});

test("pas de parrainage entre deux boutiques de la même personne", () => {
  const a = { cardFingerprint: 'fp1', name: 'Jean Dupont', address: { line1: '3 rue de la Paix', postal_code: '13510' } };
  assert.equal(samePayer(a, { cardFingerprint: 'fp1' }), 'card');
  assert.equal(samePayer(a, { cardFingerprint: 'fp2', address: { line1: '3, Rue de la paix', postal_code: '13510' } }), 'address');
  assert.equal(samePayer(a, { cardFingerprint: 'fp2', name: 'jean dupont' }), 'name');
  assert.equal(samePayer(a, { cardFingerprint: 'fp2', name: 'Marie Martin', address: { line1: '8 cours Mirabeau', postal_code: '13100' } }), null);
  assert.equal(samePayer({}, {}), null);
});

test('la carte à imprimer : 10 cartes avec le code, le nom protégé et un QR code', async () => {
  const { printableCards, referralLink, shareMessage } = await import('../src/lib/referralCard.ts');
  const html = printableCards('FLEURS-7K4Q9', 'Fleurs <de> Marie');
  assert.equal(html.match(/class="card"/g)?.length, 10);
  assert.ok(html.includes('Fleurs &lt;de&gt; Marie'));
  assert.ok(html.includes('<svg') && html.includes('FLEURS-7K4Q9'));
  assert.equal(referralLink('FLEURS-7K4Q9'), 'https://kelianjouini-byte.github.io/vitrine/app/?parrain=FLEURS-7K4Q9');
  assert.ok(shareMessage('FLEURS-7K4Q9').includes('FLEURS-7K4Q9'));
});
