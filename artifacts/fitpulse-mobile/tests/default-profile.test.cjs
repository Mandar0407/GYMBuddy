const{test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const exportsObject={};
const source=fs.readFileSync(path.join(__dirname,'../lib/defaultFitnessProfile.ts'),'utf8');
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:exportsObject});
const{DEFAULT_FITNESS_PROFILE:defaults,upgradeSampleProfile:upgrade}=exportsObject;
test('creator defaults cover the requested editable profile',()=>{
  assert.equal(defaults.name,'Mandar Owalekar');assert.equal(defaults.age,26);
  assert.equal(defaults.sex,'male');assert.equal(defaults.weight,75);assert.equal(defaults.height,182);
  assert.equal(defaults.calorieTarget,2500);assert.equal(defaults.stepTarget,10000);
});
test('legacy sample upgrade leaves custom values and the input untouched',()=>{
  const old={name:'Maya Chen',weight:68,height:170,calorieTarget:2200,age:28,sex:'female',proteinTarget:180,stepTarget:12000,goal:'Custom focus'};
  const next=upgrade(old);
  for(const key of ['name','weight','height','calorieTarget','age','sex'])assert.equal(next[key],defaults[key]);
  assert.equal(next.proteinTarget,180);assert.equal(next.stepTarget,12000);assert.equal(next.goal,'Custom focus');
  assert.equal(old.name,'Maya Chen');
  const edited=upgrade({...old,weight:80,height:190,calorieTarget:3000,age:31,sex:'male'});
  assert.equal(edited.weight,80);assert.equal(edited.height,190);assert.equal(edited.calorieTarget,3000);assert.equal(edited.age,31);
});
test('a customized profile is never reset by loading the defaults',()=>{
  const custom={name:'Changed name',weight:68,height:170,calorieTarget:2200,age:28,sex:'female'};
  assert.equal(upgrade(custom),custom);
  assert.equal(upgrade(null),null);
});