import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createRouter, createMemoryHistory } from 'vue-router'
import en from '@/locales/en.json'
import fr from '@/locales/fr.json'
import plugin from '@plugins/app-extensions/MetricTracker/index'

const mocks = vi.hoisted(() => ({ getPluginContext: vi.fn() }))

vi.mock('@/services/PluginContextFactory', () => ({
  getPluginContext: mocks.getPluginContext
}))

const MetricTrackerPanel = (
  await import('@plugins/app-extensions/MetricTracker/components/MetricTrackerPanel.vue')
).default

function makeActivity(id: string, type: string) {
  return {
    id,
    startTime: Date.now(),
    distance: 10000,
    duration: 3000,
    type,
    provider: 'test',
    version: 1,
    lastModified: 1
  }
}

/** Two sports, so the panel has something to offer in its own selector */
const ACTIVITIES = [makeActivity('a', 'running'), makeActivity('b', 'cycling')]

async function mountPanel(props: Record<string, unknown>) {
  const i18n = createI18n({
    legacy: false,
    locale: 'en',
    fallbackLocale: 'en',
    messages: { en, fr }
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div/>' } }]
  })
  await router.push('/metrics')
  await router.isReady()

  const wrapper = mount(MetricTrackerPanel, { props, global: { plugins: [i18n, router] } })
  await vi.waitFor(() => expect(wrapper.find('[data-test="metric-select"]').exists()).toBe(true))
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getPluginContext.mockResolvedValue({
    activity: { getAllActivities: vi.fn(async () => ACTIVITIES), getDetails: vi.fn() },
    storage: { exportDB: vi.fn(async () => []), addItemsToStore: vi.fn(), getData: vi.fn() },
    analyzer: { create: () => ({ bestSegments: () => ({}) }) }
  })
})

describe('metric tracker hosts', () => {
  it('is reachable from the statistics page and from its own route', () => {
    expect(plugin.slots?.['statistics.sections']).toBeDefined()
    expect(plugin.routes?.some(r => r.path === '/metrics')).toBe(true)
  })

  it('no longer claims a navigation entry of its own', () => {
    // Merged into the statistics page: two menu entries for one question was
    // the confusion this removes
    expect(plugin.slots?.['navigation.main']).toBeUndefined()
  })
})

describe('MetricTrackerPanel sport filter', () => {
  it('offers its own sport selector when no host owns one', async () => {
    const wrapper = await mountPanel({ syncUrl: true })

    expect(wrapper.find('[data-test="sport-all"]').exists()).toBe(true)
  })

  it('hides its selector when the host provides the sport', async () => {
    // The statistics page already shows a sport filter above; a second one
    // inside the section would let the page disagree with itself
    const wrapper = await mountPanel({ sport: '' })

    expect(wrapper.find('[data-test="sport-all"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="metric-select"]').exists()).toBe(true)
  })
})
