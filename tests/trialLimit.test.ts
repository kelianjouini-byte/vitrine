import { test } from 'node:test';
import assert from 'node:assert/strict';
import { overTrialLimit, TRIAL_TEXTS_PER_DAY } from '../supabase/functions/_shared/trialLimit.ts';

const rows = (...ids: (string | null)[]) => ids.map((post_id) => ({ post_id }));

test('essai : 3 posts par jour, le 4e est refusé', () => {
  assert.equal(overTrialLimit(rows(), 'a'), false);
  assert.equal(overTrialLimit(rows('a', 'b'), 'c'), false);
  assert.equal(overTrialLimit(rows('a', 'b', 'c'), 'd'), true);
});

test('essai : réécrire un post du jour reste possible', () => {
  assert.equal(overTrialLimit(rows('a', 'a', 'b', 'c'), 'a'), false);
});

test('essai : les petits textes de story ne comptent pas comme des posts, mais il y a un plafond total', () => {
  assert.equal(overTrialLimit(rows(null, null, null, null), 'a'), false);
  assert.equal(overTrialLimit(rows(null, null), null), false);
  assert.equal(overTrialLimit(rows(...Array(TRIAL_TEXTS_PER_DAY).fill('a')), 'a'), true);
});
