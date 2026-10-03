import React,{useEffect,useState}from'react';
import{View,Text}from'react-native';
import{calculatePlates}from'@/lib/premiumLogic';
import{useColors}from'@/hooks/useColors';
import{Box,Button,Choice,Copy,Input,Sheet,styles}from'./PremiumUI';
// Adapted from the uploaded calculator: same bar choices, denominations and
// per-side breakdown, with finite-input validation and honest residual loads.
export function PlateCalculatorModal({visible,onClose,initialWeight=60}:{visible:boolean;onClose:()=>void;initialWeight?:number}){
  const c=useColors();const[targetWeight,setTargetWeight]=useState(String(initialWeight));const[barWeight,setBarWeight]=useState('20');
  useEffect(()=>{if(visible)setTargetWeight(String(initialWeight));},[visible,initialWeight]);
  let result:ReturnType<typeof calculatePlates>|null=null;let error='';
  try{if(targetWeight.trim())result=calculatePlates(Number(targetWeight),Number(barWeight));}catch(e){error=(e as Error).message;}
  return <Sheet visible={visible} title="Plate calculator" onClose={onClose}>
    <Copy>Total weight includes the bar. The breakdown shows plates needed on each side.</Copy>
    <Copy>Barbell weight (kg)</Copy><Choice values={['20','15','10']} value={barWeight} onChange={setBarWeight}/>
    <Input label="Target total (kg)" numeric value={targetWeight} onChange={setTargetWeight} testID="plate-target"/>
    {!!error&&<Copy error>{error}</Copy>}
    {result&&<Box title={result.exact?'Exact load':'Closest lower load'} subtitle={`${result.loadable} kg including the bar`}>
      {!result.exact&&<Copy error>These plates fall short by {result.shortfall} kg. This is not the requested weight.</Copy>}
      <View style={styles.row}>{result.plates.map(item=><View key={item.plate} style={{backgroundColor:c.secondary,padding:15,borderRadius:14,gap:5}}>
        <Text style={{fontFamily:'DMSans_700Bold',fontSize:24,color:c.secondaryForeground}}>{item.count}×</Text><Copy>{item.plate} kg per side</Copy>
      </View>)}</View>
      {!result.plates.length&&<Copy>Bar only · no plates needed.</Copy>}
      <Copy>Assumes matching 25, 20, 15, 10, 5, 2.5 and 1.25 kg plates are available.</Copy>
    </Box>}
    <Button onPress={onClose}>Done</Button>
  </Sheet>;
}