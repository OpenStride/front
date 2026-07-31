import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import ProfileSharingTab from '@plugins/app-extensions/ProfileSharing/ProfileSharingTab.vue'
import { PLUGIN_CONTEXT_KEY } from '@/composables/usePluginContext'
import fr from '@/locales/fr.json'
import en from '@/locales/en.json'

function contextWith(summary: { activityCount: number; publishedAt: number | null }) {
  return {
    storage: { getData: async () => 'private', saveData: async () => {} },
    notifications: { notify: vi.fn() },
    friends: {
      getMyPublicUrl: async () => 'https://drive.example.test/uc?id=ABC',
      canPublish: async () => true,
      isAutoPublishEnabled: async () => false,
      setAutoPublish: vi.fn(),
      publishPublicData: vi.fn(),
      getPublicSummary: async () => summary
    }
  }
}

async function mountWith(
  summary: { activityCount: number; publishedAt: number | null },
  locale: 'fr' | 'en' = 'fr'
) {
  const i18n = createI18n({ legacy: false, locale, messages: { fr, en } })
  const wrapper = mount(ProfileSharingTab, {
    global: {
      plugins: [i18n],
      provide: { [PLUGIN_CONTEXT_KEY]: contextWith(summary) },
      stubs: { MyQrCodeModal: true, RouterLink: true }
    }
  })
  await new Promise(r => setTimeout(r, 0))
  await wrapper.vm.$nextTick()
  return wrapper
}

describe('ProfileSharingTab.vue', () => {
  /**
   * A 256px QR canvas used to open this section, and the same code — same
   * component, same link, same copy button — sat one tap away behind "My QR
   * code". The section is about the state of the profile; sharing it is an
   * occasional act and belongs behind the button that already existed.
   */
  it('does not render a second copy of the QR code inline', async () => {
    const wrapper = await mountWith({ activityCount: 4, publishedAt: Date.now() })
    expect(wrapper.find('canvas').exists()).toBe(false)
    expect(wrapper.find('[data-test="show-my-qr"]').exists()).toBe(true)
  })

  /**
   * `defaultPrivacy` ships as `private`, so publishing without touching it
   * produces a profile a friend can follow and find empty. The screen showed a
   * QR code to share it and never mentioned that it contained nothing.
   */
  it('says so when a published profile contains nothing', async () => {
    const wrapper = await mountWith({ activityCount: 0, publishedAt: Date.now() })
    expect(wrapper.find('[data-test="nothing-shared"]').exists()).toBe(true)
    expect(wrapper.text()).toContain(fr.profile.nothingShared)
  })

  it('stays quiet once something is actually shared', async () => {
    const wrapper = await mountWith({ activityCount: 4, publishedAt: Date.now() })
    expect(wrapper.find('[data-test="nothing-shared"]').exists()).toBe(false)
  })

  it('counts in the singular for one activity, plural otherwise', async () => {
    expect((await mountWith({ activityCount: 1, publishedAt: null })).text()).toContain(
      '1 activité partagée'
    )
    const many = (await mountWith({ activityCount: 4, publishedAt: null })).text()
    expect(many).toContain('4 activités partagées')
    // Zero takes the plural in French, and must not leak the raw `a | b` source
    const none = (await mountWith({ activityCount: 0, publishedAt: null })).text()
    expect(none).toContain('0 activités partagées')
    expect(none).not.toContain('|')
  })

  /** Unknown is not never: a profile published before the timestamp existed. */
  it('omits the publication date when it was never recorded', async () => {
    const wrapper = await mountWith({ activityCount: 2, publishedAt: null })
    expect(wrapper.text()).not.toContain('Publié')
  })

  for (const locale of ['fr', 'en'] as const) {
    it(`resolves every key it renders in ${locale}`, async () => {
      const text = (await mountWith({ activityCount: 0, publishedAt: Date.now() }, locale)).text()
      expect(text).not.toMatch(/\b(profile|time)\.[a-z]/i)
    })
  }
})
