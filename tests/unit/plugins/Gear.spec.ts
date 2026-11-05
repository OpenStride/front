import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ActivityGear from '@plugins/app-extensions/Gear/ActivityGear.vue'
import GearTab from '@plugins/app-extensions/Gear/GearTab.vue'
import GearPlugin from '@plugins/app-extensions/Gear/index'
import {
  convertQuantity,
  formatQuantity,
  setUnitSystem,
  toSI,
  unitSystem
} from '@/composables/useUnits'
import type { Activity } from '@/types/activity'
import type { Gear, GearInput } from '@/types/gear'
import type { SlotContext, SlotEntry } from '@/types/extension'

const day = (iso: string) => new Date(`${iso}T12:00:00`).getTime()

function gear(id: string, fields: Partial<Gear> = {}): Gear {
  return {
    id,
    name: id,
    kind: 'shoes',
    sports: ['running'],
    activeFrom: day('2026-01-01'),
    alertDistance: 700_000,
    version: 1,
    lastModified: 1,
    ...fields
  }
}

function run(id: string, fields: Partial<Activity> = {}): Activity {
  return {
    id,
    provider: 'garmin',
    type: 'running',
    startTime: day('2026-03-01'),
    distance: 10_000,
    duration: 3_000,
    version: 1,
    lastModified: 1,
    ...fields
  } as Activity
}

function context(gearList: Gear[], activities: Activity[]) {
  const store = new Map(activities.map(a => [a.id, a]))
  return {
    units: {
      get system() {
        return unitSystem.value
      },
      format: formatQuantity,
      convert: convertQuantity,
      toSI
    },
    gear: {
      list: vi.fn(async () => gearList),
      create: vi.fn(async (_input: GearInput) => gearList[0]),
      update: vi.fn(async () => null),
      remove: vi.fn(async () => true),
      onChanged: vi.fn(() => () => {})
    },
    activity: {
      getAllActivities: vi.fn(async () => [...store.values()]),
      getActivity: vi.fn(async (id: string) => store.get(id)),
      setGear: vi.fn(async (ids: string[], gearIds: string[] | null) => {
        for (const id of ids) {
          const { gearIds: _old, ...rest } = store.get(id)!
          store.set(id, gearIds === null ? rest : { ...rest, gearIds, gearSetAt: 1 })
        }
      })
    }
  }
}

beforeEach(() => {
  setUnitSystem('metric')
})

describe('Gear plugin slot', () => {
  const entry = (GearPlugin.slots!['activity.top'] as SlotEntry[])[0]
  const applies = (ctx: SlotContext) => entry.appliesTo!(ctx)

  it('stays off a friend’s outing', () => {
    expect(applies({ activity: run('a') })).toBe(true)
    expect(applies({ activity: run('a', { provider: 'friend_42' }) })).toBe(false)
  })
})

describe('ActivityGear.vue', () => {
  const mountOn = (ctx: ReturnType<typeof context>, activity: Activity) =>
    mount(ActivityGear, {
      props: { data: { activity } },
      global: { provide: { pluginContext: ctx } }
    })

  it('renders nothing for a reader without gear', async () => {
    const wrapper = mountOn(context([], [run('a')]), run('a'))
    await flushPromises()
    expect(wrapper.find('[data-test="activity-gear"]').exists()).toBe(false)
  })

  it('shows the default gear with its wear, in orange past 80 %', async () => {
    const shoes = gear('Pegasus', { initialDistance: 560_000 })
    const wrapper = mountOn(context([shoes], [run('a')]), run('a'))
    await flushPromises()
    const chip = wrapper.find('[data-test="gear-chip"]')
    expect(chip.text()).toContain('Pegasus')
    expect(chip.text()).toContain('570 km')
    expect(wrapper.find('.ag__alert').text()).toContain('replace soon')
    expect(chip.classes()).toContain('is-warn')
    expect(wrapper.text()).toContain('default')
  })

  it('turns red past the limit', async () => {
    const shoes = gear('Pegasus', { initialDistance: 700_000 })
    const wrapper = mountOn(context([shoes], [run('a')]), run('a'))
    await flushPromises()
    expect(wrapper.find('[data-test="gear-chip"]').classes()).toContain('is-over')
  })

  it('saves the picked gear on the activity', async () => {
    const ctx = context([gear('road'), gear('trail', { sports: [] })], [run('a')])
    const wrapper = mountOn(ctx, run('a'))
    await flushPromises()

    await wrapper.find('[data-test="gear-edit"]').trigger('click')
    const boxes = wrapper.findAll('[data-test="gear-panel"] input[type="checkbox"]')
    await boxes[0].setValue(false)
    await boxes[1].setValue(true)
    await wrapper.find('[data-test="gear-panel"]').trigger('submit')
    await flushPromises()

    expect(ctx.activity.setGear).toHaveBeenCalledWith(['a'], ['trail'])
    expect(wrapper.find('[data-test="gear-chip"]').text()).toContain('trail')
    expect(wrapper.find('[data-test="gear-panel"]').exists()).toBe(false)
  })

  it('goes back to the default', async () => {
    const ctx = context([gear('road')], [run('a', { gearIds: [] })])
    const wrapper = mountOn(ctx, run('a', { gearIds: [] }))
    await flushPromises()
    expect(wrapper.find('[data-test="gear-chip"]').exists()).toBe(false)

    await wrapper.find('[data-test="gear-edit"]').trigger('click')
    await wrapper.find('[data-test="gear-reset"]').trigger('click')
    await flushPromises()

    expect(ctx.activity.setGear).toHaveBeenCalledWith(['a'], null)
    expect(wrapper.find('[data-test="gear-chip"]').text()).toContain('road')
  })
})

describe('GearTab.vue', () => {
  const mountTab = (ctx: ReturnType<typeof context>) =>
    mount(GearTab, { global: { provide: { pluginContext: ctx } } })

  it('lists the gear with its usage', async () => {
    const ctx = context([gear('Pegasus')], [run('a'), run('b')])
    const wrapper = mountTab(ctx)
    await flushPromises()
    const card = wrapper.find('[data-test="gear-card"]')
    expect(card.text()).toContain('Pegasus')
    expect(card.text()).toContain('20')
    expect(card.text()).toContain('2 outings')
  })

  it('creates shoes defaulting to the running sports the reader does, with a 700 km alert', async () => {
    const ctx = context(
      [],
      [run('a'), run('b', { type: 'trail_running' }), run('c', { type: 'cycling' })]
    )
    const wrapper = mountTab(ctx)
    await flushPromises()

    await wrapper.find('[data-test="gear-add"]').trigger('click')
    await wrapper.find('[data-test="gear-name"]').setValue('Speedgoat')
    expect(
      (wrapper.find('[data-test="gear-alert-distance"]').element as HTMLInputElement).value
    ).toBe('700')
    await wrapper.find('[data-test="gear-form"]').trigger('submit')
    await flushPromises()

    const input = ctx.gear.create.mock.calls[0]![0]
    expect(input).toMatchObject({ name: 'Speedgoat', kind: 'shoes', alertDistance: 700_000 })
    expect([...input.sports].sort()).toEqual(['running', 'trail_running'])
  })

  it('stores the alert in metres when the reader reads miles', async () => {
    setUnitSystem('imperial')
    const ctx = context([], [run('a')])
    const wrapper = mountTab(ctx)
    await flushPromises()
    await wrapper.find('[data-test="gear-add"]').trigger('click')
    await wrapper.find('[data-test="gear-name"]').setValue('Bike')
    await wrapper.find('[data-test="gear-alert-distance"]').setValue('100')
    await wrapper.find('[data-test="gear-form"]').trigger('submit')
    await flushPromises()
    expect(ctx.gear.create.mock.calls[0]![0].alertDistance).toBeCloseTo(160_934, 0)
  })
})
