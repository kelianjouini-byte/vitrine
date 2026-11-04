import { test } from 'node:test';
import assert from 'node:assert/strict';
import { holidayNote, buildWeek, dayKey, planReminders, postsOfDay, statusAfterPublish, weekCount, weekLabel, weekRhythm, weekStart } from '../src/lib/planning.ts';
import { holidaysForYear, upcomingEvents, upcomingHolidays } from '../src/lib/events.ts';
import type { Business, Post } from '../src/lib/types.ts';

const b: Business = { ownerFirstName: 'Marie', businessName: 'Les Fleurs de Marie', businessType: 'fleuriste', city: 'Lyon', postalCode: '69003', tone: 'chaleureux', specialties: 'Bouquets de saison, plantes' };

test('rythme conseillé : 3 posts, 2 stories, repos lundi et dimanche', () => {
  assert.deepEqual(weekRhythm(), ['rest', 'post', 'story', 'post', 'story', 'post', 'rest']);
});

test('les jours de fermeture restent au repos et le rythme se décale', () => {
  const r = weekRhythm([1, 5]); // mardi et samedi fermés
  assert.equal(r[1], 'rest');
  assert.equal(r[5], 'rest');
  assert.equal(r.filter((k) => k === 'post').length, 3);
  assert.equal(r.filter((k) => k === 'story').length, 2);
});

test('la semaine commence le lundi', () => {
  const s = weekStart(new Date(2026, 10, 4)); // mercredi 4 novembre
  assert.equal(dayKey(s), '2026-11-02');
  assert.equal(weekLabel(s), 'Du 2 au 8 novembre');
  assert.equal(weekLabel(weekStart(new Date(2026, 11, 1))), 'Du 30 novembre au 6 décembre');
});

test('chaque jour de post ou de story a une idée, le choix du commerçant passe avant le conseil', () => {
  const start = weekStart(new Date(2026, 10, 4));
  const days = buildWeek(b, start, { '2026-11-06': { kind: 'rest' } }, []);
  assert.equal(days.length, 7);
  for (const d of days) assert.equal(!!d.idea, d.kind !== 'rest', d.key);
  assert.equal(days[4].advice, 'story');
  assert.equal(days[4].kind, 'rest');
});

test('« Une autre idée » change l\'idée du jour', () => {
  const start = weekStart(new Date(2026, 10, 4));
  const a = buildWeek(b, start, {}, [])[1].idea!.title;
  const c = buildWeek(b, start, { '2026-11-03': { shift: 1 } }, [])[1].idea!.title;
  assert.notEqual(a, c);
});

test('une fête proche se prépare avec le dernier post avant elle', () => {
  const start = weekStart(new Date(2026, 11, 9)); // semaine du 7 décembre
  const days = buildWeek(b, start, {}, upcomingEvents(b, start, 2, b.postalCode));
  const fete = days.find((d) => d.occasion);
  assert.ok(fete, 'Noël doit apparaître');
  assert.equal(fete!.kind, 'post');
  assert.ok(fete!.idea!.title.startsWith('Préparer'));
});

const post = (over: Partial<Post>): Post => ({ id: Math.random().toString(), imageUri: '', caption: 'x', hashtags: [], platforms: ['instagram'], status: 'published', createdAt: '2026-11-01T10:00:00', publications: [], ...over });

test('posts du jour et compteur de la semaine', () => {
  const posts = [
    post({ status: 'scheduled', scheduledFor: new Date(2026, 10, 5, 9).toISOString() }),
    post({ publishedAt: new Date(2026, 10, 3, 11).toISOString() }),
    post({ kind: 'story', publishedAt: new Date(2026, 10, 4, 8).toISOString() }),
    post({ status: 'draft', createdAt: new Date(2026, 10, 4, 8).toISOString() }),
  ];
  assert.equal(postsOfDay(posts, '2026-11-05').length, 1);
  assert.equal(postsOfDay(posts, '2026-11-04').length, 1);
  const days = buildWeek(b, weekStart(new Date(2026, 10, 4)), {}, []);
  assert.deepEqual(weekCount(posts, days), { post: 2, story: 1 });
});

test('rappels : « post prêt » le jour prévu, idée du jour sinon, rien les jours de repos ni dans le passé', () => {
  const now = new Date(2026, 10, 4, 10); // mercredi 10 h, rappels à 9 h
  const posts = [post({ status: 'scheduled', scheduledFor: new Date(2026, 10, 5, 9).toISOString() })];
  const r = planReminders(b, posts, {}, [], 9, now, 7);
  assert.equal(r[0].day, '2026-11-05');
  assert.equal(r[0].title, 'Votre post du jour est prêt');
  assert.ok(!r.some((x) => x.day === '2026-11-04'), 'mercredi 9 h est passé');
  assert.ok(!r.some((x) => x.day === '2026-11-08' || x.day === '2026-11-09'), 'dimanche et lundi : repos');
  assert.equal(new Set(r.map((x) => x.day)).size, r.length, 'un rappel par jour au plus');
});

test('statut après publication', () => {
  assert.equal(statusAfterPublish([{ platform: 'instagram', status: 'published' }]), 'published');
  assert.equal(statusAfterPublish([{ platform: 'instagram', status: 'published' }, { platform: 'facebook', status: 'failed' }]), 'partially_published');
  assert.equal(statusAfterPublish([{ platform: 'instagram', status: 'not_configured' }]), 'draft');
  assert.equal(statusAfterPublish([{ platform: 'instagram', status: 'failed' }]), 'failed');
});

test('le jour même d\'une fête : un post ET une story, et le post de préparation avant', () => {
  const start = weekStart(new Date(2026, 11, 23)); // semaine du 21 décembre
  const days = buildWeek(b, start, {}, upcomingEvents(b, start, 2, b.postalCode));
  const noel = days.find((d) => d.key === '2026-12-25')!;
  assert.equal(noel.kind, 'both');
  assert.ok(noel.feteDay);
  assert.ok(noel.idea && noel.storyIdea);
  assert.ok(noel.idea!.title.includes('Noël'));
  const prep = days.find((d) => !d.feteDay && d.occasion?.key === 'noel');
  assert.ok(prep && prep.key < '2026-12-25' && prep.kind === 'post');
  // Le commerçant peut choisir seulement une story ce jour-là.
  const s = buildWeek(b, start, { '2026-12-25': { kind: 'story' } }, upcomingEvents(b, start, 2, b.postalCode)).find((d) => d.key === '2026-12-25')!;
  assert.equal(s.kind, 'story');
  assert.equal(s.storyIdea, null);
});

test('les 11 jours fériés de 2026, 13 en Alsace-Moselle', () => {
  const keys = holidaysForYear(2026).map((h) => dayKey(h.date));
  assert.deepEqual(keys, ['2026-01-01', '2026-04-06', '2026-05-01', '2026-05-08', '2026-05-14', '2026-05-25', '2026-07-14', '2026-08-15', '2026-11-01', '2026-11-11', '2026-12-25']);
  const alsace = holidaysForYear(2026, '67000').map((h) => dayKey(h.date));
  assert.equal(alsace.length, 13);
  assert.ok(alsace.includes('2026-04-03') && alsace.includes('2026-12-26'));
});

test('jour férié : question, puis post la veille pour prévenir (ouvert ou fermé)', () => {
  const start = weekStart(new Date(2026, 10, 11));
  const hol = upcomingHolidays(start, 2);
  // Pas encore de réponse : la veille (mardi 10), Vitrine pose la question.
  let days = buildWeek(b, start, {}, [], hol);
  assert.equal(days[2].holiday?.key, 'ferie-11-novembre');
  assert.equal(days[1].announce?.key, 'ferie-11-novembre');
  assert.equal(days[1].kind, 'post');
  assert.ok(days[1].idea!.title.includes('?'));
  // Ouvert, avec horaires : le texte du post les reprend tels quels.
  const open = { ...b, holidays: { 'ferie-11-novembre-2026': { open: true, hours: 'de 9 h à 13 h' } } };
  days = buildWeek(open, start, {}, [], hol);
  assert.equal(days[1].idea!.title, 'Ouvert le 11 novembre');
  assert.equal(holidayNote(open, days[1].announce!), 'Ouvert le mercredi 11 novembre (jour férié), de 9 h à 13 h.');
  // Fermé : repos le 11, post « Fermé » la veille.
  const closed = { ...b, holidays: { 'ferie-11-novembre-2026': { open: false } } };
  days = buildWeek(closed, start, {}, [], hol);
  assert.equal(days[2].kind, 'rest');
  assert.equal(days[1].idea!.title, 'Fermé le 11 novembre');
  // Boutique fermée le mardi : on prévient le lundi.
  days = buildWeek({ ...b, closedDays: [1] }, start, {}, [], hol);
  assert.equal(days[0].announce?.key, 'ferie-11-novembre');
});

test('rappel « Êtes-vous ouvert ? » une semaine avant un jour férié sans réponse', () => {
  const now = new Date(2026, 10, 2, 8);
  const r = planReminders(b, [], {}, [], 9, now, 14, upcomingHolidays(now, 2));
  const q = r.find((x) => x.title === 'Le 11 novembre est férié');
  assert.ok(q);
  assert.equal(dayKey(q!.date), '2026-11-04');
  const answered = { ...b, holidays: { 'ferie-11-novembre-2026': { open: true } } };
  assert.ok(!planReminders(answered, [], {}, [], 9, now, 14, upcomingHolidays(now, 2)).some((x) => x.title === 'Le 11 novembre est férié'));
});
