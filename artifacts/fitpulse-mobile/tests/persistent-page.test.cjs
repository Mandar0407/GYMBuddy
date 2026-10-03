const{test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const source=fs.readFileSync(path.join(__dirname,'../components/PersistentPage.tsx'),'utf8');
const exportsObject={};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{
  exports:exportsObject,
  require(name){
    if(name==='react')return{createContext:initial=>({Provider:'visibility',initial}),useContext:c=>c.initial,memo:(component,compare)=>Object.assign(component,{compare})};
    if(name==='react-native')return{View:'View'};
    if(name==='react/jsx-runtime')return{jsx:(type,props)=>({type,props})};
    throw new Error('Unexpected import: '+name);
  }
});
test('hidden pages retain their rendered children rather than reconciling new empty content',()=>{
  const compare=exportsObject.FrozenPageContent.compare;
  assert.equal(compare({active:true,children:'draft'},{active:false,children:null}),true);
  assert.equal(compare({active:false,children:'draft'},{active:false,children:'other'}),true);
  assert.equal(compare({active:false},{active:true}),false);
});
test('native visibility stays on the outside View and gates page-local timers',()=>{
  const hidden=exportsObject.PersistentPage({active:false,children:'draft'});
  assert.equal(hidden.type,'View');assert.equal(hidden.props.style.display,'none');
  assert.equal(hidden.props.pointerEvents,'none');
  assert.equal(hidden.props.children.props.value,false);
  assert.equal(hidden.props.children.props.children,'draft');
  const active=exportsObject.PersistentPage({active:true,children:'draft'});
  assert.equal(active.props.style.flex,1);assert.equal(active.props.style.display,'flex');
  assert.equal(active.props.children.props.value,true);
});