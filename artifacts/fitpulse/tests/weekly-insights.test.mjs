import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWeeklyInsights } from '../src/weeklyInsights.ts';

const base = {
  todayKey: '2026-09-30',
  weekOffset: 0,
  steps: {},
  water: {},
  meals: [],
  workouts: [],
  stepGoal: 10000,
  waterGoal: 2000,
  calorieGoal: 2200,
};

test('empty weeks do not present missing activity as zero', () => {
  const result = buildWeeklyInsights(base);
  assert.equal(result.days.length, 7);
  assert.equal(result.anyEntries, false);
  assert.equal(result.days[0].steps, null);
  assert.equal(result.days[3].isFuture, true);
  assert.equal(result.rangeLabel, 'Sep 28 – Oct 4, 2026');
});

test('weekly insights update from recorded steps, meals, water and sets', () => {
  const result = buildWeeklyInsights({
    ...base,
    steps: { '2026-09-28': 12000, '2026-09-30': 0 },
    water: { '2026-09-28': 2100, '2026-09-30': 0 },
    meals: [{ date: '2026-09-29', calories: 600 }, { date: '2026-09-29', calories: 450 }],
    workouts: [{ date: '2026-09-28' }, { date: '2026-09-28' }],
  });
  assert.equal(result.stepsTotal, 12000);
  assert.equal(result.stepDaysLogged, 2);
  assert.equal(result.stepGoalDays, 1);
  assert.equal(result.days[2].steps, 0);
  assert.equal(result.days[1].steps, null);
  assert.equal(result.waterDaysLogged, 2);
  assert.equal(result.waterGoalDays, 1);
  assert.equal(result.mealsLogged, 2);
  assert.equal(result.calorieLoggedTotal, 1050);
  assert.equal(result.nutritionDaysLogged, 1);
  assert.equal(result.workoutSets, 2);
  assert.equal(result.workoutDays, 1);
  assert.match(result.takeaway, /12,000 steps/);
});

test('earlier weeks use their own Monday through Sunday and cannot include future entries', () => {
  const result = buildWeeklyInsights({
    ...base,
    weekOffset: -1,
    steps: { '2026-09-21': 500, '2026-09-28': 30000 },
  });
  assert.equal(result.isCurrentWeek, false);
  assert.equal(result.days[0].key, '2026-09-21');
  assert.equal(result.days[6].key, '2026-09-27');
  assert.equal(result.stepsTotal, 500);
  assert.equal(result.days.every((day) => !day.isFuture), true);
});