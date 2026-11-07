import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ActivityGear from '@plugins/app-extensions/Gear/ActivityGear.vue'
import GearTab from '@plugins/app-extensions/Gear/GearTab.vue'
import GearAssign from '@plugins/app-extensions/Gear/GearAssign.vue'
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

const ascents = vi.hoisted(() => new Map<string, number>())
vi.mock('@/composables/useActivityMetricsIndex', async () => {
  const { ref } = await import('vue')
  const derived = ref(new Map<string, Record<string, number>>())
  return {
    DERIVED: { ascent: 'ascent' },
    useActivityMetricsIndex: () => ({
      derived,
      ensureIndex: async () => {
        derived.value = new Map([...ascents].map(([id, a]) => [id, { ascent: a }]))
      }
    })
  }
})

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
    notifications: { notify: vi.fn() },
    storage: {
      settings: {} as Record<string, unknown>,
      getData: vi.fn(async function (this: { settings: Record<string, unknown> }, key: string) {
        return this.settings[key]
      }),
      saveData: vi.fn(async function (
        this: { settings: Record<string, unknown> },
        key: string,
        value: unknown
      ) {
        this.settings[key] = value
      })
    },
    activity: {
      getAllActivities: vi.fn(async () => [...store.values()]),
      getActivity: vi.fn(async (id: string) => store.get(id)),
      setSport: vi.fn(async () => undefined),
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
  const entry = (GearPlugin.slots!['activity.summary'] as SlotEntry[])[0]
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
    // Said in the colour, and to a screen reader — no sentence on screen
    expect(chip.find('.ag__sr').text()).toContain('replace soon')
    expect(wrapper.find('.ag__alert').exists()).toBe(false)
    expect(chip.classes()).toContain('is-warn')
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
    mount(GearTab, { global: { provide: { pluginContext: ctx }, stubs: { RouterLink: true } } })

  it('lists the gear with its usage', async () => {
    const ctx = context([gear('Pegasus')], [run('a'), run('b')])
    const wrapper = mountTab(ctx)
    await flushPromises()
    const card = wrapper.find('[data-test="gear-card"]')
    expect(card.text()).toContain('Pegasus')
    expect(card.text()).toContain('20')
    expect(card.text()).toContain('2 outings')
  })

  const runner = () =>
    context(
      [],
      [
        run('a'),
        run('b', { type: 'treadmill_running' }),
        run('c', { type: 'trail_running' }),
        run('d', { type: 'cycling' })
      ]
    )

  it('makes new shoes road shoes: the road sports the reader does, not trail, 700 km', async () => {
    const ctx = runner()
    const wrapper = mountTab(ctx)
    await flushPromises()

    await wrapper.find('[data-test="gear-add"]').trigger('click')
    await wrapper.find('[data-test="gear-name"]').setValue('Pegasus')
    expect(
      (wrapper.find('[data-test="gear-alert-distance"]').element as HTMLInputElement).value
    ).toBe('700')
    await wrapper.find('[data-test="gear-form"]').trigger('submit')
    await flushPromises()

    const input = ctx.gear.create.mock.calls[0]![0]
    expect(input).toMatchObject({ name: 'Pegasus', kind: 'shoes', alertDistance: 700_000 })
    expect([...input.sports].sort()).toEqual(['running', 'treadmill_running'])
  })

  it('makes trail shoes the default for trail alone', async () => {
    const ctx = runner()
    const wrapper = mountTab(ctx)
    await flushPromises()

    await wrapper.find('[data-test="gear-add"]').trigger('click')
    await wrapper.find('[data-test="gear-name"]').setValue('Speedgoat')
    await wrapper.find('[data-test="gear-terrain-trail"] input').setValue(true)
    await wrapper.find('[data-test="gear-form"]').trigger('submit')
    await flushPromises()

    expect(ctx.gear.create.mock.calls[0]![0].sports).toEqual(['trail_running'])
  })

  it('offers trail to a reader who has not run a trail yet', async () => {
    const ctx = context([], [run('a')])
    const wrapper = mountTab(ctx)
    await flushPromises()

    await wrapper.find('[data-test="gear-add"]').trigger('click')
    expect(wrapper.find('[data-test="gear-sport-trail_running"]').exists()).toBe(false)
    await wrapper.find('[data-test="gear-terrain-trail"] input').setValue(true)
    expect(wrapper.find('[data-test="gear-sport-trail_running"]').classes()).toContain('is-on')
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

describe('GearAssign.vue — put a gear on past outings, from the profile', () => {
  const trail = gear('trail', { sports: ['trail_running'], activeFrom: day('2026-01-01') })
  const road = gear('road', { activeFrom: day('2026-01-01') })
  const bike = gear('bike', { kind: 'bike', sports: ['running'] })
  const outings = [
    run('hill', { distance: 10_000, startTime: day('2026-03-01') }),
    run('flat', { distance: 10_000, startTime: day('2026-03-02') }),
    run('real-trail', { type: 'trail_running', distance: 10_000, startTime: day('2026-03-03') }),
    run('ride', { type: 'cycling', distance: 40_000, startTime: day('2026-03-04') }),
    run('before', { distance: 10_000, startTime: day('2025-12-01') })
  ]

  const mountAssign = (ctx: ReturnType<typeof context>) =>
    mount(GearAssign, {
      props: { target: trail, gear: [trail, road, bike], activities: outings },
      global: { provide: { pluginContext: ctx } }
    })

  const titlesOf = (wrapper: ReturnType<typeof mountAssign>) =>
    wrapper.findAll('.ga__row input').map(i => (i.element as HTMLInputElement).value)

  it('starts on all running since the gear went into service, trail included', async () => {
    const wrapper = mountAssign(context([trail, road, bike], outings))
    await flushPromises()
    expect(titlesOf(wrapper)).toEqual(['real-trail', 'flat', 'hill'])
  })

  it('narrows to the climb that tells a trail from a road run', async () => {
    ascents.set('hill', 400) // 40 m/km
    ascents.set('flat', 50)
    ascents.set('real-trail', 600)
    const wrapper = mountAssign(context([trail, road, bike], outings))
    await flushPromises()
    await wrapper.find('[data-test="assign-climb"]').setValue('25')
    expect(titlesOf(wrapper)).toEqual(['real-trail', 'hill'])
  })

  it('puts the gear on, keeping the bike, and files the runs as trails when asked', async () => {
    ascents.set('hill', 400)
    ascents.set('real-trail', 600)
    const ctx = context([trail, road, bike], outings)
    const wrapper = mountAssign(ctx)
    await flushPromises()
    await wrapper.find('[data-test="assign-climb"]').setValue('25')
    await wrapper.find('[data-test="assign-all"]').trigger('click')

    const retype = wrapper.find('[data-test="assign-retype"]')
    expect(retype.text()).toContain('1')
    await retype.find('input').setValue(true)
    await wrapper.find('[data-test="assign-apply"]').trigger('click')
    await flushPromises()

    expect(ctx.activity.setSport).toHaveBeenCalledWith(['hill'], 'trail_running')
    // hill: its default road shoes give way to the trail pair, its bike stays;
    // real-trail already wore the trail pair by default, and now by choice
    expect(ctx.activity.setGear).toHaveBeenCalledWith(['hill'], ['bike', 'trail'])
    expect(ctx.activity.setGear).toHaveBeenCalledWith(['real-trail'], ['trail'])
    expect(wrapper.emitted('done')).toHaveLength(1)
  })

  it('leaves the sport alone unless asked', async () => {
    const ctx = context([trail, road, bike], outings)
    const wrapper = mountAssign(ctx)
    await flushPromises()
    await wrapper.find('.ga__row input').setValue(true)
    await wrapper.find('[data-test="assign-apply"]').trigger('click')
    await flushPromises()
    expect(ctx.activity.setSport).not.toHaveBeenCalled()
  })
})
