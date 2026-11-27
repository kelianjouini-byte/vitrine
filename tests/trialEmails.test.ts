import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trialEmail, trialEmailDue } from '../supabase/functions/_shared/trialEmails.ts';

const created = '2026-11-01T10:00:00Z'; // fin de l'essai : 16 nov. 10 h UTC
const at = (iso: string) => new Date(iso);

test("rappel : seulement quand il reste 3 jours ou moins (et plus de 12 h)", () => {
  assert.equal(trialEmailDue(created, 'trial', at('2026-11-13T09:00:00Z')), null); // 3 j 1 h : trop tôt
  assert.equal(trialEmailDue(created, 'trial', at('2026-11-14T09:00:00Z')), 'reminder'); // 2 j 1 h : « dans 3 jours »
  assert.equal(trialEmailDue(created, 'trial', at('2026-11-15T09:00:00Z')), 'reminder'); // 25 h
  assert.equal(trialEmailDue(created, 'trial', at('2026-11-16T02:00:00Z')), null); // 8 h : l'autre e-mail arrive
});

test("essai terminé : les 3 premiers jours seulement, jamais pour un compte payé ou offert", () => {
  assert.equal(trialEmailDue(created, 'expired', at('2026-11-17T09:00:00Z')), 'ended');
  assert.equal(trialEmailDue(created, 'expired', at('2026-11-25T09:00:00Z')), null);
  assert.equal(trialEmailDue(created, 'paid', at('2026-11-13T09:00:00Z')), null);
  assert.equal(trialEmailDue(created, 'free', at('2026-11-17T09:00:00Z')), null);
});

const data = { firstName: 'Julie', businessName: 'Fleurs <de> Julie', businessCreatedAt: created, published: 4, views: 1250, founderLeft: 0, appUrl: 'https://vitrineappli.fr/app/' };

test("e-mail de rappel : date, résultats, offres et bouton, sans HTML injecté", () => {
  const m = trialEmail('reminder', data, at('2026-11-14T09:00:00Z'));
  assert.equal(m.subject, 'Votre essai Vitrine se termine dans 3 jours');
  assert.match(m.text, /se termine le lundi 16 novembre/);
  assert.match(m.text, /4 publications, vues 1\s250 fois/);
  assert.match(m.text, /Mensuel : 39 €/);
  assert.match(m.text, /Annuel : 29 €/);
  assert.doesNotMatch(m.text, /fondateur/);
  assert.match(m.html, /Fleurs &lt;de&gt; Julie/);
  assert.match(m.html, /href="https:\/\/vitrineappli\.fr\/app\/"/);
});

test("e-mail de fin : publications gardées, offre fondateur si des places restent, rien d'inventé sans publication", () => {
  const m = trialEmail('ended', { ...data, published: 0, views: 0, founderLeft: 1 }, at('2026-11-17T09:00:00Z'));
  assert.equal(m.subject, 'Votre essai Vitrine est terminé');
  assert.match(m.text, /réglages sont gardés/);
  assert.match(m.text, /plus que 1 place\)/);
  assert.doesNotMatch(m.text, /Pendant votre essai/);
});

test("offre fondateur : encadré orange « Très rare » dans l'e-mail", () => {
  const m = trialEmail('reminder', { ...data, founderLeft: 9 }, at('2026-11-14T09:00:00Z'));
  assert.match(m.html, /#FCEFD9/);
  assert.match(m.html, /Très rare/);
  assert.match(m.html, /plus que 9 places/);
  assert.match(m.html, /Annuel : 29 €/);
  assert.doesNotMatch(trialEmail('reminder', data, at('2026-11-14T09:00:00Z')).html, /Très rare/);
});
