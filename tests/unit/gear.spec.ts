import { describe, it, expect } from 'vitest'
import type { Activity } from '@/types/activity'
import type { Gear } from '@/types/gear'
import {
  applyGearPick,
  defaultGear,
  gearChoiceToKeep,
  gearUsage,
  isDefaultChoice,
  resolveGear,
  wearLevel
} from '@/utils/gear'

const day = (iso: string) => new Date(`${iso}T12:00:00`).getTime()

function gear(id: string, fields: Partial<Gear> = {}): Gear {
  return {
    id,
    name: id,
    kind: 'shoes',
    sports: ['running'],
    activeFrom: day('2026-01-01'),
    version: 1,
    lastModified: 1,
    ...fields
  }
}

function run(id: string, iso: string, fields: Partial<Activity> = {}): Activity {
  return {
    id,
    provider: 'test',
    type: 'running',
    startTime: day(iso),
    distance: 10_000,
    duration: 3_000,
    version: 1,
    lastModified: 1,
    ...fields
  } as Activity
}

describe('resolveGear — dated defaults', () => {
  const old = gear('old', { activeFrom: day('2026-01-01'), retiredAt: day('2026-06-01') })
  const fresh = gear('new', { activeFrom: day('2026-05-15') })
  const bike = gear('bike', { kind: 'bike', sports: ['cycling'] })
  const all = [old, fresh, bike]

  it('gives an outing the shoes in service on its date', () => {
    expect(resolveGear(run('a', '2026-03-01'), all).map(g => g.id)).toEqual(['old'])
    expect(resolveGear(run('b', '2026-07-01'), all).map(g => g.id)).toEqual(['new'])
  })

  it('takes the most recently started when two defaults overlap', () => {
    expect(resolveGear(run('c', '2026-05-20'), all).map(g => g.id)).toEqual(['new'])
  })

  it('matches the sport, legacy names included', () => {
    expect(resolveGear(run('d', '2026-03-01', { type: 'Run' }), all).map(g => g.id)).toEqual([
      'old'
    ])
    expect(resolveGear(run('e', '2026-03-01', { type: 'cycling' }), all).map(g => g.id)).toEqual([
      'bike'
    ])
  })

  it('lets the reader’s own choice win, "none" included', () => {
    expect(resolveGear(run('f', '2026-03-01', { gearIds: ['bike'] }), all).map(g => g.id)).toEqual([
      'bike'
    ])
    expect(resolveGear(run('g', '2026-03-01', { gearIds: [] }), all)).toEqual([])
    expect(isDefaultChoice(run('h', '2026-03-01'))).toBe(true)
    expect(isDefaultChoice(run('i', '2026-03-01', { gearIds: [] }))).toBe(false)
  })

  it('ignores deleted gear, default or chosen', () => {
    const gone = gear('gone', { deleted: true })
    expect(defaultGear(run('j', '2026-03-01'), [gone])).toEqual([])
    expect(resolveGear(run('k', '2026-03-01', { gearIds: ['gone'] }), [gone])).toEqual([])
  })
})

describe('gearUsage and wearLevel', () => {
  it('adds the outings to the wear done before tracking', () => {
    const shoes = gear('s', { initialDistance: 100_000, alertDistance: 700_000 })
    const usage = gearUsage(
      [run('a', '2026-02-01'), run('b', '2026-02-03'), run('c', '2026-02-05', { deleted: true })],
      [shoes]
    ).get('s')!
    expect(usage.distance).toBe(120_000)
    expect(usage.count).toBe(2)
    expect(usage.lastUsed).toBe(day('2026-02-03'))
  })

  it('turns orange at 80 % of the limit and red past it', () => {
    const shoes = gear('s', { alertDistance: 700_000 })
    const at = (km: number) =>
      wearLevel(shoes, { distance: km * 1000, duration: 0, count: 1, lastUsed: null })
    expect(at(500)).toBe('ok')
    expect(at(560)).toBe('warn')
    expect(at(700)).toBe('over')
  })

  it('wears by time when the gear has a time limit, and never alarms without one', () => {
    const trainer = gear('t', { kind: 'other', alertDuration: 100 * 3600 })
    expect(wearLevel(trainer, { distance: 0, duration: 90 * 3600, count: 1, lastUsed: null })).toBe(
      'warn'
    )
    expect(wearLevel(gear('n'), { distance: 9e9, duration: 9e9, count: 1, lastUsed: null })).toBe(
      'ok'
    )
  })
})

describe('wearLevel — retired gear', () => {
  it('never alarms on gear already replaced', () => {
    const old = gear('old', { alertDistance: 700_000, retiredAt: day('2026-06-01') })
    expect(wearLevel(old, { distance: 900_000, duration: 0, count: 1, lastUsed: null })).toBe('ok')
  })
})

describe('gearChoiceToKeep — sync conflicts', () => {
  it('carries over a gear choice set after the winning record’s', () => {
    const winner = run('a', '2026-03-01', { lastModified: 200 })
    const loser = run('a', '2026-03-01', { gearIds: ['trail'], gearSetAt: 150 })
    expect(gearChoiceToKeep(winner, loser)).toEqual({ gearIds: ['trail'], gearSetAt: 150 })
  })

  it('keeps the winner’s choice when it is the latest, or when neither set one', () => {
    const winner = run('a', '2026-03-01', { gearIds: ['road'], gearSetAt: 300 })
    const loser = run('a', '2026-03-01', { gearIds: ['trail'], gearSetAt: 150 })
    expect(gearChoiceToKeep(winner, loser)).toBeNull()
    expect(gearChoiceToKeep(run('a', '2026-03-01'), run('a', '2026-03-01'))).toBeNull()
  })

  it('carries a choice back to the default too', () => {
    // The reader cleared the choice on the losing side, after the winner set one
    const winner = run('a', '2026-03-01', { gearIds: ['road'], gearSetAt: 100 })
    const loser = run('a', '2026-03-01', { gearSetAt: 200 })
    expect(gearChoiceToKeep(winner, loser)).toEqual({ gearIds: undefined, gearSetAt: 200 })
  })
})

describe('applyGearPick — bulk', () => {
  const road = gear('road')
  const trail = gear('trail', { sports: [] })
  const bike = gear('bike', { kind: 'bike', sports: ['running'] })
  const all = [road, trail, bike]

  it('replaces the gear of the kind picked and keeps the rest', () => {
    expect(applyGearPick(run('a', '2026-03-01'), all, [trail]).sort()).toEqual(['bike', 'trail'])
  })

  it('starts from the outing’s own choice when it has one', () => {
    const a = run('a', '2026-03-01', { gearIds: [] })
    expect(applyGearPick(a, all, [trail])).toEqual(['trail'])
  })
})
