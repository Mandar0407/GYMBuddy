import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAdvancedAnalytics } from '../src/advancedAnalytics.ts';

const empty = {
  currentDate: '2026-10-01',
  meals: [], steps: {}, workouts: [], completedWorkouts: [],
  weightHistory: {}, calorieTarget: 2200, proteinTarget: 100,
};

test('rolling last seven days keep absent entries distinct from recorded zero', () => {
  const result = buildAdvancedAnalytics({ ...empty, steps: { '2026-09-25': 0, '2026-10-01': 4000 } });
  assert.deepEqual(result.days.map((day) => day.key), [
    '2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01',
  ]);
  assert.equal(result.days[0].steps, 0);
  assert.equal(result.days[1].steps, null);
  assert.equal(result.days[1].calories, null);
  assert.equal(result.averageSteps, 2000);
  assert.equal(result.stepDays, 2);
  assert.equal(result.averageProteinTargetRate, null);
});

test('nutrition target rates use meal-logged days; completed workouts need explicit markers', () => {
  const result = buildAdvancedAnalytics({
    ...empty,
    meals: [
      { date: '2026-09-30', calories: 450, protein: 40 },
      { date: '2026-09-30', calories: 350, protein: 60 },
      { date: '2026-10-01', calories: 200, protein: 50 },
    ],
    workouts: [{ date: '2026-09-30' }, { date: '2026-09-30' }, { date: '2026-10-01' }],
    completedWorkouts: [{ date: '2026-09-30' }, { date: '2026-09-30' }, { date: '2026-09-24' }],
  });
  assert.equal(result.days[5].calories, 800);
  assert.equal(result.days[5].protein, 100);
  assert.equal(result.averageProteinTargetRate, 75);
  assert.equal(result.mealDays, 2);
  assert.equal(result.workoutDays, 2);
  assert.equal(result.completedWorkoutCount, 2);
});

test('weight trend averages only logged measurements and never fabricates missing days', () => {
  const result = buildAdvancedAnalytics({
    ...empty,
    weightHistory: { '2026-09-25': 71, '2026-09-27': 70, '2026-09-30': 69, '2026-10-01': 68 },
  });
  assert.equal(result.days[0].weightAverage, null);
  assert.equal(result.days[1].weight, null);
  assert.equal(result.days[2].weightAverage, 70.5);
  assert.equal(result.days[5].weightAverage, 70);
  assert.equal(result.days[6].weightAverage, 69);
});