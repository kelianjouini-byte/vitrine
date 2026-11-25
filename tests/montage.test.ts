import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CROSSFADE_SECONDS, clock, layersAt, limitLabel, planMontage, usedSeconds } from '../src/lib/montage.ts';

test('montage : un seul bout, pas de fondu', () => {
  const p = planMontage([4]);
  assert.equal(p.fade, 0);
  assert.equal(p.total, 4);
  assert.deepEqual(layersAt(p, 2), [{ index: 0, local: 2, alpha: 1 }]);
});

test('montage : les bouts se chevauchent du temps du fondu', () => {
  const p = planMontage([2, 3, 1.5]);
  assert.equal(p.fade, CROSSFADE_SECONDS);
  assert.deepEqual(p.starts, [0, 1.75, 4.5]);
  assert.equal(p.total, 2 + 3 + 1.5 - 2 * CROSSFADE_SECONDS);
});

test('montage : pendant le fondu, le bout suivant apparaît par-dessus', () => {
  const p = planMontage([2, 3]);
  const mid = layersAt(p, 1.875);
  assert.equal(mid.length, 2);
  assert.equal(mid[0].index, 0);
  assert.equal(mid[0].alpha, 1);
  assert.equal(mid[1].index, 1);
  assert.ok(Math.abs(mid[1].alpha - 0.5) < 1e-9);
  assert.deepEqual(layersAt(p, 2.5).map((l) => l.index), [1]);
});

test('montage : un bout très court raccourcit le fondu', () => {
  const p = planMontage([0.3, 2]);
  assert.ok(p.fade <= 0.1 + 1e-9);
});

test('montage : jamais de trou noir, chaque instant montre au moins un bout', () => {
  const p = planMontage([1.2, 0.8, 2.4, 0.5]);
  for (let t = 0; t < p.total; t += 1 / 30) assert.ok(layersAt(p, t).length >= 1, `t=${t}`);
});

test('compteur et limites', () => {
  assert.equal(usedSeconds([{ seconds: 2.2 }, { seconds: 1.6 }]), 3.8000000000000003);
  assert.equal(clock(5.9), '0:05');
  assert.equal(clock(72), '1:12');
  assert.equal(limitLabel(90), '1 min 30');
  assert.equal(limitLabel(60), '1 min');
  assert.equal(limitLabel(45), '45 secondes');
});
