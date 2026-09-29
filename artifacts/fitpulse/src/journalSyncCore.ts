export type JournalSyncState = {
  meta: Record<string, unknown>;
  pending: Record<string, unknown>;
  tombstones: Record<string, string>;
};

export function firstPairDecision(
  hasLocal: boolean,
  remoteDeleted: boolean,
  localMatchesRemote = false,
): 'conflict' | 'apply' | 'acknowledge' | 'adopt' {
  if (remoteDeleted && hasLocal) return 'conflict';
  if (remoteDeleted) return 'acknowledge';
  if (!hasLocal) return 'apply';
  return localMatchesRemote ? 'adopt' : 'conflict';
}

export function shouldTreatAsEmptyFirstPair(pristineDefault: boolean, hasSyncBaseline: boolean): boolean {
  return pristineDefault && !hasSyncBaseline;
}

export function mergeDurableState<T extends JournalSyncState>(
  working: T,
  latest: T,
  baseline: T,
  consumedTombstones: Record<string, string> = {},
): T {
  const tombstones = { ...working.tombstones };
  for (const [key, token] of Object.entries(latest.tombstones)) {
    if (token !== baseline.tombstones[key] && consumedTombstones[key] !== token) tombstones[key] = token;
  }
  return {
    ...working,
    meta: { ...latest.meta, ...working.meta },
    pending: { ...latest.pending, ...working.pending },
    tombstones,
  };
}

export function adaptLegacyWebMealToJournal(data: Record<string, unknown>): Record<string, unknown> {
  const existing = data.websiteLegacyMealAdapter;
  if (existing && typeof existing === 'object' && !Array.isArray(existing)) return data;
  const mealValue = typeof data.meal === 'string' ? data.meal : '';
  const hasName = typeof data.name === 'string';
  const categories = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
  if (categories.includes(mealValue) && hasName) return data;
  const name = hasName ? data.name as string : mealValue;
  const mappedCategory = categories.includes(mealValue) ? mealValue : 'Snack';
  return {
    ...data,
    meal: mappedCategory,
    name,
    provenance: typeof data.provenance === 'string' ? data.provenance : 'website-legacy-meal-as-name',
    websiteLegacyMealAdapter: {
      version: 1,
      mealValue,
      hadName: hasName,
      previousName: hasName ? data.name : null,
      mappedCategory,
      hadProvenance: typeof data.provenance === 'string',
      previousProvenance: data.provenance ?? null,
    },
  };
}

export function adaptJournalMealToWeb(data: Record<string, unknown>): Record<string, unknown> {
  const marker = data.websiteLegacyMealAdapter;
  if (!marker || typeof marker !== 'object' || Array.isArray(marker)) return data;
  const legacy = marker as Record<string, unknown>;
  if (legacy.version !== 1 || data.meal !== legacy.mappedCategory || typeof legacy.mealValue !== 'string') return data;
  const result: Record<string, unknown> = { ...data, meal: legacy.mealValue };
  delete result.websiteLegacyMealAdapter;
  if (legacy.hadName === true) {
    if (legacy.previousName === data.name) result.name = legacy.previousName;
  } else if (data.name === legacy.mealValue) {
    delete result.name;
  }
  if (legacy.hadProvenance !== true && result.provenance === 'website-legacy-meal-as-name') {
    delete result.provenance;
  }
  return result;
}

export function adaptLegacySetToJournal(data: Record<string, unknown>): Record<string, unknown> {
  if (data.setType !== undefined || data.websiteLegacySetTypeMissing === true) return data;
  return { ...data, setType: 'working', websiteLegacySetTypeMissing: true };
}

export function adaptJournalSetToWeb(data: Record<string, unknown>): Record<string, unknown> {
  if (data.websiteLegacySetTypeMissing !== true) return data;
  const result = { ...data };
  delete result.websiteLegacySetTypeMissing;
  if (result.setType === 'working') delete result.setType;
  return result;
}

export function adaptLegacyTemplateToJournal(data: Record<string, unknown>): Record<string, unknown> {
  if (data.meal !== undefined || data.websiteLegacyTemplateMealMissing === true) return data;
  return { ...data, meal: 'Snack', websiteLegacyTemplateMealMissing: true };
}

export function adaptJournalTemplateToWeb(data: Record<string, unknown>): Record<string, unknown> {
  if (data.websiteLegacyTemplateMealMissing !== true || data.meal !== 'Snack') return data;
  const result = { ...data };
  delete result.meal;
  delete result.websiteLegacyTemplateMealMissing;
  return result;
}

export function adaptLiveWorkoutForWebsite(data: Record<string, unknown>): Record<string, unknown> {
  const missingMetrics = ['distanceMeters', 'activeCalories', 'totalCalories']
    .filter((field) => data[field] === undefined);
  return {
    ...data,
    distanceMeters: data.distanceMeters === undefined ? null : data.distanceMeters,
    activeCalories: data.activeCalories === undefined ? null : data.activeCalories,
    totalCalories: data.totalCalories === undefined ? null : data.totalCalories,
    ...(missingMetrics.length ? { websiteLiveMetricsMissing: missingMetrics } : {}),
  };
}

export function adaptLiveWorkoutToJournal(data: Record<string, unknown>): Record<string, unknown> {
  const result = { ...data };
  const missing = Array.isArray(result.websiteLiveMetricsMissing)
    ? result.websiteLiveMetricsMissing.filter((field): field is string => typeof field === 'string')
    : [];
  delete result.websiteLiveMetricsMissing;
  for (const field of missing) if (result[field] === null) delete result[field];
  return result;
}