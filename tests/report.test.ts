import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addMonths, basicAdvice, comparisonText, durationLabel, firstMonth, monthKey, ofMonth, postsOfMonth,
  reportReminderDates, reportReminderText, summarize,
} from '../src/lib/report.ts';
import { buildReportPrompt, parseAdvice, type ReportContext } from '../supabase/functions/_shared/report.ts';
import type { Post } from '../src/lib/types.ts';

const post = (id: string, date: string, status: Post['status'] = 'published'): Post => ({
  id, imageUri: 'x.jpg', caption: '', hashtags: [], platforms: ['instagram'], status, createdAt: date, publishedAt: status === 'published' ? date : null, publications: [],
});

const posts = [
  post('a', '2026-11-02T10:00:00'), post('b', '2026-11-03T10:00:00'), post('c', '2026-11-03T12:00:00', 'draft'),
  post('d', '2026-10-05T10:00:00'), post('e', '2026-10-20T10:00:00'), post('f', '2026-10-28T10:00:00'),
  post('g', '2026-09-01T10:00:00', 'failed'),
];
const nov = { year: 2026, month: 10 };
const today = new Date(2026, 10, 3, 15);

test('seuls les posts vraiment publiés comptent, dans le bon mois', () => {
  assert.deepEqual(postsOfMonth(posts, nov).map((p) => p.id), ['b', 'a']);
  assert.equal(postsOfMonth(posts, { year: 2026, month: 8 }).length, 0); // l'échec de septembre ne compte pas
});

test('bilan : vrais chiffres, temps gagné à 20 min par post, baisse en cours de mois', () => {
  const s = summarize(posts, nov, today);
  assert.equal(s.count, 2);
  assert.equal(s.previousCount, 3);
  assert.equal(s.minutesSaved, 40);
  assert.equal(s.trend, 'down');
  assert.equal(s.inProgress, true);
  assert.equal(s.daysLeft, 27);
  assert.match(comparisonText(s), /En octobre : 3 posts\. Pour l'instant, 1 post de moins, mais il reste 27 jours/);
});

test('comparaison d\'un mois fini, en hausse, et sans mois d\'avant', () => {
  const oct = summarize(posts, { year: 2026, month: 9 }, today);
  assert.equal(oct.trend, 'first');
  assert.equal(oct.inProgress, false);
  const up = summarize([...posts, post('h', '2026-11-10T10:00:00'), post('i', '2026-11-11T10:00:00')], nov, new Date(2026, 11, 2));
  assert.equal(up.trend, 'up');
  assert.match(comparisonText(up), /En novembre, c'est 1 post de plus/);
  assert.equal(comparisonText(summarize([], nov, today)), 'Aucun post publié en novembre ni en octobre.');
});

test('durées et noms de mois', () => {
  assert.equal(durationLabel(0), '0 min');
  assert.equal(durationLabel(40), '40 min');
  assert.equal(durationLabel(60), '1 h');
  assert.equal(durationLabel(80), '1 h 20');
  assert.equal(ofMonth({ year: 2026, month: 9 }), "d'octobre");
  assert.equal(ofMonth({ year: 2026, month: 10 }), 'de novembre');
  assert.equal(ofMonth({ year: 2026, month: 3 }), "d'avril");
  assert.deepEqual(addMonths({ year: 2026, month: 0 }, -1), { year: 2025, month: 11 });
  assert.equal(monthKey({ year: 2026, month: 0 }), '2026-01');
});

test('on peut toujours remonter au moins au mois d\'avant', () => {
  assert.deepEqual(firstMonth([], today), { year: 2026, month: 9 });
  assert.deepEqual(firstMonth(posts, today), { year: 2026, month: 9 });
  assert.deepEqual(firstMonth([post('z', '2026-06-01T10:00:00')], today), { year: 2026, month: 5 });
});

test('notification le 1er du mois, pour le mois qui vient de finir', () => {
  const dates = reportReminderDates(today, 9, 3);
  assert.equal(dates.length, 3);
  assert.equal(dates[0].date.getDate(), 1);
  assert.equal(dates[0].date.getMonth(), 11);
  assert.equal(dates[0].date.getHours(), 9);
  assert.deepEqual(dates[0].month, nov);
  assert.equal(reportReminderText(nov).title, '📈 Votre bilan de novembre est prêt');
  assert.equal(reportReminderText({ year: 2026, month: 9 }).title, "📈 Votre bilan d'octobre est prêt");
});

test('conseil de base : aucun chiffre inventé', () => {
  for (const s of [summarize(posts, nov, today), summarize([], nov, today), summarize(posts, { year: 2026, month: 9 }, today)]) {
    assert.doesNotMatch(basicAdvice(s, { name: 'Noël' }), /\d/);
  }
});

const ctx: ReportContext = {
  businessName: 'Fleurs de Marie', trade: 'Fleuriste', city: 'Lyon', tone: 'chaleureux', products: 'Bouquets', tradeHint: null,
  monthLabel: 'novembre 2026', previousMonthName: 'octobre', count: 2, previousCount: 3, inProgress: false, daysLeft: 0,
  occasions: [{ name: 'Noël', date: '2026-12-25' }, { name: 'Saint-Nicolas 6 décembre', date: '2026-12-06' }],
};

test('la consigne contient les vrais chiffres, la tendance et les occasions', () => {
  const p = buildReportPrompt(ctx);
  for (const part of ['2 post(s)', 'En octobre : 3', 'En baisse', 'Noël (2026-12-25)', 'Fleuriste']) assert.ok(p.includes(part), part);
});

test('le conseil de l\'IA est refusé s\'il invente un chiffre, un prix ou un horaire', () => {
  assert.equal(parseAdvice('{"advice": "Publiez un bouquet chaque lundi matin : vos clients prendront l\'habitude."}', ctx), "Publiez un bouquet chaque lundi matin : vos clients prendront l'habitude.");
  assert.ok(parseAdvice('{"advice": "Vous êtes passé de 3 à 2 posts : un post par semaine suffit pour remonter."}', ctx));
  assert.ok(parseAdvice('{"advice": "Pensez à la Saint-Nicolas 6 décembre avec une jolie photo."}', ctx));
  assert.equal(parseAdvice('{"advice": "Publiez 5 posts pour gagner 200 vues de plus !"}', ctx), null);
  assert.equal(parseAdvice('{"advice": "Faites une promotion de 10 € sur les bouquets."}', ctx), null);
  assert.equal(parseAdvice('{"advice": "Rappelez vos horaires du dimanche à vos clients."}', ctx), null);
  assert.equal(parseAdvice('pas du json', ctx), null);
  assert.equal(parseAdvice('{"advice": "Ok"}', ctx), null);
});
