import { describe, it, expect, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createRouter, createMemoryHistory } from 'vue-router'
import en from '@/locales/en.json'
import { PLUGIN_CONTEXT_KEY } from '@/composables/usePluginContext'
import type { Gear } from '@/types/gear'

const mocks = vi.hoisted(() => ({ getPluginContext: vi.fn() }))
vi.mock('@/services/PluginContextFactory', () => ({ getPluginContext: mocks.getPluginContext }))

const MetricTrackerPanel = (
  await import('@plugins/app-extensions/MetricTracker/components/MetricTrackerPanel.vue')
).default

const run = (id: string, gearIds?: string[], type = 'running') => ({
  id,
  startTime: Date.now() - Number(id.slice(1)) * 86_400_000,
  distance: 10000,
  duration: 3000,
  type,
  provider: 'test',
  version: 1,
  lastModified: 1,
  ...(gearIds ? { gearIds } : {})
})

const gear = (id: string): Gear => ({
  id,
  name: id === 'g1' ? 'Pegasus' : 'Speedgoat',
  kind: 'shoes',
  sports: [],
  activeFrom: 0,
  version: 1,
  lastModified: 1
})

mocks.getPluginContext.mockResolvedValue({
  activity: {
    getAllActivities: vi.fn(async () => [
      run('a1', ['g1']),
      run('a2', ['g2']),
      run('a3'),
      run('a4', ['g2'], 'cycling')
    ]),
    getDetails: vi.fn()
  },
  storage: { exportDB: vi.fn(async () => []), addItemsToStore: vi.fn(), getData: vi.fn() },
  analyzer: { create: () => ({ bestSegments: () => ({}) }) }
})

async function mountPanel(gearList: Gear[]) {
  const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div/>' } }]
  })
  await router.push('/metrics?sport=running')
  await router.isReady()
  const wrapper = mount(MetricTrackerPanel, {
    props: { syncUrl: true },
    global: {
      plugins: [i18n, router],
      provide: {
        [PLUGIN_CONTEXT_KEY]: {
          aggregates: { list: vi.fn(async () => []), onChanged: vi.fn(() => () => undefined) },
          gear: { list: vi.fn(async () => gearList), onChanged: vi.fn(() => () => undefined) }
        }
      }
    }
  })
  await vi.waitFor(() => expect(wrapper.find('[data-test="metric-select"]').exists()).toBe(true))
  await flushPromises()
  return { wrapper, router }
}

describe('metric tracker — gear filter', () => {
  it('offers the gear this sport wore, and keeps the choice in the link', async () => {
    const { wrapper, router } = await mountPanel([gear('g1'), gear('g2')])
    const select = wrapper.find('[data-test="gear-select"]')
    expect(select.findAll('option').map(o => o.text())).toEqual(['All', 'Pegasus', 'Speedgoat'])

    await select.setValue('g2')
    await flushPromises()
    expect(router.currentRoute.value.query.gear).toBe('g2')
  })

  it('stays out of the way with a single gear, or none', async () => {
    const { wrapper } = await mountPanel([gear('g1')])
    expect(wrapper.find('[data-test="gear-select"]').exists()).toBe(false)
  })
})
