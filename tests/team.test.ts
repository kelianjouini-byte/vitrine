import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canPublishDirectly, companyMonthlyCents, isLockedOut, isPatron, LOGIN_CODE_LENGTH, looksLikeEmail, looksLikeLoginCode,
  makeLoginCode, MAX_FAILED_LOGINS, memberShopIds, normalizeEmail, normalizeLoginCode, sameCode,
} from '../supabase/functions/_shared/team.ts';
import { namesList, shopsLabel } from '../supabase/functions/_shared/team.ts';
import { referrerCredit } from '../supabase/functions/_shared/referral.ts';

test("le code de connexion fait 6 caractères faciles à lire (pas de 0/O, 1/I/L)", () => {
  let seed = 0;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 200; i++) {
    const code = makeLoginCode(rnd);
    assert.equal(code.length, LOGIN_CODE_LENGTH);
    assert.ok(looksLikeLoginCode(code), code);
    assert.doesNotMatch(code, /[01ILO]/);
  }
});

test("le code tapé est rangé : minuscules, espaces et tirets acceptés", () => {
  assert.equal(normalizeLoginCode(' 4k7-q2 m '), '4K7Q2M');
  assert.equal(normalizeLoginCode(42), '');
  assert.ok(looksLikeLoginCode('4K7Q2M'));
  assert.ok(!looksLikeLoginCode('4K7Q2'));
  assert.ok(!looksLikeLoginCode('motdepasse'));
});

test("comparaison des codes", () => {
  assert.ok(sameCode('4K7Q2M', '4K7Q2M'));
  assert.ok(!sameCode('4K7Q2M', '4K7Q2N'));
  assert.ok(!sameCode('4K7Q2M', '4K7Q2'));
});

test(`bloqué après ${MAX_FAILED_LOGINS} erreurs`, () => {
  assert.ok(!isLockedOut(MAX_FAILED_LOGINS - 1));
  assert.ok(isLockedOut(MAX_FAILED_LOGINS));
});

test("e-mails", () => {
  assert.equal(normalizeEmail('  Julie@Fleurs.FR '), 'julie@fleurs.fr');
  assert.ok(looksLikeEmail('julie@fleurs.fr'));
  assert.ok(!looksLikeEmail('julie@fleurs'));
});

test("rôles : un patron publie toujours, un employé seulement avec « Publie seul »", () => {
  assert.ok(isPatron('owner') && isPatron('patron') && !isPatron('employe'));
  assert.ok(canPublishDirectly('patron', false));
  assert.ok(!canPublishDirectly('employe', false));
  assert.ok(canPublishDirectly('employe', true));
});

test("boutiques d'un membre : liste vide = toutes ; boutique retirée = plus rien", () => {
  const all = ['main', 'b2', 'b3'];
  assert.deepEqual(memberShopIds('employe', [], all), all);
  assert.deepEqual(memberShopIds('employe', ['b3'], all), ['b3']);
  assert.deepEqual(memberShopIds('patron', ['b3'], all), all);
  assert.deepEqual(memberShopIds('employe', ['gone'], all), []);
});

test("prix : 39 € + 19 € par boutique en plus (mensuel), 29 € + 15 € (annuel)", () => {
  assert.equal(companyMonthlyCents(3900, 1900, 1), 3900);
  assert.equal(companyMonthlyCents(3900, 1900, 3), 7700);
  assert.equal(companyMonthlyCents(2900, 1500, 2), 4400);
  assert.equal(companyMonthlyCents(2900, 1500, 0), 2900);
});

test("parrainage : le crédit du parrain ne dépasse jamais le prix de sa 1re boutique", () => {
  // Parrain annuel avec 3 boutiques (59 €/mois) : le plafond reste 29 €.
  assert.equal(referrerCredit(2000, 2900), 900);
  assert.equal(referrerCredit(2900, 2900), 0);
});

test("affichage des boutiques d'un employé", () => {
  const shops = [
    { id: 'main', city: 'Aix', businessName: 'Fleurs' },
    { id: 'b2', city: 'Marseille', businessName: 'Fleurs' },
    { id: 'b3', city: 'Toulon', businessName: 'Fleurs' },
  ];
  assert.equal(shopsLabel([], shops), 'Toutes les boutiques');
  assert.equal(shopsLabel(['b2'], shops), 'Marseille');
  assert.equal(shopsLabel(['gone'], shops), 'Aucune boutique');
  assert.equal(namesList(['Aix', 'Marseille', 'Toulon']), 'Aix, Marseille et Toulon');
});
