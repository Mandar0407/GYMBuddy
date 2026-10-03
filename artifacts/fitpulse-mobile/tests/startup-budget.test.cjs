const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function imports(file) {
  const ast = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  return ast.statements.filter(ts.isImportDeclaration).map(node => node.moduleSpecifier.text);
}

test('startup fonts import only the two used weights, with splash error handling preserved', () => {
  const modules = imports('app/_layout.tsx');
  assert.ok(modules.includes('@expo-google-fonts/dm-sans/400Regular'));
  assert.ok(modules.includes('@expo-google-fonts/dm-sans/700Bold'));
  assert.ok(modules.includes('expo-font'));
  assert.ok(!modules.includes('@expo-google-fonts/dm-sans'));
  const source = read('app/_layout.tsx');
  assert.match(source, /if \(!fontsLoaded && !fontError\) return null/);
  assert.match(source, /if \(fontsLoaded \|\| fontError\)/);
});

test('icon imports do not pull every icon family into the startup graph', () => {
  function walk(directory) {
    for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (file.endsWith('.tsx')) assert.ok(!imports(file).includes('@expo/vector-icons'), file);
    }
  }
  walk('app');
  walk('components');
});

test('advanced libraries are deferred and unopened workspace/profile do not mount at launch', () => {
  const modules = imports('components/FitnessApp.tsx');
  for (const component of ['premium/TrainingHub', 'premium/NutritionHub', 'premium/PremiumCenter', 'ProfileModal']) {
    assert.ok(!modules.includes(`@/components/${component}`), component);
    assert.ok(read('components/FitnessApp.tsx').includes(`lazy(() => import('@/components/${component}'))`));
  }
  const source = read('components/FitnessApp.tsx');
  assert.match(source, /workspaceVisited && <Suspense/);
  assert.match(source, /profileVisited && <Suspense/);
  assert.match(source, /filter\(section=>section===tab\|\|visited\.includes\(section\)\)/);
  // Rest and live workout recovery must still run without opening Strength.
  assert.match(source, /<RestTimer startKey=\{restStartKey\}/);
  assert.match(read('app/index.tsx'), /<LiveWorkout steps=\{movementSummary\.steps\}/);
});