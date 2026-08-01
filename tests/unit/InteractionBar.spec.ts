import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '@/locales/en.json'
import fr from '@/locales/fr.json'

/**
 * A like that cannot happen used to be a disabled button and, at best, a
 * sentence. The reader was told "no" and left there. These tests pin the two
 * ways out — publish your profile, show your QR code — to the state that
 * causes them, so a refactor cannot quietly go back to the dead end.
 */

const state = vi.hoisted(() => ({
  pluginEnabled: true,
  myUserId: null as string | null,
  summary: { likeCount: 0, commentCount: 0, hasLiked: false } as Record<string, unknown>
}))

const service = vi.hoisted(() => ({
  addLike: vi.fn(async () => {}),
  removeLike: vi.fn(async () => {}),
  addComment: vi.fn(async () => {}),
  emitter: new EventTarget()
}))

vi.mock('@/services/AppExtensionPluginManager', () => ({
  AppExtensionPluginManager: {
    getInstance: () => ({ isPluginEnabled: async () => state.pluginEnabled })
  }
}))

vi.mock('@/services/InteractionService', () => ({
  getInteractionService: () => ({
    ...service,
    getMyUserId: async () => state.myUserId,
    getInteractionSummary: async (activityId: string) => ({ activityId, ...state.summary })
  })
}))

vi.mock('@/components/MyQrCodeModal.vue', () => ({
  default: { name: 'MyQrCodeModal', props: ['isOpen'], template: '<div />' }
}))

// onMounted resolves the plugin manager through a dynamic import. Loading that
// module for the first time costs more ticks than flushPromises() waits, so the
// first mounts would read sharingPluginActive as false and render nothing —
// which reads exactly like a broken mock. Warming the registry here removes the
// race: by mount time the import resolves in a single microtask.
await import('@/services/AppExtensionPluginManager')

const InteractionBar = (await import('@/components/InteractionBar.vue')).default

type Props = {
  activityId?: string
  activityOwnerId?: string
  showWarning?: boolean
  isMutualFriend?: boolean
}

async function mountBar(props: Props = {}, locale: 'en' | 'fr' = 'en') {
  const i18n = createI18n({ legacy: false, locale, fallbackLocale: 'en', messages: { en, fr } })
  const wrapper = mount(InteractionBar, {
    props: { activityId: 'act1', activityOwnerId: 'user_camille', ...props },
    global: {
      plugins: [i18n],
      stubs: { RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } }
    }
  })
  await flushPromises()
  return wrapper
}

describe('InteractionBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.pluginEnabled = true
    state.myUserId = null
    state.summary = { likeCount: 0, commentCount: 0, hasLiked: false }
  })

  it('stays out of the way when profile sharing is off', async () => {
    state.pluginEnabled = false

    const wrapper = await mountBar()

    expect(wrapper.find('.interaction-bar').exists()).toBe(false)
  })

  it('keeps the buttons pressable when the like cannot go through', async () => {
    // Disabled, they had nothing to say; pressable, they can answer the press
    const wrapper = await mountBar()

    const like = wrapper.get('[data-test="like-btn"]')
    expect(like.attributes('disabled')).toBeUndefined()
    expect(like.classes()).toContain('blocked')
    expect(wrapper.find('[data-test="interaction-blocked"]').exists()).toBe(false)
  })

  it('answers a blocked like with the missing step: publish', async () => {
    state.myUserId = null

    const wrapper = await mountBar()
    await wrapper.get('[data-test="like-btn"]').trigger('click')

    const blocked = wrapper.get('[data-test="interaction-blocked"]')
    expect(blocked.text()).toContain(en.interactions.publishRequired)
    expect(service.addLike).not.toHaveBeenCalled()

    const action = wrapper.get('[data-test="blocked-action"]')
    expect(action.text()).toContain(en.interactions.publishAction)
    expect(action.attributes('href')).toBe('/profile?tab=friends')
  })

  it('answers a blocked comment with the missing step: be added back', async () => {
    // Published, but the friend has not added us back — nothing to publish,
    // something to show them
    state.myUserId = 'user_me'

    const wrapper = await mountBar({ isMutualFriend: false })
    await wrapper.get('[data-test="comment-btn"]').trigger('click')

    const blocked = wrapper.get('[data-test="interaction-blocked"]')
    expect(blocked.text()).toContain(en.interactions.mutualRequired)
    expect(wrapper.find('.comment-input-section').exists()).toBe(false)

    // The QR code is a modal, not a page: an action, not a link
    const action = wrapper.get('[data-test="blocked-action"]')
    expect(action.element.tagName).toBe('BUTTON')
    expect(action.text()).toContain(en.myQr.title)
  })

  it('speaks the active locale', async () => {
    const wrapper = await mountBar({}, 'fr')
    await wrapper.get('[data-test="like-btn"]').trigger('click')

    expect(wrapper.get('[data-test="interaction-blocked"]').text()).toContain(
      fr.interactions.publishRequired
    )
  })

  it('likes for real once both conditions hold', async () => {
    state.myUserId = 'user_me'

    const wrapper = await mountBar({ isMutualFriend: true })

    const like = wrapper.get('[data-test="like-btn"]')
    expect(like.classes()).not.toContain('blocked')

    await like.trigger('click')
    await flushPromises()

    expect(service.addLike).toHaveBeenCalledWith('act1', 'user_camille')
    expect(wrapper.find('[data-test="interaction-blocked"]').exists()).toBe(false)
  })

  it('opens the comment box instead of explaining, when there is nothing to explain', async () => {
    state.myUserId = 'user_me'

    const wrapper = await mountBar({ isMutualFriend: true })
    await wrapper.get('[data-test="comment-btn"]').trigger('click')

    expect(wrapper.find('.comment-input-section').exists()).toBe(true)
  })

  it('offers no actions on your own activity, only the counts', async () => {
    state.myUserId = 'user_me'
    state.summary = { likeCount: 3, commentCount: 1, hasLiked: false }

    const wrapper = await mountBar({ activityOwnerId: 'user_me' })

    expect(wrapper.find('[data-test="like-btn"]').exists()).toBe(false)
    expect(wrapper.get('.like-counter').text()).toContain('3')
    expect(wrapper.get('.comment-counter').text()).toContain('1')
  })

  it('hides an empty bar on your own activity', async () => {
    state.myUserId = 'user_me'

    const wrapper = await mountBar({ activityOwnerId: 'user_me' })

    expect(wrapper.find('.interaction-bar').exists()).toBe(false)
  })
})
