import assert from 'node:assert/strict';
import test from 'node:test';
import {
  adaptJournalMealToWeb,
  adaptJournalSetToWeb,
  adaptJournalTemplateToWeb,
  adaptLegacySetToJournal,
  adaptLegacyTemplateToJournal,
  adaptLegacyWebMealToJournal,
  adaptLiveWorkoutForWebsite,
  adaptLiveWorkoutToJournal,
  firstPairDecision,
  mergeDurableState,
  shouldTreatAsEmptyFirstPair,
} from '../src/journalSyncCore.ts';

test('first-pair server tombstone conflicts with, and preserves, unsynced local data', () => {
  assert.equal(firstPairDecision(true, true), 'conflict');
  assert.equal(firstPairDecision(false, true), 'acknowledge');
  assert.equal(firstPairDecision(true, false, true), 'adopt');
  assert.equal(firstPairDecision(true, false, false), 'conflict');
  assert.equal(firstPairDecision(false, false), 'apply');
});

test('website-first pairing omits pristine settings until phone settings arrive', () => {
  assert.equal(shouldTreatAsEmptyFirstPair(true, false), true);
  assert.equal(firstPairDecision(false, false), 'apply');
});

test('phone-first pairing applies customized phone settings over pristine website defaults', () => {
  assert.equal(shouldTreatAsEmptyFirstPair(true, false), true);
  assert.equal(firstPairDecision(false, false), 'apply');
});

test('genuine website edits are not treated as defaults and conflict with different phone data', () => {
  assert.equal(shouldTreatAsEmptyFirstPair(false, false), false);
  assert.equal(firstPairDecision(true, false, false), 'conflict');
});

test('a deletion written during an in-flight upload survives stale sync-state persistence', () => {
  const key = 'meal\u0000meal-1';
  const baseline = { meta: {}, pending: {}, tombstones: {} };
  const workingAfterUpload = {
    meta: { [key]: { revision: 1, deleted: false } },
    pending: {},
    tombstones: {},
  };
  const durableDuringUpload = {
    meta: {},
    pending: {},
    tombstones: { [key]: 'new-deletion-token' },
  };

  const merged = mergeDurableState(workingAfterUpload, durableDuringUpload, baseline);
  assert.equal(merged.tombstones[key], 'new-deletion-token');
  assert.equal(merged.meta[key].revision, 1);

  const acknowledged = mergeDurableState(
    { ...workingAfterUpload, tombstones: {} },
    durableDuringUpload,
    baseline,
    { [key]: 'new-deletion-token' },
  );
  assert.equal(acknowledged.tombstones[key], undefined);
});

test('website meal category/name fields round-trip without replacing either legacy value', () => {
  const legacy = { id: 'm1', meal: 'Breakfast', calories: 320 };
  const journal = adaptLegacyWebMealToJournal(legacy);
  assert.equal(journal.meal, 'Breakfast');
  assert.equal(journal.name, 'Breakfast');
  assert.deepEqual(adaptJournalMealToWeb(journal), legacy);

  const mobileMeal = { id: 'm2', meal: 'Lunch', name: 'Lentil bowl', calories: 450 };
  assert.deepEqual(adaptLegacyWebMealToJournal(mobileMeal), mobileMeal);

  const legacyNamedMeal = { id: 'm3', meal: 'Morning smoothie', calories: 280 };
  assert.deepEqual(adaptJournalMealToWeb(adaptLegacyWebMealToJournal(legacyNamedMeal)), legacyNamedMeal);
});

test('legacy strength sets without a set type return to their original shape', () => {
  const legacy = { id: 's1', exercise: 'Squat', weight: 50, reps: 8, date: '2025-01-01' };
  assert.deepEqual(adaptJournalSetToWeb(adaptLegacySetToJournal(legacy)), legacy);
});

test('legacy website templates without a meal category round-trip unchanged', () => {
  const legacy = { id: 't1', name: 'Morning oats', calories: 300, protein: 15, carbs: 40, fat: 8 };
  assert.deepEqual(adaptJournalTemplateToWeb(adaptLegacyTemplateToJournal(legacy)), legacy);
});

test('mobile live workout records without metrics remain valid and retain their missing shape', () => {
  const mobileSession = {
    id: 'w1', kind: 'outdoor-walk', startedAt: 100, endedAt: 300,
    durationMs: 200, steps: 20,
  };
  const websiteSession = adaptLiveWorkoutForWebsite(mobileSession);
  assert.equal(websiteSession.distanceMeters, null);
  assert.equal(websiteSession.activeCalories, null);
  assert.equal(websiteSession.totalCalories, null);
  assert.deepEqual(adaptLiveWorkoutToJournal(websiteSession), mobileSession);
});