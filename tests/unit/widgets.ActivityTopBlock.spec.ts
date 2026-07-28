import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ActivityTopBlock from '@plugins/app-extensions/StandardDetails/ActivityTopBlock.vue'
import { PLUGIN_CONTEXT_KEY } from '@/composables/usePluginContext'
import { formatQuantity, setUnitSystem, unitSystem } from '@/composables/useUnits'

function makeData(over: Record<string, unknown> = {}) {
  return {
    activity: {
      id: 'a1',
      type: 'running',
      distance: 5000,
      duration: 1500,
      startTime: Math.floor(Date.now() / 1000),
      provider: 'mock',
      ...over
    },
    details: { id: 'a1', stats: { totalAscent: 120, averageSpeed: 3, calories: 400 }, samples: [] }
  }
}

// The widget formats through the plugin context, as plugins must.
const pluginContext = {
    analyzer: {
    create: (samples: { elevation?: number }[]) => ({
      // The real computation, so the fallback path is genuinely exercised.
      elevationChange: () => {
        let ascent = 0
        let descent = 0
        let ref: number | null = null
        for (const sample of samples ?? []) {
          const e = sample.elevation
          if (e == null || !Number.isFinite(e)) continue
          if (ref === null) {
            ref = e
            continue
          }
          const d = e - ref
          if (d >= 3) {
            ascent += d
            ref = e
          } else if (d <= -3) {
            descent += -d
            ref = e
          }
        }
        return { ascent: Math.round(ascent), descent: Math.round(descent) }
      },
      sampleAverageByDistance: () => [],
      sampleByLaps: () => [],
      sampleBySlopeChange: () => [],
      bestSegments: () => ({})
    })
  },
  units: {
    get system() {
      return unitSystem.value
    },
    format: formatQuantity
  }
}

const render = (data = makeData()) =>
  mount(ActivityTopBlock, {
    props: { data },
    global: { provide: { [PLUGIN_CONTEXT_KEY]: pluginContext } }
  })

describe('ActivityTopBlock widget', () => {
  beforeEach(() => setUnitSystem('metric'))

  it('affiche titre (type traduit) et métriques de base', () => {
    const wrapper = render()
    // Sport type localised (en default → "Running"); value + unit render adjacent
    expect(wrapper.text()).toMatch(/Running|Course à pied|RUNNING/i)
    expect(wrapper.text()).toMatch(/5\.00\s*km/)
    expect(wrapper.text()).toMatch(/12[01]\s*m/) // arrondi
    expect(wrapper.text()).toMatch(/400/) // calories
  })

  it('gives a run a pace and a ride a speed', () => {
    // 3 m/s → 5'33 /km
    expect(render().text()).toMatch(/5'3\d\s*\/km/)
    // same speed, shown as 10.8 km/h for a ride
    expect(render(makeData({ type: 'cycling' })).text()).toMatch(/10\.8\s*km\/h/)
  })

  it('reads a pool swim in metres, per 100 m', () => {
    const swim = render(makeData({ type: 'pool_swimming', distance: 1500 }))
    expect(swim.text()).toMatch(/1500\s*m/)
    expect(swim.text()).toMatch(/\/100 m/)
  })

  it('follows the unit preference', () => {
    setUnitSystem('imperial')
    const text = render().text()
    expect(text).toMatch(/3\.11\s*mi/) // 5 km
    expect(text).toMatch(/394\s*ft/) // 120 m of ascent
    setUnitSystem('metric')
  })
})

describe('ActivityTopBlock — sports without a pace', () => {
  beforeEach(() => setUnitSystem('metric'))

  const gym = () =>
    render({
      ...makeData({ type: 'strength_training', distance: 0, duration: 3300 }),
      details: {
        id: 'a1',
        stats: { averageHeartRate: 118, maxHeartRate: 158, calories: 410 },
        samples: []
      }
    })

  it('headlines calories when there is no pace or speed to show', () => {
    // The accent slot used to hold a dash while the calories sat in the second row.
    const text = gym().text()
    expect(text).toContain('410')
    expect(text).toMatch(/CALORIES|Calories/i)
  })

  it('drops the empty distance and pace slots', () => {
    const text = gym().text()
    expect(text).not.toContain('0.00')
    expect(text).not.toMatch(/Avg pace/i)
  })

  it('does not print the calories twice', () => {
    const matches = gym().text().match(/410/g) ?? []
    expect(matches).toHaveLength(1)
  })

  it('still keeps calories in the second row for a run', () => {
    const text = render({
      ...makeData({ type: 'running' }),
      details: { id: 'a1', stats: { averageSpeed: 3, calories: 600 }, samples: [] }
    }).text()
    expect(text).toMatch(/Avg pace/i)
    expect(text).toContain('600')
  })
})

describe('ActivityTopBlock — descent and max speed', () => {
  beforeEach(() => setUnitSystem('metric'))

  const ski = (over: Record<string, unknown> = {}) =>
    render({
      ...makeData({ type: 'alpine_skiing', distance: 31200, duration: 10800 }),
      details: {
        id: 'a1',
        samples: [
          { time: 0, elevation: 1800 },
          { time: 1, elevation: 1200 },
          { time: 2, elevation: 1750 },
          { time: 3, elevation: 1100 }
        ],
        stats: { averageSpeed: 2.9, maxSpeed: 21.4, totalAscent: 550, ...over }
      }
    })

  it('prefers the descent the provider reported', () => {
    expect(ski({ totalDescent: 4200 }).text()).toMatch(/4\s?200\s*m|4200\s*m/)
  })

  it('computes the descent when the provider gave none', () => {
    // Every activity stored before this existed falls here.
    const text = ski().text()
    expect(text).toMatch(/Elevation -|Dénivelé/i)
    expect(text).toMatch(/1250/)
  })

  it('shows the max speed, which was stored and displayed nowhere', () => {
    expect(ski().text()).toMatch(/77\.0\s*km\/h/)
  })

  it('omits the descent when there is no elevation at all', () => {
    const flat = render({
      ...makeData({ type: 'running' }),
      details: { id: 'a1', samples: [{ time: 0, heartRate: 150 }], stats: { averageSpeed: 3 } }
    })
    expect(flat.text()).not.toMatch(/Elevation -|Dénivelé -/i)
  })

  it('follows the unit preference for both', () => {
    setUnitSystem('imperial')
    const text = ski({ totalDescent: 1000 }).text()
    expect(text).toMatch(/3281\s*ft/)
    expect(text).toMatch(/mph/)
    setUnitSystem('metric')
  })
})
