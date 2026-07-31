import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import ProfileFriends from '@/components/profile/ProfileFriends.vue'
import fr from '@/locales/fr.json'
import en from '@/locales/en.json'
import type { Friend } from '@/types/friend'

const FRIENDS: Friend[] = [
  {
    id: 'f1',
    username: 'Camille',
    publicUrl: 'https://example.test/1',
    addedAt: 1_700_000_000_000,
    lastFetched: 1_700_000_500_000,
    syncEnabled: true,
    followsMe: true,
    fullySynced: true
  },
  {
    id: 'f2',
    username: 'Bruno',
    publicUrl: 'https://example.test/2',
    addedAt: 1_700_000_000_000,
    syncEnabled: true,
    followsMe: false
  }
]

const getAllFriends = vi.fn(async () => FRIENDS)

vi.mock('@/services/FriendService', () => ({
  FriendService: {
    getInstance: () => ({
      getAllFriends: () => getAllFriends(),
      refreshAllFriends: vi.fn(),
      syncFriendActivitiesQuick: vi.fn(),
      syncFriendActivitiesAll: vi.fn(),
      removeFriend: vi.fn()
    })
  }
}))

vi.mock('@/composables/useSlotExtensions', () => ({
  useSlotExtensions: () => ({ components: { value: [] } })
}))

async function mountIn(locale: 'fr' | 'en', friends: Friend[] = FRIENDS) {
  getAllFriends.mockResolvedValueOnce(friends)
  const i18n = createI18n({ legacy: false, locale, messages: { fr, en } })
  const wrapper = mount(ProfileFriends, {
    global: {
      plugins: [i18n],
      stubs: { QRScanner: true, MyQrCodeModal: true, RouterLink: true }
    }
  })
  await new Promise(r => setTimeout(r, 0))
  await wrapper.vm.$nextTick()
  return wrapper
}

describe('ProfileFriends.vue', () => {
  /**
   * The tab is called "Friends & sharing" and only sharing carried a heading.
   * The list below simply started, which is why the action row read as
   * belonging to the privacy card above it rather than to the friends.
   */
  it('names the friends half of the tab', async () => {
    const wrapper = await mountIn('en')
    expect(wrapper.text()).toContain(en.friendsList.title)
  })

  /**
   * One action, one button. The empty state used to offer "Scan a QR code"
   * a few pixels under "Add a friend", and both opened the same scanner.
   */
  it('offers a single way to add a friend, list empty or not', async () => {
    for (const friends of [FRIENDS, []]) {
      const wrapper = await mountIn('en', friends)
      const openers = wrapper
        .findAll('button')
        .filter(b => b.text().includes(en.friends.addFriend) || /scan/i.test(b.text()))
      expect(openers).toHaveLength(1)
    }
  })

  for (const locale of ['fr', 'en'] as const) {
    it(`resolves every key it renders in ${locale}`, async () => {
      const text = (await mountIn(locale)).text()
      expect(text).not.toMatch(/\b(friendsList|friends|myQr)\./)
    })
  }
})
