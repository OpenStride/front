import { describe, it, expect, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'

/**
 * A plugin's component, registered on `activity.top`, appears on the activity
 * page — the whole point of the slot system, end to end through the view.
 */

// The registry already resolves loaders to components (see the contracts)
vi.mock('@/services/ExtensionPluginRegistry', () => ({
  allAppPlugins: [],
  getPluginViewsForSlot: async (slot: string) =>
    slot === 'activity.top' ? [{ template: '<div class="inject-top">Injected</div>' }] : []
}))

vi.mock('@/services/IndexedDBService', () => ({
  IndexedDBService: {
    getInstance: async () => ({
      getData: async () => null,
      saveData: async () => undefined,
      getDataFromStore: async () => null,
      getAllData: async () => []
    })
  }
}))

vi.mock('@/services/ActivityService', () => ({
  getActivityService: async () => ({
    getActivity: async () => ({
      id: 'abc',
      startTime: 1_772_000_000,
      distance: 10_000,
      duration: 3000,
      type: 'running',
      provider: 'test',
      version: 1,
      lastModified: 1
    }),
    getDetails: async () => ({ id: 'abc', samples: [], version: 1, lastModified: 1 })
  })
}))

describe('Functional scenario: ActivityDetails + extension injection', () => {
  it('rend un composant injecté sur le slot activity.top', async () => {
    const ActivityDetails = (await import('@/views/ActivityDetails.vue')).default
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/activity/:activityId', component: ActivityDetails }]
    })
    router.push('/activity/abc')
    await router.isReady()
    const wrapper = mount(ActivityDetails, { global: { plugins: [router], stubs: ['RouterLink'] } })

    await vi.waitFor(async () => {
      await flushPromises()
      expect(wrapper.find('.inject-top').exists()).toBe(true)
    })
  })
})
