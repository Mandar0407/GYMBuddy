// The journal's auxiliary stores are owned by screens outside FitnessProvider.
// Hold this lock through reconciliation so those screens cannot save stale
// snapshots while sync reads, merges, and acknowledges remote records.
let tail: Promise<void> = Promise.resolve();

export function withJournalStorageLock<T>(operation: () => Promise<T>): Promise<T> {
  const result = tail.then(operation);
  tail = result.then(() => undefined, () => undefined);
  return result;
}