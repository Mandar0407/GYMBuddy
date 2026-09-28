export const bounds = {
  calories: 10_000, macros: 1_000, dailySteps: 2_400_000,
} as const;

export function boundedNumber(value: unknown, min: number, max: number, integer = false): value is number {
  return typeof value === 'number' && Number.isFinite(value) &&
    value >= min && value <= max && (!integer || Number.isSafeInteger(value));
}

// React escapes rendered text; this additionally keeps markup out of persisted user data.
export function plainText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  const document = new DOMParser().parseFromString(value.slice(0, 4096), 'text/html');
  document.querySelectorAll('script, style, template, iframe, object, svg, math').forEach((node) => node.remove());
  return (document.body.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}