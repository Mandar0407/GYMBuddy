import test from 'node:test';
import assert from 'node:assert/strict';
import { workoutMetrics } from '../src/useWorkoutSessions.ts';

test('walk distance and pace use detected steps and the saved stride, not daily step totals', () => {
  const result = workoutMetrics({ kind: 'outdoor-walk', steps: 1000, strideCm: 70, weightKg: 68 }, 600_000, true);
  assert.equal(result.distanceMeters, 700);
  assert.ok(Math.abs(result.averagePaceSecondsPerKm - 600 / .7) < .0001);
  assert.ok(Math.abs(result.activeCalories - .7 * 68 * .53) < .0001);
  assert.ok(result.totalCalories > result.activeCalories);
});

test('unavailable walking sensor yields no invented measurements; strength energy uses time', () => {
  const walk = workoutMetrics({ kind: 'indoor-walk', steps: 0, strideCm: 72, weightKg: 68 }, 600_000, false);
  assert.equal(walk.distanceMeters, null);
  assert.equal(walk.averagePaceSecondsPerKm, null);
  assert.equal(walk.activeCalories, null);
  assert.equal(walk.totalCalories, null);
  const strength = workoutMetrics({ kind: 'strength', steps: 0, strideCm: 72, weightKg: 68 }, 3_600_000, false);
  assert.equal(strength.distanceMeters, null);
  assert.equal(strength.averagePaceSecondsPerKm, null);
  assert.equal(strength.activeCalories, 170);
  assert.equal(strength.totalCalories, 238);
});