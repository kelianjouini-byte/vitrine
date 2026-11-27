import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_NUDGE_HOUR, NUDGE_HOURS, nudgeCount, nudgeDue, parisDayStart, parisNow, pickNudge, type NudgeContext } from '../supabase/functions/_shared/nudges.ts';

const ctx = (o: Partial<NudgeContext> = {}): NudgeContext => ({
  firstName: 'Christelle', businessName: 'Fleurs de Christelle', businessType: 'fleuriste', city: 'Aix-en-Provence',
  daysSincePost: 1, occasion: null, weekday: 1, seed: 'abc:2026-11-27', recent: [], ...o,
});

test('une grande réserve de textes, sans emoji, sans variable oubliée', () => {
  assert.ok(nudgeCount() >= 100, `seulement ${nudgeCount()} textes`);
  const seen = new Set<string>();
  for (let i = 0; i < 400; i++) {
    for (const type of ['fleuriste', 'boulangerie', 'coiffure', 'caviste', 'boucherie', 'restaurant', 'vetements', 'artisan', 'autre']) {
      const n = pickNudge(ctx({ seed: `s${i}`, businessType: type, weekday: i % 7, daysSincePost: i % 10 }));
      seen.add(n.id);
      assert.doesNotMatch(n.title + n.body, /[{}]/, n.id);
      assert.doesNotMatch(n.title + n.body, /\p{Extended_Pictographic}/u, n.id);
      assert.ok(n.title.length <= 60 && n.body.length <= 140, n.id);
    }
  }
  assert.ok(seen.size >= 45, `seulement ${seen.size} textes différents tirés`);
});

test('même jour = même texte ; jours différents = textes variés', () => {
  assert.deepEqual(pickNudge(ctx()), pickNudge(ctx()));
  const week = new Set(Array.from({ length: 7 }, (_, i) => pickNudge(ctx({ seed: `abc:2026-12-0${i + 1}` })).id));
  assert.ok(week.size >= 5);
});

test('les textes envoyés récemment ne reviennent pas', () => {
  const first = pickNudge(ctx());
  const second = pickNudge(ctx({ recent: [first.id] }));
  assert.notEqual(second.id, first.id);
});

test('une fête toute proche passe en premier', () => {
  const n = pickNudge(ctx({ occasion: { name: 'Noël', inDays: 1 } }));
  assert.equal(n.title, "Noël, c'est demain");
  assert.equal(pickNudge(ctx({ occasion: { name: 'Noël', inDays: 0 } })).title, "C'est Noël aujourd'hui");
});

test('jamais publié : texte de première publication ; long silence : texte doux', () => {
  const never = Array.from({ length: 30 }, (_, i) => pickNudge(ctx({ daysSincePost: null, seed: `n${i}` })).id);
  assert.ok(never.filter((id) => id.startsWith('p-premier')).length >= 10);
  const ids = Array.from({ length: 30 }, (_, i) => pickNudge(ctx({ daysSincePost: 12, seed: `x${i}` })).id);
  assert.ok(ids.some((id) => id === 'p-douceur' || id === 'p-revenir'));
  for (const i of [0, 1, 2]) {
    const n = pickNudge(ctx({ daysSincePost: 4, seed: `y${i}` }));
    if (n.id.startsWith('p-')) assert.match(n.body, /4 jours/);
  }
});

test('sans prénom, jamais de « Bonjour » tout seul', () => {
  for (let i = 0; i < 300; i++) assert.notEqual(pickNudge(ctx({ firstName: '', seed: `z${i}` })).title.trim(), 'Bonjour');
});

test('heure de Paris (hiver et été)', () => {
  assert.deepEqual(parisNow(new Date('2026-11-27T09:30:00Z')), { day: '2026-11-27', weekday: 4, hour: 10 });
  assert.deepEqual(parisNow(new Date('2026-07-05T22:30:00Z')), { day: '2026-07-06', weekday: 0, hour: 0 });
  assert.equal(parisDayStart(new Date('2026-11-27T09:30:00Z')).toISOString(), '2026-11-26T23:00:00.000Z');
  assert.equal(parisDayStart(new Date('2026-07-06T10:00:00Z')).toISOString(), '2026-07-05T22:00:00.000Z');
});

test("envoi : jours d'ouverture, à l'heure choisie, une fois, et pas si déjà publié", () => {
  const h = { hour: 10, closedDays: [6], closedDates: ['2026-12-25'] };
  const free = { sentToday: false, postedToday: false };
  // Vendredi 27 novembre 2026, heures de Paris (UTC+1).
  assert.equal(nudgeDue(h, new Date('2026-11-27T08:05:00Z'), free), 'not_yet'); // 9 h
  assert.equal(nudgeDue(h, new Date('2026-11-27T09:05:00Z'), free), true); // 10 h
  assert.equal(nudgeDue(h, new Date('2026-11-27T10:05:00Z'), free), true); // 11 h : passage manqué, on rattrape
  assert.equal(nudgeDue(h, new Date('2026-11-27T11:05:00Z'), free), 'too_late'); // 12 h : trop tard (boutique peut-être fermée)
  assert.equal(nudgeDue(h, new Date('2026-11-27T09:05:00Z'), { sentToday: true, postedToday: false }), 'already_sent');
  assert.equal(nudgeDue(h, new Date('2026-11-27T09:05:00Z'), { sentToday: false, postedToday: true }), 'already_posted');
  assert.equal(nudgeDue(h, new Date('2026-11-29T09:05:00Z'), free), 'closed_day'); // dimanche fermé
  assert.equal(nudgeDue(h, new Date('2026-12-25T09:05:00Z'), free), 'closed_day'); // Noël fermé
});

test('heure du rappel : 10 h par défaut, choix simples', () => {
  assert.equal(DEFAULT_NUDGE_HOUR, 10);
  assert.ok(NUDGE_HOURS.includes(DEFAULT_NUDGE_HOUR));
});

test('surtout des rappels courts « postez » : au moins 6 jours sur 10', () => {
  let short = 0;
  for (let i = 0; i < 1000; i++) if (pickNudge(ctx({ seed: `k${i}` })).id.startsWith('s-')) short++;
  assert.ok(short >= 600, `${short} / 1000`);
});

test("« d'Aix » et « de Marseille »", () => {
  const find = (city: string) => {
    for (let i = 0; i < 500; i++) { const n = pickNudge(ctx({ city, seed: `v${i}`, businessType: 'autre' })); if (n.id === 'g-une-minute') return n.body; }
    return '';
  };
  assert.match(find('Aix-en-Provence'), /hashtags d'Aix-en-Provence/);
  assert.match(find('Marseille'), /hashtags de Marseille/);
});
