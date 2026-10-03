import { useEffect,useRef,useState } from'react';
import { AppState } from'react-native';
import { usePremium,type PremiumState } from'@/providers/PremiumProvider';
import{registerDraftSaver}from'@/lib/draftFlush';
export function usePremiumDraft<K extends 'routineDraft'|'recipeDraft'>(key:K,value:PremiumState[K],restore:(value:NonNullable<PremiumState[K]>)=>void) {
  const p=usePremium();const[initialized,setInitialized]=useState(false);
  const update=useRef(p.update);update.current=p.update;
  const restoreRef=useRef(restore);restoreRef.current=restore;
  const latest=useRef(value);latest.current=value;
  const serialized=JSON.stringify(value);
  useEffect(()=>{
    if(!p.ready||initialized)return;
    const saved=p[key];if(saved)restoreRef.current(saved);
    setInitialized(true);
  },[p.ready,initialized,key,p[key]]);
  useEffect(()=>{
    if(!initialized)return;
    const timer=setTimeout(()=>{void update.current(s=>({...s,[key]:latest.current}));},350);
    return()=>clearTimeout(timer);
  },[initialized,key,serialized]);
  useEffect(()=>{
    const listener=AppState.addEventListener('change',state=>{if(state!=='active'&&initialized)void update.current(s=>({...s,[key]:latest.current}));});
    return()=>listener.remove();
  },[initialized,key]);
  useEffect(()=>{
    if(!initialized)return;
    return registerDraftSaver(key,async()=>{if(!await update.current(s=>({...s,[key]:latest.current})))throw new Error(`The ${key} could not save. Backup was not exported; your original stored data was kept.`);});
  },[initialized,key]);
}