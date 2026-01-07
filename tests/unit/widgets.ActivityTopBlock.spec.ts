import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ActivityTopBlock from '@plugins/app-extensions/StandardDetails/ActivityTopBlock.vue'

function makeData() {
  return {
    activity: { id: 'a1', type: 'RUNNING', distance: 5000, duration: 1500, startTime: Math.floor(Date.now()/1000), provider: 'mock' },
    details: { id: 'a1', stats: { totalAscent: 120, averageSpeed: 3, calories: 400 }, samples: [] }
  }
}

describe('ActivityTopBlock widget', () => {
  it('affiche titre (type traduit) et métriques de base', () => {
    const wrapper = mount(ActivityTopBlock, { props: { data: makeData() } })
    expect(wrapper.text()).toMatch(/Course à pied|RUNNING/i)
    expect(wrapper.text()).toContain('5.00 km')
    expect(wrapper.text()).toMatch(/120 m|121 m/) // arrondi
    expect(wrapper.text()).toMatch(/400/) // calories
  })
})
