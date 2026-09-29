import { useCallback, useEffect, useRef, useState } from 'react';
import { applyJournalChanges, getJournal, type JournalChange, type JournalEntity, type JournalRecord } from '@workspace/api-client-react';
import { firstPairDecision, mergeDurableState, shouldTreatAsEmptyFirstPair } from './journalSyncCore';

export type LocalJournalRecord = {
  entity: JournalEntity;
  id: string;
  data: Record<string, unknown>;
  pristineDefault?: boolean;
};

type SyncMeta = { revision: number; data: Record<string, unknown> | null; deleted: boolean };
type Pending = JournalChange;
type Conflict = { entity: JournalEntity; id: string; reason: string; server: JournalRecord | null };
type PersistedSync = {
  meta: Record<string, SyncMeta>;
  pending: Record<string, Pending>;
  tombstones: Record<string, string>;
};

const STATE_KEY = 'fitpulse-journal-sync-state';
const randomId = () => crypto.randomUUID();
const recordKey = (entity: JournalEntity, id: string) => `${entity}\u0000${id}`;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function readState(): PersistedSync {
  const raw = localStorage.getItem(STATE_KEY);
  if (!raw) return { meta: {}, pending: {}, tombstones: {} };
  let saved: unknown;
  try { saved = JSON.parse(raw); }
  catch { throw new Error('Saved journal sync metadata is invalid. Local journal data was left untouched.'); }
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) {
    throw new Error('Saved journal sync metadata is invalid. Local journal data was left untouched.');
  }
  const value = saved as Partial<PersistedSync>;
  const isMap = (entry: unknown) => !!entry && typeof entry === 'object' && !Array.isArray(entry);
  if ((value.meta !== undefined && !isMap(value.meta)) ||
    (value.pending !== undefined && !isMap(value.pending)) ||
    (value.tombstones !== undefined && !isMap(value.tombstones))) {
    throw new Error('Saved journal sync metadata is invalid. Local journal data was left untouched.');
  }
  const tombstones = Object.fromEntries((Object.entries(value.tombstones ?? {}) as Array<[string, unknown]>)
    .filter(([, token]) => token === true || typeof token === 'string')
    .map(([key, token]) => [key, typeof token === 'string' ? token : 'legacy-tombstone']));
  return { meta: value.meta ?? {}, pending: value.pending ?? {}, tombstones };
}

function saveState(state: PersistedSync): void {
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

function isSame(left: unknown, right: unknown): boolean {
  return canonical(left) === canonical(right);
}

function isLocalRecord(value: LocalJournalRecord | undefined): value is LocalJournalRecord {
  return !!value && !!value.data && typeof value.data === 'object' && !Array.isArray(value.data);
}

export function useJournalSync(
  pairingKey: string,
  localRecords: LocalJournalRecord[],
  applyRemote: (record: JournalRecord) => boolean,
  snapshotVersion = '',
  localValidationErrors: string[] = [],
) {
  const [status, setStatus] = useState<'unpaired' | 'syncing' | 'synced' | 'error'>('unpaired');
  const [message, setMessage] = useState('');
  const [conflictCount, setConflictCount] = useState(0);
  const busy = useRef(false);
  const recordsRef = useRef(localRecords);
  recordsRef.current = localRecords;
  const applyRef = useRef(applyRemote);
  applyRef.current = applyRemote;
  const validationErrorsRef = useRef(localValidationErrors);
  validationErrorsRef.current = localValidationErrors;
  const remoteRemovalKeys = useRef(new Set<string>());
  const lastLocalKeys = useRef<Set<string> | null>(null);

  const markDeleted = useCallback((entity: JournalEntity, id: string) => {
    try {
      const state = readState();
      state.tombstones[recordKey(entity, id)] = randomId();
      saveState(state);
    } catch {
      setStatus('error');
      setMessage('A deletion could not be saved for sync. Keep this browser open and enable local storage.');
    }
  }, []);

  useEffect(() => {
    const current = new Set(recordsRef.current.map((record) => recordKey(record.entity, record.id)));
    if (lastLocalKeys.current) {
      for (const key of lastLocalKeys.current) {
        if (current.has(key)) continue;
        if (remoteRemovalKeys.current.delete(key)) continue;
        const splitAt = key.indexOf('\u0000');
        const entity = key.slice(0, splitAt) as JournalEntity;
        const id = key.slice(splitAt + 1);
        markDeleted(entity, id);
      }
    }
    lastLocalKeys.current = current;
  }, [snapshotVersion, markDeleted]);

  const sync = useCallback(async () => {
    if (!pairingKey || busy.current) return;
    if (validationErrorsRef.current.length) {
      setStatus('error');
      setConflictCount(validationErrorsRef.current.length);
      setMessage(`Journal sync paused: ${validationErrorsRef.current.join('; ')}. Existing local and paired-device records were not changed.`);
      return;
    }
    busy.current = true;
    setStatus('syncing');
    setMessage('');
    try {
      const request = { headers: { Authorization: `Bearer ${pairingKey}` } };
      const [snapshot, initial] = await Promise.all([getJournal(request), Promise.resolve(readState())]);
      const baseline = initial;
      const state = mergeDurableState(initial, readState(), baseline);
      const consumedTombstones: Record<string, string> = {};
      const clearTombstone = (key: string) => {
        const token = state.tombstones[key];
        if (token) consumedTombstones[key] = token;
        delete state.tombstones[key];
      };
      const mergeCurrentState = () => {
        Object.assign(state, mergeDurableState(state, readState(), baseline, consumedTombstones));
      };
      const server = new Map(snapshot.records.map((record) => [recordKey(record.entity, record.id), record]));
      const allLocalRecords = recordsRef.current.filter(isLocalRecord);
      const pristineDefaults = new Set(allLocalRecords.filter((record) => {
        const key = recordKey(record.entity, record.id);
        return shouldTreatAsEmptyFirstPair(!!record.pristineDefault, !!state.meta[key]);
      }).map((record) => recordKey(record.entity, record.id)));
      const local = new Map(allLocalRecords
        .filter((record) => !pristineDefaults.has(recordKey(record.entity, record.id)))
        .map((record) => [recordKey(record.entity, record.id), record]));
      const conflicts: Conflict[] = [];
      const skipUpload = new Set<string>();
      const keys = new Set([...server.keys(), ...allLocalRecords.map((record) => recordKey(record.entity, record.id)),
        ...Object.keys(state.meta), ...Object.keys(state.tombstones)]);

      for (const key of keys) {
        const remote = server.get(key);
        const localRecord = local.get(key);
        const meta = state.meta[key];
        let explicitlyDeleted = !!state.tombstones[key];
        if (explicitlyDeleted && localRecord) {
          // A same-ID local record appearing again is a new deliberate write, not an old tombstone.
          clearTombstone(key);
          if (state.pending[key]?.deleted) delete state.pending[key];
          explicitlyDeleted = false;
        }

        const pending = state.pending[key];
        if (remote && pending && remote.revision === pending.baseRevision + 1 &&
          remote.deleted === pending.deleted && isSame(remote.data, pending.data)) {
          state.meta[key] = { revision: remote.revision, data: remote.data, deleted: remote.deleted };
          delete state.pending[key];
          clearTombstone(key);
          continue;
        }

        if (remote && !meta) {
          const firstPair = firstPairDecision(
            !!localRecord,
            remote.deleted,
            localRecord ? isSame(localRecord.data, remote.data) : false,
          );
          if (firstPair === 'conflict') {
            conflicts.push({
              entity: remote.entity, id: remote.id,
              reason: remote.deleted
                ? 'The server has deleted this ID, but this device has unsynced local data. Neither copy was changed.'
                : 'Local and paired-device data differ; neither copy was changed.',
              server: remote,
            });
            skipUpload.add(key);
            continue;
          }
          if (explicitlyDeleted && remote.deleted) {
            state.meta[key] = { revision: remote.revision, data: null, deleted: true };
            clearTombstone(key);
            delete state.pending[key];
            continue;
          }
          if (explicitlyDeleted) {
            conflicts.push({ entity: remote.entity, id: remote.id, reason: 'This device has a saved deletion but has not previously synced this record.', server: remote });
            skipUpload.add(key);
            continue;
          }
          if (localRecord) {
            if (remote.deleted) {
              remoteRemovalKeys.current.add(key);
              if (!applyRef.current(remote)) {
                remoteRemovalKeys.current.delete(key);
                conflicts.push({ entity: remote.entity, id: remote.id, reason: 'The server tombstone could not be safely applied.', server: remote });
                continue;
              }
            } else if (!isSame(localRecord.data, remote.data)) {
              conflicts.push({ entity: remote.entity, id: remote.id, reason: 'Local and paired-device data differ; neither copy was changed.', server: remote });
              continue;
            }
          } else if (!remote.deleted) {
            if (!applyRef.current(remote)) {
              conflicts.push({ entity: remote.entity, id: remote.id, reason: 'Remote data failed website validation and was not applied.', server: remote });
              continue;
            }
          }
          state.meta[key] = { revision: remote.revision, data: remote.data, deleted: remote.deleted };
          clearTombstone(key);
          delete state.pending[key];
          continue;
        }

        if (remote && meta) {
          if (remote.revision < meta.revision) {
            conflicts.push({ entity: remote.entity, id: remote.id, reason: 'Server revision moved backwards; local data was preserved.', server: remote });
            skipUpload.add(key);
            continue;
          }
          const localMatchesMeta = explicitlyDeleted
            ? meta.deleted
            : localRecord ? !meta.deleted && isSame(localRecord.data, meta.data) : meta.deleted;
          if (remote.revision > meta.revision) {
            if (!explicitlyDeleted && localMatchesMeta) {
              if (remote.deleted && localRecord) {
                remoteRemovalKeys.current.add(key);
              }
              if (!applyRef.current(remote)) {
                remoteRemovalKeys.current.delete(key);
                conflicts.push({ entity: remote.entity, id: remote.id, reason: 'Remote data failed website validation and was not applied.', server: remote });
                skipUpload.add(key);
                continue;
              }
              state.meta[key] = { revision: remote.revision, data: remote.data, deleted: remote.deleted };
              delete state.pending[key];
              continue;
            }
            if (localRecord && !remote.deleted && isSame(localRecord.data, remote.data)) {
              state.meta[key] = { revision: remote.revision, data: remote.data, deleted: false };
              delete state.pending[key];
              clearTombstone(key);
              continue;
            }
            if (explicitlyDeleted && remote.deleted) {
              state.meta[key] = { revision: remote.revision, data: null, deleted: true };
              delete state.pending[key];
              continue;
            }
            conflicts.push({ entity: remote.entity, id: remote.id, reason: 'Both devices changed this record; neither copy was overwritten.', server: remote });
            skipUpload.add(key);
            continue;
          }
          if (localMatchesMeta && remote.deleted === meta.deleted && isSame(remote.data, meta.data)) {
            if (remote.revision > meta.revision) state.meta[key] = { ...meta, revision: remote.revision };
            continue;
          }
          if (remote.deleted && localRecord && !explicitlyDeleted) {
            conflicts.push({ entity: remote.entity, id: remote.id, reason: 'The server has a tombstone while this device has active data. Neither copy was restored or removed.', server: remote });
            skipUpload.add(key);
            continue;
          }
          if (localRecord && !explicitlyDeleted && !remote.deleted && isSame(localRecord.data, remote.data)) {
            state.meta[key] = { revision: remote.revision, data: remote.data, deleted: false };
            delete state.pending[key];
            clearTombstone(key);
            continue;
          }
          if (remote.revision === meta.revision && (explicitlyDeleted || !localMatchesMeta)) {
            const deleted = explicitlyDeleted;
            const data = deleted ? null : localRecord?.data ?? null;
            if (!deleted && !data) continue;
            state.pending[key] ??= {
              entity: remote.entity, id: remote.id, baseRevision: meta.revision,
              mutationId: randomId(), deleted, data,
            };
          }
          continue;
        }

        if (!remote && pristineDefaults.has(key)) {
          delete state.pending[key];
          continue;
        }

        if (!remote && meta && meta.revision > 0) {
          conflicts.push({ entity: localRecord?.entity ?? (key.split('\u0000')[0] as JournalEntity), id: localRecord?.id ?? key.slice(key.indexOf('\u0000') + 1), reason: 'A previously synced server record is missing; local data was preserved.', server: null });
          skipUpload.add(key);
          continue;
        }

        if (!remote && localRecord) {
          const deleted = explicitlyDeleted;
          state.pending[key] ??= {
            entity: localRecord.entity,
            id: localRecord.id,
            baseRevision: 0,
            mutationId: randomId(),
            deleted,
            data: deleted ? null : localRecord.data,
          };
        } else if (!remote && explicitlyDeleted && !meta) {
          const [entity, id] = key.split('\u0000') as [JournalEntity, string];
          state.pending[key] ??= { entity, id, baseRevision: 0, mutationId: randomId(), deleted: true, data: null };
        }
      }

      mergeCurrentState();
      saveState(state);
      const changes = Object.entries(state.pending)
        .filter(([key]) => !skipUpload.has(key))
        .map(([, change]) => change)
        .slice(0, 100);
      if (changes.length) {
        const sentTombstones = { ...state.tombstones };
        const result = await applyJournalChanges({ changes }, request);
        mergeCurrentState();
        for (const accepted of result.records) {
          const key = recordKey(accepted.entity, accepted.id);
          state.meta[key] = { revision: accepted.revision, data: accepted.data, deleted: accepted.deleted };
          delete state.pending[key];
          const tokenAtSend = sentTombstones[key];
          const latestToken = state.tombstones[key];
          if (latestToken === tokenAtSend || (accepted.deleted && latestToken === undefined)) {
            clearTombstone(key);
          }
        }
        for (const conflict of result.conflicts) {
          const key = recordKey(conflict.entity, conflict.id);
          conflicts.push({
            entity: conflict.entity, id: conflict.id,
            reason: 'A paired device changed this record first; local data was kept.',
            server: conflict.current,
          });
          delete state.pending[key];
        }
        mergeCurrentState();
        saveState(state);
      }

      setConflictCount(conflicts.length);
      if (conflicts.length) {
        setStatus('error');
        setMessage(`${conflicts.length} journal conflict${conflicts.length === 1 ? '' : 's'} need review. Local and server copies were preserved.`);
      } else {
        setStatus('synced');
        setMessage('');
      }
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? `Journal sync failed: ${error.message}` : 'Journal sync failed. Check the connection and pairing key.');
    } finally {
      busy.current = false;
    }
  }, [pairingKey]);

  useEffect(() => {
    if (!pairingKey) { setStatus('unpaired'); setMessage(''); setConflictCount(0); return undefined; }
    void sync();
    const interval = window.setInterval(() => { void sync(); }, 30_000);
    const onFocus = () => { void sync(); };
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [pairingKey, sync, snapshotVersion]);

  return { status, message, conflictCount, retry: sync, markDeleted };
}