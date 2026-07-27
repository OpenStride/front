import { describe, it, expect } from 'vitest'
import { selectSlotLoaders } from '@/services/ExtensionPluginRegistry'
import type { SlotEntry } from '@/types/extension'
import StandardDetails from '@plugins/app-extensions/StandardDetails/index'

const loaded: string[] = []
const trackedLoader = (name: string) => async () => {
  loaded.push(name)
  return { name, template: `<div>${name}</div>` }
}

describe('selectSlotLoaders', () => {
  it('never touches the loader of an entry that does not apply', async () => {
    loaded.length = 0
    const entries: SlotEntry[] = [
      { id: 'kept', component: trackedLoader('kept'), appliesTo: () => true },
      { id: 'dropped', component: trackedLoader('dropped'), appliesTo: () => false }
    ]

    const loaders = selectSlotLoaders(entries, {})
    await Promise.all(loaders.map(l => l()))

    // The whole point of filtering before loading: no chunk for what we skip.
    expect(loaded).toEqual(['kept'])
  })

  it('keeps a bare loader, which has no opinion', () => {
    const bare = async () => ({ template: '<div />' })
    expect(selectSlotLoaders([bare], {})).toHaveLength(1)
  })

  it('keeps an entry that declares no condition', () => {
    const entries: SlotEntry[] = [{ id: 'always', component: trackedLoader('always') }]
    expect(selectSlotLoaders(entries, {})).toHaveLength(1)
  })

  it('preserves declaration order', () => {
    const entries: SlotEntry[] = [
      { id: 'a', component: trackedLoader('a') },
      { id: 'b', component: trackedLoader('b'), appliesTo: () => false },
      { id: 'c', component: trackedLoader('c') }
    ]
    expect(selectSlotLoaders(entries, {})).toHaveLength(2)
  })
})

describe('StandardDetails applicability', () => {
  const entryFor = (id: string): SlotEntry => {
    const entries = StandardDetails.slots!['activity.widgets']
    const found = entries.find(e => typeof e !== 'function' && e.id === id)
    if (!found || typeof found === 'function') throw new Error(`no entry "${id}"`)
    return found
  }

  const details = (over: Record<string, unknown> = {}) => ({
    id: 'a1',
    version: 1,
    lastModified: 0,
    ...over
  })

  it('hides the heart-rate graph when no sample carries a heart rate', () => {
    const hr = entryFor('heart-rate')
    expect(hr.appliesTo!({ details: details({ samples: [{ time: 0 }, { time: 1 }] }) })).toBe(false)
    expect(hr.appliesTo!({ details: details({ samples: [{ time: 0, heartRate: 140 }] }) })).toBe(
      true
    )
  })

  it('hides the cadence graph on a swim with no cadence samples', () => {
    const cadence = entryFor('cadence')
    expect(
      cadence.appliesTo!({ details: details({ samples: [{ time: 0, heartRate: 120 }] }) })
    ).toBe(false)
  })

  it('shows the swim summary only when swim measurements exist', () => {
    const swim = entryFor('swim-summary')
    expect(swim.appliesTo!({ details: details({ samples: [] }) })).toBe(false)
    expect(
      swim.appliesTo!({
        details: details({ measurements: { 'swim.swolf': { value: 38, unit: 'swolf' } } })
      })
    ).toBe(true)
  })

  it('treats missing details as nothing to show rather than crashing', () => {
    for (const id of ['heart-rate', 'heart-zones', 'speed', 'cadence', 'swim-summary']) {
      expect(() => entryFor(id).appliesTo!({}), `entry "${id}" threw`).not.toThrow()
      expect(entryFor(id).appliesTo!({}), `entry "${id}" should not apply`).toBe(false)
    }
  })

  it('gives every widget entry an id', () => {
    for (const entry of StandardDetails.slots!['activity.widgets']) {
      expect(typeof entry === 'function' ? null : entry.id).toBeTruthy()
    }
  })
})
