const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../components/ProfileModal.tsx'), 'utf8');
const block = name => {
  const m = source.match(new RegExp(`\\n  ${name}: \\{([^}]*)\\}`));
  assert.ok(m, `missing style ${name}`);
  return m[1];
};

test('profile fields keep intrinsic height (no zero-basis flex collapse)', () => {
  for (const name of ['field', 'form', 'row']) {
    const css = block(name);
    assert.doesNotMatch(css, /\bflex:\s*1\b/, `${name} must not use flex: 1`);
    assert.match(css, /flexShrink:\s*0/, `${name} must not shrink`);
  }
});

test('only horizontal columns share width with flex: 1', () => {
  assert.match(block('half'), /flex:\s*1/);
  assert.match(block('half'), /minWidth:\s*0/);
});

test('sheet is bounded and content does not stretch', () => {
  assert.match(block('sheet'), /maxHeight:\s*'100%'/);
  assert.match(block('content'), /flexGrow:\s*0/);
});
