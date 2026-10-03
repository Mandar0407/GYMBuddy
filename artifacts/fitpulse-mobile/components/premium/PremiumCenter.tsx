import React,{useState}from'react';
import{View}from'react-native';
import{dateKey,useFitness,type MovementSummary}from'@/providers/FitnessProvider';
import{usePremium}from'@/providers/PremiumProvider';
import{targetKeys}from'@/lib/premiumLogic';
import{Box,Button,Choice,Copy,Input,Sheet,styles}from'./PremiumUI';
import BackupPanel from'./BackupPanel';
import ProgressPhotos from'./ProgressPhotos';
import{useColors}from'@/hooks/useColors';

export default function PremiumCenter({visible,onClose,movementSummary}:{visible:boolean;onClose:()=>void;movementSummary:MovementSummary}){
  const p=usePremium();const fit=useFitness();
  const[section,setSection]=useState('Journal');const[day,setDay]=useState(dateKey(new Date()));
  const[dateInput,setDateInput]=useState(day);
  const[month,setMonth]=useState(()=>new Date(new Date().getFullYear(),new Date().getMonth(),1,12));
  const c=useColors();
  const[targetDay,setTargetDay]=useState<'training'|'rest'>('training');
  const[draft,setDraft]=useState<Record<string,string>|null>(null);const[message,setMessage]=useState('');
  const values=draft??Object.fromEntries(targetKeys.map(k=>[k,String(p.dayTargets[targetDay][k])]));
  const shift=(n:number)=>{const d=new Date(`${day}T12:00:00`);d.setDate(d.getDate()+n);setDay(dateKey(d));};
  const meals=fit.meals.filter(m=>m.date===day),sets=fit.sets.filter(s=>s.date===day);
  const steps=movementSummary.week.find(d=>d.date===day)?.steps;
  return <Sheet visible={visible} title="Your personal workspace" onClose={onClose}>
    <Copy>Every original feature remains available in the main tabs. Advanced libraries and preferences are device-local.</Copy>
    <Choice values={['Journal','Appearance','Day targets','Backup','Photos']} value={section} onChange={setSection} testID="workspace-section"/>
    {!!p.error&&<Copy error>{p.error}</Copy>}{!!message&&<Copy>{message}</Copy>}
    {section==='Journal'&&<>
      <Box title="Calendar journal" subtitle="Meals, strength, water and weight by recorded date. Imported legacy dates can be uncertain.">
        <View style={styles.row}><Button secondary onPress={()=>setMonth(m=>new Date(m.getFullYear(),m.getMonth()-1,1,12))}>Previous month</Button><Button secondary onPress={()=>setMonth(m=>new Date(m.getFullYear(),m.getMonth()+1,1,12))}>Next month</Button></View>
        <Copy>{month.toLocaleDateString('en-US',{month:'long',year:'numeric'})}</Copy>
        <View style={{flexDirection:'row',flexWrap:'wrap',gap:3}}>
          {['S','M','T','W','T','F','S'].map((d,i)=><View key={`label-${i}`} style={{width:'13%',alignItems:'center'}}><Copy>{d}</Copy></View>)}
          {Array.from({length:month.getDay()},(_,i)=><View key={`empty-${i}`} style={{width:'13%',height:40}}/>)}
          {Array.from({length:new Date(month.getFullYear(),month.getMonth()+1,0).getDate()},(_,i)=>{
            const key=dateKey(new Date(month.getFullYear(),month.getMonth(),i+1,12));
            const recorded=fit.meals.some(m=>m.date===key)||fit.sets.some(s=>s.date===key)||!!fit.water[key]||fit.weights.some(w=>w.date===key);
            return <View key={key} style={{width:'13%'}}><Button secondary={key!==day} testID={`calendar-${key}`} onPress={()=>{setDay(key);setDateInput(key);}}>{i+1}{recorded?'·':''}</Button></View>;
          })}
        </View>
        <Copy>Selected: {day}. A dot marks a date with journal records.</Copy>
        <Input label="Date (YYYY-MM-DD)" value={dateInput} onChange={setDateInput} testID="journal-date"/>
        <Button secondary onPress={()=>{const date=new Date(dateInput+'T12:00:00');if(/^\d{4}-\d{2}-\d{2}$/.test(dateInput)&&Number.isFinite(date.getTime())&&dateKey(date)===dateInput){setDay(dateInput);setMonth(new Date(date.getFullYear(),date.getMonth(),1,12));setMessage('');}else setMessage('Enter a valid date in YYYY-MM-DD format.');}}>Open date</Button>
        <View style={styles.row}><Button secondary onPress={()=>shift(-1)} testID="journal-previous">Previous day</Button><Button secondary onPress={()=>setDay(dateKey(new Date()))}>Today</Button><Button secondary onPress={()=>shift(1)} testID="journal-next">Next day</Button></View>
        <Copy>{meals.length} meals · {sets.length} sets · {fit.water[day]??0} ml water · {steps===null||steps===undefined?'Steps not available':`${steps} recorded steps`}</Copy>
        {fit.weights.filter(w=>w.date===day).map(w=><Copy key={w.date}>Weight: {w.weight} kg</Copy>)}
        {meals.map(m=><Copy key={m.id}>{m.time} · {m.name} · {m.calories} kcal · P {m.protein} g · C {m.carbs} g · F {m.fat} g</Copy>)}
        {sets.map(s=><Copy key={s.id}>{s.exercise} · {s.weight} kg × {s.reps} · {s.setType}</Copy>)}
        {!meals.length&&!sets.length&&!fit.water[day]&&<Copy>No journal entries recorded for this date. That does not mean no activity occurred.</Copy>}
      </Box>
      <Box title="Recorded days">
        {[...new Set([...fit.meals.map(x=>x.date),...fit.sets.map(x=>x.date),...Object.keys(fit.water),...fit.weights.map(x=>x.date)])].sort().reverse().slice(0,60).map(d=><Button secondary key={d} onPress={()=>setDay(d)}>{d}</Button>)}
      </Box>
    </>}
    {section==='Appearance'&&<>
      <Box title="Appearance">
        <Choice values={['system','light','dark']} value={p.settings.appearance} onChange={v=>void p.update(s=>({...s,settings:{...s.settings,appearance:v as typeof s.settings.appearance}}))} testID="appearance"/>
        <Button secondary onPress={()=>void p.update(s=>({...s,settings:{...s.settings,haptics:!s.settings.haptics}}))}>Haptics: {p.settings.haptics?'on':'off'}</Button>
        <Copy>Animations respect your device’s Reduce Motion setting. Text follows system accessibility settings.</Copy>
      </Box>
      <Box title="Today metrics" subtitle="Choose your dashboard metrics. Their full features remain in the main tabs.">
        {['protein','steps','strength','water','calories'].map(k=><Button secondary key={k} testID={`metric-${k}`} onPress={()=>void p.update(s=>({...s,settings:{...s.settings,metrics:s.settings.metrics.includes(k)?s.settings.metrics.filter(x=>x!==k):[...s.settings.metrics,k]}}))}>{p.settings.metrics.includes(k)?'Shown: ':'Add: '}{k}</Button>)}
      </Box>
      <Box title="Today shortcuts">
        {['Nutrition','Strength','Movement','Insights','My plan'].map(k=><Button secondary key={k} onPress={()=>void p.update(s=>({...s,settings:{...s.settings,shortcuts:s.settings.shortcuts.includes(k)?s.settings.shortcuts.filter(x=>x!==k):[...s.settings.shortcuts,k]}}))}>{p.settings.shortcuts.includes(k)?'Shown: ':'Add: '}{k}</Button>)}
      </Box>
    </>}
    {section==='Day targets'&&<Box title="Training & rest-day targets" subtitle="Optional overrides for your current day. Standard mode uses your saved base plan. These are manually chosen targets, not an automatic prescription.">
      <Choice values={['standard','training','rest']} value={p.dayMode} onChange={v=>void p.update(s=>({...s,dayMode:v as typeof s.dayMode}))} testID="day-mode"/>
      <Copy>Active mode: {p.dayMode}. Changing modes does not overwrite your base plan.</Copy>
      <Choice values={['training','rest']} value={targetDay} onChange={v=>{setTargetDay(v as typeof targetDay);setDraft(null);setMessage('');}}/>
      {targetKeys.map(k=><Input key={k} label={k.replace('Target','')+(k==='calorieTarget'?' (kcal)':' (g)')} numeric value={values[k]} onChange={v=>setDraft({...values,[k]:v})} testID={`day-target-${k}`}/>)}
      <Button testID="save-day-targets" onPress={()=>void p.update(s=>({...s,dayTargets:{...s.dayTargets,[targetDay]:Object.fromEntries(targetKeys.map(k=>[k,Number(values[k])]))}})).then(ok=>{if(ok){setDraft(null);setMessage(`${targetDay} targets saved on this device.`);}})}>Save {targetDay} targets</Button>
      <Copy>Use 1,000–10,000 kcal and 1–1,000 g per macro. Failed validation leaves saved targets unchanged.</Copy>
    </Box>}
    {section==='Backup'&&<BackupPanel/>}
    {section==='Photos'&&<ProgressPhotos/>}
  </Sheet>;
}