import type { FilterChip } from './FilterBar';

export type ChipDefinition =
  | { key: string; label: string; format?: (value: string) => string }
  /** A min/max pair shown as one chip ("Units: 10 – 50"); removing it clears both. */
  | { range: readonly [string, string]; label: string; unit?: string };

/** Turns the active URL filters into removable chips, in the order of `definitions`. */
export function buildChips(filters: Record<string, string>, definitions: ChipDefinition[], set: (updates: Record<string, null>) => void): FilterChip[] {
  const chips: FilterChip[] = [];
  for (const definition of definitions) {
    if ('range' in definition) {
      const [minKey, maxKey] = definition.range;
      const min = filters[minKey];
      const max = filters[maxKey];
      if (min === undefined && max === undefined) continue;
      const unit = definition.unit ?? '';
      const text = min !== undefined && max !== undefined ? `${min}${unit} – ${max}${unit}` : min !== undefined ? `≥ ${min}${unit}` : `≤ ${max}${unit}`;
      chips.push({ key: minKey, label: `${definition.label}: ${text}`, onRemove: () => set({ [minKey]: null, [maxKey]: null }) });
      continue;
    }
    const value = filters[definition.key];
    if (value === undefined) continue;
    chips.push({ key: definition.key, label: `${definition.label}: ${definition.format ? definition.format(value) : value}`, onRemove: () => set({ [definition.key]: null }) });
  }
  return chips;
}

/** Counts how many of the given keys are set (for the "More filters" badge). */
export function countActive(filters: Record<string, string>, keys: string[]): number {
  return keys.filter((key) => filters[key] !== undefined).length;
}
