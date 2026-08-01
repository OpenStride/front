import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'

const mocks = vi.hoisted(() => ({
  platform: 'ios-safari' as string,
  canInstall: true,
  mayAsk: true,
  visitDays: 1,
  providers: [] as unknown[],
  storages: [] as unknown[],
  activities: [] as { deleted?: boolean }[]
}))

vi.mock('@/services/InstallService', () => ({
  ANDROID_MIN_VISIT_DAYS: 4,
  getInstallService: () => ({
    get platform() {
      return mocks.platform
    },
    get canInstall() {
      return mocks.canInstall
    },
    get canPrompt() {
      return mocks.platform === 'android-chromium'
    },
    get mayAsk() {
      return mocks.mayAsk
    },
    get visitDays() {
      return mocks.visitDays
    },
    emitter: new EventTarget(),
    promptInstall: vi.fn(),
    recordDismissal: vi.fn()
  })
}))

vi.mock('@/services/DataProviderPluginManager', () => ({
  DataProviderPluginManager: {
    getInstance: () => ({ getEnabledPlugins: async () => mocks.providers })
  }
}))
vi.mock('@/services/StoragePluginManager', () => ({
  StoragePluginManager: {
    getInstance: () => ({ getEnabledPlugins: async () => mocks.storages })
  }
}))
vi.mock('@/services/ActivityService', () => ({
  getActivityService: async () => ({ getAllActivities: async () => mocks.activities })
}))

const { useInstallPrompt } = await import('@/composables/useInstallPrompt')

/** The composable uses onMounted, so it needs a host component. */
async function harness() {
  let api!: ReturnType<typeof useInstallPrompt>
  mount(
    defineComponent({
      setup() {
        api = useInstallPrompt()
        return () => h('div')
      }
    })
  )
  await flushPromises()
  return api
}

function reset(over: Partial<typeof mocks> = {}) {
  Object.assign(mocks, {
    platform: 'ios-safari',
    canInstall: true,
    mayAsk: true,
    visitDays: 1,
    providers: [],
    storages: [],
    activities: []
  })
  Object.assign(mocks, over)
}

describe('useInstallPrompt — iOS asks before anything is connected', () => {
  beforeEach(() => reset())

  it('invites while nothing is connected yet', async () => {
    const api = await harness()
    expect(api.offerBeforePlugins.value).toBe(true)
    expect(api.offerAfterEngagement.value).toBe(false)
  })

  it('stays quiet once a provider is connected', async () => {
    // Too late to be useful: installing now would strand the import in Safari's
    // own storage, which the home-screen app does not share.
    reset({ providers: [{ id: 'garmin' }] })
    const api = await harness()
    expect(api.offerBeforePlugins.value).toBe(false)
  })

  it('stays quiet once a storage is connected', async () => {
    reset({ storages: [{ id: 'gdrive' }] })
    const api = await harness()
    expect(api.offerBeforePlugins.value).toBe(false)
  })

  it('does not wait for visits — the window closes as soon as data arrives', async () => {
    reset({ visitDays: 1 })
    const api = await harness()
    expect(api.offerBeforePlugins.value).toBe(true)
  })
})

describe('useInstallPrompt — Android waits for the habit', () => {
  beforeEach(() => reset({ platform: 'android-chromium' }))

  it('says nothing before enough distinct days', async () => {
    reset({ platform: 'android-chromium', visitDays: 3, activities: [{}] })
    const api = await harness()
    expect(api.offerAfterEngagement.value).toBe(false)
  })

  it('says nothing while there is no imported activity', async () => {
    reset({ platform: 'android-chromium', visitDays: 9, activities: [] })
    const api = await harness()
    expect(api.offerAfterEngagement.value).toBe(false)
  })

  it('invites once the app has proven useful', async () => {
    reset({ platform: 'android-chromium', visitDays: 4, activities: [{}] })
    const api = await harness()
    expect(api.offerAfterEngagement.value).toBe(true)
    // The iOS urgency does not apply: installed and browser share one storage.
    expect(api.offerBeforePlugins.value).toBe(false)
  })

  it('ignores deleted activities, which are not a reason to install', async () => {
    reset({ platform: 'android-chromium', visitDays: 9, activities: [{ deleted: true }] })
    const api = await harness()
    expect(api.offerAfterEngagement.value).toBe(false)
  })
})

describe('useInstallPrompt — when not to ask at all', () => {
  beforeEach(() => reset())

  it('never asks a user already running the installed app', async () => {
    reset({ platform: 'installed', canInstall: false })
    const api = await harness()
    expect(api.offerBeforePlugins.value).toBe(false)
    expect(api.offerAfterEngagement.value).toBe(false)
  })

  it('never asks on desktop', async () => {
    reset({ platform: 'desktop', canInstall: false })
    const api = await harness()
    expect(api.offerBeforePlugins.value).toBe(false)
    expect(api.offerAfterEngagement.value).toBe(false)
  })

  it('stops once the user has refused enough times', async () => {
    reset({ mayAsk: false })
    const api = await harness()
    expect(api.offerBeforePlugins.value).toBe(false)
  })
})
