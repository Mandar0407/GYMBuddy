import React, { useEffect, useRef, useState } from 'react';
import { AppState, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { usePremium } from '@/providers/PremiumProvider';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import AsyncStorage from '@react-native-async-storage/async-storage';

const REST_SECONDS = 90;

const formatTime = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

export default function RestTimer({ startKey, storageId='free' }: { startKey: number; storageId?: string }) {
  const colors = useColors();
  const p=usePremium();
  const reduced=useReducedMotion();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [remaining, setRemaining] = useState(REST_SECONDS);
  const [running, setRunning] = useState(false);
  const deadlineRef = useRef(0);
  const lastStartKeyRef = useRef(0);
  const [total,setTotal]=useState(REST_SECONDS);
  const [loaded,setLoaded]=useState(false);
  const [saveError,setSaveError]=useState('');
  useEffect(()=>{
    let alive=true;
    AsyncStorage.getItem(`@fitpulse/mobile/rest/${storageId}`).then(raw=>{
      if(!alive||!raw||lastStartKeyRef.current>0)return;
      const v=JSON.parse(raw);
      if(typeof v.visible!=='boolean'||typeof v.running!=='boolean'||!Number.isFinite(v.deadline)||!Number.isFinite(v.remaining)||v.remaining<0||v.remaining>3600||!Number.isFinite(v.total)||v.total<1||v.total>3600)throw new Error('Invalid timer draft');
      if(v.visible){
        const left=v.running?Math.max(0,Math.ceil((v.deadline-Date.now())/1000)):v.remaining;
        setRemaining(left);setTotal(v.total);deadlineRef.current=v.deadline;setRunning(v.running&&left>0);setVisible(true);
      }
    }).catch(()=>{if(alive)setSaveError('Rest timer draft could not load; journal records were kept.');}).finally(()=>{if(alive)setLoaded(true);});
    return()=>{alive=false;};
  },[storageId]);
  const pausedRemaining=running?null:remaining;
  useEffect(()=>{
    if(!loaded)return;
    void AsyncStorage.setItem(`@fitpulse/mobile/rest/${storageId}`,JSON.stringify({visible,running,deadline:deadlineRef.current,remaining,total}))
      .catch(()=>setSaveError('Timer draft could not save. Keep the app open to retain the countdown.'));
  },[loaded,visible,running,pausedRemaining,total,storageId]);

  useEffect(() => {
    if (startKey <= 0) {
      lastStartKeyRef.current = 0;
      return;
    }
    if (startKey <= lastStartKeyRef.current) return;

    lastStartKeyRef.current = startKey;
    const seconds=p.settings.restSeconds;
    setTotal(seconds);
    setRemaining(seconds);
    deadlineRef.current = Date.now() + seconds * 1000;
    setRunning(true);
    setVisible(true);
  }, [startKey]);

  useEffect(() => {
    if (!visible || !running) return undefined;

    const refresh = () => {
      const seconds = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
      setRemaining(seconds);
      if (seconds === 0) setRunning(false);
    };
    refresh();
    const interval = setInterval(refresh, 250);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') refresh();
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [visible, running]);

  const dismiss = () => {
    setVisible(false);
    setRunning(false);
  };
  const pauseOrResume = () => {
    if (running) {
      const nextRemaining = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
      setRemaining(nextRemaining);
      setRunning(false);
      return;
    }
    if (remaining > 0) {
      deadlineRef.current = Date.now() + remaining * 1000;
      setRunning(true);
    }
  };

  const complete = remaining === 0;
  const progress = Math.max(0, Math.min(1, (total - remaining) / total));
  const adjust=(extra:number)=>{
    const now=running?Math.max(0,Math.ceil((deadlineRef.current-Date.now())/1000)):remaining;
    const next=Math.min(3600,now+extra);setRemaining(next);setTotal(t=>Math.min(3600,t+next-now));
    if(running)deadlineRef.current=Date.now()+next*1000;
  };
  const preset=(seconds:number)=>{
    setTotal(seconds);setRemaining(seconds);deadlineRef.current=Date.now()+seconds*1000;setRunning(true);
    void p.update(s=>({...s,settings:{...s.settings,restSeconds:seconds}}));
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduced?'none':'fade'}
      statusBarTranslucent
      onRequestClose={dismiss}
    >
      <View style={[styles.backdrop, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
        <View style={[styles.dialog, { backgroundColor: colors.card, borderColor: colors.border }]} testID="dialog-rest-timer">
          <View style={styles.header}>
            <View style={styles.eyebrowRow}>
              <Feather name="clock" size={14} color={colors.primary} />
              <Text style={[styles.eyebrow, { color: colors.primary }]}>
                {complete ? 'REST COMPLETE' : 'REST BETWEEN SETS'}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss rest timer"
              testID="button-close-rest-timer"
              hitSlop={10}
              onPress={dismiss}
              style={styles.closeButton}
            >
              <Feather name="x" size={18} color={colors.mutedForeground} />
            </Pressable>
          </View>

          <View style={[styles.timerFace, { backgroundColor: colors.background, borderColor: colors.accent }]}>
            <Text
              accessibilityLiveRegion="polite"
              accessibilityLabel={`${Math.floor(remaining / 60)} minutes ${remaining % 60} seconds remaining`}
              testID="text-rest-time"
              style={[styles.clock, { color: colors.foreground }]}
            >
              {formatTime(remaining)}
            </Text>
            <Text style={[styles.timerCaption, { color: colors.mutedForeground }]}>
              {complete ? 'READY WHEN YOU ARE' : 'TAKE A BREATH'}
            </Text>
          </View>

          <View style={styles.copy}>
            <Text style={[styles.title, { color: colors.foreground }]}>
              {complete ? 'Ready for your next set.' : running ? 'Take a breath.' : 'Timer paused.'}
            </Text>
            <Text style={[styles.description, { color: colors.mutedForeground }]}>
              A little space to recover before you go again.
            </Text>
          </View>

          <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
            <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: colors.primary }]} />
          </View>
          <View style={[styles.actions,{flexWrap:'wrap'}]}>
            {[60,90,120,180].map(seconds=><Pressable key={seconds} accessibilityRole="button" accessibilityLabel={`Set rest to ${seconds} seconds`} testID={`rest-preset-${seconds}`} onPress={()=>preset(seconds)}
              style={[styles.secondaryAction,{minWidth:62,flex:1,backgroundColor:colors.secondary}]}><Text style={[styles.secondaryActionText,{color:colors.secondaryForeground}]}>{seconds}s</Text></Pressable>)}
          </View>
          <View style={styles.actions}>
            {[15,30].map(seconds=><Pressable key={seconds} accessibilityRole="button" accessibilityLabel={`Extend rest by ${seconds} seconds`} testID={`extend-rest-${seconds}`} onPress={()=>adjust(seconds)}
              style={[styles.secondaryAction,{flex:1,backgroundColor:colors.secondary}]}><Text style={[styles.secondaryActionText,{color:colors.secondaryForeground}]}>+{seconds}s</Text></Pressable>)}
          </View>
          {!!saveError&&<Text style={[styles.description,{color:colors.destructive}]}>{saveError}</Text>}

          <View style={styles.actions}>
            {complete ? (
              <Pressable
                accessibilityRole="button"
                testID="button-finish-rest"
                onPress={dismiss}
                style={({ pressed }) => [styles.primaryAction, { backgroundColor: colors.primary, opacity: pressed ? 0.75 : 1 }]}
              >
                <Feather name="check" size={16} color={colors.primaryForeground} />
                <Text style={[styles.primaryActionText, { color: colors.primaryForeground }]}>Done</Text>
              </Pressable>
            ) : (
              <>
                <Pressable
                  accessibilityRole="button"
                  testID={running ? 'button-pause-rest' : 'button-resume-rest'}
                  onPress={pauseOrResume}
                  style={({ pressed }) => [styles.primaryAction, { backgroundColor: colors.primary, opacity: pressed ? 0.75 : 1 }]}
                >
                  <Feather name={running ? 'pause' : 'play'} size={15} color={colors.primaryForeground} />
                  <Text style={[styles.primaryActionText, { color: colors.primaryForeground }]}>{running ? 'Pause' : 'Resume'}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  testID="button-skip-rest"
                  onPress={dismiss}
                  style={({ pressed }) => [styles.secondaryAction, { backgroundColor: colors.secondary, opacity: pressed ? 0.75 : 1 }]}
                >
                  <Text style={[styles.secondaryActionText, { color: colors.secondaryForeground }]}>Skip</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, backgroundColor: 'rgba(39, 35, 31, 0.48)' },
  dialog: { width: '100%', maxWidth: 420, borderWidth: 1, borderRadius: 24, padding: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  eyebrow: { fontFamily: 'DMSans_700Bold', fontSize: 9, letterSpacing: 1.3 },
  closeButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  timerFace: { alignSelf: 'center', width: 174, height: 174, borderRadius: 87, borderWidth: 7, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  clock: { fontFamily: 'DMSans_700Bold', fontSize: 39, lineHeight: 46, letterSpacing: -1.8, fontVariant: ['tabular-nums'] },
  timerCaption: { fontFamily: 'DMSans_700Bold', fontSize: 8, letterSpacing: 1.1, marginTop: 2 },
  copy: { alignItems: 'center', marginTop: 17 },
  title: { fontFamily: 'DMSans_700Bold', fontSize: 18, lineHeight: 24, textAlign: 'center' },
  description: { fontFamily: 'DMSans_400Regular', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 4 },
  progressTrack: { height: 5, borderRadius: 3, overflow: 'hidden', marginTop: 20 },
  progressFill: { height: '100%', borderRadius: 3 },
  actions: { flexDirection: 'row', gap: 9, marginTop: 18 },
  primaryAction: { minHeight: 46, flex: 1, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 },
  primaryActionText: { fontFamily: 'DMSans_700Bold', fontSize: 13 },
  secondaryAction: { minHeight: 46, minWidth: 92, borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  secondaryActionText: { fontFamily: 'DMSans_700Bold', fontSize: 13 },
});