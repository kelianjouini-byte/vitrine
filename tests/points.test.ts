import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frNumber, levelOf, MAX_SENT_PER_DAY, parisDayStart, POINTS, postsLeft, readGoal, sentPoints } from '../supabase/functions/_shared/points.ts';

test('points : +10 par envoi, 3 envois comptés par jour', () => {
  assert.equal(POINTS.sent, 10);
  assert.equal(POINTS.published, 50);
  for (let i = 0; i < MAX_SENT_PER_DAY; i++) assert.equal(sentPoints(i), 10);
  assert.equal(sentPoints(MAX_SENT_PER_DAY), 0);
});

test('niveaux : noms neutres, progression vers le suivant', () => {
  assert.equal(levelOf(0).number, 1);
  assert.equal(levelOf(299).number, 1);
  assert.equal(levelOf(300).name, 'Bon œil');
  const l = levelOf(650);
  assert.equal(l.number, 2);
  assert.equal(l.next, 1000);
  assert.equal(l.nextName, 'Pro de la vitrine');
  assert.equal(Math.round(l.progress * 100), 50);
  const top = levelOf(99999);
  assert.equal(top.number, 5);
  assert.equal(top.next, null);
  assert.equal(top.progress, 1);
  assert.equal(levelOf(-5).number, 1);
});

test('objectif : points raisonnables et récompense écrite', () => {
  assert.deepEqual(readGoal(1000, '  Un resto   offert '), { points: 1000, reward: 'Un resto offert' });
  assert.equal(readGoal(50, 'x'), null);
  assert.equal(readGoal(1000, '   '), null);
  assert.equal(readGoal('abc', 'Resto'), null);
  assert.equal(readGoal(999999, 'Resto'), null);
});

test('« encore environ N posts publiés »', () => {
  assert.equal(postsLeft(1000, 770), 4);
  assert.equal(postsLeft(1000, 0), 17);
  assert.equal(postsLeft(1000, 999), 1);
  assert.equal(postsLeft(1000, 1000), 1);
});

test('nombres à la française', () => {
  assert.equal(frNumber(1000), '1\u00a0000');
  assert.equal(frNumber(650), '650');
});

test('début du jour à Paris (hiver et été)', () => {
  assert.equal(parisDayStart(new Date('2026-11-23T15:00:00Z')).toISOString(), '2026-11-22T23:00:00.000Z');
  assert.equal(parisDayStart(new Date('2026-11-23T23:30:00Z')).toISOString(), '2026-11-23T23:00:00.000Z');
  assert.equal(parisDayStart(new Date('2026-07-10T08:00:00Z')).toISOString(), '2026-07-09T22:00:00.000Z');
});
