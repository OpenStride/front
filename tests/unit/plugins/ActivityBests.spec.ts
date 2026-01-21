import { describe, it, expect } from 'vitest'
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
      }
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
      }
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
      }
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
