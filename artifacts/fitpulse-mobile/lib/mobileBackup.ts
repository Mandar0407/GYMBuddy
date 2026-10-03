import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { validateFitnessBackup, type FitnessState } from '@/providers/FitnessProvider';
import { validatePremium, type PremiumState } from '@/providers/PremiumProvider';
const localKeys = ['fitpulse-workout-sessions','fitpulse-active-workout','@fitpulse/mobile/fasting-session/v1','@fitpulse/mobile/interval-presets/v1','@fitpulse/mobile/meal-templates/v1','@fitpulse/mobile/form-drafts/v1','@fitpulse/mobile/rest/free','@fitpulse/mobile/rest/guided'];
export type Backup = { format: 'GYMBuddy'; version: 1; exportedAt: string; journal: FitnessState & { version: 1 }; advanced: PremiumState; localSessions: Record<string,string> };
export async function makeBackup(journal: FitnessState, advanced: PremiumState, includePhotos: boolean): Promise<Backup> {
  const photos = [];
  if (includePhotos) for (const photo of advanced.photos) {
    const format=photo.uri.endsWith('.png')?'png':photo.uri.endsWith('.webp')?'webp':'jpeg';
    const uri = photo.uri.startsWith('data:') ? photo.uri : `data:image/${format};base64,${await new File(photo.uri).base64()}`;
    if (uri.length>7000000) throw new Error('A photo is too large for this backup. Export without photos or use a smaller image.');
    photos.push({...photo,uri});
  }
  const pairs=await AsyncStorage.multiGet(localKeys);
  return {format:'GYMBuddy',version:1,exportedAt:new Date().toISOString(),journal:{version:1,...journal},
    advanced:{...advanced,photos},localSessions:Object.fromEntries(pairs.filter((p):p is [string,string]=>p[1]!==null))};
}
export function parseBackup(text:string):Backup {
  if(text.length>40000000)throw new Error('Backup exceeds the 40 MB limit.');
  const v=JSON.parse(text) as Backup;
  if(!v||v.format!=='GYMBuddy'||v.version!==1)throw new Error('Choose a GYM Buddy backup file.');
  v.journal={version:1,...validateFitnessBackup(v.journal)};v.advanced=validatePremium(v.advanced);
  if(!v.advanced.photos.every(p=>/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=\r\n]+$/.test(p.uri)&&p.uri.length<=7000000))throw new Error('Backup photos must contain portable JPEG, PNG or WebP image data.');
  if(!v.localSessions||typeof v.localSessions!=='object'||Array.isArray(v.localSessions))throw new Error('Invalid session backup.');
  for(const [key,value]of Object.entries(v.localSessions)){
    if(!localKeys.includes(key)||typeof value!=='string'||value.length>2000000)throw new Error('Invalid session backup key or size.');
    const data=JSON.parse(value);
    if(!data||typeof data!=='object')throw new Error('Invalid session data.');
  }
  return v;
}
export async function exportBackup(backup:Backup) {
  const text=JSON.stringify(backup);
  if(text.length>40000000)throw new Error('Backup exceeds 40 MB. Try excluding photos.');
  const name=`gym-buddy-${new Date().toISOString().slice(0,10)}.json`;
  if(Platform.OS==='web'){
    const blob=new Blob([text],{type:'application/json'});const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;
  }
  if(!await Sharing.isAvailableAsync())throw new Error('File sharing is unavailable on this device.');
  const file=new File(Paths.cache,name);file.create({overwrite:true});file.write(text);
  await Sharing.shareAsync(file.uri,{mimeType:'application/json',dialogTitle:'Save your private GYM Buddy backup'});
}
export async function pickBackup():Promise<Backup|null>{
  const result=await DocumentPicker.getDocumentAsync({type:['application/json','text/plain'],copyToCacheDirectory:true});
  if(result.canceled)return null;
  const asset=result.assets[0];
  if(asset.size&&asset.size>40000000)throw new Error('Backup exceeds the 40 MB limit.');
  const text=Platform.OS==='web'&&asset.file?await asset.file.text():await new File(asset.uri).text();
  return parseBackup(text);
}
export async function materializePhotos(incoming:PremiumState):Promise<PremiumState>{
  if(Platform.OS==='web')return incoming;
  const photos=[];
  for(const p of incoming.photos){
    if(!p.uri.startsWith('data:image/'))throw new Error('Backup photo data is not portable. Export a new backup with photos included.');
    const comma=p.uri.indexOf(',');const data=p.uri.slice(comma+1);
    const extension=p.uri.startsWith('data:image/png;')?'png':p.uri.startsWith('data:image/webp;')?'webp':'jpg';
    const file=new File(Paths.document,`gym-photo-${p.id}.${extension}`);
    if(!file.exists){file.create();file.write(data,{encoding:'base64'});}
    photos.push({...p,uri:file.uri});
  }
  return {...incoming,photos};
}
export async function restoreMissingSessions(values:Record<string,string>){
  for(const [key,value]of Object.entries(values))if(await AsyncStorage.getItem(key)===null)await AsyncStorage.setItem(key,value);
}