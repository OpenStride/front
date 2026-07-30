import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import MyActivities from '@/views/MyActivities.vue'
import { getActivityService } from '@/services/ActivityService'
import en from '@/locales/en.json'
import { createActivity } from '../fixtures/activities'

vi.mock('@/components/ActivityCard.vue', () => ({
  default: { props: ['activity'], template: '<div class="stub-card" />' }
}))
vi.mock('@/composables/useSlotExtensions', () => ({
  useSlotExtensions: () => ({ components: { value: [] } })
}))
vi.mock('@/composables/useActivityMetricsIndex', () => ({ useFeedMetricsIndex: () => {} }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(() => Promise.resolve()) })
}))

const activityService = {
  emitter: new EventTarget(),
  getActivities: vi.fn(),
  countActivities: vi.fn(),
  getFilterFacets: vi.fn()
}
vi.mock('@/services/ActivityService', () => ({
  getActivityService: vi.fn(),
  ActivityService: class {}
}))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

const render = async () => {
  const wrapper = mount(MyActivities, { global: { plugins: [i18n] } })
  await flushPromises()
  return wrapper
}

/**
 * `/my-activities` is where the router sends a user the moment onboarding
 * completes, so its first frame is the first thing a new account ever sees. It
 * used to fall through to "all activities are loaded" over a blank page: the
 * no-results branch required active filters, and nothing else claimed the case.
 */
describe('MyActivities — an empty list says which kind of empty it is', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(getActivityService as any).mockResolvedValue(activityService)
    activityService.getActivities.mockResolvedValue([])
    activityService.countActivities.mockResolvedValue(0)
    activityService.getFilterFacets.mockResolvedValue({ sports: [], hasDistance: false })
  })

  it('offers a way out when the library is genuinely empty', async () => {
    const wrapper = await render()

    expect(wrapper.find('[data-test="activity-empty-state"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="empty-configure"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="all-loaded-message"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="no-results-message"]').exists()).toBe(false)
  })

  // Adding a friend does not make one's own activity list less empty.
  it('does not offer the friends route from one’s own list', async () => {
    const wrapper = await render()
    expect(wrapper.find('[data-test="empty-friends"]').exists()).toBe(false)
  })

  it('says "no results" instead when filters are what emptied it', async () => {
    const wrapper = await render()

    await wrapper.findComponent({ name: 'ActivityFiltersPanel' }).exists()
    // Go through the filter state the panel writes to, rather than the search
    // input, whose emit is debounced by 300 ms.
    ;(wrapper.vm as any).filters = { sportType: 'swimming' }
    await flushPromises()

    expect(wrapper.find('[data-test="no-results-message"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="activity-empty-state"]').exists()).toBe(false)
  })

  it('shows neither once there is something to list', async () => {
    activityService.getActivities.mockResolvedValue([createActivity({ id: 'a' })])
    activityService.countActivities.mockResolvedValue(1)

    const wrapper = await render()

    expect(wrapper.find('[data-test="activity-empty-state"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="no-results-message"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="all-loaded-message"]').exists()).toBe(true)
  })

  it('reads the panel’s facets from the service instead of the whole library', async () => {
    await render()
    expect(activityService.getFilterFacets).toHaveBeenCalled()
  })
})
