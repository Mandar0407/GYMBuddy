import React, { useRef, useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { getFoodBarcode } from '@workspace/api-client-react';
import { type MealDraft, portion } from '@/lib/premiumLogic';
import { Button, Copy, Input, Sheet, Box } from './PremiumUI';

export default function BarcodeScanner({ visible, onClose, onMeal }: { visible: boolean; onClose: () => void; onMeal: (meal: MealDraft) => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [barcode, setBarcode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [product, setProduct] = useState<MealDraft|null>(null);
  const [grams, setGrams] = useState('100');
  const [camera, setCamera] = useState(false);
  const scanned=useRef(false);
  const lookup = async (code: string) => {
    setCamera(false);
    if (!/^\d{8,14}$/.test(code.trim())) { setMessage('Enter an 8–14 digit barcode.'); return; }
    setBusy(true);setProduct(null);setMessage('');setBarcode(code);
    try {
      const food = await getFoodBarcode(code.trim());
      setProduct({name:food.name,meal:'Snack',calories:food.calories,protein:food.protein,carbs:food.carbs,fat:food.fat});
    } catch(e) {
      const text=e instanceof Error?e.message:'Lookup failed';
      setMessage(`Could not retrieve complete nutrition. ${text}. Try another barcode or enter the package label manually.`);
    } finally {setBusy(false);}
  };
  return <Sheet visible={visible} title="Scan & review food" onClose={()=>{setCamera(false);onClose();}}>
    <Copy>Open Food Facts lookup sends only the product barcode. Community nutrition can be incomplete; check your package before logging.</Copy>
    <Input label="Product barcode" numeric value={barcode} onChange={setBarcode} testID="barcode-input"/>
    <Button disabled={busy} onPress={()=>void lookup(barcode)} testID="barcode-lookup">{busy?'Looking up…':'Look up barcode'}</Button>
    {Platform.OS!=='web' && <Button secondary disabled={busy} onPress={async()=>{
      scanned.current=false;
      if (permission?.granted) {setCamera(true);return;}
      if (permission&&!permission.canAskAgain) { try {await Linking.openSettings();} catch {setMessage('Open device settings to allow camera access.');} return; }
      try {const result=await requestPermission();if(result.granted)setCamera(true);else setMessage('Camera permission was not granted. You can still enter the barcode.');}
      catch {setMessage('Camera access is unavailable. Enter the barcode instead.');}
    }}>{permission&&!permission.canAskAgain&&!permission.granted?'Open camera settings':'Open barcode camera'}</Button>}
    {camera&&permission?.granted&&visible&&<View style={{height:240,borderRadius:16,overflow:'hidden'}}>
      <CameraView style={{flex:1}} facing="back" barcodeScannerSettings={{barcodeTypes:['ean13','ean8','upc_a','upc_e']}}
        onBarcodeScanned={busy?undefined:({data})=>{if(scanned.current)return;scanned.current=true;void lookup(data);}}/>
    </View>}
    {!!message&&<Copy error>{message}</Copy>}
    {product&&<Box title={product.name} subtitle="Nutrition per 100 g · Open Food Facts">
      <Copy>{product.calories} kcal · P {product.protein} g · C {product.carbs} g · F {product.fat} g</Copy>
      <Input label="Amount eaten (grams)" numeric value={grams} onChange={setGrams} testID="barcode-grams"/>
      <Button onPress={()=>{try{onMeal(portion(product,Number(grams)/100));onClose();}catch(e){setMessage((e as Error).message);}}} testID="barcode-review">Review in meal logger</Button>
      <Button secondary onPress={()=>void Linking.openURL('https://world.openfoodfacts.org')}>Food data attribution & licence</Button>
    </Box>}
  </Sheet>;
}