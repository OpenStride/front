import { describe, it, expect, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ActivityTopBlock from '@plugins/app-extensions/StandardDetails/ActivityTopBlock.vue'
import type { Activity } from '@/types/activity'
import { PLUGIN_CONTEXT_KEY } from '@/composables/usePluginContext'
import { formatQuantity, unitSystem } from '@/composables/useUnits'

vi.mock('@/composables/useSlotExtensions', () => ({
  useSlotExtensions: () => ({ components: { value: [] } })
}))

function mountBlock(fields: Partial<Activity> = {}) {
  const setTitle = vi.fn(async () => undefined)
  const activity = {
    id: 'a1',
    provider: 'garmin',
    type: 'running',
    title: 'Morning Run',
    startTime: 1_700_000_000,
    distance: 10_000,
    duration: 3000,
    version: 1,
    lastModified: 1,
    ...fields
  } as Activity
  const wrapper = mount(ActivityTopBlock, {
    attachTo: document.body,
    props: { data: { activity, details: { id: 'a1', samples: [], version: 1, lastModified: 1 } } },
    global: {
      provide: {
        [PLUGIN_CONTEXT_KEY]: {
          analyzer: { create: () => ({}) },
          units: {
            get system() {
              return unitSystem.value
            },
            format: formatQuantity
          },
          activity: { setTitle },
          photos: { list: async () => [], blob: async () => null, onChanged: () => () => undefined }
        }
      }
    }
  })
  return { wrapper, setTitle }
}

const input = (w: ReturnType<typeof mountBlock>['wrapper']) =>
  w.find('[data-test="title-input"]').element as HTMLInputElement

describe('renaming an outing', () => {
  it('opens on the current name, all of it selected, ready to be typed over', async () => {
    const { wrapper } = mountBlock()
    await wrapper.find('[data-test="title-edit"]').trigger('click')
    await flushPromises()
    const field = input(wrapper)
    expect(field.value).toBe('Morning Run')
    expect(document.activeElement).toBe(field)
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, 'Morning Run'.length])
    wrapper.unmount()
  })

  it('offers the default label when the outing has no name', async () => {
    const { wrapper } = mountBlock({ title: undefined })
    await wrapper.find('[data-test="title-edit"]').trigger('click')
    await flushPromises()
    expect(input(wrapper).value).toBe('Running')
    wrapper.unmount()
  })

  it('saves on Enter and shows the new name at once', async () => {
    const { wrapper, setTitle } = mountBlock()
    await wrapper.find('[data-test="title-edit"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-test="title-input"]').setValue('  Sortie au lac  ')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(setTitle).toHaveBeenCalledWith('a1', 'Sortie au lac')
    expect(wrapper.find('h1').text()).toBe('Sortie au lac')
    wrapper.unmount()
  })

  it('leaves the name as it was on Escape, or when nothing changed', async () => {
    const { wrapper, setTitle } = mountBlock()
    await wrapper.find('[data-test="title-edit"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-test="title-input"]').setValue('Autre chose')
    await wrapper.find('[data-test="title-input"]').trigger('keydown', { key: 'Escape' })
    await flushPromises()
    expect(wrapper.find('h1').text()).toBe('Morning Run')

    await wrapper.find('[data-test="title-edit"]').trigger('click')
    await flushPromises()
    await wrapper.find('form').trigger('submit')
    expect(setTitle).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('offers no pencil on a friend’s outing', () => {
    const { wrapper } = mountBlock({ provider: 'friend_42' })
    expect(wrapper.find('[data-test="title-edit"]').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('the map of a friend’s outing', () => {
  it('falls back to the published track when the shared samples carry no position', () => {
    const wrapper = mount(ActivityTopBlock, {
      props: {
        data: {
          activity: {
            id: 'f1',
            provider: 'friend_42',
            type: 'running',
            startTime: 1_700_000_000,
            distance: 10_000,
            duration: 3000,
            mapPolyline: [
              [45, 4],
              [45.01, 4.01]
            ],
            version: 1,
            lastModified: 1
          } as Activity,
          details: {
            id: 'f1',
            samples: [{ time: 0, heartRate: 140 }],
            version: 1,
            lastModified: 1
          }
        }
      },
      global: {
        stubs: {
          MapPreview: {
            props: ['polyline'],
            template: '<div class="map-stub">{{ polyline.length }}</div>'
          }
        },
        provide: {
          [PLUGIN_CONTEXT_KEY]: {
            analyzer: { create: () => ({ elevationChange: () => ({ ascent: 0, descent: 0 }) }) },
            units: {
              get system() {
                return unitSystem.value
              },
              format: formatQuantity
            },
            activity: {},
            photos: {
              list: async () => [],
              blob: async () => null,
              onChanged: () => () => undefined
            }
          }
        }
      }
    })
    expect(wrapper.find('.map-stub').text()).toBe('2')
  })
})
