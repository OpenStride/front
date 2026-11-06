import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ActivityGear from '@plugins/app-extensions/Gear/ActivityGear.vue'
import GearTab from '@plugins/app-extensions/Gear/GearTab.vue'
import GearBulkAction from '@plugins/app-extensions/Gear/GearBulkAction.vue'
import GearStatsCard from '@plugins/app-extensions/Gear/GearStatsCard.vue'
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

describe('GearBulkAction.vue', () => {
  const mountBulk = (ctx: ReturnType<typeof context>, ids: string[]) =>
    mount(GearBulkAction, { props: { ids }, global: { provide: { pluginContext: ctx } } })

  it('puts the picked shoes on every outing, keeping their bike, in one write per result', async () => {
    const road = gear('road')
    const trail = gear('trail', { sports: [] })
    const bike = gear('bike', { kind: 'bike', sports: ['running'] })
    const ctx = context([road, trail, bike], [run('a'), run('b'), run('c', { gearIds: [] })])
    const wrapper = mountBulk(ctx, ['a', 'b', 'c'])
    await flushPromises()

    await wrapper.find('[data-test="gear-bulk-open"]').trigger('click')
    const boxes = wrapper.findAll('[data-test="gear-bulk-sheet"] input[type="checkbox"]')
    await boxes.find(b => (b.element as HTMLInputElement).value === 'trail')!.setValue(true)
    await wrapper.find('[data-test="gear-bulk-sheet"]').trigger('submit')
    await flushPromises()

    expect(ctx.activity.setGear).toHaveBeenCalledTimes(2)
    expect(ctx.activity.setGear).toHaveBeenCalledWith(['a', 'b'], ['bike', 'trail'])
    expect(ctx.activity.setGear).toHaveBeenCalledWith(['c'], ['trail'])
    expect(ctx.notifications.notify).toHaveBeenCalledWith('3 outings changed', { type: 'success' })
    expect(wrapper.emitted('done')).toHaveLength(1)
  })

  it('sends the whole selection back to the default', async () => {
    const ctx = context([gear('road')], [run('a', { gearIds: [] })])
    const wrapper = mountBulk(ctx, ['a'])
    await flushPromises()
    await wrapper.find('[data-test="gear-bulk-open"]').trigger('click')
    await wrapper.find('[data-test="gear-bulk-default"]').trigger('click')
    await flushPromises()
    expect(ctx.activity.setGear).toHaveBeenCalledWith(['a'], null)
  })

  it('stays out of the bar for a reader without gear', async () => {
    const wrapper = mountBulk(context([], []), ['a'])
    await flushPromises()
    expect(wrapper.find('[data-test="gear-bulk-open"]').exists()).toBe(false)
  })
})

describe('GearStatsCard.vue', () => {
  const mountCard = (ctx: ReturnType<typeof context>, sport?: string) =>
    mount(GearStatsCard, {
      props: { sport },
      global: { provide: { pluginContext: ctx }, stubs: { RouterLink: true } }
    })

  const road = gear('road', { initialDistance: 100_000 })
  const worn = gear('worn', { sports: [], initialDistance: 650_000 })
  const bike = gear('bike', { kind: 'bike', sports: ['cycling'], alertDistance: undefined })
  const acts = [run('a'), run('b', { gearIds: ['worn'] }), run('c', { type: 'cycling' })]

  it('lists gear in use, the most worn first', async () => {
    const wrapper = mountCard(context([road, worn, bike], acts))
    await flushPromises()
    const names = wrapper.findAll('.gsc__name').map(n => n.text())
    expect(names).toEqual(['worn', 'road', 'bike'])
    expect(wrapper.find('.gsc__row.is-warn').text()).toContain('worn')
  })

  it('follows the dashboard’s sport', async () => {
    const wrapper = mountCard(context([road, worn, bike], acts), 'cycling')
    await flushPromises()
    expect(wrapper.findAll('.gsc__name').map(n => n.text())).toEqual(['bike'])
  })

  it('renders nothing for a reader whose gear has not been out yet', async () => {
    const wrapper = mountCard(context([gear('new', { activeFrom: day('2027-01-01') })], acts))
    await flushPromises()
    expect(wrapper.find('[data-test="gear-stats"]').exists()).toBe(false)
  })
})
