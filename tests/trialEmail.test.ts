import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueTrialEmail, trialEmailHtml, trialEmailSubject, trialEmailText } from '../supabase/functions/_shared/trialEmail.ts';

const base = {
  shopName: 'Fleurs de Marie', firstName: 'Marie', trialEnd: new Date('2026-12-08T10:00:00Z'),
  offers: [
    { name: 'Mensuel', priceCents: 3900, detail: 'Sans engagement.', url: 'https://x.test/a?t=1&b=2' },
    { name: 'Annuel', priceCents: 2900, detail: 'Engagement 1 an.', url: 'https://x.test/b', highlight: true },
  ],
};

test("e-mail avant la fin : date, prix et liens", () => {
  const i = { ...base, kind: 'soon' as const, now: new Date('2026-12-05T10:00:00Z') };
  assert.match(trialEmailSubject(i), /se termine/);
  const text = trialEmailText(i);
  assert.match(text, /Bonjour Marie/);
  assert.match(text, /39 € par mois/);
  assert.match(text, /rien avant la fin/);
  const html = trialEmailHtml(i);
  assert.match(html, /href="https:\/\/x\.test\/a\?t=1&amp;b=2"/);
  assert.match(html, /Choisir Annuel/);
});

test("e-mail après la fin : boutique gardée", () => {
  const i = { ...base, kind: 'ended' as const, now: new Date('2026-12-09T10:00:00Z') };
  assert.match(trialEmailSubject(i), /terminé/);
  assert.match(trialEmailText(i), /posts sont gardés/);
});

test("le nom de la boutique est protégé dans la mise en page", () => {
  const html = trialEmailHtml({ ...base, kind: 'resend', shopName: '<b>Chez Léa</b>' });
  assert.ok(!html.includes('<b>Chez'));
});

test("quel e-mail envoyer et quand", () => {
  const end = new Date('2026-12-08T10:00:00Z');
  assert.equal(dueTrialEmail(end, new Date('2026-12-01T10:00:00Z')), null);
  assert.equal(dueTrialEmail(end, new Date('2026-12-05T11:00:00Z')), 'soon');
  assert.equal(dueTrialEmail(end, new Date('2026-12-08T11:00:00Z')), 'ended');
  assert.equal(dueTrialEmail(end, new Date('2026-12-30T11:00:00Z')), null);
});
