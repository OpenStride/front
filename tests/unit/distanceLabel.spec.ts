import { describe, it, expect } from 'vitest'
import { distanceLabel } from '@plugins/app-extensions/StandardDetails/distanceLabel'
import type { IUnitsService } from '@/types/plugin-context'

/** The metric side of the real units table: km with two decimals, m with none */
const metric = {
  format: (dimension, si) => {
    const km = dimension === 'distance'
    const value = km ? (si / 1000).toFixed(2) : si.toFixed(0)
    const unit = km ? 'km' : 'm'
    return { value, unit, text: `${value} ${unit}` }
  }
} as unknown as IUnitsService

describe('distanceLabel', () => {
  it('drops decimals that carry nothing', () => {
    // A column of "1.00 km / 2.00 km / 3.00 km" makes the reader parse four
    // characters that never change
    expect(distanceLabel(metric, 1000)).toBe('1 km')
    expect(distanceLabel(metric, 3000)).toBe('3 km')
  })

  it('keeps the decimals that say something', () => {
    expect(distanceLabel(metric, 1250)).toBe('1.25 km')
    expect(distanceLabel(metric, 5190)).toBe('5.19 km')
  })

  it('keeps a single significant decimal', () => {
    expect(distanceLabel(metric, 1200)).toBe('1.2 km')
  })

  it('reads short distances in metres', () => {
    // "0.20 km" is not how anyone says two hundred metres
    expect(distanceLabel(metric, 200)).toBe('200 m')
    expect(distanceLabel(metric, 999)).toBe('999 m')
  })

  it('does not eat the zeros of a whole number of metres', () => {
    expect(distanceLabel(metric, 100)).toBe('100 m')
    expect(distanceLabel(metric, 500)).toBe('500 m')
  })
})
