import type { GearKind } from '@/types/gear'
import { SPORT_FAMILY, isSportType } from '@/types/sport'
import { mapStravaSport } from './sportTypes'
import type { StravaCsvRow } from './adapter'

/** A row of the export's shoes.csv or bikes.csv: only the columns used. */
export type StravaGearCsvRow = Record<string, string | undefined>

/** One piece of gear named in the export, with what the import needs to create it. */
export interface StravaGearRef {
  name: string
  kind: GearKind
  /** Start of its first outing, ms: when it went into service, as far as the export knows. */
  firstUse: number
}

/** The column naming the gear an outing used. */
export const GEAR_COLUMN = 'Activity Gear'

export const gearName = (row: StravaCsvRow): string | undefined =>
  row[GEAR_COLUMN]?.trim() || undefined

/**
 * The names a shoes.csv or bikes.csv row can appear under in activities.csv:
 * its nickname, or brand and model when it has none.
 */
export function namesOf(rows: StravaGearCsvRow[], prefix: 'Shoe' | 'Bike'): Set<string> {
  const names = new Set<string>()
  for (const r of rows) {
    const name = r[`${prefix} Name`]?.trim()
    if (name) names.add(name.toLowerCase())
    const model = [r[`${prefix} Brand`], r[`${prefix} Model`]]
      .map(v => v?.trim())
      .filter(Boolean)
      .join(' ')
    if (model) names.add(model.toLowerCase())
  }
  return names
}

/**
 * Every gear the export names, once each.
 *
 * Its kind comes from shoes.csv and bikes.csv when the export has them, and
 * otherwise from what it was worn for: on foot, shoes; in the saddle, a bike.
 */
export function collectStravaGear(
  rows: StravaCsvRow[],
  shoes: Set<string>,
  bikes: Set<string>,
  startOf: (row: StravaCsvRow) => number
): StravaGearRef[] {
  const found = new Map<string, { name: string; firstUse: number; families: string[] }>()
  for (const row of rows) {
    const name = gearName(row)
    if (!name) continue
    const key = name.toLowerCase()
    const sport = mapStravaSport(row['Activity Type'])
    const family = isSportType(sport) ? SPORT_FAMILY[sport] : 'other'
    const start = startOf(row)
    const entry = found.get(key)
    if (!entry) found.set(key, { name, firstUse: start, families: [family] })
    else {
      if (start > 0 && (entry.firstUse <= 0 || start < entry.firstUse)) entry.firstUse = start
      entry.families.push(family)
    }
  }

  return [...found.entries()].map(([key, { name, firstUse, families }]) => ({
    name,
    firstUse,
    kind: shoes.has(key) ? 'shoes' : bikes.has(key) ? 'bike' : guessKind(families)
  }))
}

function guessKind(families: string[]): GearKind {
  const count = (f: string[]) => families.filter(x => f.includes(x)).length
  const onFoot = count(['running', 'walking'])
  const riding = count(['cycling'])
  if (onFoot === 0 && riding === 0) return 'other'
  return onFoot >= riding ? 'shoes' : 'bike'
}
