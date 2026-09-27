import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatedOneRm } from '../src/strengthMath.ts';

test('Epley estimates use original load and reps, including for legacy rounded records', () => {
  const oldSet = { weight: 100, reps: 10, estimatedOneRm: 133 };
  const newSet = { weight: 129, reps: 1 };
  assert.ok(calculatedOneRm(oldSet) > calculatedOneRm(newSet));
  assert.equal(calculatedOneRm(oldSet), 100 * (1 + 10 / 30));
  assert.equal(calculatedOneRm({ weight: 60, reps: 5 }), 60 * (1 + 5 / 30));
});