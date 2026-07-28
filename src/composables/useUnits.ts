// src/composables/useUnits.ts
import { readonly, ref } from 'vue'
import type { Dimension, Formatted, UnitSystem } from '@/types/units'
import { i18n } from '@/locales'
import { IndexedDBService } from '@/services/IndexedDBService'

// The vocabulary lives in types/ so plugin-context and the measurement registry
// can depend on it without importing this composable.
export type { UnitSystem, Dimension, Formatted, FormatQuantity } from '@/types/units'

const METERS_PER_MILE = 1609.344
const METERS_PER_FOOT = 0.3048
const METERS_PER_YARD = 0.9144

/** Shown when a quantity cannot be computed (no distance, no duration…). */
const NO_VALUE = '—'

const system = ref<UnitSystem>('metric')
let loading: Promise<void> | null = null

const readPreference = async (): Promise<void> => {
  try {
    const db = await IndexedDBService.getInstance()
    const prefs = await db.getData<{ units?: UnitSystem }>('app_preferences')
    if (prefs?.units === 'imperial' || prefs?.units === 'metric') {
      system.value = prefs.units
    }
  } catch {
    // IndexedDB may be unavailable (tests, private mode) — metric stays.
  }
}

/** Load the stored preference once. Idempotent. */
export const ensureUnitsLoaded = () => {
  if (!loading) loading = readPreference()
  return loading
}

/**
 * Apply a new unit system app-wide.
 *
 * The preference lives in a module-level ref rather than in each component's
 * `onMounted`, so changing it updates every mounted screen instead of only the
 * ones rendered afterwards.
 */
export const setUnitSystem = (next: UnitSystem) => {
  system.value = next
}

/** Live preference for non-component consumers (plugin context, canvas charts). */
export const unitSystem = readonly(system)

const label = (key: string, fallback: string): string => {
  const full = `units.${key}`
  return i18n.global.te(full) ? i18n.global.t(full) : fallback
}

/** Seconds per unit → "4'32" */
const formatPace = (secondsPerUnit: number): string => {
  const total = Math.round(secondsPerUnit)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}'${String(s).padStart(2, '0')}`
}

const build = (value: string, unit: string): Formatted => ({
  value,
  unit,
  text: unit ? `${value} ${unit}` : value
})

/**
 * Convert an SI value to the user's unit system.
 *
 * Everything is stored in SI (metres, seconds, m/s, °C) and converted here, at
 * the render boundary — never on the way into storage, or caches like
 * `activity_metrics` would depend on a display preference.
 *
 * `pace` and `pace100` take seconds per metre, i.e. `duration / distance`.
 */
export const formatQuantity = (dimension: Dimension, si: number): Formatted => {
  if (!Number.isFinite(si)) return build(NO_VALUE, '')
  const imperial = system.value === 'imperial'

  switch (dimension) {
    case 'distance':
      return imperial
        ? build((si / METERS_PER_MILE).toFixed(2), label('mi', 'mi'))
        : build((si / 1000).toFixed(2), label('km', 'km'))

    case 'distanceShort':
      return imperial
        ? build(Math.round(si / METERS_PER_YARD).toString(), label('yd', 'yd'))
        : build(Math.round(si).toString(), label('m', 'm'))

    case 'elevation':
      return imperial
        ? build(Math.round(si / METERS_PER_FOOT).toString(), label('ft', 'ft'))
        : build(Math.round(si).toString(), label('m', 'm'))

    case 'speed':
      return imperial
        ? build(((si * 3600) / METERS_PER_MILE).toFixed(1), label('mph', 'mph'))
        : build((si * 3.6).toFixed(1), label('kmh', 'km/h'))

    case 'pace':
      if (si <= 0) return build(NO_VALUE, '')
      return imperial
        ? build(formatPace(si * METERS_PER_MILE), label('perMi', '/mi'))
        : build(formatPace(si * 1000), label('perKm', '/km'))

    case 'pace100':
      if (si <= 0) return build(NO_VALUE, '')
      return imperial
        ? build(formatPace(si * 100 * METERS_PER_YARD), label('per100yd', '/100 yd'))
        : build(formatPace(si * 100), label('per100m', '/100 m'))

    case 'temperature':
      return imperial
        ? build(Math.round((si * 9) / 5 + 32).toString(), label('fahrenheit', '°F'))
        : build(Math.round(si).toString(), label('celsius', '°C'))
  }
}

/**
 * Unit-aware formatting for components.
 *
 * `system` is reactive: reading it (directly or through `format`) inside a
 * computed or a template re-renders when the preference changes.
 */
export function useUnits() {
  ensureUnitsLoaded()
  return {
    system: readonly(system),
    format: formatQuantity
  }
}
