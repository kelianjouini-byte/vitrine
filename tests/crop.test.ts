import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CENTERED, FEED_FORMATS, clampFraming, cropRect, FORMATS, formatRatio, MAX_ZOOM } from '../src/lib/crop.ts';

const portraitPhoto = { width: 3000, height: 4000 };
const landscapePhoto = { width: 4000, height: 3000 };

test('formats : tous dans les limites Instagram (de 4:5 à 1,91:1)', () => {
  for (const f of FEED_FORMATS) {
    const r = formatRatio(f);
    assert.ok(r >= 0.8 && r <= 1.91, `${f} : ${r}`);
    assert.equal(FORMATS[f].width, 1080);
  }
});

test('story : plein écran vertical 9:16, en 1080 x 1920', () => {
  assert.equal(FORMATS.story.width, 1080);
  assert.equal(FORMATS.story.height, 1920);
  const r = cropRect(landscapePhoto, 'story', CENTERED);
  assert.equal(r.height, 3000);
  assert.equal(r.width, Math.round(3000 * 9 / 16));
  assert.equal(r.originX, Math.floor((4000 - 3000 * 9 / 16) / 2));
});

test('zoom 1 centré : le plus grand cadre possible, au milieu', () => {
  const r = cropRect(portraitPhoto, 'square', CENTERED);
  assert.deepEqual(r, { originX: 0, originY: 500, width: 3000, height: 3000 });
  const p = cropRect(landscapePhoto, 'portrait', CENTERED);
  assert.equal(p.height, 3000);
  assert.equal(p.width, 2400);
  assert.equal(p.originX, 800);
});

test('le cadre ne sort jamais de la photo, même tiré tout au bord', () => {
  for (const framing of [{ zoom: 1, cx: -2, cy: -2 }, { zoom: 3, cx: 5, cy: 5 }, { zoom: 10, cx: 0.5, cy: 0.5 }]) {
    for (const f of ['portrait', 'square', 'landscape'] as const) {
      const r = cropRect(landscapePhoto, f, framing);
      assert.ok(r.originX >= 0 && r.originY >= 0, JSON.stringify(r));
      assert.ok(r.originX + r.width <= landscapePhoto.width && r.originY + r.height <= landscapePhoto.height, JSON.stringify(r));
      assert.ok(Math.abs(r.width / r.height - formatRatio(f)) < 0.01, `${f} garde son format`);
    }
  }
});

test('zoom : le cadre rétrécit, limité à x4', () => {
  assert.equal(cropRect(portraitPhoto, 'square', { zoom: 2, cx: 0.5, cy: 0.5 }).width, 1500);
  assert.equal(cropRect(portraitPhoto, 'square', { zoom: 99, cx: 0.5, cy: 0.5 }).width, 3000 / MAX_ZOOM);
});

test('clampFraming : ramène le centre visé à un endroit possible', () => {
  const f = clampFraming(portraitPhoto, 'square', { zoom: 1, cx: 0.9, cy: 0 });
  assert.equal(f.cx, 0.5); // la photo est aussi large que le cadre : impossible d'aller à droite
  assert.equal(f.cy, 1500 / 4000);
});
