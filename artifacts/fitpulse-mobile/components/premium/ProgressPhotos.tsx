import React,{useState}from'react';
import{Image,Linking,Platform,View}from'react-native';
import * as ImagePicker from'expo-image-picker';
import{File,Paths}from'expo-file-system';
import{usePremium}from'@/providers/PremiumProvider';
import{dateKey}from'@/providers/FitnessProvider';
import{uid}from'@/lib/premiumLogic';
import{Box,Button,Copy,Input,styles}from'./PremiumUI';

export default function ProgressPhotos(){
  const p=usePremium();const[note,setNote]=useState('');const[message,setMessage]=useState('');const[busy,setBusy]=useState(false);
  const[selected,setSelected]=useState<string[]>([]);
  const add=async()=>{
    setBusy(true);setMessage('');
    try{
      if(Platform.OS!=='web'){
        const permission=await ImagePicker.requestMediaLibraryPermissionsAsync();
        if(!permission.granted){
          setMessage('Photo permission was not granted. No photo was added.');
          if(!permission.canAskAgain)await Linking.openSettings();
          return;
        }
      }
      const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],quality:.6,base64:Platform.OS==='web',allowsEditing:true});
      if(result.canceled)return;
      const asset=result.assets[0];const id=uid();let uri=asset.uri;
      const mime=asset.mimeType??'image/jpeg';
      if(!['image/jpeg','image/png','image/webp'].includes(mime))throw new Error('Choose a JPEG, PNG or WebP photo so it can also be restored from a backup.');
      if(Platform.OS==='web'){
        if(!asset.base64)throw new Error('This browser could not read the selected photo.');
        if(asset.base64.length>3000000)throw new Error('Choose a photo smaller than approximately 2 MB.');
        uri=`data:${asset.mimeType??'image/jpeg'};base64,${asset.base64}`;
      }else{
        const source=new File(asset.uri);if(source.size>5000000)throw new Error('Choose a photo smaller than 5 MB.');
        const extension=mime==='image/png'?'png':mime==='image/webp'?'webp':'jpg';
        const file=new File(Paths.document,`gym-photo-${id}.${extension}`);source.copy(file);uri=file.uri;
      }
      const ok=await p.update(s=>({...s,photos:[...s.photos,{id,date:dateKey(new Date()),uri,note:note.trim()}]}));
      if(ok){setNote('');setMessage('Private photo saved on this device.');}
      else setMessage('Could not save the photo record. Your existing photos were kept.');
    }catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
  };
  return <Box title="Private progress photos" subtitle="Opt-in and device-local. Photos are never uploaded to the paired journal or included in a backup unless you choose to include them.">
    <Input label="Optional note" value={note} onChange={setNote} testID="photo-note"/>
    <Button disabled={busy} onPress={()=>void add()} testID="add-progress-photo">{busy?'Adding…':'Choose a photo'}</Button>
    {!!message&&<Copy>{message}</Copy>}
    <Copy>Select two dates for a side-by-side comparison. Matching framing and lighting make comparisons more useful.</Copy>
    <View style={styles.row}>{p.photos.map(photo=><Button secondary key={photo.id} onPress={()=>setSelected(s=>s.includes(photo.id)?s.filter(id=>id!==photo.id):[...s.slice(-1),photo.id])}>{selected.includes(photo.id)?'Selected · ':''}{photo.date}</Button>)}</View>
    <View style={{flexDirection:'row',gap:10}}>{selected.map(id=>p.photos.find(x=>x.id===id)).filter(x=>!!x).map(photo=><View key={photo!.id} style={{flex:1,gap:8}}>
      <Image source={{uri:photo!.uri}} accessibilityLabel={`Private progress photo from ${photo!.date}`} style={{width:'100%',height:230,borderRadius:14}} resizeMode="contain"/>
      <Copy>{photo!.date} · {photo!.note}</Copy>
    </View>)}</View>
    {p.photos.length>0&&<Copy>Removing a photo here does not delete the original from your device photo library.</Copy>}
    {selected.map(id=><Button secondary key={id} onPress={()=>{void p.update(s=>({...s,photos:s.photos.filter(x=>x.id!==id)})).then(ok=>{if(ok)setSelected(s=>s.filter(x=>x!==id));});}}>Remove selected photo {p.photos.find(x=>x.id===id)?.date}</Button>)}
    {!p.photos.length&&<Copy>No photos added. This feature is optional.</Copy>}
  </Box>;
}