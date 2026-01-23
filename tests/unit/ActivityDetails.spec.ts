import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'

// Mock MapPreview component to prevent Leaflet/CSS fetch errors
vi.mock('@/components/MapPreview.vue', () => ({
  default: {
    name: 'MapPreview',
    template: '<div class="map-preview-mock"></div>',
    props: ['samples']
  }
}))

// Mock IndexedDBService to avoid real IndexedDB access
vi.mock('@/services/IndexedDBService', () => ({
  IndexedDBService: class {
    static instance: any = null
    static async getInstance() {
      if (!this.instance) {
        this.instance = new this()
      }
      return this.instance
    }
    async getData() { return null }
    async saveData() { }
  }
}))

// Mock ActivityService pour éviter accès IndexedDB
vi.mock('@/services/ActivityService', () => ({
  getActivityService: async () => ({
    getActivity: async () => ({ id: 'test-123', startTime: Date.now(), distance: 1000, type: 'run' }),
    getDetails: async () => ({ id: 'test-123', samples: [] })
  })
}))

// Mock ActivityDBService pour éviter accès IndexedDB (legacy)
vi.mock('@/services/ActivityDBService', () => ({
  getActivityDBService: async () => ({
    getActivity: async () => ({ id: 'test-123', startTime: Date.now() / 1000, distance: 1000, type: 'RUNNING' }),
    getDetails: async () => ({ id: 'test-123', samples: [] })
  })
}))

// Mock analyzer
vi.mock('@/services/ActivityAnalyzer', () => ({
  ActivityAnalyzer: class { constructor() { } sampleAverageByDistance() { return [] } }
}))

describe('ActivityDetails.vue', () => {
  it('monte sans erreur', async () => {
    const ActivityDetails = (await import('@/views/ActivityDetails.vue')).default
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/activity/:activityId', component: ActivityDetails }
      ]
    })
    router.push('/activity/test-123')
    await router.isReady()
    const wrapper = mount(ActivityDetails, {
      global: { plugins: [router], stubs: ['RouterLink'] }
    })
    expect(wrapper.exists()).toBe(true)
  })
})
