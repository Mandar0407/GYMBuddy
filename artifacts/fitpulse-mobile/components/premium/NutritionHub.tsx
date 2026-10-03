import React, { useState } from 'react';
import { View } from 'react-native';
import { useFitness } from '@/providers/FitnessProvider';
import { usePremium } from '@/providers/PremiumProvider';
import { type MealDraft, type Recipe, macroKeys, portion, recipeServing, uid, validMeal } from '@/lib/premiumLogic';
import { Box, Button, Copy, Input, Sheet, styles } from './PremiumUI';
import BarcodeScanner from './BarcodeScanner';
import{usePremiumDraft}from'@/hooks/usePremiumDraft';

export default function NutritionHub({ onMeal }: { onMeal: (meal: MealDraft) => void }) {
  const fit=useFitness();const p=usePremium();
  const [open,setOpen]=useState(false);const [scanner,setScanner]=useState(false);
  const [multiplier,setMultiplier]=useState('1');
  const [message,setMessage]=useState('');
  const [recipeName,setRecipeName]=useState('');const [servings,setServings]=useState('1');
  const [ingredients,setIngredients]=useState<MealDraft[]>([]);
  const [ingredientName,setIngredientName]=useState('');
  const [macros,setMacros]=useState({calories:'',protein:'',carbs:'',fat:''});
  const [editing,setEditing]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  usePremiumDraft('recipeDraft',{editing,name:recipeName,servings,ingredients,ingredientName,macros},d=>{
    setEditing(d.editing);setRecipeName(d.name);setServings(d.servings);setIngredients(d.ingredients);setIngredientName(d.ingredientName);setMacros(d.macros);
  });
  const recent=fit.meals.filter((m,i,all)=>all.findIndex(x=>x.name.toLowerCase()===m.name.toLowerCase())===i).slice(0,8);
  const review=(meal:MealDraft)=>{try{onMeal(portion(meal,Number(multiplier)));setOpen(false);setMessage('');}catch(e){setMessage((e as Error).message);}};
  const favourite=async(meal:MealDraft)=>{
    setBusy(true);
    const ok=await p.update(s=>{
      if(s.favourites.some(m=>m.name.toLowerCase()===meal.name.toLowerCase()&&m.calories===meal.calories))return s;
      return {...s,favourites:[...s.favourites,{...meal,id:uid()}]};
    });
    setBusy(false);setMessage(ok?'Favourite saved on this device.':'Favourite could not save. Try again.');
  };
  const saveRecipe=async()=>{
    const recipe:Recipe={id:editing??uid(),name:recipeName.trim(),servings:Number(servings),ingredients};
    try{recipeServing(recipe);}catch(e){setMessage((e as Error).message);return;}
    setBusy(true);const ok=await p.update(s=>({...s,recipes:[...s.recipes.filter(r=>r.id!==recipe.id),recipe]}));setBusy(false);
    if(ok){setMessage('Recipe saved.');setRecipeName('');setIngredients([]);setServings('1');setEditing(null);}
  };
  return <>
    <Box title="Your food library" subtitle="Repeat meals, scale portions, build recipes, or review a barcode.">
      <View style={styles.row}><Button testID="open-food-library" onPress={()=>setOpen(true)}>Recent & favourite meals</Button>
        <Button secondary testID="open-barcode" onPress={()=>setScanner(true)}>Scan barcode</Button></View>
      <Copy>Quick macro entry is available in the existing meal logger—no food search required.</Copy>
    </Box>
    <Sheet visible={open} title="Meals & recipes" onClose={()=>setOpen(false)}>
      {!!message&&<Copy>{message}</Copy>}{!!p.error&&<Copy error>{p.error}</Copy>}
      <Input label="Portion multiplier (1 = original portion)" numeric value={multiplier} onChange={setMultiplier} testID="meal-multiplier"/>
      <Box title="Recent meals" subtitle="Review the selected portion before logging a new entry.">
        {recent.length?recent.map(m=><View key={m.id} style={{gap:8}}>
          <Button secondary onPress={()=>review(m)} testID={`repeat-meal-${m.id}`}>{m.name} · {m.calories} kcal</Button>
          <Button secondary disabled={busy} onPress={()=>void favourite(m)}>Save as favourite</Button>
        </View>):<Copy>Your recorded meals will appear here.</Copy>}
      </Box>
      <Box title="Favourites">
        {p.favourites.map(m=><View key={m.id} style={{gap:8}}><Button secondary onPress={()=>review(m)}>{m.name} · {m.calories} kcal</Button>
          <Button secondary onPress={()=>void p.update(s=>({...s,favourites:s.favourites.filter(x=>x.id!==m.id)}))}>Unfavourite {m.name}</Button></View>)}
        {!p.favourites.length&&<Copy>Save a recent meal as a favourite to find it faster.</Copy>}
      </Box>
      <Box title={editing?'Edit recipe':'Recipe builder'} subtitle="Enter the nutrition for the amount of each ingredient used in the whole recipe.">
        <Input label="Recipe name" value={recipeName} onChange={setRecipeName} testID="recipe-name"/>
        <Input label="Number of servings" numeric value={servings} onChange={setServings} testID="recipe-servings"/>
        <Input label="Ingredient and amount" value={ingredientName} onChange={setIngredientName} testID="recipe-ingredient"/>
        {macroKeys.map(k=><Input key={k} label={`${k} (${k==='calories'?'kcal':'g'})`} numeric value={macros[k]} onChange={v=>setMacros(m=>({...m,[k]:v}))} testID={`recipe-${k}`}/>)}
        <Button secondary onPress={()=>{
          const m:MealDraft={name:ingredientName.trim(),meal:'Lunch',calories:Number(macros.calories),protein:Number(macros.protein),carbs:Number(macros.carbs),fat:Number(macros.fat)};
          if(!macroKeys.every(k=>macros[k].trim()!=='' )||!validMeal(m,true)){setMessage('Enter an ingredient name and valid calories and macros.');return;}
          setIngredients(a=>[...a,m]);setIngredientName('');setMacros({calories:'',protein:'',carbs:'',fat:''});
        }} testID="recipe-add-ingredient">Add ingredient</Button>
        {ingredients.map((m,i)=><View key={i} style={{gap:6}}><Copy>{m.name} · {m.calories} kcal in whole recipe</Copy>
          <Button secondary onPress={()=>setIngredients(a=>a.filter((_,j)=>j!==i))}>Remove ingredient</Button></View>)}
        <Button onPress={()=>void saveRecipe()} disabled={busy||!recipeName.trim()||!ingredients.length} testID="save-recipe">{busy?'Saving…':'Save recipe'}</Button>
      </Box>
      {p.recipes.map(r=><Box key={r.id} title={r.name} subtitle={`${r.servings} servings`}>
        <Copy>Per serving: {recipeServing(r).calories} kcal · P {recipeServing(r).protein} g · C {recipeServing(r).carbs} g · F {recipeServing(r).fat} g</Copy>
        <Button onPress={()=>review(recipeServing(r))} testID={`log-recipe-${r.id}`}>Review selected portion</Button>
        <Button secondary onPress={()=>{setEditing(r.id);setRecipeName(r.name);setServings(String(r.servings));setIngredients([...r.ingredients]);}}>Edit recipe</Button>
      </Box>)}
    </Sheet>
    <BarcodeScanner visible={scanner} onClose={()=>setScanner(false)} onMeal={onMeal}/>
  </>;
}