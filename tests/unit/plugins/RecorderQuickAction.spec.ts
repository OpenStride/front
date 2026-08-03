import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '@/locales/en.json'
import { PLUGIN_CONTEXT_KEY } from '@/composables/usePluginContext'
import * as recorder from '@plugins/data-providers/RecorderProvider/client/session'
import RecorderQuickAction from '@plugins/app-extensions/RecorderQuickAction/RecorderQuickAction.vue'

const startWatch = vi.fn().mockResolvedValue('watcher-1')
const stopWatch = vi.fn().mockResolvedValue(undefined)

vi.mock('@plugins/data-providers/RecorderProvider/client/geo', () => ({
  NOT_AUTHORIZED: 'NOT_AUTHORIZED',
  startWatch: (...a: unknown[]) => startWatch(...a),
  stopWatch: (...a: unknown[]) => stopWatch(...a),
  openLocationSettings: vi.fn()
}))

const store = new Map<string, unknown>()
const saveActivityWithDetails = vi.fn().mockResolvedValue(undefined)

vi.mock('@/services/PluginContextFactory', () => ({
  getPluginContext: async () => ({
    storage: {
      getData: async (k: string) => store.get(k),
      saveData: async (k: string, v: unknown) => void store.set(k, v),
      deleteData: async (k: string) => void store.delete(k)
    },
    activity: { saveActivityWithDetails }
  })
}))

const isPluginActive = vi.fn().mockResolvedValue(true)
const notify = vi.fn()

const ctx = {
  storage: {
    getData: async (k: string) => store.get(k),
    saveData: async (k: string, v: unknown) => void store.set(k, v),
    deleteData: async (k: string) => void store.delete(k)
  },
  plugins: { isPluginActive },
  notifications: { notify },
  units: { format: (_d: string, si: number) => ({ text: `${(si / 1000).toFixed(2)} km` }) }
}

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

function render() {
  return mount(RecorderQuickAction, {
    global: { plugins: [i18n], provide: { [PLUGIN_CONTEXT_KEY]: ctx } }
  })
}

describe('recorder quick action', () => {
  beforeEach(() => {
    store.clear()
    isPluginActive.mockResolvedValue(true)
    notify.mockClear()
    startWatch.mockClear()
    stopWatch.mockClear()
    saveActivityWithDetails.mockClear()
    recorder.resetForTests()
  })

  afterEach(() => recorder.resetForTests())

  it('shows nothing while the recorder provider is switched off', async () => {
    isPluginActive.mockResolvedValue(false)
    const w = render()
    await flushPromises()

    expect(w.find('[data-test="recorder-quick-action"]').exists()).toBe(false)
  })

  it('offers a start button once the provider is on', async () => {
    const w = render()
    await flushPromises()

    expect(w.find('[data-test="recorder-start"]').exists()).toBe(true)
    expect(w.find('[data-test="recorder-finish"]').exists()).toBe(false)
  })

  it('starts a recording, and turns into the live control', async () => {
    const w = render()
    await flushPromises()

    await w.find('[data-test="recorder-start"]').trigger('click')
    await flushPromises()

    expect(startWatch).toHaveBeenCalledTimes(1)
    expect(recorder.state.phase).toBe('recording')
    expect(w.find('[data-test="recorder-pause"]').exists()).toBe(true)
    expect(w.find('[data-test="recorder-finish"]').exists()).toBe(true)
    expect(w.find('[data-test="recorder-start"]').exists()).toBe(false)
  })

  it('pauses and resumes the same recording', async () => {
    const w = render()
    await flushPromises()
    await w.find('[data-test="recorder-start"]').trigger('click')
    await flushPromises()

    await w.find('[data-test="recorder-pause"]').trigger('click')
    await flushPromises()
    expect(recorder.state.phase).toBe('paused')
    expect(stopWatch).toHaveBeenCalledWith('watcher-1')

    await w.find('[data-test="recorder-resume"]').trigger('click')
    await flushPromises()
    expect(recorder.state.phase).toBe('recording')
    expect(startWatch).toHaveBeenCalledTimes(2)
  })

  it('says nothing was recorded when finishing without a single fix', async () => {
    const w = render()
    await flushPromises()
    await w.find('[data-test="recorder-start"]').trigger('click')
    await flushPromises()

    await w.find('[data-test="recorder-finish"]').trigger('click')
    await flushPromises()

    expect(saveActivityWithDetails).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledWith(en.providers.recorder.nothingRecorded, {
      type: 'warning'
    })
    expect(recorder.state.phase).toBe('idle')
  })

  it('adopts a recording left running by the setup screen', async () => {
    await recorder.start('cycling', { title: 't', message: 'm' })
    const w = render()
    await flushPromises()

    // No second watcher, and the live control rather than the start button.
    expect(startWatch).toHaveBeenCalledTimes(1)
    expect(w.find('[data-test="recorder-finish"]').exists()).toBe(true)
  })

  it('shows the distance through the unit system, never raw metres', async () => {
    await recorder.start('running', { title: 't', message: 'm' })
    const onPoint = startWatch.mock.calls[0][0] as (p: unknown) => void
    onPoint({ lat: 45, lng: 5, time: Date.now() })
    onPoint({ lat: 45.009, lng: 5, time: Date.now() + 300_000 })

    const w = render()
    await flushPromises()

    expect(w.find('[data-test="recorder-quick-action"]').text()).toContain('km')
  })
})
