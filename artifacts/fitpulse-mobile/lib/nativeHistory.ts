export type NativeHistoryDay = { date: string; hours: number[] };
type StepReader = (from: Date, until: Date) => Promise<{ steps: number }>;
const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** Read today first and limit native requests to four at once. Each complete
 * day replaces its snapshot; never add a refreshed sensor count to old data. */
export async function readNativeHistory(
  now: Date,
  read: StepReader,
  onDay: (day: NativeHistoryDay) => void,
): Promise<NativeHistoryDay[]> {
  const snapshots: NativeHistoryDay[] = [];
  for (let offset = 0; offset < 7; offset++) {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - offset);
    const hours = Array<number>(24).fill(0);
    const lastHour = offset === 0 ? now.getHours() : 23;
    for (let first = 0; first <= lastHour; first += 4) {
      await Promise.all(Array.from({ length: Math.min(4, lastHour - first + 1) }, async (_, i) => {
        const hour = first + i;
        const from = new Date(start); from.setHours(hour);
        const until = new Date(start); until.setHours(hour + 1);
        const end = until < now ? until : now;
        // Spring-forward can produce an empty local-hour interval.
        if (end <= from) return;
        const result = await read(from, end);
        if (!Number.isSafeInteger(result.steps) || result.steps < 0) {
          throw new Error('Device returned an invalid step count.');
        }
        hours[hour] = result.steps;
      }));
    }
    const snapshot = { date: dateKey(start), hours };
    snapshots.push(snapshot);
    onDay(snapshot);
  }
  return snapshots;
}