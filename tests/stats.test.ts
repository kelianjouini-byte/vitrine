import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bestPost, reachOf, statsLine, totalOf, viewsOf, type StatsMap } from '../src/lib/stats.ts';
import { metric } from '../supabase/functions/_shared/insights.ts';
import type { Post } from '../src/lib/types.ts';

const post = (id: string): Post => ({
  id, imageUri: 'x.jpg', caption: '', hashtags: [], platforms: ['instagram', 'facebook'], status: 'published',
  createdAt: '2026-11-11T10:00:00', publishedAt: '2026-11-11T10:00:00', publications: [],
});

test('totalOf additionne Instagram et Facebook, garde null si inconnu', () => {
  const t = totalOf({
    instagram: { likes: 3, comments: 1, views: 40, reach: 30 },
    facebook: { likes: 2, comments: null, views: null, reach: 10 },
  });
  assert.deepEqual(t, { likes: 5, comments: 1, views: 40, reach: 40 });
  assert.deepEqual(totalOf(undefined), { likes: null, comments: null, views: null, reach: null });
});

test('reachOf / viewsOf : null si aucun chiffre, jamais 0 inventé', () => {
  const stats: StatsMap = { a: { instagram: { likes: 1, comments: 0, views: 12, reach: 9 } } };
  assert.equal(reachOf([post('a'), post('b')], stats), 9);
  assert.equal(viewsOf([post('a')], stats), 12);
  assert.equal(reachOf([post('b')], stats), null);
});

test('bestPost : le plus de likes + commentaires, puis le plus de vues', () => {
  const stats: StatsMap = {
    a: { instagram: { likes: 2, comments: 0, views: 100, reach: 80 } },
    b: { instagram: { likes: 1, comments: 2, views: 10, reach: 8 } },
    c: { instagram: { likes: 3, comments: 0, views: 50, reach: 40 } },
  };
  assert.equal(bestPost([post('a'), post('b'), post('c')], stats)?.post.id, 'c');
  // Égalité : les vues départagent.
  assert.equal(bestPost([post('a'), post('c')], { ...stats, a: { instagram: { likes: 3, comments: 0, views: 100, reach: 1 } } })?.post.id, 'a');
  // Tout à zéro ou inconnu : rien à mettre en avant.
  assert.equal(bestPost([post('d')], { d: { instagram: { likes: 0, comments: 0, views: 0, reach: 0 } } }), null);
  assert.equal(bestPost([post('e')], {}), null);
});

test('statsLine : seulement les chiffres connus, accords', () => {
  assert.equal(statsLine({ likes: 3, comments: 1, views: 1200, reach: null }), "3 j'aime · 1 commentaire · 1 200 vues");
  assert.equal(statsLine({ likes: null, comments: 2, views: 1, reach: 1 }), '2 commentaires · 1 vue');
  assert.equal(statsLine({ likes: null, comments: null, views: null, reach: 5 }), '');
});

test('metric lit les deux formats de réponse Meta', () => {
  assert.equal(metric({ data: [{ name: 'reach', values: [{ value: 7 }] }] }, 'reach'), 7);
  assert.equal(metric({ data: [{ name: 'views', total_value: { value: 9 } }] }, 'views'), 9);
  assert.equal(metric({ data: [] }, 'reach'), null);
  assert.equal(metric(null, 'a', 'b'), null);
});
