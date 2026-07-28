// src/composables/useUnits.ts
import { readonly, ref } from 'vue'
import type { Converted, Dimension, Formatted, UnitSystem } from '@/types/units'
import { i18n } from '@/locales'
import { IndexedDBService } from '@/services/IndexedDBService'

// The vocabulary lives in types/ so plugin-context and the measurement registry
// can depend on it without importing this composable.
export type { UnitSystem, Dimension, Formatted, Converted, FormatQuantity } from '@/types/units'

const METERS_PER_MILE = 1609.344
const METERS_PER_FOOT = 0.3048
const METERS_PER_YARD = 0.9144

/** Shown when a quantity cannot be computed (no distance, no duration…). */
const NO_VALUE = '—'

interface Scale {
  /** display = si * factor + offset */
  factor: number
  offset?: number
  unitKey: string
  decimals: number
}

interface DimensionSpec {
  metric: Scale
  imperial: Scale
  /** Paces read as "4'32", not as a decimal number of minutes. */
  style?: 'pace'
}

/**
 * Every conversion factor in the app, in one table.
 *
 * Both the numeric API (charts, which need a plottable number) and the string
 * API derive from this, so a factor is never written twice.
 */
const DIMENSIONS: Record<Exclude<Dimension, 'poolLength'>, DimensionSpec> = {
  distance: {
    metric: { factor: 1 / 1000, unitKey: 'km', decimals: 2 },
    imperial: { factor: 1 / METERS_PER_MILE, unitKey: 'mi', decimals: 2 }
  },
  distanceShort: {
    metric: { factor: 1, unitKey: 'm', decimals: 0 },
    imperial: { factor: 1 / METERS_PER_YARD, unitKey: 'yd', decimals: 0 }
  },
  elevation: {
    metric: { factor: 1, unitKey: 'm', decimals: 0 },
    imperial: { factor: 1 / METERS_PER_FOOT, unitKey: 'ft', decimals: 0 }
  },
  speed: {
    metric: { factor: 3.6, unitKey: 'kmh', decimals: 1 },
    imperial: { factor: 3600 / METERS_PER_MILE, unitKey: 'mph', decimals: 1 }
  },
  // Paces take seconds per metre and yield seconds per display unit.
  pace: {
    metric: { factor: 1000, unitKey: 'perKm', decimals: 0 },
    imperial: { factor: METERS_PER_MILE, unitKey: 'perMi', decimals: 0 },
    style: 'pace'
  },
  pace100: {
    metric: { factor: 100, unitKey: 'per100m', decimals: 0 },
    imperial: { factor: 100 * METERS_PER_YARD, unitKey: 'per100yd', decimals: 0 },
    style: 'pace'
  },
  temperature: {
    metric: { factor: 1, unitKey: 'celsius', decimals: 0 },
    imperial: { factor: 9 / 5, offset: 32, unitKey: 'fahrenheit', decimals: 0 }
  }
}

/**
 * Pool lengths people actually swim in, with the system each is built in.
 *
 * Providers report metres whatever the swimmer set on the watch, so a 25 yd
 * pool arrives as 22.86 m. Converting that by preference gives "27 yd" for a
 * 25 m pool and "23 m" for a 25 yd one — both meaningless to a swimmer, and
 * the first is off by 2 m per length, enough to reason wrongly about a pace
 * per 100. Snapping back to the built length is the honest answer.
 */
const STANDARD_POOLS: ReadonlyArray<{ meters: number; value: string; unitKey: string }> = [
  { meters: 18.288, value: '20', unitKey: 'yd' },
  { meters: 22.86, value: '25', unitKey: 'yd' }, // US short course
  { meters: 25, value: '25', unitKey: 'm' },
  { meters: 30.48, value: '33⅓', unitKey: 'yd' },
  { meters: 33.33, value: '33⅓', unitKey: 'm' },
  { meters: 50, value: '50', unitKey: 'm' }
]

/** Half a metre: absorbs rounding, too narrow to bridge two standards. */
const POOL_TOLERANCE_M = 0.5

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

const label = (key: string): string => {
  const full = `units.${key}`
  return i18n.global.te(full) ? i18n.global.t(full) : key
}

/** Seconds → "4'32" */
const renderPace = (seconds: number): string => {
  const total = Math.round(seconds)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}'${String(s).padStart(2, '0')}`
}

const poolFor = (meters: number) =>
  STANDARD_POOLS.find(p => Math.abs(meters - p.meters) <= POOL_TOLERANCE_M)

/**
 * Convert an SI value to the user's unit system, as a number.
 *
 * For charts and any other consumer that needs to compute on the result.
 * Paces come back in seconds per display unit.
 */
export const convertQuantity = (dimension: Dimension, si: number): Converted => {
  if (dimension === 'poolLength') {
    const pool = poolFor(si)
    if (pool) return { value: si, unit: label(pool.unitKey) }
    return convertQuantity('distanceShort', si)
  }

  const spec = DIMENSIONS[dimension]
  const scale = system.value === 'imperial' ? spec.imperial : spec.metric
  return { value: si * scale.factor + (scale.offset ?? 0), unit: label(scale.unitKey) }
}

const build = (value: string, unit: string): Formatted => ({
  value,
  unit,
  text: unit ? `${value} ${unit}` : value
})

/**
 * Convert an SI value to the user's unit system, as display text.
 *
 * Everything is stored in SI (metres, seconds, m/s, °C) and converted here, at
 * the render boundary — never on the way into storage, or caches like
 * `activity_metrics` would depend on a display preference.
 *
 * `pace` and `pace100` take seconds per metre, i.e. `duration / distance`.
 */
export const formatQuantity = (dimension: Dimension, si: number): Formatted => {
  if (!Number.isFinite(si)) return build(NO_VALUE, '')

  if (dimension === 'poolLength') {
    const pool = poolFor(si)
    // A pool is shown as the pool it is, whatever the preference. Anything
    // non-standard (open water, odd hotel pool) is just a short distance.
    if (pool) return build(pool.value, label(pool.unitKey))
    return formatQuantity('distanceShort', si)
  }

  const spec = DIMENSIONS[dimension]
  if (spec.style === 'pace' && si <= 0) return build(NO_VALUE, '')

  const scale = system.value === 'imperial' ? spec.imperial : spec.metric
  const { value, unit } = convertQuantity(dimension, si)

  return build(spec.style === 'pace' ? renderPace(value) : value.toFixed(scale.decimals), unit)
}

/**
 * Unit-aware conversion for components.
 *
 * `system` is reactive: reading it (directly or through `format`/`convert`)
 * inside a computed or a template re-renders when the preference changes.
 */
export function useUnits() {
  ensureUnitsLoaded()
  return {
    system: readonly(system),
    format: formatQuantity,
    convert: convertQuantity
  }
}
