import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { defineComponent, h } from 'vue'
import HomePage from '@/views/HomePage.vue'
import { ActivityFeedService, type FeedActivity } from '@/services/ActivityFeedService'
import en from '@/locales/en.json'
import { createActivity } from '../fixtures/activities'

vi.mock('@/components/ActivityCard.vue', () => ({
  default: {
    props: ['activity', 'friendUsername', 'selectable', 'selected'],
    emits: ['toggle'],
    template:
      '<div class="stub-card" :data-selectable="selectable" :data-selected="selected" @click="$emit(\'toggle\')" />'
  }
}))
vi.mock('@/components/InstallPrompt.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/components/FriendsQuickActions.vue', () => ({ default: { template: '<div />' } }))

/** What an extension contributes: it reads the ids, and says when it is done. */
const BulkStub = defineComponent({
  props: { ids: { type: Array, required: true } },
  emits: ['done'],
  setup(props, { emit }) {
    return () =>
      h(
        'button',
        { class: 'bulk-stub', onClick: () => emit('done') },
        (props.ids as string[]).join(',')
      )
  }
})
let bulk: unknown[] = [BulkStub]
vi.mock('@/composables/useSlotExtensions', () => ({
  useSlotExtensions: (slot: string) => ({
    components: { value: slot === 'activities.bulk' ? bulk : [] }
  })
}))
const metrics = vi.hoisted(() => ({ ascent: new Map<string, number>(), ensureIndex: vi.fn() }))
vi.mock('@/composables/useActivityMetricsIndex', async () => {
  const { ref } = await import('vue')
  const derived = ref(new Map<string, Record<string, number>>())
  return {
    DERIVED: { ascent: 'ascent' },
    useFeedMetricsIndex: () => {},
    useActivityMetricsIndex: () => ({
      derived,
      indexing: ref(false),
      ensureIndex: async (...args: unknown[]) => {
        metrics.ensureIndex(...args)
        derived.value = new Map([...metrics.ascent].map(([id, a]) => [id, { ascent: a }]))
      }
    })
  }
})
const setSport = vi.hoisted(() => vi.fn(async () => undefined))
vi.mock('@/services/ActivityService', () => ({
  getActivityService: async () => ({ emitter: new EventTarget(), setSport })
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

const own = (id: string): FeedActivity => ({
  ...createActivity({ id, type: 'running', startTime: 1_700_000_000 - Number(id.slice(1)) }),
  source: 'own'
})
const friend: FeedActivity = {
  ...createActivity({ id: 'f1', type: 'cycling' }),
  source: 'friend',
  friendId: 'x',
  friendUsername: 'alex'
}

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })
const render = async () => {
  const wrapper = mount(HomePage, { global: { plugins: [i18n] } })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  route.query = {}
  bulk = [BulkStub]
  // More than a page, so "select all" has to reach past what is on screen.
  feed = [...Array.from({ length: 14 }, (_, i) => own(`o${i}`)), friend]
})

describe('HomePage — selection', () => {
  it('offers selection on one’s own outings, extension or not, never on friends’ alone', async () => {
    bulk = []
    const wrapper = await render()
    expect(wrapper.find('[data-test="select-start"]').exists()).toBe(true)

    route.query = { who: 'friends' }
    const friends = await render()
    expect(friends.find('[data-test="select-start"]').exists()).toBe(false)
  })

  it('corrects the sport of the selection, out of the way behind an icon', async () => {
    const wrapper = await render()
    await wrapper.find('[data-test="select-start"]').trigger('click')
    await wrapper.findAll('.stub-card')[0].trigger('click')
    await wrapper.findAll('.stub-card')[1].trigger('click')

    expect(wrapper.find('[data-test="bulk-sport-sheet"]').exists()).toBe(false)
    await wrapper.find('[data-test="bulk-sport-open"]').trigger('click')
    const select = wrapper.find('[data-test="bulk-sport-select"]')
    // The reader's own sports come first
    expect(select.find('optgroup').attributes('label')).toBe(en.feed.select.sportMine)
    await select.setValue('trail_running')
    const reads = vi.mocked(ActivityFeedService.prototype.loadAllActivities).mock.calls.length
    await wrapper.find('[data-test="bulk-sport-sheet"]').trigger('submit')
    await flushPromises()

    expect(setSport).toHaveBeenCalledWith(['o0', 'o1'], 'trail_running')
    expect(wrapper.find('[data-test="select-bar"]').exists()).toBe(false)
    // Read again: the cards change sport, and maybe filter
    expect(vi.mocked(ActivityFeedService.prototype.loadAllActivities).mock.calls.length).toBe(
      reads + 1
    )
  })

  it('toggles own cards, never a friend’s, and hands the ids to the extension', async () => {
    const wrapper = await render()
    await wrapper.find('[data-test="select-start"]').trigger('click')

    const cards = wrapper.findAll('.stub-card')
    expect(cards[0].attributes('data-selectable')).toBe('true')
    await cards[0].trigger('click')
    await cards[2].trigger('click')

    expect(wrapper.find('[data-test="select-bar"]').text()).toContain('2 selected')
    expect(wrapper.find('.bulk-stub').text()).toBe('o0,o2')
  })

  it('selects everything the filters match, scrolled to or not', async () => {
    const wrapper = await render()
    await wrapper.find('[data-test="select-start"]').trigger('click')
    expect(wrapper.find('[data-test="select-all"]').text()).toContain('14')
    await wrapper.find('[data-test="select-all"]').trigger('click')
    expect(wrapper.find('.bulk-stub').text().split(',')).toHaveLength(14)
  })

  it('leaves selection once the action is done', async () => {
    const wrapper = await render()
    await wrapper.find('[data-test="select-start"]').trigger('click')
    await wrapper.findAll('.stub-card')[0].trigger('click')
    await wrapper.find('.bulk-stub').trigger('click')
    expect(wrapper.find('[data-test="select-bar"]').exists()).toBe(false)
    expect(wrapper.findAll('.stub-card')[0].attributes('data-selectable')).toBe('false')
  })

  it('opens ready to pick from a ?select=1 link', async () => {
    route.query = { select: '1' }
    const wrapper = await render()
    expect(wrapper.find('[data-test="select-bar"]').exists()).toBe(true)
  })
})
