const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Exercise the component's platform-specific props without a native runtime.
// These checks guard the scrolling contract, not native gesture behaviour.
function loadComponent(platform) {
  const source = fs.readFileSync(path.join(__dirname, '../components/KeyboardAwareScrollViewCompat.tsx'), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports,
    require(name) {
      if (name === 'react-native') return { Platform: { OS: platform }, ScrollView: 'ScrollView' };
      if (name === 'react-native-keyboard-controller') return { KeyboardAwareScrollView: 'KeyboardAwareScrollView' };
      if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }) };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  return exports.KeyboardAwareScrollViewCompat;
}

for (const platform of ['ios', 'android']) {
  test(`${platform}: use direct-scroll layout mode and preserve keyboard/viewport props`, () => {
    const style = { flex: 1 };
    const view = loadComponent(platform)({ children: 'content', style, bottomOffset: 60, keyboardShouldPersistTaps: 'always' });
    assert.equal(view.type, 'KeyboardAwareScrollView');
    assert.equal(view.props.mode, 'layout');
    assert.equal(view.props.style, style);
    assert.equal(view.props.bottomOffset, 60);
    assert.equal(view.props.keyboardShouldPersistTaps, 'always');
    assert.equal(view.props.children, 'content');
    assert.notEqual(view.props.scrollEnabled, false);
  });
}

test('web: use ordinary scrolling without forwarding the native mode', () => {
  const view = loadComponent('web')({ children: 'content', mode: 'layout' });
  assert.equal(view.type, 'ScrollView');
  assert.equal(view.props.keyboardShouldPersistTaps, 'handled');
  assert.equal('mode' in view.props, false);
});