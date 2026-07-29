import { describe, it, expect, beforeEach, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  getInstance: vi.fn()
}))

vi.mock('@/services/IndexedDBService', () => ({
  IndexedDBService: {
    getInstance: async () => ({
      getData: async (key: string) => mocks.store.get(key),
      saveData: async (key: string, value: unknown) => {
        mocks.store.set(key, value)
      }
    })
  }
}))

const { InstallService } = await import('@/services/InstallService')

const IOS_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
const IOS_CHROME = IOS_SAFARI.replace('Version/17.4', 'CriOS/122.0')
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Mobile Safari/537.36'

function setEnvironment(ua: string, standalone = false, maxTouchPoints = 5) {
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true })
  Object.defineProperty(navigator, 'maxTouchPoints', { value: maxTouchPoints, configurable: true })
  Object.defineProperty(window.navigator, 'standalone', { value: false, configurable: true })
  window.matchMedia = ((query: string) => ({
    matches: standalone && query.includes('standalone'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {}
  })) as unknown as typeof window.matchMedia
}

/** A stand-in for the Chromium event, which happy-dom does not fire. */
function fireBeforeInstallPrompt(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const evt = new Event('beforeinstallprompt') as Event & {
    prompt: () => Promise<void>
    userChoice: Promise<{ outcome: string }>
  }
  evt.prompt = vi.fn(async () => {})
  evt.userChoice = Promise.resolve({ outcome })
  window.dispatchEvent(evt)
  return evt
}

/** Each test needs a service that has not already counted today's visit. */
async function freshService() {
  ;(InstallService as unknown as { instance: unknown }).instance = null
  const service = InstallService.getInstance()
  await service.initialize()
  return service
}

describe('InstallService — reading the platform', () => {
  beforeEach(() => {
    mocks.store.clear()
    vi.clearAllMocks()
  })

  it('recognises an installable Android only once the browser has offered', async () => {
    setEnvironment(ANDROID_CHROME)
    const service = await freshService()

    // Chromium decides whether the app qualifies; before its event there is
    // nothing to trigger, so claiming otherwise would show a dead button.
    expect(service.platform).toBe('unsupported')
    expect(service.canPrompt).toBe(false)

    fireBeforeInstallPrompt()
    expect(service.platform).toBe('android-chromium')
    expect(service.canPrompt).toBe(true)
  })

  it('recognises Safari on iOS, which never offers an event', async () => {
    setEnvironment(IOS_SAFARI)
    const service = await freshService()

    expect(service.platform).toBe('ios-safari')
    expect(service.canInstall).toBe(true)
    // There is no API: the UI can only show where the gesture lives.
    expect(service.canPrompt).toBe(false)
  })

  it('does not guide Chrome on iOS, which cannot add to the home screen', async () => {
    setEnvironment(IOS_CHROME)
    const service = await freshService()

    expect(service.platform).toBe('unsupported')
    expect(service.canInstall).toBe(false)
  })

  it('sees an iPad that reports itself as a Mac', async () => {
    // iPadOS 13+ sends a desktop UA; the touch points are what give it away.
    Object.defineProperty(navigator, 'platform', { value: 'MacIntel', configurable: true })
    setEnvironment('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', false, 5)
    const service = await freshService()

    expect(service.platform).toBe('ios-safari')
  })

  it('says nothing to a user already running the installed app', async () => {
    setEnvironment(ANDROID_CHROME, true)
    const service = await freshService()
    fireBeforeInstallPrompt()

    expect(service.platform).toBe('installed')
    expect(service.canInstall).toBe(false)
  })
})

describe('InstallService — holding the browser event', () => {
  beforeEach(() => {
    mocks.store.clear()
    vi.clearAllMocks()
    setEnvironment(ANDROID_CHROME)
  })

  it('keeps the event so it can be used long after the page loaded', async () => {
    const service = await freshService()
    const evt = fireBeforeInstallPrompt('accepted')

    // The event fires during load; the invitation comes much later. Without
    // preventDefault and this reference, prompt() could never be called.
    expect(await service.promptInstall()).toBe('accepted')
    expect(evt.prompt).toHaveBeenCalledOnce()
  })

  it('reports unavailable rather than throwing when there is no event', async () => {
    const service = await freshService()
    expect(await service.promptInstall()).toBe('unavailable')
  })

  it('does not reuse a spent event, which Chromium refuses', async () => {
    const service = await freshService()
    fireBeforeInstallPrompt('accepted')

    await service.promptInstall()
    expect(await service.promptInstall()).toBe('unavailable')
  })

  it('counts a refused browser dialog as a refusal', async () => {
    const service = await freshService()
    fireBeforeInstallPrompt('dismissed')

    expect(await service.promptInstall()).toBe('dismissed')
    expect(service.getState().dismissCount).toBe(1)
  })

  it('forgets the event once the app is installed', async () => {
    const service = await freshService()
    fireBeforeInstallPrompt()
    expect(service.canPrompt).toBe(true)

    window.dispatchEvent(new Event('appinstalled'))
    expect(service.canPrompt).toBe(false)
  })
})

describe('InstallService — knowing when to stop asking', () => {
  beforeEach(() => {
    mocks.store.clear()
    vi.clearAllMocks()
    setEnvironment(ANDROID_CHROME)
  })

  it('stops after two refusals', async () => {
    const service = await freshService()
    expect(service.mayAsk).toBe(true)

    await service.recordDismissal()
    expect(service.mayAsk).toBe(true)

    await service.recordDismissal()
    // Two noes is an answer; a third invitation is nagging.
    expect(service.mayAsk).toBe(false)
  })

  it('remembers refusals across reloads', async () => {
    const first = await freshService()
    await first.recordDismissal()
    await first.recordDismissal()

    const second = await freshService()
    expect(second.mayAsk).toBe(false)
  })
})

describe('InstallService — counting visits', () => {
  beforeEach(() => {
    mocks.store.clear()
    vi.clearAllMocks()
    setEnvironment(ANDROID_CHROME)
  })

  it('counts the first visit', async () => {
    const service = await freshService()
    expect(service.visitDays).toBe(1)
  })

  it('counts one visit per day, not per reload', async () => {
    // Four reloads in one sitting say nothing about habit.
    await freshService()
    await freshService()
    const third = await freshService()

    expect(third.visitDays).toBe(1)
  })

  it('counts a genuine return on another day', async () => {
    const first = await freshService()
    expect(first.visitDays).toBe(1)

    const state = mocks.store.get('install_prompt_state') as { lastVisitDay: string }
    mocks.store.set('install_prompt_state', { ...state, lastVisitDay: '2020-01-01' })

    const second = await freshService()
    expect(second.visitDays).toBe(2)
  })
})
