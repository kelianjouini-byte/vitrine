import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { musicVolumeAt, suggestTrack, TRACKS } from '../src/lib/music.ts';
import { eventsForYear } from '../src/lib/events.ts';

test('musiques : identifiants uniques, et chacune a son fichier dans videoMusic.ts', () => {
  const ids = TRACKS.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  const src = readFileSync(new URL('../src/lib/videoMusic.ts', import.meta.url), 'utf8');
  for (const id of ids) assert.ok(src.includes(`'${id}': require('../../assets/sons/${id}.mp3')`), id);
});

test('musiques : chaque fête citée existe bien dans le calendrier', () => {
  const names = new Set(eventsForYear(2027).map((e) => e.name));
  for (const t of TRACKS) for (const o of t.occasions ?? []) assert.ok(names.has(o), `${t.id} : ${o}`);
});

test('musique proposée : la fête qui arrive, sinon la saison, sinon Cocooning', () => {
  const today = new Date(2026, 11, 20);
  assert.equal(suggestTrack([{ name: 'Noël', date: new Date(2026, 11, 25) }], today), 'noel');
  assert.equal(suggestTrack([{ name: 'Noël', date: new Date(2027, 0, 25) }], today), 'cocooning');
  assert.equal(suggestTrack([{ name: 'Noël', date: new Date(2026, 11, 25), notifyDaysBefore: 21 }], new Date(2026, 11, 6)), 'noel');
  assert.equal(suggestTrack([], new Date(2026, 6, 10)), 'ete');
  assert.equal(suggestTrack([], new Date(2026, 9, 10)), 'automne');
});

test('le son redescend jusqu\'à zéro pile à la fin de la story', () => {
  assert.equal(musicVolumeAt(0, 20), 0);
  assert.equal(musicVolumeAt(10, 20), 1);
  assert.ok(musicVolumeAt(18.5, 20) > 0.4 && musicVolumeAt(18.5, 20) < 0.6);
  assert.ok(musicVolumeAt(19.9, 20) < 0.05);
  assert.equal(musicVolumeAt(20, 20), 0);
  // Vidéo très courte : la descente reste proportionnée.
  assert.ok(musicVolumeAt(2.5, 4) > 0 && musicVolumeAt(2.5, 4) <= 1);
});
