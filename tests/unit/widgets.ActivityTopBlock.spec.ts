import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ActivityTopBlock from '@plugins/app-extensions/StandardDetails/ActivityTopBlock.vue'
import { PLUGIN_CONTEXT_KEY } from '@/composables/usePluginContext'
import { formatQuantity, setUnitSystem, unitSystem } from '@/composables/useUnits'
import type { Activity, ActivityDetails } from '@/types/activity'

// Typed rather than inferred: an inferred literal narrows `stats` to the three
// keys this default happens to carry and `samples` to `never[]`, so every test
// below that overrides them stops compiling.
type WidgetData = { activity: Activity; details: ActivityDetails }

type Stats = NonNullable<ActivityDetails['stats']>

function makeData(
  over: Partial<Activity> = {},
  detailsOver: Partial<ActivityDetails> = {}
): WidgetData {
  return {
    activity: {
      id: 'a1',
      type: 'running',
      distance: 5000,
      duration: 1500,
      startTime: Math.floor(Date.now() / 1000),
      provider: 'mock',
      version: 1,
      lastModified: Date.now(),
      ...over
    },
    details: {
      id: 'a1',
      version: 1,
      lastModified: Date.now(),
      stats: { totalAscent: 120, averageSpeed: 3, calories: 400 },
      samples: [],
      ...detailsOver
    }
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

const render = (data: WidgetData = makeData()) =>
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
    render(
      makeData(
        { type: 'strength_training', distance: 0, duration: 3300 },
        { stats: { averageHeartRate: 118, maxHeartRate: 158, calories: 410 }, samples: [] }
      )
    )

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
    const text = render(
      makeData({ type: 'running' }, { stats: { averageSpeed: 3, calories: 600 }, samples: [] })
    ).text()
    expect(text).toMatch(/Avg pace/i)
    expect(text).toContain('600')
  })
})

describe('ActivityTopBlock — descent and max speed', () => {
  beforeEach(() => setUnitSystem('metric'))

  const ski = (over: Partial<Stats> = {}) =>
    render(
      makeData(
        { type: 'alpine_skiing', distance: 31200, duration: 10800 },
        {
          samples: [
            { time: 0, elevation: 1800 },
            { time: 1, elevation: 1200 },
            { time: 2, elevation: 1750 },
            { time: 3, elevation: 1100 }
          ],
          stats: { averageSpeed: 2.9, maxSpeed: 21.4, totalAscent: 550, ...over }
        }
      )
    )

  it('prefers the descent the provider reported', () => {
    expect(ski({ totalDescent: 4200 }).text()).toMatch(/4\s?200\s*m|4200\s*m/)
  })

  it('computes the descent when the provider gave none', () => {
    // Every activity stored before this existed falls here.
    const text = ski().text()
    // Climbed and descended share one cell now: "Elevation + / -" "550 / 1250 m"
    expect(text).toMatch(/Elevation \+\/-|Dénivelé/i)
    expect(text).toMatch(/550\/1250/)
  })

  it('shows the max speed, which was stored and displayed nowhere', () => {
    expect(ski().text()).toMatch(/77\.0\s*km\/h/)
  })

  it('omits the descent when there is no elevation at all', () => {
    const flat = render(
      makeData(
        { type: 'running' },
        { samples: [{ time: 0, heartRate: 150 }], stats: { averageSpeed: 3 } }
      )
    )
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

describe('ActivityTopBlock — pairs and long readings', () => {
  beforeEach(() => setUnitSystem('metric'))

  const ultra = () =>
    render(
      makeData(
        { type: 'running', distance: 100000, duration: 87120 },
        {
          samples: [{ time: 0, elevation: 500 }],
          stats: {
            averageSpeed: 1.15,
            averageHeartRate: 152,
            maxHeartRate: 198,
            totalAscent: 4280,
            totalDescent: 4315
          }
        }
      )
    )

  it('reads both heart rates from one cell', () => {
    const text = render(
      makeData({}, { stats: { averageSpeed: 3, averageHeartRate: 148, maxHeartRate: 176 } })
    ).text()

    expect(text).toMatch(/148\/176/)
    // One cell, so the standalone "Max HR" label is gone
    expect(text).not.toMatch(/Max HR/i)
  })

  it('keeps its own label when only one of the pair exists', () => {
    // "148/—" would be worse than a single value under its own name
    const text = render(makeData({}, { stats: { averageSpeed: 3, averageHeartRate: 148 } })).text()

    expect(text).toMatch(/Avg HR/i)
    // Not "148/…" — the pace unit legitimately carries a slash, the value must not
    expect(text).not.toMatch(/148\//)
  })

  it('steps the type down when the numbers get long', () => {
    // An ultra reads "4280/4315 m" where a park run reads "120 m"; at 30px that
    // spills out of a half-width cell on a phone
    const value = ultra().find('.atb__cvalue')

    expect(value.classes()).toContain('is-long')
  })

  it('leaves ordinary readings at full size', () => {
    const value = render().find('.atb__cvalue')

    expect(value.classes()).not.toContain('is-long')
    expect(value.classes()).not.toContain('is-xlong')
  })

  it('sizes the whole block together, not cell by cell', () => {
    // Numbers read side by side must not sit at three different sizes
    const sizes = new Set(
      ultra()
        .findAll('.atb__cvalue')
        .map(v => v.classes().find(c => c.startsWith('is-')) ?? '')
    )

    expect(sizes.size).toBe(1)
  })
})
