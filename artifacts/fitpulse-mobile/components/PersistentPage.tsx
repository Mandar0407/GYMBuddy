import React,{createContext,memo,useContext,type ReactNode}from'react';
import{View}from'react-native';
const PageVisibility=createContext(true);
export const usePageVisible=()=>useContext(PageVisibility);
// Keep drafts and scroll positions mounted, but do not reconcile hidden page
// trees on every field edit, step update or navigation action.
export const FrozenPageContent=memo(
  ({children}:{children:ReactNode;active:boolean})=><>{children}</>,
  (_previous,next)=>!next.active,
);
export function PersistentPage({active,children}:{active:boolean;children:ReactNode}){
  return <View style={{flex:1,display:active?'flex':'none'}} pointerEvents={active?'auto':'none'}>
    <PageVisibility.Provider value={active}>{children}</PageVisibility.Provider>
  </View>;
}