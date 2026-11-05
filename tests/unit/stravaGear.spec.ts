import { describe, it, expect } from 'vitest'
import { collectStravaGear, namesOf } from '@plugins/data-providers/StravaProvider/client/gear'
import type { StravaCsvRow } from '@plugins/data-providers/StravaProvider/client/adapter'

const row = (gear: string, type: string, date: number): StravaCsvRow => ({
  'Activity ID': String(date),
  'Activity Type': type,
  'Activity Gear': gear,
  date: String(date)
})
const startOf = (r: StravaCsvRow) => Number(r.date)

describe('Strava export gear', () => {
  it('knows shoes and bikes by nickname or by brand and model', () => {
    const shoes = namesOf(
      [{ 'Shoe Name': 'Daily', 'Shoe Brand': 'Nike', 'Shoe Model': 'Pegasus 40' }],
      'Shoe'
    )
    expect([...shoes].sort()).toEqual(['daily', 'nike pegasus 40'])
  })

  it('lists each gear once, from its first outing, with its kind', () => {
    const rows = [
      row('Daily', 'Run', 300),
      row('daily', 'Run', 100),
      row('', 'Run', 50),
      row('Canyon', 'Ride', 200),
      row('Mystery', 'Hike', 400)
    ]
    const refs = collectStravaGear(rows, new Set(['daily']), new Set(), startOf)
    expect(refs).toEqual([
      { name: 'Daily', kind: 'shoes', firstUse: 100 },
      { name: 'Canyon', kind: 'bike', firstUse: 200 },
      { name: 'Mystery', kind: 'shoes', firstUse: 400 }
    ])
  })

  it('leaves gear worn for neither foot nor saddle as "other"', () => {
    const refs = collectStravaGear([row('Paddle', 'Kayaking', 1)], new Set(), new Set(), startOf)
    expect(refs[0].kind).toBe('other')
  })
})
