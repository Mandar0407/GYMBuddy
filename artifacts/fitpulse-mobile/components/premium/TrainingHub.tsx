import React, { useEffect, useRef, useState } from 'react';
import { AppState, Platform, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useFitness } from '@/providers/FitnessProvider';
import { usePremium } from '@/providers/PremiumProvider';
import { exerciseLibrary, substitutions, uid, type Routine, type RoutineExercise } from '@/lib/premiumLogic';
import { Box, Button, Choice, Copy, Input, Sheet, styles } from './PremiumUI';
import RestTimer from '@/components/RestTimer';
import { usePremiumDraft } from '@/hooks/usePremiumDraft';
import { PlateCalculatorModal } from './PlateCalculatorModal';
import {registerDraftSaver}from'@/lib/draftFlush';

export default function TrainingHub({ onExercise, exercise, weight }: {
  onExercise: (name: string, weight?: number|null, reps?: number|null) => void; exercise: string; weight: string;
}) {
  const fit = useFitness(); const p = usePremium();
  const [open, setOpen] = useState<'routines'|'plates'|'alternatives'|null>(null);
  const [editing, setEditing] = useState<string|null>(null);
  const [name, setName] = useState('');
  const [draft, setDraft] = useState<RoutineExercise[]>([]);
  const [newExercise, setNewExercise] = useState('');
  const [newWeight, setNewWeight] = useState('');
  const [newReps, setNewReps] = useState('');
  const [muscle, setMuscle] = useState('legs');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  usePremiumDraft('routineDraft',{editing,name,exercises:draft,newExercise,newWeight,newReps},d=>{
    setEditing(d.editing);setName(d.name);setDraft(d.exercises);setNewExercise(d.newExercise);setNewWeight(d.newWeight);setNewReps(d.newReps);
  });
  const [active, setActive] = useState<Routine|null>(null);
  const [index, setIndex] = useState(0);
  const [started, setStarted] = useState(0);
  const [restKey, setRestKey] = useState(0);
  const selected = active?.exercises[index];
  const [workWeight, setWorkWeight] = useState('');
  const [workReps, setWorkReps] = useState('');
  const [workType, setWorkType] = useState<'warmup'|'working'|'drop'|'failure'>('working');
  const [draftReady,setDraftReady]=useState(false);
  const updateRef=useRef(p.update);updateRef.current=p.update;
  const guidedRef=useRef(p.guided);
  useEffect(()=>{
    if(!p.ready||draftReady)return;
    if(p.guided){setActive(p.guided.routine);setIndex(p.guided.index);setStarted(p.guided.startedAt);setWorkWeight(p.guided.weight);setWorkReps(p.guided.reps);setWorkType(p.guided.setType??'working');setMessage('Unfinished guided session restored. Your previously logged sets are still in the journal.');}
    setDraftReady(true);
  },[p.ready,draftReady,p.guided]);
  useEffect(()=>{
    if(!draftReady)return;
    guidedRef.current=active?{routine:active,index,startedAt:started,weight:workWeight,reps:workReps,setType:workType}:null;
    const timer=setTimeout(()=>void updateRef.current(s=>({...s,guided:guidedRef.current})),350);
    return()=>clearTimeout(timer);
  },[draftReady,active,index,started,workWeight,workReps,workType]);
  useEffect(()=>{
    if(!draftReady)return;
    return registerDraftSaver('guided-session',async()=>{if(!await updateRef.current(s=>({...s,guided:guidedRef.current})))throw new Error('The guided session draft could not save. Backup was not exported.');});
  },[draftReady]);
  useEffect(()=>{
    const sub=AppState.addEventListener('change',state=>{if(state!=='active'&&draftReady)void updateRef.current(s=>({...s,guided:guidedRef.current}));});
    return()=>sub.remove();
  },[draftReady]);
  const last = exercise ? fit.sets.find(s => s.exercise.toLowerCase() === exercise.trim().toLowerCase()) : undefined;
  const saveRoutine = async () => {
    setBusy(true);
    const r = { id: editing ?? uid(), name: name.trim(), exercises: draft };
    const ok = await p.update(s => ({ ...s, routines: [...s.routines.filter(x=>x.id!==r.id),r] }));
    setBusy(false);
    if (ok) { setMessage('Routine saved on this device.'); setName(''); setDraft([]); setEditing(null); }
  };
  const begin = (routine: Routine) => {
    if (active) { setMessage('Finish the current guided session before starting another.'); return; }
    setActive(routine); setIndex(0); setStarted(Date.now()); setMessage('');
    setWorkWeight(String(routine.exercises[0].weight)); setWorkReps(String(routine.exercises[0].reps));
    onExercise(routine.exercises[0].name, routine.exercises[0].weight, routine.exercises[0].reps); setOpen(null);
  };
  const move = (next: number) => {
    if (!active) return;
    setIndex(next); const e = active.exercises[next]; setWorkWeight(String(e.weight)); setWorkReps(String(e.reps)); onExercise(e.name,e.weight,e.reps);
  };
  const log = async () => {
    if (!selected) return;
    setBusy(true);
    const ok = await fit.addSet({ exercise: selected.name, weight:Number(workWeight),reps:Number(workReps),setType:workType });
    setBusy(false); setMessage(ok ? 'Set saved. Advance when you are ready.' : 'Could not save this set. Check the weight and reps.');
    if(ok&&p.settings.haptics&&Platform.OS!=='web')void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(()=>{});
    if (ok && workType==='working') setRestKey(k=>k+1);
  };
  const finish = async () => {
    if (!active) return;
    setBusy(true); const ok = await fit.finishWorkout({ since:started,sessionId:uid() }); setBusy(false);
    if (ok) {
      const session = fit.sets.filter(s=> (s.loggedAt??0)>=started);
      setMessage(`Session saved: ${session.length} sets · ${Math.round(session.reduce((n,s)=>n+s.weight*s.reps,0))} kg total volume.`);
      setActive(null);
      void p.update(s=>({...s,guided:null}));
      if(p.settings.haptics&&Platform.OS!=='web')void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(()=>{});
    } else setMessage('Log at least one unfinished set before finishing this session.');
  };
  return <>
    <Box title="Training toolkit" subtitle="Your routines, previous results, and practical tools.">
      <View style={styles.row}><Button testID="open-routines" onPress={()=>{setOpen('routines');setMessage('');}}>Routines & replay</Button>
        <Button secondary testID="open-plates" onPress={()=>setOpen('plates')}>Plate calculator</Button>
        <Button secondary testID="open-alternatives" onPress={()=>setOpen('alternatives')}>Swap exercise</Button></View>
      {last && <Copy>Last {last.exercise}: {last.weight} kg × {last.reps} · {last.date}</Copy>}
      {last && <Button secondary onPress={()=>onExercise(last.exercise,last.weight,last.reps)}>Use previous set values</Button>}
      {!!message && <Copy>{message}</Copy>}{!!p.error && <Copy error>{p.error}</Copy>}
    </Box>
    {selected && <Box title={selected.name} subtitle={`Guided session · exercise ${index+1} of ${active!.exercises.length}. Logged sets persist in your journal.`}>
      <Input label="Working weight (kg)" numeric value={workWeight} onChange={setWorkWeight} testID="routine-weight"/>
      <Input label="Repetitions" numeric value={workReps} onChange={setWorkReps} testID="routine-reps"/>
      <Choice values={['warmup','working','drop','failure']} value={workType} onChange={v=>setWorkType(v as typeof workType)}/>
      <Button disabled={busy} testID="routine-log-set" onPress={()=>void log()}>Log this set</Button>
      <View style={styles.row}>{index>0 && <Button secondary onPress={()=>move(index-1)}>Previous</Button>}
        {index<active!.exercises.length-1 && <Button secondary onPress={()=>move(index+1)}>Next exercise</Button>}</View>
      <Button secondary disabled={busy} testID="routine-finish" onPress={()=>void finish()}>Finish guided session</Button>
      <Button secondary disabled={busy} onPress={()=>{setActive(null);void p.update(s=>({...s,guided:null}));setMessage('Guided draft closed without marking it complete. Any logged sets were kept in your strength journal.');}}>Close draft without finishing</Button>
      <Copy>You can still use the live-session timer and the complete set logger below.</Copy>
    </Box>}
    <RestTimer startKey={restKey} storageId="guided"/>
    <Sheet visible={open==='routines'} title="Routines & workout replay" onClose={()=>setOpen(null)}>
      {!!message && <Copy>{message}</Copy>}{!!p.error && <Copy error>{p.error}</Copy>}
      <Box title={editing ? 'Edit routine' : 'Build your routine'} subtitle="Add exercises in the order you want to train. Nothing is logged until you record a set.">
        <Input label="Routine name" value={name} onChange={setName} testID="routine-name"/>
        <Input label="Exercise name" value={newExercise} onChange={setNewExercise} testID="routine-exercise"/>
        <Input label="Planned weight (kg)" numeric value={newWeight} onChange={setNewWeight} testID="routine-planned-weight"/>
        <Input label="Planned reps" numeric value={newReps} onChange={setNewReps} testID="routine-planned-reps"/>
        <Button secondary onPress={()=>{
          const w=Number(newWeight),r=Number(newReps);
          if (!newExercise.trim() || !Number.isFinite(w) || w<=0 || w>500 || !Number.isInteger(r) || r<1 || r>30) { setMessage('Enter an exercise, 0.01–500 kg and 1–30 whole reps.'); return; }
          setDraft(d=>[...d,{name:newExercise.trim(),weight:w,reps:r}]);setNewExercise('');setNewWeight('');setNewReps('');
        }} testID="routine-add-exercise">Add exercise</Button>
        {draft.map((e,i)=><View key={i} style={{gap:8}}><Copy>{i+1}. {e.name} · {e.weight} kg × {e.reps}</Copy><View style={styles.row}>
          {i>0 && <Button secondary onPress={()=>setDraft(d=>{const n=[...d];[n[i-1],n[i]]=[n[i],n[i-1]];return n;})}>Move up</Button>}
          {i<draft.length-1 && <Button secondary onPress={()=>setDraft(d=>{const n=[...d];[n[i+1],n[i]]=[n[i],n[i+1]];return n;})}>Move down</Button>}
          <Button secondary onPress={()=>{setNewExercise(e.name);setNewWeight(String(e.weight));setNewReps(String(e.reps));setDraft(d=>d.filter((_,j)=>j!==i));}}>Edit</Button>
          <Button secondary onPress={()=>setDraft(d=>d.filter((_,j)=>j!==i))}>Remove from draft</Button></View></View>)}
        <Button disabled={busy||!name.trim()||!draft.length} onPress={()=>void saveRoutine()} testID="save-routine">{busy?'Saving…':'Save routine'}</Button>
      </Box>
      {p.routines.map(r=><Box key={r.id} title={r.name} subtitle={`${r.exercises.length} exercises`}>
        <Button onPress={()=>begin(r)} testID={`start-routine-${r.id}`}>Start guided session</Button>
        <Button secondary onPress={()=>{setEditing(r.id);setName(r.name);setDraft([...r.exercises]);}}>Edit routine</Button>
      </Box>)}
      {!p.routines.length && <Copy>No saved routines yet. Build your first one above.</Copy>}
      <Box title="Repeat a recorded session" subtitle="Review the previous weights and reps before you log new sets.">
        {fit.completedWorkouts.slice(0,8).map(w=>{
          const records=w.setIds.map(id=>fit.sets.find(s=>s.id===id)).filter(s=>!!s);
          return <Button secondary key={w.id} onPress={()=>begin({id:uid(),name:`Repeat ${w.date}`,exercises:records.map(s=>({name:s!.exercise,weight:s!.weight,reps:s!.reps}))})}>Repeat {w.date} · {records.length} sets</Button>;
        })}
        {!fit.completedWorkouts.length && <Copy>Finished workouts will appear here.</Copy>}
      </Box>
    </Sheet>
    <PlateCalculatorModal visible={open==='plates'} onClose={()=>setOpen(null)} initialWeight={weight.trim()&&Number.isFinite(Number(weight))?Number(weight):undefined}/>
    <Sheet visible={open==='alternatives'} title="Exercise substitutions" onClose={()=>setOpen(null)}>
      <Copy>Suggestions share a movement group, not an identical training effect. Start with an appropriate load for the replacement.</Copy>
      <Choice values={['legs','chest','back','shoulders','hinge']} value={muscle} onChange={setMuscle}/>
      {['barbell','dumbbells','machines','cables','bodyweight'].map(e=><Button key={e} secondary onPress={()=>void p.update(s=>({...s,equipment:s.equipment.includes(e)?s.equipment.filter(x=>x!==e):[...s.equipment,e]}))}>{p.equipment.includes(e)?'Available: ':'Add: '}{e}</Button>)}
      {(substitutions(exercise,p.equipment).length ? substitutions(exercise,p.equipment) : exerciseLibrary.filter(e=>e.group===muscle&&p.equipment.includes(e.equipment))).map(e=>
        <Button key={e.name} secondary onPress={()=>{onExercise(e.name,null,null);setOpen(null);}}>{e.name} · {e.equipment}</Button>)}
    </Sheet>
  </>;
}