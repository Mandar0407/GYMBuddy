import React,{useEffect}from'react';
import{StatusBar}from'expo-status-bar';
import * as SystemUI from'expo-system-ui';
import{useColors}from'@/hooks/useColors';
export default function AppearanceBridge(){
  const c=useColors();
  useEffect(()=>{void SystemUI.setBackgroundColorAsync(c.background).catch(()=>{});},[c.background]);
  return <StatusBar style={c.background==='#181c19'?'light':'dark'}/>;
}