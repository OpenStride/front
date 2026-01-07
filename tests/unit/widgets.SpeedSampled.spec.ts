import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import SpeedSampled from '@plugins/app-extensions/StandardDetails/SpeedSampled.vue'

// Mock Analyzer + IndexedDB
vi.mock('@/services/ActivityAnalyzer', () => ({
  ActivityAnalyzer: class { constructor() {} sampleAverageByDistance() { return [ { distance: 1000, speed: 3, heartRate: 150 } ] } sampleByLaps(){return []} sampleBySlopeChange(){return []} }
}))
vi.mock('@/services/IndexedDBService', () => ({
  getIndexedDBService: async () => ({ saveData: async () => {}, getData: async () => null })
}))
vi.mock('@/services/ActivityAnalyzer', () => ({
  ActivityAnalyzer: class { constructor() {} sampleAverageByDistance() { return [ { distance: 1000, speed: 3, heartRate: 150 } ] } sampleByLaps(){return []} sampleBySlopeChange(){return []} }
}))
describe('SpeedSampled widget', () => {
  it('rend le tableau récapitulatif avec une ligne', async () => {
    const data = { activity: { id: 'a1', distance: 5000, provider: 'mock', startTime: 0, duration: 0, type: 'RUNNING' }, details: { id: 'a1', samples: [], laps: [] } }
    const wrapper = mount(SpeedSampled, { props: { data } })
    // attendre onMounted
    await Promise.resolve();
  expect(wrapper.text()).toMatch(/Allure/i)
  // Vérifie colonnes header (Dist., Pace, FC, Pente)
  expect(wrapper.text()).toMatch(/Dist\./)
  expect(wrapper.text()).toMatch(/Pace/i)
  })
})
