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
