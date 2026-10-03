import React from'react';
import{View}from'react-native';
import{dateKey,useFitness}from'@/providers/FitnessProvider';
import{usePremium}from'@/providers/PremiumProvider';
import{Box,Button,Copy,styles}from'./PremiumUI';

export default function DashboardExtras({onNavigate}:{onNavigate:(tab:'Today'|'Nutrition'|'Strength'|'Movement'|'Insights'|'My plan')=>void}){
  const fit=useFitness();const p=usePremium();
  const now=new Date();const start=new Date(now);start.setDate(start.getDate()-6);
  const dates=Array.from({length:7},(_,i)=>{const d=new Date(start);d.setDate(d.getDate()+i);return dateKey(d);});
  const workouts=fit.completedWorkouts.filter(w=>dates.includes(w.date));
  const meals=fit.meals.filter(m=>dates.includes(m.date));
  return <>
    <Box title="Your shortcuts" subtitle="Full tools stay available in the navigation.">
      <View style={styles.row}>{p.settings.shortcuts.map(s=><Button secondary key={s} onPress={()=>onNavigate(s as Parameters<typeof onNavigate>[0])} testID={`shortcut-${s.replace(/\s/g,'-')}`}>{s}</Button>)}</View>
      {!p.settings.shortcuts.length&&<Copy>Choose Today shortcuts in your personal workspace.</Copy>}
      <Button secondary onPress={()=>onNavigate('Strength')}>Continue or resume training</Button>
    </Box>
    <Box title="Your recorded week" subtitle="Last seven recorded dates—not an estimate of unlogged activity.">
      <Copy>{workouts.length} finished workouts · {meals.length} meals logged · {new Set(meals.map(m=>m.date)).size} days with meal entries</Copy>
      <Copy>{!workouts.length?'Next step: record and finish a strength session.':!meals.length?'Next step: add meals to make nutrition progress easier to review.':'Next step: compare exercise results in Insights and repeat a routine you enjoyed.'}</Copy>
      <Button secondary onPress={()=>onNavigate('Insights')}>Open all insights & history</Button>
    </Box>
    <Box title="Saved & connected" subtitle={fit.journalSyncStatus==='unpaired'?'Journal saved on this device. Pair in Movement for supported journal syncing.':`Paired journal: ${fit.journalSyncStatus}`}>
      <Copy>Routines, recipes, photos, day overrides and appearance preferences remain device-local. Export a backup to keep a separate copy.</Copy>
      {!!fit.journalSyncError&&<Copy error>{fit.journalSyncError}</Copy>}
      {!!fit.error&&<Copy error>{fit.error}</Copy>}
      {fit.journalSyncStatus!=='unpaired'&&<Button secondary disabled={fit.journalSyncStatus==='syncing'} testID="retry-journal-sync" onPress={()=>void fit.syncJournal()}>Retry journal sync</Button>}
      {fit.undoAvailable&&<Button secondary testID="undo-deletion" onPress={()=>void fit.undoLastDeletion()}>Undo last meal or set deletion</Button>}
    </Box>
  </>;
}