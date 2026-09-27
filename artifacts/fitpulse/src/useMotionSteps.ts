import { useEffect, useRef, useState } from 'react';

export type MotionStatus = 'idle' | 'requesting' | 'active' | 'paused' | 'denied' | 'unsupported';

type SensorLike = {
  x: number | null;
  y: number | null;
  z: number | null;
  start: () => void;
  stop: () => void;
  addEventListener: (name: string, listener: EventListener) => void;
  removeEventListener: (name: string, listener: EventListener) => void;
};

const TRACKING_KEY = 'fitpulse-live-tracking';

function trackingWasEnabled() {
  try {
    return window.localStorage.getItem(TRACKING_KEY) === 'true';
  } catch {
    return false;
  }
}

function saveTrackingIntent(enabled: boolean) {
  try {
    window.localStorage.setItem(TRACKING_KEY, String(enabled));
    return true;
  } catch {
    return false;
  }
}

function makePeakDetector(onStep: () => void) {
  let baseline = 9.81;
  let smoothed = 0;
  let armed = true;
  let lastStepAt = performance.now();

  return (x: number, y: number, z: number, includesGravity: boolean) => {
    const magnitude = Math.hypot(x, y, z);
    if (includesGravity) baseline = baseline * 0.94 + magnitude * 0.06;
    const dynamic = includesGravity ? Math.abs(magnitude - baseline) : magnitude;
    smoothed = smoothed * 0.55 + dynamic * 0.45;
    if (smoothed < 0.65) armed = true;
    const now = performance.now();
    if (armed && smoothed > 1.15 && now - lastStepAt >= 320) {
      armed = false;
      lastStepAt = now;
      onStep();
    }
  };
}

export function useMotionSteps(onStep: () => void) {
  const [status, setStatus] = useState<MotionStatus>(() => trackingWasEnabled() ? 'paused' : 'idle');
  const [storageError, setStorageError] = useState(false);
  const onStepRef = useRef(onStep);
  const cleanupRef = useRef<(() => void) | null>(null);
  const tokenRef = useRef(0);
  const wantedRef = useRef(trackingWasEnabled());
  onStepRef.current = onStep;
  const persistIntent = (enabled: boolean) => {
    wantedRef.current = enabled;
    if (!saveTrackingIntent(enabled)) setStorageError(true);
  };

  const stop = () => {
    tokenRef.current += 1;
    cleanupRef.current?.();
    cleanupRef.current = null;
    persistIntent(false);
    setStatus('idle');
  };

  const start = async () => {
    if (status === 'active' || status === 'requesting') return;
    const token = ++tokenRef.current;
    cleanupRef.current?.();
    cleanupRef.current = null;
    setStatus('requesting');

    if (!window.isSecureContext) {
      setStatus('unsupported');
      persistIntent(false);
      return;
    }

    const Motion = window.DeviceMotionEvent as (typeof DeviceMotionEvent & {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    }) | undefined;

    try {
      // iOS requires this call directly from the button click, before any other await.
      if (Motion?.requestPermission && await Motion.requestPermission() !== 'granted') {
        if (token === tokenRef.current) {
          setStatus('denied');
          persistIntent(false);
        }
        return;
      }
    } catch {
      if (token === tokenRef.current) {
        setStatus('denied');
        persistIntent(false);
      }
      return;
    }
    if (token !== tokenRef.current) return;

    let stopped = false;
    let activeCleanup = () => {};
    let silenceTimer = 0;
    const close = () => {
      stopped = true;
      window.clearTimeout(silenceTimer);
      activeCleanup();
    };
    cleanupRef.current = close;
    const ready = () => {
      if (stopped || token !== tokenRef.current) return;
      persistIntent(true);
      setStatus('active');
    };
    const noteReading = () => {
      window.clearTimeout(silenceTimer);
      silenceTimer = window.setTimeout(() => {
        if (stopped || token !== tokenRef.current) return;
        close();
        cleanupRef.current = null;
        setStatus('paused');
      }, 15_000);
    };
    const fail = (reason: MotionStatus) => {
      if (stopped || token !== tokenRef.current) return;
      close();
      cleanupRef.current = null;
      persistIntent(false);
      setStatus(reason);
    };
    const detector = makePeakDetector(() => {
      if (!stopped && token === tokenRef.current) onStepRef.current();
    });

    const startAccelerometer = () => {
      const Sensor = (window as Window & { Accelerometer?: new (options: { frequency: number }) => SensorLike }).Accelerometer;
      if (!Sensor) {
        fail('unsupported');
        return;
      }
      try {
        const sensor = new Sensor({ frequency: 25 });
        let hasReading = false;
        const reading: EventListener = () => {
          if (sensor.x === null || sensor.y === null || sensor.z === null ||
            ![sensor.x, sensor.y, sensor.z].every(Number.isFinite)) return;
          if (!hasReading) {
            hasReading = true;
            window.clearTimeout(timeout);
            ready();
          }
          noteReading();
          detector(sensor.x, sensor.y, sensor.z, true);
        };
        const error: EventListener = (event) => {
          const sensorError = (event as Event & { error?: Error }).error;
          fail(sensorError?.name === 'NotAllowedError' ? 'denied' : 'unsupported');
        };
        sensor.addEventListener('reading', reading);
        sensor.addEventListener('error', error);
        const timeout = window.setTimeout(() => fail('unsupported'), 5000);
        activeCleanup = () => {
          window.clearTimeout(timeout);
          sensor.removeEventListener('reading', reading);
          sensor.removeEventListener('error', error);
          sensor.stop();
        };
        sensor.start();
      } catch (error) {
        fail(error instanceof DOMException && error.name === 'NotAllowedError' ? 'denied' : 'unsupported');
      }
    };

    if (!Motion) {
      startAccelerometer();
      return;
    }

    let hasReading = false;
    const handleMotion = (event: DeviceMotionEvent) => {
      const acceleration = event.acceleration;
      const vector = acceleration && acceleration.x !== null && acceleration.y !== null && acceleration.z !== null
        ? acceleration : event.accelerationIncludingGravity;
      if (!vector || vector.x === null || vector.y === null || vector.z === null ||
        ![vector.x, vector.y, vector.z].every(Number.isFinite)) return;
      if (!hasReading) {
        hasReading = true;
        window.clearTimeout(timeout);
        ready();
      }
      noteReading();
      detector(vector.x, vector.y, vector.z, vector !== acceleration);
    };
    window.addEventListener('devicemotion', handleMotion);
    const timeout = window.setTimeout(() => {
      window.removeEventListener('devicemotion', handleMotion);
      if (!hasReading && !stopped) startAccelerometer();
    }, 5000);
    activeCleanup = () => {
      window.clearTimeout(timeout);
      window.removeEventListener('devicemotion', handleMotion);
    };
  };

  useEffect(() => {
    const pauseWhenHidden = () => {
      if (!document.hidden || !cleanupRef.current) return;
      tokenRef.current += 1;
      cleanupRef.current();
      cleanupRef.current = null;
      setStatus(wantedRef.current ? 'paused' : 'idle');
    };
    document.addEventListener('visibilitychange', pauseWhenHidden);
    return () => document.removeEventListener('visibilitychange', pauseWhenHidden);
  }, []);

  useEffect(() => () => {
    tokenRef.current += 1;
    cleanupRef.current?.();
    cleanupRef.current = null;
  }, []);

  return { status, storageError, start, stop };
}