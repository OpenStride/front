import { describe, it, expect, beforeEach, vi } from 'vitest'

const settings = new Map<string, unknown>()

const mocks = vi.hoisted(() => ({
  hasPublicFileSupport: vi.fn(async () => true),
  activityEmitter: new EventTarget()
}))

vi.mock('@/services/IndexedDBService', () => ({
  IndexedDBService: {
    getInstance: async () => ({
      getData: async (key: string) => (settings.has(key) ? settings.get(key) : null),
      saveData: async (key: string, value: unknown) => {
        settings.set(key, value)
      }
    })
  }
}))

vi.mock('@/services/PublicFileService', () => ({
  PublicFileService: {
    getInstance: () => ({ hasPublicFileSupport: mocks.hasPublicFileSupport })
  }
}))

vi.mock('@/services/ActivityService', () => ({
  getActivityService: async () => ({ emitter: mocks.activityEmitter })
}))

const { FriendService } = await import('@/services/FriendService')
const { PublicDataListener } = await import('@/services/PublicDataListener')

/** What the publisher emits after a successful upload */
function emitPublishCompleted() {
  FriendService.getInstance().emitter.dispatchEvent(
    new CustomEvent('friend-event', {
      detail: { type: 'publish-completed', publishUrl: 'https://example.test/manifest' }
    })
  )
}

/** The listener enables asynchronously; give the microtasks a turn */
const settle = () => new Promise(resolve => setTimeout(resolve, 0))

describe('PublicDataListener auto-publish', () => {
  beforeEach(async () => {
    settings.clear()
    vi.clearAllMocks()
    mocks.hasPublicFileSupport.mockResolvedValue(true)
    // Singleton across tests: unwind any listener a previous test started
    await PublicDataListener.getInstance().stopListening()
  })

  it('turns itself on the first time the user publishes', async () => {
    // Without this, publishing was a one-shot: friends kept seeing the profile
    // as it was the day they scanned it
    const listener = PublicDataListener.getInstance()
    await listener.initialize()
    expect(await listener.isAutoPublishEnabled()).toBe(false)

    emitPublishCompleted()
    await settle()

    expect(await listener.isAutoPublishEnabled()).toBe(true)
  })

  it('respects an explicit opt-out', async () => {
    settings.set('autoPublishEnabled', false)
    const listener = PublicDataListener.getInstance()
    await listener.initialize()

    emitPublishCompleted()
    await settle()

    expect(await listener.isAutoPublishEnabled()).toBe(false)
  })

  it('publishes when an activity changes once enabled', async () => {
    const listener = PublicDataListener.getInstance()
    const publishNow = vi.spyOn(listener, 'publishNow').mockResolvedValue({ success: true })
    vi.useFakeTimers()

    try {
      await listener.enableAutoPublish()
      mocks.activityEmitter.dispatchEvent(
        new CustomEvent('activity-changed', { detail: { type: 'saved', activity: { id: 'a1' } } })
      )
      // The publish is debounced so a bulk import does not upload once per activity
      expect(publishNow).not.toHaveBeenCalled()
      vi.advanceTimersByTime(5000)
      expect(publishNow).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
      publishNow.mockRestore()
    }
  })
})
