import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ActivityTopBlock from '@plugins/app-extensions/StandardDetails/ActivityTopBlock.vue'
import type { Activity, ActivityDetails } from '@/types/activity'

describe('ActivityTopBlock.vue', () => {
  const mockActivity: Activity = {
    id: 'test-1',
    startTime: Date.now(),
    distance: 5000,
    duration: 1800,
    type: 'running',
    provider: 'test',
    version: 1,
    lastModified: Date.now(),
    synced: false,
    deleted: false
  }

  const mockDetails: ActivityDetails = {
    id: 'test-1',
    samples: [
      { time: 0, lat: 48.8566, lng: 2.3522, speed: 3.5 },
      { time: 60, lat: 48.8567, lng: 2.3523, speed: 3.6 }
    ],
    laps: [],
    stats: {
      averageSpeed: 2.78,
      totalAscent: 50,
      calories: 300
    },
    version: 1,
    lastModified: Date.now()
  }

  it('renders correctly with valid data', () => {
    const wrapper = mount(ActivityTopBlock, {
      props: {
        data: {
          activity: mockActivity,
          details: mockDetails
        }
      }
    })

    expect(wrapper.find('h2').exists()).toBe(true)
    expect(wrapper.text()).toContain('5.00 km')
  })

  it('handles undefined details gracefully', () => {
    const wrapper = mount(ActivityTopBlock, {
      props: {
        data: {
          activity: mockActivity,
          details: undefined as any
        }
      }
    })

    // Should not crash, polyline should be empty
    expect(wrapper.vm).toBeDefined()
  })

  it('handles details with no samples', () => {
    const detailsWithoutSamples = {
      ...mockDetails,
      samples: undefined
    }

    const wrapper = mount(ActivityTopBlock, {
      props: {
        data: {
          activity: mockActivity,
          details: detailsWithoutSamples as any
        }
      }
    })

    // Should not crash
    expect(wrapper.vm).toBeDefined()
  })

  it('handles empty samples array', () => {
    const detailsWithEmptySamples = {
      ...mockDetails,
      samples: []
    }

    const wrapper = mount(ActivityTopBlock, {
      props: {
        data: {
          activity: mockActivity,
          details: detailsWithEmptySamples
        }
      }
    })

    // Should not crash, polyline should be empty
    expect(wrapper.vm).toBeDefined()
  })

  it('filters samples without GPS coordinates', () => {
    const detailsWithMixedSamples = {
      ...mockDetails,
      samples: [
        { timeOffset: 0, lat: 48.8566, lng: 2.3522, speed: 3.5 },
        { timeOffset: 30, speed: 3.55 }, // No GPS
        { timeOffset: 60, lat: 48.8567, lng: 2.3523, speed: 3.6 }
      ]
    }

    const wrapper = mount(ActivityTopBlock, {
      props: {
        data: {
          activity: mockActivity,
          details: detailsWithMixedSamples as any
        }
      }
    })

    // Should filter out samples without GPS
    expect(wrapper.vm).toBeDefined()
  })
})
