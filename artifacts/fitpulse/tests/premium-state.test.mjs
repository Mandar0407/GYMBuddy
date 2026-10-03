import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {
  initialPremium, validPremium, scaledMeal, serving, calculatePlates, mergeById,
  restoreDeletedId, validJournalBackup,
} from '../src/premiumState.ts';
import { adaptLegacyWebMealToJournal, adaptJournalMealToWeb } from '../src/journalSyncCore.ts';

test('advanced preferences validate atomically and reject malformed targets', () => {
  assert.equal(validPremium(initialPremium), true);
  assert.equal(validPremium({ ...initialPremium, dayTargets: { ...initialPremium.dayTargets, rest: { calorieTarget: 80, proteinTarget: 0, carbsTarget: 0, fatTarget: 0 } } }), false);
});

test('portion scaling and recipe serving calculate every macro with bounds', () => {
  const meal = { name: 'Rice bowl', meal: 'Lunch', calories: 620, protein: 35, carbs: 70, fat: 18 };
  assert.deepEqual(scaledMeal(meal, 1.5), { ...meal, calories: 930, protein: 52.5, carbs: 105, fat: 27 });
  assert.throws(() => scaledMeal(meal, 0), /portion/);
  assert.deepEqual(serving({ id: 'recipe', name: 'Egg toast', servings: 2, ingredients: [
    { name: 'Eggs', meal: 'Lunch', calories: 140, protein: 12, carbs: 1, fat: 10 },
    { name: 'Bread', meal: 'Lunch', calories: 200, protein: 8, carbs: 36, fat: 3 },
  ] }), { name: 'Egg toast', meal: 'Lunch', calories: 170, protein: 10, carbs: 18.5, fat: 6.5 });
});

test('plate calculator reports per-side loading and closest valid total', () => {
  assert.deepEqual(calculatePlates(100, 20), { plates: [{ plate: 25, count: 1 }, { plate: 15, count: 1 }], exact: true, loadable: 100, shortfall: 0 });
  assert.throws(() => calculatePlates(10, 20), /at least the bar/);
});

test('merge keeps current conflicting IDs and does not duplicate identical IDs', () => {
  assert.deepEqual(mergeById([{ id: 'a', value: 'local' }], [{ id: 'a', value: 'backup' }, { id: 'b', value: 'new' }]), [
    { id: 'a', value: 'local' }, { id: 'b', value: 'new' },
  ]);
});

test('paired deletion markers produce stable restoration IDs', () => {
  const tombstones = { 'meal\u0000lunch-1': 'deleted' };
  const id = restoreDeletedId('meal', 'lunch-1', tombstones, []);
  assert.match(id, /^restored-[a-f0-9]{8}-0$/);
  assert.equal(restoreDeletedId('meal', 'lunch-1', tombstones, []), id);
  assert.notEqual(restoreDeletedId('meal', 'lunch-1', tombstones, [id]), id);
  assert.equal(restoreDeletedId('meal', 'fresh', tombstones, []), 'fresh');
});

test('deleted-record restore is content-idempotent and skips remapped tombstones', () => {
  const tombstones = { 'meal\u0000source': 'deleted' };
  const first = restoreDeletedId('meal', 'source', tombstones, []);
  const record = { id: first, name: 'Oat bowl', calories: 320 };
  assert.equal(restoreDeletedId('meal', 'source', tombstones, [record], { id: 'source', name: 'Oat bowl', calories: 320 }), first);
  assert.notEqual(restoreDeletedId('meal', 'source', tombstones, [record], { id: 'source', name: 'Different meal', calories: 320 }), first);
  const blocked = { ...tombstones, [`meal\u0000${first}`]: 'deleted' };
  const next = restoreDeletedId('meal', 'source', blocked, []);
  assert.notEqual(next, first);
  assert.equal(blocked[`meal\u0000${next}`], undefined);
});

test('advanced backup validation rejects malformed nested data and duplicate IDs', () => {
  assert.equal(validPremium({ ...initialPremium, routines: [{ id: 'broken', name: 'Routine', exercises: null }] }), false);
  assert.equal(validPremium({ ...initialPremium, favourites: [{ id: 'same', name: 'A', meal: 'Snack', calories: 10, protein: 0, carbs: 0, fat: 0 }, { id: 'same', name: 'B', meal: 'Snack', calories: 10, protein: 0, carbs: 0, fat: 0 }] }), false);
  assert.equal(validPremium({ ...initialPremium, guided: { routine: { id: 'r', name: 'R', exercises: [] }, index: 0, startedAt: 1, weight: '', reps: '' } }), false);
  const ingredient = { name: 'Oats', meal: 'Lunch', calories: 300, protein: 12, carbs: 50, fat: 6 };
  assert.equal(validPremium({ ...initialPremium, recipes: [{ id: 'r', name: 'Oats', servings: .01, ingredients: [ingredient] }] }), false);
  assert.equal(validPremium({ ...initialPremium, recipes: [{ id: 'r', name: 'Empty energy', servings: 1, ingredients: [{ ...ingredient, calories: 0 }] }] }), false);
});

test('journal backup validation rejects malformed record arrays without partial acceptance', () => {
  const safe = { 'fitpulse-macros': [], 'fitpulse-workouts': [], 'fitpulse-water': {}, 'fitpulse-weight-history': {} };
  assert.equal(validJournalBackup(safe), true);
  assert.equal(validJournalBackup({ ...safe, 'fitpulse-macros': [{ id: 'x', meal: 'Meal', calories: 3, protein: 0, carbs: 0, fat: 0, time: '', date: '2025-02-30' }] }), false);
  assert.equal(validJournalBackup({ ...safe, 'fitpulse-profile': { name: '', goal: 'Invalid', weight: 70, height: 170, calorieTarget: 2000, proteinTarget: 100, carbsTarget: 200, fatTarget: 60, stepTarget: 8000 } }), false);
  assert.equal(validJournalBackup({ ...safe, 'fitpulse-meal-templates': [{ id: 'x', name: 'Invalid', calories: 12000, protein: 0, carbs: 0, fat: 0 }] }), false);
});

test('legacy website meals remain importable without losing the saved food name', () => {
  const legacy = { id: 'legacy-food', meal: 'Oat bowl', calories: 320, protein: 12, carbs: 48, fat: 8, time: '10:00 AM', date: '2026-10-03' };
  const canonical = adaptLegacyWebMealToJournal(legacy);
  assert.equal(canonical.name, 'Oat bowl');
  assert.equal(canonical.meal, 'Snack');
  assert.equal(validJournalBackup({ 'fitpulse-macros': [canonical], 'fitpulse-workouts': [] }), true);
  assert.deepEqual(adaptJournalMealToWeb(canonical), legacy);
  const modern = { ...legacy, meal: 'Lunch', name: 'New oat bowl' };
  assert.deepEqual(adaptJournalMealToWeb(adaptLegacyWebMealToJournal(modern)), modern);
});

test('meal undo survives toast expiry and restores once without duplicating the record', () => {
  const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const effect = source.match(/useEffect\(\(\) => \{\s*if \(!toast\) return undefined;([\s\S]*?)\}, \[toast\]\);/);
  const undo = source.match(/const undoMealDelete = \(\) => \{([\s\S]*?)\n  \};/);
  assert.ok(effect && undo);
  const meal = { id: 'deleted-lunch', meal: 'Lunch', name: 'Oat bowl', calories: 200 };
  let timeout;
  const context = { toast: 'Meal removed.', deletedMealUndo: meal, macros: [],
    window: { setTimeout: fn => { timeout = fn; return 1; }, clearTimeout: () => {} },
    setToast: value => { context.toast = value; },
    setDeletedMealUndo: value => { context.deletedMealUndo = value; },
    setMacros: change => { context.macros = change(context.macros); },
  };
  vm.runInNewContext(`(() => { ${effect[1]} })()`, context);
  timeout();
  assert.equal(context.toast, '');
  assert.equal(context.deletedMealUndo, meal);
  vm.runInNewContext(`(() => { ${undo[1]} })()`, context);
  assert.equal(context.macros.length, 1);
  assert.equal(context.macros[0], meal);
  assert.equal(context.deletedMealUndo, null);
  vm.runInNewContext(`(() => { ${undo[1]} })()`, context);
  assert.equal(context.macros.length, 1);
});