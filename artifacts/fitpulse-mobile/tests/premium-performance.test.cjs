const{test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
async function harness(){
  const cache=new Map(),effects=[],notifications=[],writes=[];
  const react={
    createContext:()=>({Provider:'provider'}),
    useState:value=>[value,next=>notifications.push(next)],
    useRef:value=>({current:value}),
    useEffect:effect=>effects.push(effect),
  };
  function load(file){
    if(cache.has(file))return cache.get(file);
    const exports={};cache.set(file,exports);
    const source=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
    vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,{
      exports,Promise,Set,Map,
      require(name){
        if(name==='react')return react;
        if(name==='react/jsx-runtime')return{jsx:(type,props)=>({type,props})};
        if(name==='@react-native-async-storage/async-storage')return{getItem:async()=>null,setItem:async(k,v)=>writes.push({k,v})};
        if(name==='@/lib/premiumLogic')return load('lib/premiumLogic.ts');
        throw new Error('Unexpected import: '+name);
      }
    });
    return exports;
  }
  const provider=load('providers/PremiumProvider.tsx').PremiumProvider({children:null});
  effects.forEach(effect=>effect());
  await new Promise(resolve=>setImmediate(resolve));
  notifications.length=0;
  return{context:provider.props.value,notifications,writes};
}
test('draft saves persist but do not publish a whole-app state update',async()=>{
  const h=await harness();
  assert.equal(await h.context.update(s=>({...s,routineDraft:{editing:null,name:'Draft',exercises:[],newExercise:'Squat',newWeight:'',newReps:''}})),true);
  assert.equal(h.writes.length,1);
  assert.equal(JSON.parse(h.writes[0].v).routineDraft.name,'Draft');
  assert.equal(h.notifications.filter(v=>v&&typeof v==='object').length,0);
  assert.equal(h.notifications.filter(v=>typeof v==='boolean').length,0);
  assert.equal(h.context.getSnapshot().routineDraft.newExercise,'Squat');
});
test('unchanged saves do not rewrite storage or redraw application state',async()=>{
  const h=await harness();
  await h.context.update(s=>({...s}));
  await h.context.update(s=>({...s,settings:{...s.settings}}));
  assert.equal(h.writes.length,0);
  assert.equal(h.notifications.filter(v=>v&&typeof v==='object').length,0);
});
test('visible preference changes still publish and retain previously saved drafts',async()=>{
  const h=await harness();
  await h.context.update(s=>({...s,routineDraft:{editing:null,name:'Kept draft',exercises:[],newExercise:'',newWeight:'',newReps:''}}));
  await h.context.update(s=>({...s,settings:{...s.settings,haptics:false}}));
  const published=h.notifications.filter(v=>v&&typeof v==='object');
  assert.equal(published.length,1);assert.equal(published[0].settings.haptics,false);
  assert.equal(published[0].routineDraft.name,'Kept draft');
});