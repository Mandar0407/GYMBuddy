import React,{useState}from'react';
import{useFitness,validateFitnessBackup}from'@/providers/FitnessProvider';
import{usePremium,validatePremium,type PremiumState}from'@/providers/PremiumProvider';
import{exportBackup,makeBackup,pickBackup,materializePhotos,restoreMissingSessions,type Backup}from'@/lib/mobileBackup';
import{Box,Button,Choice,Copy}from'./PremiumUI';
import{flushDraftSavers}from'@/lib/draftFlush';

export default function BackupPanel(){
  const fit=useFitness();const p=usePremium();
  const[photos,setPhotos]=useState('exclude photos');const[restoreProfile,setRestoreProfile]=useState('keep current profile');
  const[preferences,setPreferences]=useState('keep current preferences');
  const[incoming,setIncoming]=useState<Backup|null>(null);const[message,setMessage]=useState('');const[busy,setBusy]=useState(false);
  const core=()=>({profile:fit.profile,meals:fit.meals,sets:fit.sets,completedWorkouts:fit.completedWorkouts,water:fit.water,weights:fit.weights});
  const advanced=():PremiumState=>({version:1,settings:p.settings,routines:p.routines,favourites:p.favourites,recipes:p.recipes,photos:p.photos,equipment:p.equipment,dayMode:p.dayMode,dayTargets:p.dayTargets,guided:p.guided,routineDraft:p.routineDraft,recipeDraft:p.recipeDraft});
  const run=async(fn:()=>Promise<void>)=>{setBusy(true);setMessage('');try{await fn();}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}};
  return <Box title="Backup & restore" subtitle="Backup files contain personal fitness data. Keep them somewhere private. Pairing keys and credentials are never exported.">
    <Choice values={['exclude photos','include private photos']} value={photos} onChange={setPhotos}/>
    <Button disabled={busy||!fit.canSave||!p.canSave} testID="export-backup" onPress={()=>void run(async()=>{
      await flushDraftSavers();
      await exportBackup(await makeBackup(fit.getSnapshot(),p.getSnapshot(),photos==='include private photos'));setMessage('Backup prepared. Save the file using your device’s download or sharing options.');
    })}>Export private backup</Button>
    <Button secondary disabled={busy} testID="pick-backup" onPress={()=>void run(async()=>{const file=await pickBackup();if(file)setIncoming(file);})}>Choose backup to restore</Button>
    {incoming&&<>
      <Copy>Preview: {incoming.journal.meals.length} meals, {incoming.journal.sets.length} sets, {incoming.advanced.routines.length} routines, {incoming.advanced.recipes.length} recipes, {incoming.advanced.photos.length} photos.</Copy>
      <Copy>Merge adds missing records. Identical IDs are not duplicated; differing existing records stay unchanged. Existing daily water and weight records take precedence. Completed sessions with conflicting or already-claimed sets are not duplicated. Previously deleted paired meal/set IDs get stable restoration IDs rather than resurrecting sync deletion markers.</Copy>
      <Choice values={['keep current profile','restore backup profile']} value={restoreProfile} onChange={setRestoreProfile}/>
      <Copy>Choosing restore backup profile replaces your current profile and base targets.</Copy>
      <Choice values={['keep current preferences','restore backup preferences']} value={preferences} onChange={setPreferences}/>
      <Copy>Restoring preferences replaces appearance, Today shortcuts, available equipment, rest duration and day-target overrides with the backup values.</Copy>
      <Button disabled={busy} testID="confirm-restore" onPress={()=>void run(async()=>{
        validateFitnessBackup(incoming.journal);validatePremium(incoming.advanced);
        const local=await materializePhotos(incoming.advanced);
        if(!await fit.importBackup(incoming.journal,restoreProfile==='restore backup profile'))throw new Error('Journal restore failed. Existing journal records were kept.');
        if(!await p.mergeBackup(local,preferences==='restore backup preferences'))throw new Error('Journal records were merged, but advanced libraries could not save. Your original libraries were kept; retrying does not duplicate IDs.');
        await restoreMissingSessions(incoming.localSessions);setIncoming(null);setMessage('Restore complete. Existing conflicting records and preferences were kept. Reopen the app to load any newly imported session drafts or presets.');
      })}>{busy?'Restoring…':'Confirm merge restore'}</Button>
      <Button secondary onPress={()=>setIncoming(null)}>Cancel restore</Button>
    </>}
    {!!message&&<Copy>{message}</Copy>}
  </Box>;
}