import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import en from '@/locales/en.json'
import SpeedSampled from '@plugins/app-extensions/StandardDetails/SpeedSampled.vue'
import { convertQuantity, formatQuantity, unitSystem } from '@/composables/useUnits'

// Mock PluginContext with analyzer and storage
const mockPluginContext = {
  units: {
    get system() {
      return unitSystem.value
    },
    format: formatQuantity,
    convert: convertQuantity
  },
  storage: {
    getData: vi.fn().mockResolvedValue(null),
    saveData: vi.fn().mockResolvedValue(undefined),
    deleteData: vi.fn(),
    exportDB: vi.fn()
  },
  analyzer: {
    create: () => ({
      sampleAverageByDistance: () => [
        { distance: 500, segmentEnd: 1000, segmentDistance: 1000, speed: 3, heartRate: 150 }
      ],
      sampleByLaps: () => [],
      sampleBySlopeChange: () => [],
      bestSegments: () => ({}),
      elevationChange: () => ({ ascent: 0, descent: 0 }),
      // The widget asks the terrain whether grade is worth showing
      elevationProfile: () => ({
        gain: 0,
        loss: 0,
        distance: 5000,
        gainPerKm: 0,
        isFlat: true,
        hasElevation: false
      })
    })
  },
  notifications: { notify: vi.fn() },
  activity: { getAllActivities: vi.fn() },
  plugins: { isPluginActive: vi.fn(), enablePlugin: vi.fn() },
  aggregation: { getAggregated: vi.fn(), listMetrics: vi.fn() },
  friends: { publishPublicData: vi.fn(), getMyManifestUrl: vi.fn() }
}

describe('SpeedSampled widget', () => {
  it('rend le tableau récapitulatif avec une ligne', async () => {
    const data = {
      activity: {
        id: 'a1',
        distance: 5000,
        provider: 'mock',
        startTime: 0,
        duration: 0,
        type: 'RUNNING'
      },
      details: { id: 'a1', samples: [], laps: [] }
    }
    const wrapper = mount(SpeedSampled, {
      props: { data },
      global: { provide: { pluginContext: mockPluginContext } }
    })
    // attendre onMounted
    await Promise.resolve()
    expect(wrapper.text()).toContain(en.graphs.colPace)
    // Vérifie colonnes header (Dist., Pace, FC, Pente)
    expect(wrapper.text()).toMatch(/Dist\./)
    expect(wrapper.text()).toMatch(/Pace/i)
  })
})
