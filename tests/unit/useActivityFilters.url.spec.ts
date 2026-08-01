import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import {
  useActivityFilters,
  filtersFromQuery,
  filtersToQuery
} from '@/composables/useActivityFilters'
import type { LocationQuery } from 'vue-router'

type Navigation = { query: Record<string, string> }

const route = { query: {} as LocationQuery }
const replace = vi.fn((_to: Navigation) => Promise.resolve())

vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ replace })
}))

/** Mount the composable in a component, the only place it can run. */
const host = () => {
  let api!: ReturnType<typeof useActivityFilters>
  const wrapper = mount(
    defineComponent({
      setup() {
        api = useActivityFilters()
        return () => null
      }
    })
  )
  return { wrapper, api }
}

const lastQuery = () => replace.mock.calls.at(-1)?.[0].query

/**
 * A filtered list used to live and die with the component: opening an activity
 * and coming back reset it, and the view could not be shared or bookmarked.
 */
describe('useActivityFilters — the link is the filter state', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    route.query = {}
  })

  it('starts from what the link was carrying', () => {
    route.query = { q: 'trail', sport: 'running', durMin: '1800' }
    const { api } = host()

    expect(api.filters.value.text).toBe('trail')
    expect(api.filters.value.sportType).toBe('running')
    expect(api.filters.value.durationMin).toBe(1800)
    expect(api.hasActiveFilters.value).toBe(true)
  })

  it('writes a filter back to the query', async () => {
    const { api } = host()
    api.setTextFilter('col du')
    await nextTick()
    await flushPromises()

    expect(lastQuery()).toEqual({ q: 'col du' })
  })

  it('leaves the URL clean when nothing is filtered', async () => {
    route.query = { q: 'trail' }
    const { api } = host()
    api.resetFilters()
    await nextTick()
    await flushPromises()

    expect(lastQuery()).toEqual({})
  })

  // `replace`, not `push`: narrowing a list is not a step the back button
  // should have to walk through one keystroke at a time.
  it('replaces rather than stacking history entries', async () => {
    const { api } = host()
    api.setTextFilter('a')
    await nextTick()
    api.setTextFilter('ab')
    await nextTick()
    await flushPromises()

    expect(replace).toHaveBeenCalledTimes(2)
  })

  it('does not rewrite a query that already says the same thing', async () => {
    route.query = { q: 'trail' }
    host()
    await nextTick()
    await flushPromises()

    expect(replace).not.toHaveBeenCalled()
  })

  describe('what a link carries', () => {
    // SI, so the link survives the reader's unit preference — "5" would mean
    // five kilometres to one reader and five miles to the next.
    it('carries distances in metres', () => {
      expect(filtersToQuery({ distanceMin: 5000 })).toEqual({ distMin: '5000' })
    })

    it('carries dates as a legible day', () => {
      const at = new Date(2026, 2, 1, 9, 30).getTime()
      expect(filtersToQuery({ dateFrom: at })).toEqual({ from: '2026-03-01' })
    })

    it('round-trips a full set of filters', () => {
      const filters = {
        text: 'col',
        sportType: 'cycling',
        distanceMin: 5000,
        distanceMax: 90000,
        dateFrom: new Date(2026, 0, 1, 0, 0, 0, 0).getTime(),
        dateTo: new Date(2026, 2, 31, 23, 59, 59, 999).getTime(),
        durationMin: 1800,
        durationMax: 14400
      }
      expect(filtersFromQuery(filtersToQuery(filters) as LocationQuery)).toMatchObject(filters)
    })

    it('ignores a day that is not one', () => {
      expect(filtersFromQuery({ from: 'last-tuesday' }).dateFrom).toBeUndefined()
    })

    it('ignores a range bound that is not a number', () => {
      expect(filtersFromQuery({ distMin: 'far' }).distanceMin).toBeUndefined()
    })
  })

  describe('the badge counts questions, not boxes', () => {
    it('counts a two-ended range once', () => {
      route.query = { durMin: '600', durMax: '3600' }
      expect(host().api.activeFilterCount.value).toBe(1)
    })

    it('counts each range separately', () => {
      route.query = { durMin: '600', from: '2026-01-01', sport: 'running' }
      expect(host().api.activeFilterCount.value).toBe(3)
    })
  })
})
