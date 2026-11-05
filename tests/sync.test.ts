import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergePosts, type RemotePost } from '../src/lib/sync.ts';
import type { Post } from '../src/lib/types.ts';

const local = (o: Partial<Post>): Post => ({
  id: 'a', kind: 'post', imageUri: 'file://a.jpg', caption: 'Bonjour', hashtags: [], platforms: ['instagram'],
  status: 'awaiting_approval', createdAt: '2026-11-01T10:00:00Z', publications: [], ...o,
});
const remote = (o: Partial<RemotePost>): RemotePost => ({
  id: 'a', status: 'published', instagram_caption: 'Bonjour', hashtags: ['#aix'], image_urls: ['u/1.jpg'],
  created_at: '2026-11-01T10:00:00Z', published_at: '2026-11-01T10:05:00Z',
  publications: [{ platform: 'instagram', status: 'published', platform_post_url: 'https://instagram.com/p/x', error_message: null, published_at: '2026-11-01T10:05:00Z' }],
  imageUrl: 'https://signed/1.jpg', ...o,
});

test('un post publié sur un autre téléphone est ajouté à l\'historique', () => {
  const out = mergePosts([], [remote({})]);
  assert.equal(out.length, 1);
  assert.equal(out[0].status, 'published');
  assert.equal(out[0].imageUri, 'https://signed/1.jpg');
  assert.deepEqual(out[0].platforms, ['instagram']);
  assert.equal(out[0].publications[0].url, 'https://instagram.com/p/x');
});

test('le serveur fait foi pour le résultat, la photo du téléphone est gardée', () => {
  const out = mergePosts([local({ status: 'publishing' })], [remote({})]);
  assert.equal(out.length, 1);
  assert.equal(out[0].status, 'published');
  assert.equal(out[0].imageUri, 'file://a.jpg');
});

test('un brouillon du serveur ne remplace pas un post prévu sur le téléphone', () => {
  const out = mergePosts([local({ status: 'scheduled' })], [remote({ status: 'awaiting_approval', publications: [] })]);
  assert.equal(out[0].status, 'scheduled');
});

test('les brouillons et échecs qui n\'existent que sur le serveur ne sont pas ajoutés', () => {
  assert.equal(mergePosts([], [remote({ status: 'draft' }), remote({ id: 'b', status: 'failed' })]).length, 0);
});

test('les stories du téléphone sont gardées et tout est trié du plus récent au plus ancien', () => {
  const story = local({ id: 's', kind: 'story', createdAt: '2026-11-03T10:00:00Z' });
  const out = mergePosts([story], [remote({ id: 'r', created_at: '2026-11-02T10:00:00Z' })]);
  assert.deepEqual(out.map((p) => p.id), ['s', 'r']);
});
