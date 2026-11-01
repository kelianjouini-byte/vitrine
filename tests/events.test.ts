import { test } from 'node:test';
import assert from 'node:assert/strict';
import { easterSunday, mothersDay, winterSales, summerSales, epiphany, eventsForYear, upcomingEvents, daysUntil } from '../src/lib/events.ts';

const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;

test('Pâques', () => {
  assert.equal(iso(easterSunday(2024)), '2024-03-31');
  assert.equal(iso(easterSunday(2025)), '2025-04-20');
  assert.equal(iso(easterSunday(2026)), '2026-04-05');
  assert.equal(iso(easterSunday(2027)), '2027-03-28');
});

test('Fête des mères (décalée si Pentecôte)', () => {
  assert.equal(iso(mothersDay(2024)), '2024-05-26');
  assert.equal(iso(mothersDay(2025)), '2025-05-25');
  assert.equal(iso(mothersDay(2026)), '2026-05-31');
  assert.equal(iso(mothersDay(2027)), '2027-05-30');
  // 2024? Pentecôte = 19 mai -> pas de décalage. 2008 : Pentecôte 11 mai.
  // Cas de décalage connu : 2061 (Pâques 10 avril, Pentecôte 29 mai = dernier dimanche de mai)
  assert.equal(iso(mothersDay(2061)), '2061-06-05');
});

test('Soldes officiels', () => {
  assert.equal(iso(winterSales(2025).start), '2025-01-08');
  assert.equal(iso(winterSales(2026).start), '2026-01-07');
  assert.equal(iso(summerSales(2025).start), '2025-06-25');
  assert.equal(iso(summerSales(2026).start), '2026-06-24');
  assert.equal(iso(winterSales(2026).end), '2026-02-03');
});

test('Épiphanie', () => {
  assert.equal(iso(epiphany(2026)), '2026-01-04');
  assert.equal(iso(epiphany(2023)), '2023-01-08');
});

test('Black Friday et Cyber Monday', () => {
  const e = eventsForYear(2026);
  assert.equal(iso(e.find((x) => x.name === 'Black Friday')!.date), '2026-11-27');
  assert.equal(iso(e.find((x) => x.name === 'Cyber Monday')!.date), '2026-11-30');
  assert.equal(iso(e.find((x) => x.name === 'Beaujolais nouveau')!.date), '2026-11-19');
});

test('Filtre par métier', () => {
  const from = new Date(2026, 10, 1);
  const fleuriste = upcomingEvents('fleuriste', from).map((e) => e.name);
  assert.ok(fleuriste.includes('Toussaint'));
  assert.ok(fleuriste.includes('Saint-Valentin'));
  assert.ok(!fleuriste.includes('Épiphanie'));
  const boulangerie = upcomingEvents('boulangerie', from).map((e) => e.name);
  assert.ok(boulangerie.includes('Épiphanie'));
  assert.ok(!boulangerie.includes('Toussaint'));
});

test('Jours restants', () => {
  assert.equal(daysUntil(new Date(2026, 10, 27), new Date(2026, 10, 1, 23, 0)), 26);
});
