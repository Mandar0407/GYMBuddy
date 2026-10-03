const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(
  fs.readFileSync(path.join(__dirname, '../lib/nativeHistory.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText, { exports: exportsObject, Date, Promise, Number, Array, Error });
const { readNativeHistory } = exportsObject;

test('today publishes first, native reads are bounded, and snapshots replace rather than accumulate', async () => {
  const now = new Date(2026, 9, 3, 10, 30);
  let active = 0, maximum = 0;
  const days = [];
  const calls = [];
  const read = async (from, until) => {
    active++; maximum = Math.max(maximum, active);
    calls.push({ from, until });
    await new Promise(resolve => setImmediate(resolve));
    active--;
    assert.ok(from < until);
    assert.ok(until <= now);
    return { steps: 10 };
  };
  const result = await readNativeHistory(now, read, day => days.push(day));
  assert.equal(days[0].date, '2026-10-03');
  assert.equal(days.length, 7);
  assert.equal(result[6].date, '2026-09-27');
  assert.equal(maximum, 4);
  assert.equal(calls.length, 11 + 6 * 24);
  assert.equal(days[0].hours.reduce((a, b) => a + b, 0), 110);
  const refreshed = await readNativeHistory(now, async () => ({ steps: 10 }), () => {});
  assert.deepEqual(refreshed, result);
});

test('an older-day failure leaves the completed today snapshot available', async () => {
  const days = [];
  const now = new Date(2026, 9, 3, 1, 30);
  await assert.rejects(readNativeHistory(now, async from => {
    if (from.getDate() !== now.getDate()) throw new Error('History unavailable');
    return { steps: 5 };
  }, day => days.push(day)), /History unavailable/);
  assert.equal(days.length, 1);
  assert.equal(days[0].date, '2026-10-03');
  assert.equal(days[0].hours[1], 5);
});

test('invalid sensor counts are never published as recorded activity', async () => {
  for (const steps of [-1, .5, NaN, Infinity]) {
    const days = [];
    await assert.rejects(readNativeHistory(new Date(2026, 9, 3, 1),
      async () => ({ steps }), day => days.push(day)), /invalid step count/);
    assert.equal(days.length, 0);
  }
});