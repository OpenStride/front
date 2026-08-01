import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import HomePage from '@/views/HomePage.vue'
import { ActivityFeedService, type FeedActivity } from '@/services/ActivityFeedService'
import en from '@/locales/en.json'
import { createActivity } from '../fixtures/activities'

vi.mock('@/components/ActivityCard.vue', () => ({
  default: { props: ['activity', 'friendUsername'], template: '<div class="stub-card" />' }
}))
vi.mock('@/components/InstallPrompt.vue', () => ({ default: { template: '<div />' } }))
// Pulls in a camera scanner and a QR renderer; its presence is what matters.
vi.mock('@/components/FriendsQuickActions.vue', () => ({
  default: { template: '<div data-test="friends-actions" />' }
}))
vi.mock('@/composables/useSlotExtensions', () => ({
  useSlotExtensions: () => ({ components: { value: [] } })
}))
vi.mock('@/composables/useActivityMetricsIndex', () => ({ useFeedMetricsIndex: () => {} }))
vi.mock('@/services/ActivityService', () => ({
  getActivityService: async () => ({ emitter: new EventTarget() })
}))

const route = { query: {} as Record<string, string> }
vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(() => Promise.resolve()) })
}))

let feed: FeedActivity[] = []
vi.spyOn(ActivityFeedService.prototype, 'loadAllActivities').mockImplementation(async () => [
  ...feed
])

const own = (over: Record<string, unknown> = {}): FeedActivity => ({
  ...createActivity({ id: 'own-1', title: 'Morning Run', type: 'running', ...over }),
  source: 'own'
})

const friend = (over: Record<string, unknown> = {}): FeedActivity => ({
  ...createActivity({ id: 'friend-1', title: 'Club Ride', type: 'cycling', ...over }),
  source: 'friend',
  friendId: 'f1',
  friendUsername: 'alex'
})

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

const render = async () => {
  const wrapper = mount(HomePage, { global: { plugins: [i18n] } })
  await flushPromises()
  return wrapper
}

const cards = (wrapper: Awaited<ReturnType<typeof render>>) => wrapper.findAll('.stub-card')

/**
 * One list where there were two: a feed on `/` and a searchable list on
 * `/my-activities` that showed the same cards in the same order for anyone
 * without friends.
 */
describe('HomePage — the one activity list', () => {
  beforeEach(() => {
    route.query = {}
    feed = []
  })

  describe('an empty list says which kind of empty it is', () => {
    it('offers a way out when nothing has ever been imported', async () => {
      const wrapper = await render()

      expect(wrapper.find('[data-test="activity-empty-state"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="empty-configure"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="all-loaded-message"]').exists()).toBe(false)
    })

    it('says "no results" instead when filters are what emptied it', async () => {
      feed = [own()]
      route.query = { q: 'nothing matches this' }

      const wrapper = await render()

      expect(wrapper.find('[data-test="no-results-message"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="activity-empty-state"]').exists()).toBe(false)
    })
  })

  describe('the search reaches both sides of the merge', () => {
    it('narrows friends’ activities by the same rules as one’s own', async () => {
      feed = [own(), friend()]
      route.query = { q: 'club' }

      const wrapper = await render()

      expect(cards(wrapper)).toHaveLength(1)
      expect(wrapper.find('[data-test="result-count"]').text()).toContain('1')
    })

    it('narrows by sport across both', async () => {
      feed = [own(), friend()]
      route.query = { sport: 'cycling' }

      expect(cards(await render())).toHaveLength(1)
    })
  })

  describe('whose activities', () => {
    // The Friends tab is the only door to adding a friend, so hiding it until
    // you already have one would close the door on the people who need it.
    it('offers the scope tabs even with nobody followed', async () => {
      feed = [own()]
      expect((await render()).find('[data-test="scope-tabs"]').exists()).toBe(true)
    })

    it('shows both sides by default', async () => {
      feed = [own(), friend()]
      expect(cards(await render())).toHaveLength(2)
    })

    it('restores the scope a link was carrying', async () => {
      feed = [own(), friend()]
      route.query = { who: 'own' }

      const wrapper = await render()

      expect(cards(wrapper)).toHaveLength(1)
      expect(wrapper.find('[data-test="scope-own"]').attributes('aria-selected')).toBe('true')
    })

    it('keeps only friends when asked', async () => {
      feed = [own(), friend()]
      route.query = { who: 'friends' }

      expect(cards(await render())).toHaveLength(1)
    })
  })

  describe('paging', () => {
    const many = (n: number) =>
      Array.from({ length: n }, (_, i) => own({ id: `own-${i}`, title: `Run ${i}` }))

    it('shows a first page and keeps the rest for the scroll', async () => {
      feed = many(25)
      const wrapper = await render()

      expect(cards(wrapper)).toHaveLength(10)
      expect(wrapper.find('[data-test="all-loaded-message"]').exists()).toBe(false)
    })

    it('announces the end once everything matching is on screen', async () => {
      feed = many(3)
      const wrapper = await render()

      expect(cards(wrapper)).toHaveLength(3)
      expect(wrapper.find('[data-test="all-loaded-message"]').exists()).toBe(true)
    })
  })

  // `/friends` was a page whose only content was these actions and a feed of
  // the very cards this scope already shows.
  describe('what became of the friends page', () => {
    it('offers its actions under the Friends scope', async () => {
      feed = [own(), friend()]
      route.query = { who: 'friends' }

      expect((await render()).find('[data-test="friends-actions"]').exists()).toBe(true)
    })

    it('keeps them out of the way under the other scopes', async () => {
      feed = [own(), friend()]

      expect((await render()).find('[data-test="friends-actions"]').exists()).toBe(false)
    })

    it('offers them with nobody followed — that is when they are needed', async () => {
      feed = [own()]
      route.query = { who: 'friends' }

      const wrapper = await render()

      expect(wrapper.find('[data-test="friends-actions"]').exists()).toBe(true)
      // Names what is missing rather than repeating the buttons just above it.
      expect(wrapper.find('[data-test="friends-empty"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="activity-empty-state"]').exists()).toBe(false)
    })
  })
})
