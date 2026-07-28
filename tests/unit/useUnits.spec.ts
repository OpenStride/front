import { describe, it, expect, beforeEach } from 'vitest'
import { formatQuantity, setUnitSystem, unitSystem } from '@/composables/useUnits'

const METERS_PER_MILE = 1609.344

describe('useUnits — metric', () => {
  beforeEach(() => setUnitSystem('metric'))

  it('formats long distances in kilometres', () => {
    expect(formatQuantity('distance', 10000).text).toBe('10.00 km')
  })

  it('formats short distances in metres', () => {
    // A 1500 m swim reads as metres, not "1.50 km".
    expect(formatQuantity('distanceShort', 1500).text).toBe('1500 m')
  })

  it('formats speed in km/h', () => {
    expect(formatQuantity('speed', 10).text).toBe('36.0 km/h')
  })

  it('formats pace per kilometre', () => {
    // 5 min/km = 300 s over 1000 m
    expect(formatQuantity('pace', 300 / 1000).text).toBe("5'00 /km")
  })

  it('formats swim pace per 100 m', () => {
    // 1'40 per 100 m
    expect(formatQuantity('pace100', 100 / 100).text).toBe("1'40 /100 m")
  })

  it('formats elevation and temperature', () => {
    expect(formatQuantity('elevation', 250).text).toBe('250 m')
    expect(formatQuantity('temperature', 21.4).text).toBe('21 °C')
  })
})

describe('useUnits — imperial', () => {
  beforeEach(() => setUnitSystem('imperial'))

  it('formats long distances in miles', () => {
    expect(formatQuantity('distance', METERS_PER_MILE).text).toBe('1.00 mi')
  })

  it('formats short distances in yards', () => {
    expect(formatQuantity('distanceShort', 91.44).text).toBe('100 yd')
  })

  it('formats speed in mph', () => {
    expect(formatQuantity('speed', METERS_PER_MILE / 3600).text).toBe('1.0 mph')
  })

  it('formats pace per mile', () => {
    // 5 min per mile
    expect(formatQuantity('pace', 300 / METERS_PER_MILE).text).toBe("5'00 /mi")
  })

  it('formats swim pace per 100 yards', () => {
    // Imperial pools are counted in yards, so the reference length changes too.
    expect(formatQuantity('pace100', 100 / (100 * 0.9144)).text).toBe("1'40 /100 yd")
  })

  it('formats elevation in feet and temperature in fahrenheit', () => {
    expect(formatQuantity('elevation', 0.3048).text).toBe('1 ft')
    expect(formatQuantity('temperature', 100).text).toBe('212 °F')
  })
})

describe('useUnits — edge cases', () => {
  beforeEach(() => setUnitSystem('metric'))

  it('shows a dash rather than Infinity when there is no distance', () => {
    // duration / distance with distance 0
    expect(formatQuantity('pace', 600 / 0).value).toBe('—')
    expect(formatQuantity('pace100', 600 / 0).value).toBe('—')
  })

  it('shows a dash for a missing value', () => {
    expect(formatQuantity('distance', NaN).value).toBe('—')
  })

  it('treats a zero-length activity as unmeasurable, not as instant', () => {
    expect(formatQuantity('pace', 0).value).toBe('—')
  })
})

describe('useUnits — round trip', () => {
  it('does not drift beyond display rounding', () => {
    setUnitSystem('imperial')
    const miles = Number(formatQuantity('distance', 42195).value)
    const backToMeters = miles * METERS_PER_MILE
    // 2 decimals on miles ≈ 16 m of resolution over a marathon.
    expect(Math.abs(backToMeters - 42195)).toBeLessThan(20)
  })

  it('reacts to a preference change without any reload', () => {
    setUnitSystem('metric')
    expect(formatQuantity('distance', 5000).unit).toBe('km')
    setUnitSystem('imperial')
    expect(formatQuantity('distance', 5000).unit).toBe('mi')
    expect(unitSystem.value).toBe('imperial')
  })
})

describe('useUnits — pool length', () => {
  const pool = (meters: number) => formatQuantity('poolLength', meters).text

  it('shows a metric pool as metres in both systems', () => {
    // A 25 m pool is 25 m to everyone. "27 yd" is 2 m off per length, enough to
    // reason wrongly about a pace per 100.
    setUnitSystem('metric')
    expect(pool(25)).toBe('25 m')
    setUnitSystem('imperial')
    expect(pool(25)).toBe('25 m')
    setUnitSystem('metric')
  })

  it('recovers a yard pool from the metres the provider reports', () => {
    // Garmin reports metres whatever the watch was set to: 25 yd = 22.86 m.
    setUnitSystem('metric')
    expect(pool(22.86)).toBe('25 yd')
    setUnitSystem('imperial')
    expect(pool(22.86)).toBe('25 yd')
    setUnitSystem('metric')
  })

  it('handles the other lengths people actually swim', () => {
    setUnitSystem('metric')
    expect(pool(50)).toBe('50 m')
    expect(pool(18.288)).toBe('20 yd')
    expect(pool(33.33)).toBe('33⅓ m')
    expect(pool(30.48)).toBe('33⅓ yd')
  })

  it('tolerates rounding in the source data', () => {
    setUnitSystem('metric')
    expect(pool(22.9)).toBe('25 yd')
    expect(pool(24.8)).toBe('25 m')
  })

  it('falls back to a plain distance for a non-standard pool', () => {
    setUnitSystem('metric')
    expect(pool(17)).toBe('17 m')
    setUnitSystem('imperial')
    expect(pool(17)).toBe('19 yd')
    setUnitSystem('metric')
  })

  it('does not confuse two nearby standards', () => {
    setUnitSystem('metric')
    // 22.86 (25 yd) and 25 (25 m) are 2.14 m apart; the tolerance must not bridge them.
    expect(pool(22.86)).toBe('25 yd')
    expect(pool(25)).toBe('25 m')
  })
})
