const savers=new Map<string,()=>Promise<void>>();
export function registerDraftSaver(key:string,save:()=>Promise<void>){
  savers.set(key,save);
  return()=>{if(savers.get(key)===save)savers.delete(key);};
}
export async function flushDraftSavers(){
  await Promise.all([...savers.values()].map(save=>save()));
}