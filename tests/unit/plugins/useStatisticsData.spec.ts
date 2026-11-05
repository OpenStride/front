import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import type { Activity } from '@/types/activity'

const store = new Map<string, unknown>()
const activities: Activity[] = []

vi.mock('@/services/PluginContextFactory', () => ({
  getPluginContext: async () => ({
    activity: { getAllActivities: async () => activities },
    storage: {
      getData: async (key: string) => store.get(key) ?? null,
      saveData: async (key: string, value: unknown) => {
        store.set(key, value)
      }
    }
  })
}))

function act(id: string, type: string): Activity {
  return {
    id,
    type,
    provider: 'test',
    startTime: Date.now(),
    distance: 1000,
    duration: 300,
    version: 1,
    lastModified: 1
  } as Activity
}

/** The composable keeps module state, as the page does across visits: reload it per test. */
async function load() {
  vi.resetModules()
  const { useStatisticsData } =
    await import('@plugins/app-extensions/Statistics/composables/useStatisticsData')
  let api!: ReturnType<typeof useStatisticsData>
  const wrapper = mount(
    defineComponent({
      setup() {
        api = useStatisticsData()
        return () => h('div')
      }
    })
  )
  await flushPromises()
  return { api, wrapper }
}

beforeEach(() => {
  store.clear()
  activities.splice(0)
})

describe('useStatisticsData — which sport the page opens on', () => {
  it('opens on the main sport, legacy names merged into the canonical one', async () => {
    activities.push(act('a', 'run'), act('b', 'running'), act('c', 'cycling'))
    const { api } = await load()

    expect(api.selectedSport.value).toBe('running')
    // Running first: it is the group the menu opens with
    expect(api.sportTypes.value).toEqual(['running', 'cycling'])
    expect(api.filteredActivities.value.map(a => a.id)).toEqual(['a', 'b'])
  })

  it('remembers the last choice, "all sports" included, for the next visit', async () => {
    activities.push(act('a', 'running'), act('b', 'running'), act('c', 'cycling'))
    const first = await load()
    first.api.chooseSport('cycling')
    await flushPromises()
    first.wrapper.unmount()

    const second = await load()
    expect(second.api.selectedSport.value).toBe('cycling')

    second.api.chooseSport('')
    await flushPromises()
    second.wrapper.unmount()

    const third = await load()
    expect(third.api.selectedSport.value).toBe('')
  })

  it('falls back to the main sport when the saved one has no activity left', async () => {
    store.set('statistics_selected_sport', { sport: 'swimming' })
    activities.push(act('a', 'running'))
    const { api } = await load()
    await nextTick()

    expect(api.selectedSport.value).toBe('running')
  })
})
