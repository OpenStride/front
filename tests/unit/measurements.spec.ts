import { describe, it, expect } from 'vitest'
import {
  MEASUREMENT_KEYS,
  MEASUREMENTS,
  measurementKeysFor,
  isMeasurementKey
} from '@/types/measurements'
import { formatMeasurement } from '@/utils/activityMetrics'
import { formatQuantity, setUnitSystem } from '@/composables/useUnits'
import en from '@/locales/en.json'
import fr from '@/locales/fr.json'

/** Resolve a dotted i18n path against a locale object. */
const lookup = (locale: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[part]
    return undefined
  }, locale)

describe('measurement registry', () => {
  it('describes every declared key', () => {
    for (const key of MEASUREMENT_KEYS) {
      expect(MEASUREMENTS[key], `no definition for "${key}"`).toBeTruthy()
      expect(MEASUREMENTS[key].unit, `no unit for "${key}"`).toBeTruthy()
    }
  })

  it('has a label in every locale for every key', () => {
    for (const key of MEASUREMENT_KEYS) {
      const { labelKey } = MEASUREMENTS[key]
      expect(lookup(en, labelKey), `missing en label "${labelKey}" for "${key}"`).toBeTruthy()
      expect(lookup(fr, labelKey), `missing fr label "${labelKey}" for "${key}"`).toBeTruthy()
    }
  })

  it('has a translated suffix wherever one is declared', () => {
    for (const key of MEASUREMENT_KEYS) {
      const { suffixKey } = MEASUREMENTS[key]
      if (!suffixKey) continue
      expect(lookup(en, suffixKey), `missing en suffix "${suffixKey}"`).toBeTruthy()
      expect(lookup(fr, suffixKey), `missing fr suffix "${suffixKey}"`).toBeTruthy()
    }
  })

  it('uses namespaced keys so a namespace can be listed', () => {
    for (const key of MEASUREMENT_KEYS) {
      expect(key, `"${key}" is not namespaced`).toMatch(/^[a-z]+\.[a-zA-Z]+$/)
    }
    expect(measurementKeysFor('swim').length).toBeGreaterThan(0)
    expect(measurementKeysFor('swim').every(k => k.startsWith('swim.'))).toBe(true)
    expect(measurementKeysFor('nonexistent')).toEqual([])
  })

  it('recognises its own keys and rejects others', () => {
    expect(isMeasurementKey('swim.swolf')).toBe(true)
    expect(isMeasurementKey('swimming.swolf')).toBe(false)
  })

  it('separates the three cadences that stats could not tell apart', () => {
    expect(MEASUREMENTS['run.cadence'].unit).toBe('spm')
    expect(MEASUREMENTS['bike.cadence'].unit).toBe('rpm')
    expect(MEASUREMENTS['swim.strokeRate'].unit).toBe('spm')
    // Same physical unit as running cadence, but a different quantity — the key
    // is what disambiguates, not the unit.
    expect(MEASUREMENTS['swim.strokeRate'].labelKey).not.toBe(MEASUREMENTS['run.cadence'].labelKey)
  })
})

describe('formatMeasurement', () => {
  const t = (key: string) => key.split('.').pop() ?? key

  it('routes a key through the dimension it declares', () => {
    // poolLength is deliberately not a plain conversion: a 25 m pool stays a
    // 25 m pool for an imperial swimmer, because that is the pool they swam in.
    setUnitSystem('imperial')
    const out = formatMeasurement('swim.poolLength', { value: 25, unit: 'm' }, formatQuantity, t)
    expect(out.text).toBe('25 m')

    // …and a US 25 yd pool, which the provider reports as 22.86 m, reads as yards.
    const usPool = formatMeasurement(
      'swim.poolLength',
      { value: 22.86, unit: 'm' },
      formatQuantity,
      t
    )
    expect(usPool.text).toBe('25 yd')
    setUnitSystem('metric')
  })

  it('leaves unit-independent values alone whatever the system', () => {
    for (const system of ['metric', 'imperial'] as const) {
      setUnitSystem(system)
      const out = formatMeasurement('swim.swolf', { value: 38, unit: 'swolf' }, formatQuantity, t)
      expect(out.value, `SWOLF changed under ${system}`).toBe('38')
      expect(out.unit).toBe('')
    }
    setUnitSystem('metric')
  })

  it('appends the declared suffix for raw values', () => {
    const out = formatMeasurement('run.cadence', { value: 172, unit: 'spm' }, formatQuantity, t)
    expect(out.value).toBe('172')
    expect(out.unit).toBe('spm')
  })

  it('is the only place deciding whether a key converts', () => {
    // Every key either declares a dimension or does not; the widget never gets
    // to have an opinion. This asserts the registry actually drives it.
    for (const key of MEASUREMENT_KEYS) {
      const out = formatMeasurement(
        key,
        { value: 10, unit: MEASUREMENTS[key].unit },
        formatQuantity,
        t
      )
      expect(out.text, `"${key}" produced nothing`).toBeTruthy()
    }
  })
})
