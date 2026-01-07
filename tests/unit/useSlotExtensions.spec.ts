import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'

// Mock ciblé du registry pour contrôler les composants retournés
vi.mock('@/services/ExtensionPluginRegistry', () => ({
  getPluginViewsForSlot: async (slot: string) => {
    if (slot !== 'activity.widgets') return []
    return [
      { default: { name: 'MockA', template: '<div class="mock-a">A</div>' } },
      { default: { name: 'MockB', template: '<div class="mock-b">B</div>' } }
    ]
  }
}))

import { useSlotExtensions } from '@/composables/useSlotExtensions'

const Host = defineComponent({
  setup() {
    const { components } = useSlotExtensions('activity.widgets')
    return () => h('section', components.value.map((c: any, i: number) => h(c.default || c, { 'data-idx': i })))
  }
})

describe('useSlotExtensions', () => {
  it('charge et rend les composants dynamiques', async () => {
    const wrapper = mount(Host)
    // flush onMounted + async import
    await Promise.resolve()
    await nextTick()
    await Promise.resolve()
    expect(wrapper.findAll('[data-idx]').length).toBe(2)
    expect(wrapper.find('.mock-a').exists()).toBe(true)
    expect(wrapper.find('.mock-b').exists()).toBe(true)
  })
})
