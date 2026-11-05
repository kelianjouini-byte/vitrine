import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trialReminders, trialSummary } from '../src/lib/report.ts';
import type { Post } from '../src/lib/types.ts';

const post = (o: Partial<Post>): Post => ({
  id: Math.random().toString(36), kind: 'post', imageUri: '', caption: '', hashtags: [], platforms: ['instagram'],
  status: 'published', createdAt: '2026-11-03T10:00:00Z', publishedAt: '2026-11-03T10:00:00Z', publications: [], ...o,
});

test("bilan de l'essai : vrais posts publiés, et projection sur un mois au même rythme", () => {
  const posts = [
    post({}), post({}), post({}), post({}),
    post({ kind: 'story' }), post({ kind: 'story' }),
    post({ status: 'awaiting_approval' }), // brouillon : ne compte pas
    post({ publishedAt: '2026-10-20T10:00:00Z' }), // avant l'essai : ne compte pas
  ];
  const s = trialSummary(posts, '2026-11-01T10:00:00Z', '2026-11-16T10:00:00Z', new Date('2026-11-16T12:00:00Z'));
  assert.equal(s.posts, 4);
  assert.equal(s.stories, 2);
  assert.equal(s.minutesSaved, 4 * 20 + 2 * 5);
  assert.equal(s.days, 15);
  assert.deepEqual(s.month, { posts: 8, stories: 4, minutesSaved: 180 });
});

test("bilan à 3 jours de la fin : la projection se fait sur les jours déjà passés", () => {
  const s = trialSummary([post({}), post({})], '2026-11-01T10:00:00Z', '2026-11-16T10:00:00Z', new Date('2026-11-11T10:00:00Z'));
  assert.equal(s.days, 10);
  assert.equal(s.month.posts, 6);
});

test("rappels de fin d'essai : 3 jours avant, puis le dernier jour", () => {
  const r = trialReminders('2026-11-16T15:00:00', 9, new Date('2026-11-05T10:00:00'));
  assert.equal(r.length, 2);
  assert.equal(r[0].date.getDate(), 13);
  assert.equal(r[1].date.getDate(), 16);
  assert.equal(trialReminders('2026-11-16T15:00:00', 9, new Date('2026-11-14T10:00:00')).length, 1);
});

test("l'appli et le serveur ont la même durée d'essai", async () => {
  const { TRIAL_LENGTH_DAYS } = await import('../src/lib/report.ts');
  const { TRIAL_DAYS } = await import('../supabase/functions/_shared/billing.ts');
  assert.equal(TRIAL_LENGTH_DAYS, TRIAL_DAYS);
});
