import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import SpeedSampled from '@plugins/app-extensions/StandardDetails/SpeedSampled.vue'

// Mock PluginContext with analyzer and storage
const mockPluginContext = {
  storage: {
    getData: vi.fn().mockResolvedValue(null),
    saveData: vi.fn().mockResolvedValue(undefined),
    deleteData: vi.fn(),
    exportDB: vi.fn()
  },
  analyzer: {
    create: () => ({
      sampleAverageByDistance: () => [{ distance: 1000, speed: 3, heartRate: 150 }],
      sampleByLaps: () => [],
      sampleBySlopeChange: () => [],
      bestSegments: () => ({})
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
    expect(wrapper.text()).toMatch(/Allure/i)
    // Vérifie colonnes header (Dist., Pace, FC, Pente)
    expect(wrapper.text()).toMatch(/Dist\./)
    expect(wrapper.text()).toMatch(/Pace/i)
  })
})
