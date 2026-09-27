import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetMovement, useCreateMovementAccount, useAddMovementManual,
  useResetMovementManual, usePutMovementSettings, getGetMovementQueryKey,
} from '@workspace/api-client-react';

const KEY = 'fitpulse-movement-pairing-key';
const savedKey = () => {
  try { return localStorage.getItem(KEY) ?? ''; } catch { return ''; }
};
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

export function usePairedMovement() {
  const [key, setKey] = useState(savedKey);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();
  const request = { headers: { Authorization: `Bearer ${key}` } };
  const query = useGetMovement({
    query: { queryKey: [...getGetMovementQueryKey(), key], enabled: !!key, refetchInterval: 30_000, refetchOnWindowFocus: true, retry: false },
    request,
  });
  const create = useCreateMovementAccount();
  const add = useAddMovementManual({ request });
  const reset = useResetMovementManual({ request });
  const settings = usePutMovementSettings({ request });
  const refresh = () => queryClient.invalidateQueries({ queryKey: getGetMovementQueryKey() });

  const pair = async (goal: number, strideCm: number, weightKg: number) => {
    setBusy(true); setError('');
    try {
      const account = await create.mutateAsync();
      // The key is deliberately local to this browser; share it only with your own phone.
      localStorage.setItem(KEY, account.key);
      setKey(account.key);
      const { putMovementSettings } = await import('@workspace/api-client-react');
      await putMovementSettings({ goal, strideCm, weightKg }, { headers: { Authorization: `Bearer ${account.key}` } });
      await refresh();
    } catch {
      setError('Could not pair. Check your connection and try again.');
    } finally { setBusy(false); }
  };
  const change = async (amount: number, date: string, hour: number) => {
    setBusy(true); setError('');
    try {
      if (amount < 0) await reset.mutateAsync({ date });
      else await add.mutateAsync({ data: { id: crypto.randomUUID(), date, hour, amount } });
      await refresh();
      return true;
    } catch { setError('Steps were not saved. Try again.'); return false; }
    finally { setBusy(false); }
  };
  const saveSettings = async (goal: number, strideCm: number, weightKg: number) => {
    setBusy(true); setError('');
    try {
      await settings.mutateAsync({ data: { goal, strideCm, weightKg } });
      await refresh();
    } catch { setError('Settings were not saved. Try again.'); }
    finally { setBusy(false); }
  };
  const days = query.data?.days ?? [];
  const nativeDates = new Set(days.filter((day) => day.nativeHours !== null).map((day) => day.date));
  const stepTotals = Object.fromEntries(days.map((day) => [day.date, sum(day.nativeHours ?? []) + sum(day.manualHours)]));
  const hourly = Object.fromEntries(days.map((day) => [day.date, day.manualHours.map((value, i) => value + (day.nativeHours?.[i] ?? 0))]));
  return {
    key, error: error || (query.isError ? 'Pairing key or connection unavailable. Check the key and refresh.' : ''),
    busy, loading: query.isPending && !!key, pair, change, saveSettings,
    data: query.data, stepTotals, hourly, nativeDates, refresh,
  };
}