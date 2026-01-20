import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createRouter, createMemoryHistory } from 'vue-router'

// Mock extension registry pour ajouter un composant top
vi.mock('@/services/ExtensionPluginRegistry', () => ({
  getPluginViewsForSlot: async (slot: string) => {
    if (slot === 'activity.top') {
      return [{ default: { template: '<div class="inject-top">Injected</div>' } }]
    }
    return []
  }
}))

// Mock DB & analyzer comme dans le test ActivityDetails
vi.mock('@/services/ActivityDBService', () => ({
  getActivityDBService: async () => ({
    getActivity: async () => ({ id: 'abc', startTime: Date.now() / 1000, distance: 1000, type: 'RUNNING' }),
    getDetails: async () => ({ id: 'abc', samples: [] })
  })
}))
vi.mock('@/services/ActivityAnalyzer', () => ({
  ActivityAnalyzer: class { constructor() { } sampleAverageByDistance() { return [] } }
}))

// Mock ActivityDBService singleton pour éviter IndexedDB réel
vi.mock('@/services/ActivityDBService', () => ({
  getActivityDBService: async () => ({
    getActivity: async () => ({ id: 'abc', startTime: Date.now() / 1000, distance: 1000, type: 'RUNNING' }),
    getDetails: async () => ({ id: 'abc', samples: [] })
  })
}))

// Mock ActivityAnalyzer pour ignorer calcul
vi.mock('@/services/ActivityAnalyzer', () => ({
  ActivityAnalyzer: class { constructor() { } sampleAverageByDistance() { return [] } }
}))

describe('Functional scenario: ActivityDetails + extension injection', () => {
  it.skip('rend un composant injecté sur le slot activity.top', async () => {
    const ActivityDetails = (await import('@/views/ActivityDetails.vue')).default
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/activity/:activityId', component: ActivityDetails }]
    })
    router.push('/activity/abc')
    await router.isReady()
    const wrapper = mount(ActivityDetails, { global: { plugins: [router], stubs: ['RouterLink'] } })
    for (let i = 0; i < 6 && !wrapper.find('.inject-top').exists(); i++) {
      await Promise.resolve();
      await nextTick();
    }
    expect(wrapper.find('.inject-top').exists()).toBe(true)
  })
})
