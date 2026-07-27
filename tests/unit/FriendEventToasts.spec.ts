import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '@/locales/en.json'
import fr from '@/locales/fr.json'
import type { FriendServiceEvent } from '@/types/friend'

const mocks = vi.hoisted(() => ({ push: vi.fn() }))

vi.mock('@/services/ToastService', () => ({ ToastService: { push: mocks.push } }))

const { FriendService } = await import('@/services/FriendService')
const { useFriendEventToasts } = await import('@/composables/useFriendEventToasts')

const Host = { setup: () => useFriendEventToasts(), template: '<div/>' }

function mountHost(locale: 'en' | 'fr') {
  const i18n = createI18n({ legacy: false, locale, fallbackLocale: 'en', messages: { en, fr } })
  return mount(Host, { global: { plugins: [i18n] } })
}

const emit = (detail: FriendServiceEvent) =>
  FriendService.getInstance().emitter.dispatchEvent(new CustomEvent('friend-event', { detail }))

describe('friend event toasts', () => {
  beforeEach(() => vi.clearAllMocks())

  it('translates the event key into the active locale', () => {
    // Services used to carry French strings, shown as-is to English users
    const wrapper = mountHost('en')

    emit({
      type: 'friend-added',
      messageKey: 'friendEvents.friendAdded',
      messageParams: { name: 'Camille' },
      messageType: 'success'
    })

    expect(mocks.push).toHaveBeenCalledWith(
      'Camille added',
      expect.objectContaining({ type: 'success' })
    )
    wrapper.unmount()
  })

  it('follows the locale rather than the emitter', () => {
    const wrapper = mountHost('fr')

    emit({
      type: 'publish-error',
      messageKey: 'friendEvents.publishManifestFailed',
      messageType: 'error'
    })

    expect(mocks.push).toHaveBeenCalledWith(
      "Votre profil n'a pas pu être publié",
      expect.objectContaining({ type: 'error', timeout: 5000 })
    )
    wrapper.unmount()
  })

  it('picks the singular or plural form from the count', () => {
    const wrapper = mountHost('en')

    emit({
      type: 'sync-completed',
      messageKey: 'friendEvents.recentActivitiesSynced',
      messageCount: 1,
      messageType: 'success'
    })
    expect(mocks.push).toHaveBeenLastCalledWith('1 recent activity synced', expect.anything())

    emit({
      type: 'sync-completed',
      messageKey: 'friendEvents.recentActivitiesSynced',
      messageCount: 7,
      messageType: 'success'
    })
    expect(mocks.push).toHaveBeenLastCalledWith('7 recent activities synced', expect.anything())
    wrapper.unmount()
  })

  it('raises one toast per event, however many screens are mounted', () => {
    // The profile page keeps every tab mounted (v-show), which is how a single
    // failure used to produce three toasts
    const a = mountHost('en')
    const b = mountHost('en')

    emit({
      type: 'friend-removed',
      messageKey: 'friendEvents.friendRemoved',
      messageType: 'success'
    })

    expect(mocks.push).toHaveBeenCalledTimes(2)
    a.unmount()
    b.unmount()

    emit({
      type: 'friend-removed',
      messageKey: 'friendEvents.friendRemoved',
      messageType: 'success'
    })
    expect(mocks.push).toHaveBeenCalledTimes(2)
  })

  it('ignores an event with no message', () => {
    const wrapper = mountHost('en')

    emit({ type: 'sync-completed' })

    expect(mocks.push).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
