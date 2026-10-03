const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const cache=new Map();
const storage=new Map();
function load(file){
  if(cache.has(file))return cache.get(file);
  const exports={};cache.set(file,exports);
  const react={createContext:()=>({})};
  const source=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
  const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}});
  vm.runInNewContext(outputText,{exports,console,Date,Set,Map,Promise,require(name){
    if(name==='react')return react;
    if(name==='react/jsx-runtime')return {jsx:()=>null};
    if(name==='react-native')return {Platform:{OS:'web'}};
    if(name==='@react-native-async-storage/async-storage')return {multiGet:async keys=>keys.map(k=>[k,storage.get(k)??null]),getItem:async key=>storage.get(key)??null,setItem:async(k,v)=>storage.set(k,v)};
    if(name==='expo-secure-store'||name==='./fitnessJournalSync'||name==='@/widgets/updateGymBuddyWidget'||name==='expo-file-system'||name==='expo-sharing'||name==='expo-document-picker')return {};
    if(name.startsWith('@/'))return load(name.slice(2)+(['providers/FitnessProvider','providers/PremiumProvider'].includes(name.slice(2))?'.tsx':'.ts'));
    throw new Error('Unexpected test import: '+name);
  }});
  return exports;
}
const logic=load('lib/premiumLogic.ts');
const premium=load('providers/PremiumProvider.tsx');
const backup=load('lib/mobileBackup.ts');
const normalize=x=>JSON.parse(JSON.stringify(x));
const meal={name:'Test meal',meal:'Lunch',calories:400,protein:20,carbs:60,fat:10};
const profile={name:'Test athlete',goal:'maintain',weight:70,height:175,age:30,sex:'male',activity:'moderate',calorieTarget:2200,proteinTarget:140,carbsTarget:250,fatTarget:70,stepTarget:10000,waterGoalMl:2000};
const journal=()=>({profile:{...profile},meals:[],sets:[],completedWorkouts:[],water:{},weights:[]});
const advanced=()=>({version:1,settings:{appearance:'system',metrics:['protein'],shortcuts:['Nutrition'],haptics:true,restSeconds:90},routines:[],favourites:[],recipes:[],photos:[],equipment:['barbell'],dayMode:'standard',dayTargets:{training:{calorieTarget:2400,proteinTarget:150,carbsTarget:290,fatTarget:70},rest:{calorieTarget:2200,proteinTarget:150,carbsTarget:240,fatTarget:70}},guided:null,routineDraft:null,recipeDraft:null});
test('portion scales every macro without mutating the saved meal',()=>{
  const scaled=logic.portion(meal,1.5);
  assert.deepEqual(normalize(scaled),{...meal,calories:600,protein:30,carbs:90,fat:15});
  assert.equal(meal.calories,400);
});
test('portions reject zero, negatives, NaN, infinity, and out-of-range scaled nutrition',()=>{
  for(const value of [0,-1,NaN,Infinity,101])assert.throws(()=>logic.portion(meal,value));
  assert.throws(()=>logic.portion({...meal,calories:10000},2));
});
test('ingredient recipes divide totals by servings and allow calorie-free ingredients',()=>{
  const serving=logic.recipeServing({id:'recipe',name:'Test recipe',servings:2,ingredients:[meal,{...meal,name:'Water',calories:0,protein:0,carbs:0,fat:0}]});
  assert.equal(serving.calories,200);assert.equal(serving.protein,10);
  assert.throws(()=>logic.recipeServing({name:'Empty',servings:2,ingredients:[]}));
  assert.throws(()=>logic.recipeServing({name:'Invalid',servings:0,ingredients:[meal]}));
});
test('target validation accepts only bounded finite integer nutrition targets',()=>{
  assert.equal(logic.validTargets(profile),true);
  for(const value of [0,-1,NaN,Infinity,150.5,1001])assert.equal(logic.validTargets({...profile,proteinTarget:value}),false);
});
test('plate calculator handles all uploaded bar choices and exact plate combinations',()=>{
  for(const bar of [10,15,20]){
    const result=logic.calculatePlates(bar+60,bar);
    assert.equal(result.exact,true);assert.equal(result.loadable,bar+60);
    assert.deepEqual(normalize(result.plates),[{plate:25,count:1},{plate:5,count:1}]);
  }
});
test('bar-only loads are valid; unavailable increments report a shortfall instead of success',()=>{
  assert.equal(logic.calculatePlates(20,20).plates.length,0);
  const r=logic.calculatePlates(61.25,20);
  assert.equal(r.exact,false);assert.equal(r.loadable,60);assert.equal(r.shortfall,1.25);
  for(const n of [10,NaN,Infinity,-1])assert.throws(()=>logic.calculatePlates(n,20));
});
test('backup merge keeps current conflicting records, daily water, weight and profile',()=>{
  const current=journal();current.meals=[{...meal,id:'meal',date:'2026-10-01',time:'12:00'}];current.water={'2026-10-01':500};current.weights=[{date:'2026-10-01',weight:70}];
  const incoming=journal();incoming.profile.calorieTarget=2500;incoming.meals=[{...current.meals[0],calories:600}];incoming.water={'2026-10-01':900,'2026-10-02':250};incoming.weights=[{date:'2026-10-01',weight:80}];
  const merged=logic.mergeJournalBackup(current,incoming);
  assert.equal(merged.meals.length,1);assert.equal(merged.meals[0].calories,400);
  assert.equal(merged.water['2026-10-01'],500);assert.equal(merged.water['2026-10-02'],250);
  assert.equal(merged.weights[0].weight,70);assert.equal(merged.profile.calorieTarget,2200);
  assert.equal(logic.mergeJournalBackup(current,incoming,true).profile.calorieTarget,2500);
});
test('backup completion cannot claim an already completed or conflicting set',()=>{
  const current=journal();current.sets=[{id:'set',weight:50}];current.completedWorkouts=[{id:'workout',setIds:['set']}];
  const incoming=journal();incoming.sets=[{id:'set',weight:60}];incoming.completedWorkouts=[{id:'another',setIds:['set']}];
  const result=logic.mergeJournalBackup(current,incoming);
  assert.equal(result.sets[0].weight,50);assert.equal(result.completedWorkouts.length,1);
});
test('repeat backup merge is idempotent and does not mutate input collections',()=>{
  const current=journal();const incoming=journal();incoming.meals=[{...meal,id:'new',date:'2026-10-01',time:'12:00'}];
  const once=logic.mergeJournalBackup(current,incoming);
  assert.deepEqual(normalize(logic.mergeJournalBackup(once,incoming)),normalize(once));assert.equal(current.meals.length,0);
});
test('paired deleted identifiers remap consistently and preserve workout graph links',()=>{
  const j=journal();j.meals=[{...meal,id:'oldmeal'}];j.sets=[{id:'oldset'}];j.completedWorkouts=[{id:'oldworkout',setIds:['oldset']}];
  const deleted=new Set(['meal:oldmeal','strengthSet:oldset','completedWorkout:oldworkout']);
  const a=logic.remapDeletedBackupIds(j,deleted),b=logic.remapDeletedBackupIds(j,deleted);
  assert.deepEqual(normalize(a),normalize(b));assert.notEqual(a.meals[0].id,'oldmeal');assert.equal(a.completedWorkouts[0].setIds[0],a.sets[0].id);
  deleted.add(`strengthSet:${a.sets[0].id}`);
  assert.notEqual(logic.remapDeletedBackupIds(j,deleted).sets[0].id,a.sets[0].id);
});
test('advanced validation migrates absent new fields and preserves partial form strings',()=>{
  const state=advanced();delete state.settings.restSeconds;delete state.routineDraft;delete state.recipeDraft;delete state.guided;
  const parsed=premium.validatePremium(state);assert.equal(parsed.settings.restSeconds,90);assert.equal(parsed.routineDraft,null);
  parsed.recipeDraft={editing:null,name:'Draft',servings:'',ingredients:[],ingredientName:'',macros:{calories:'',protein:'1.',carbs:'',fat:''}};
  assert.equal(premium.validatePremium(parsed).recipeDraft.macros.protein,'1.');
});
test('advanced validation rejects duplicate IDs, traversal names and invalid goals',()=>{
  const a=advanced();a.favourites=[{...meal,id:'same'},{...meal,id:'same'}];assert.throws(()=>premium.validatePremium(a));
  const b=advanced();b.favourites=[{...meal,id:'../unsafe'}];assert.throws(()=>premium.validatePremium(b));
  const c=advanced();c.dayTargets.training.calorieTarget=0;assert.throws(()=>premium.validatePremium(c));
});
test('backup export excludes private photos by default and never exports pairing keys',async()=>{
  storage.set('fitpulse-pair-key','fictional-test-value');storage.set('@fitpulse/mobile/form-drafts/v1',JSON.stringify({version:1}));
  const a=advanced();a.photos=[{id:'photo',uri:'file:///private/test.jpg',date:'2026-10-01',note:''}];
  const exported=await backup.makeBackup(journal(),a,false);
  assert.equal(exported.advanced.photos.length,0);assert.equal(a.photos.length,1);
  assert.equal(Object.keys(exported.localSessions).includes('fitpulse-pair-key'),false);
  assert.equal(JSON.stringify(exported).includes('fictional-test-value'),false);
});
test('backup parsing rejects credentials, corrupt files and nonportable photo references',()=>{
  const base={format:'GYMBuddy',version:1,journal:{version:1,...journal()},advanced:advanced(),localSessions:{}};
  assert.equal(backup.parseBackup(JSON.stringify(base)).advanced.settings.restSeconds,90);
  assert.throws(()=>backup.parseBackup('{bad'));
  assert.throws(()=>backup.parseBackup(JSON.stringify({...base,localSessions:{'fitpulse-pair-key':'{}'}})));
  const a=advanced();a.photos=[{id:'photo',uri:'file:///private/test.jpg',date:'2026-10-01',note:''}];
  assert.throws(()=>backup.parseBackup(JSON.stringify({...base,advanced:a})),/portable/);
});
test('equipment substitutions respect availability rather than fabricating equipment',()=>{
  assert.equal(logic.substitutions('Barbell squat',['bodyweight']).every(e=>e.equipment==='bodyweight'),true);
});