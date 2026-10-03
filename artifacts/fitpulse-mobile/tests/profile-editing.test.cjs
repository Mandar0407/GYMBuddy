const{test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function harness(paired=false){
  const slots=[],saved=[];let cursor=0,closed=0;
  const exports={};
  const react={useEffect:()=>{},useState:initial=>{
    const index=cursor++;
    if(!(index in slots))slots[index]=typeof initial==='function'?initial():initial;
    return[slots[index],next=>{slots[index]=typeof next==='function'?next(slots[index]):next;}];
  }};
  const jsx=(type,props)=>({type,props});
  const profile={name:'Test owner',goal:'Build strength',age:26,sex:'male',weight:75,height:182,calorieTarget:2500,stepTarget:10000,proteinTarget:110,carbsTarget:250,fatTarget:70};
  const source=fs.readFileSync(path.join(__dirname,'../components/ProfileModal.tsx'),'utf8');
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{
    exports,
    require(name){
      if(name==='react')return react;
      if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};
      if(name==='react-native')return{ActivityIndicator:'Spinner',Modal:'Modal',Pressable:'Pressable',Text:'Text',TextInput:'Input',View:'View',StyleSheet:{create:x=>x}};
      if(name==='@expo/vector-icons')return{Feather:'Icon'};
      if(name==='react-native-safe-area-context')return{useSafeAreaInsets:()=>({top:0,bottom:0})};
      if(name==='@/components/KeyboardAwareScrollViewCompat')return{KeyboardAwareScrollViewCompat:'Scroll'};
      if(name==='@/hooks/useColors')return{useColors:()=>({})};
      if(name==='@/hooks/useReducedMotion')return{useReducedMotion:()=>true};
      throw new Error('Unexpected import '+name);
    }
  });
  function render(){cursor=0;return exports.default({profile,visible:true,stepTargetManagedInMovement:paired,onClose:()=>closed++,onSave:async value=>{saved.push(value);return true;}});}
  function nodes(node){
    if(!node)return[];
    if(Array.isArray(node))return node.flatMap(nodes);
    if(typeof node!=='object')return[];
    return[node,...nodes(node.props?.children)];
  }
  return{render,find:id=>nodes(render()).find(n=>n.props?.testID===id),saved,get closed(){return closed;}};
}
test('profile age and gender edits are submitted without changing macro targets',async()=>{
  const h=harness();
  assert.equal(h.find('input-profile-age').props.value,'26');
  h.find('input-profile-age').props.onChangeText('27');
  const nodes=[];
  function collect(n){if(Array.isArray(n))n.forEach(collect);else if(n&&typeof n==='object'){nodes.push(n);collect(n.props?.children);}}
  collect(h.render());
  const female=nodes.find(n=>n.props?.accessibilityRole==='radio'&&n.props?.accessibilityLabel==='Female');
  assert.ok(female);female.props.onPress();
  h.find('button-save-profile').props.onPress();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.saved.length,1);assert.equal(h.saved[0].age,27);assert.equal(h.saved[0].sex,'female');
  assert.equal(h.saved[0].proteinTarget,110);assert.equal(h.saved[0].carbsTarget,250);assert.equal(h.saved[0].fatTarget,70);
  assert.equal(h.closed,1);
});
test('invalid age cannot replace the saved profile',async()=>{
  const h=harness();h.find('input-profile-age').props.onChangeText('26.5');
  h.find('button-save-profile').props.onPress();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.saved.length,0);assert.ok(h.find('profile-error'));
});
test('paired profile edits leave the Movement-managed daily steps unchanged',async()=>{
  const h=harness(true);h.find('button-save-profile').props.onPress();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.saved.length,1);assert.equal('stepTarget'in h.saved[0],false);
});