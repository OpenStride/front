import type { IUnitsService } from '@/types/plugin-context'

/**
 * Distance as a chart reads it: whole units when they are whole.
 *
 * The units service always formats a distance with two decimals, which is right
 * for a total ("12.43 km") and noise on an axis, where a column of "1.00 km /
 * 2.00 km / 3.00 km" makes the reader parse four characters that never vary.
 * Kilometres for a split, metres below one — "0.20 km" is not how anyone says
 * two hundred metres.
 */
export function distanceLabel(units: IUnitsService, meters: number): string {
  const { value, unit } = units.format(meters >= 1000 ? 'distance' : 'distanceShort', meters)
  return unit ? `${trimTrailingZeros(value)} ${unit}` : trimTrailingZeros(value)
}

/** "1.00" → "1", "1.20" → "1.2", "1.25" → "1.25", and "100" left alone */
function trimTrailingZeros(value: string): string {
  return value.includes('.') ? value.replace(/\.?0+$/, '') : value
}
