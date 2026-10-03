import type {FitnessProfile}from'@/providers/FitnessProvider';

export const DEFAULT_FITNESS_PROFILE:FitnessProfile={
  name:'Mandar Owalekar',goal:'Build strength',weight:75,height:182,
  calorieTarget:2500,proteinTarget:110,carbsTarget:250,fatTarget:70,
  waterGoalMl:2000,stepTarget:10000,age:26,sex:'male',activity:'moderate',
};

const legacyValues={name:'Maya Chen',weight:68,height:170,calorieTarget:2200,age:28,sex:'female'}as const;
// Upgrade the old sample persona only; independently edited values are kept.
export function upgradeSampleProfile<T>(value:T):T{
  if(!value||typeof value!=='object'||Array.isArray(value))return value;
  const source=value as Record<string,unknown>;
  if(source.name!==legacyValues.name)return value;
  const next={...source,name:DEFAULT_FITNESS_PROFILE.name}as Record<string,unknown>;
  for(const key of ['weight','height','calorieTarget','age','sex']as const){
    if(source[key]===legacyValues[key])next[key]=DEFAULT_FITNESS_PROFILE[key];
  }
  return next as T;
}