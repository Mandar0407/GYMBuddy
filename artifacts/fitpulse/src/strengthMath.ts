export function calculatedOneRm(set: { weight: number; reps: number }) {
  // Older saved estimates were rounded to whole kilograms. Calculate from
  // recorded inputs so new and old sets compare at the same precision.
  return set.weight * (1 + set.reps / 30);
}