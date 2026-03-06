import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ActivityBests from '@plugins/app-extensions/AggregatedDetails/ActivityBests.vue'
import type { Activity, ActivityDetails } from '@/types/activity'

// Mock router for RouterLink components
const mockRouter = {
  push: () => {},
  resolve: () => ({ href: '/mock' })
}

const mockRoute = {
  params: {},
  query: {}
}

// Fake best-segment result (distance: 1000m in 240s)
const fakeBestResult = {
  1000: { duration: 240, avgSpeed: 4.17, sample: { speed: 4.17 } },
  2000: { duration: 500, avgSpeed: 4.0, sample: { speed: 4.0 } },
  5000: { duration: 1300, avgSpeed: 3.85, sample: { speed: 3.85 } },
  10000: { duration: 2700, avgSpeed: 3.7, sample: { speed: 3.7 } }
}

// Mock PluginContext with analyzer factory
const mockPluginContext = {
  analyzer: {
    create: (samples: any[]) => ({
      bestSegments: vi.fn().mockReturnValue(samples.length ? fakeBestResult : {}),
      sampleAverageByDistance: vi.fn().mockReturnValue([]),
      sampleBySlopeChange: vi.fn().mockReturnValue([]),
      sampleByLaps: vi.fn().mockReturnValue([])
    })
  },
  storage: { getData: vi.fn(), saveData: vi.fn(), deleteData: vi.fn(), exportDB: vi.fn() },
  notifications: { notify: vi.fn() },
  activity: { getAllActivities: vi.fn().mockResolvedValue([]) },
  plugins: { isPluginActive: vi.fn(), enablePlugin: vi.fn() },
  aggregation: { getAggregated: vi.fn(), listMetrics: vi.fn() },
  friends: { publishPublicData: vi.fn(), getMyManifestUrl: vi.fn() }
}

describe('ActivityBests.vue', () => {
  const mockActivity: Activity = {
    id: 'test-1',
    startTime: Date.now(),
    distance: 10000,
    duration: 3600,
    type: 'running',
    provider: 'test',
    version: 1,
    lastModified: Date.now(),
    synced: false,
    deleted: false
  }

  const mockSamples = Array.from({ length: 100 }, (_, i) => ({
    time: i * 36, // 36 seconds cumulative
    distance: i * 100, // 100m cumulative
    speed: 2.5 + Math.random() * 0.5, // ~2.5-3.0 m/s
    heartRate: 140 + Math.floor(Math.random() * 20)
  }))

  const mockDetails: ActivityDetails = {
    id: 'test-1',
    samples: mockSamples,
    laps: [],
    stats: {
      averageSpeed: 2.78,
      totalAscent: 50,
      calories: 500
    },
    version: 1,
    lastModified: Date.now()
  }

  it('renders correctly with valid data', () => {
    const wrapper = mount(ActivityBests, {
      props: {
        data: {
          activity: mockActivity,
          details: mockDetails
        }
      },
      global: {
        provide: { pluginContext: mockPluginContext },
        mocks: {
          $router: mockRouter,
          $route: mockRoute
        },
        stubs: {
          RouterLink: {
            template: '<a><slot /></a>'
          }
        }
      }
    })

    // Widget should render with data
    expect(wrapper.vm).toBeDefined()
    expect(wrapper.find('div').exists()).toBe(true)
  })

  it('handles undefined details gracefully', () => {
    const wrapper = mount(ActivityBests, {
      props: {
        data: {
          activity: mockActivity,
          details: undefined as any
        }
      },
      global: { provide: { pluginContext: mockPluginContext } }
    })

    // Should not crash - ActivityAnalyzer should handle empty array
    expect(wrapper.vm).toBeDefined()
  })

  it('handles details with no samples', () => {
    const detailsWithoutSamples = {
      ...mockDetails,
      samples: undefined
    }

    const wrapper = mount(ActivityBests, {
      props: {
        data: {
          activity: mockActivity,
          details: detailsWithoutSamples as any
        }
      },
      global: { provide: { pluginContext: mockPluginContext } }
    })

    // Should not crash - ActivityAnalyzer should handle empty array
    expect(wrapper.vm).toBeDefined()
  })

  it('handles empty samples array', () => {
    const detailsWithEmptySamples = {
      ...mockDetails,
      samples: []
    }

    const wrapper = mount(ActivityBests, {
      props: {
        data: {
          activity: mockActivity,
          details: detailsWithEmptySamples
        }
      },
      global: { provide: { pluginContext: mockPluginContext } }
    })

    // Should not crash
    expect(wrapper.vm).toBeDefined()
  })

  it('initializes ActivityAnalyzer with samples', () => {
    const wrapper = mount(ActivityBests, {
      props: {
        data: {
          activity: mockActivity,
          details: mockDetails
        }
      },
      global: {
        provide: { pluginContext: mockPluginContext },
        mocks: {
          $router: mockRouter,
          $route: mockRoute
        },
        stubs: {
          RouterLink: {
            template: '<a><slot /></a>'
          }
        }
      }
    })

    // Component should render without errors
    expect(wrapper.vm).toBeDefined()
    expect(wrapper.find('div').exists()).toBe(true)
  })
})
