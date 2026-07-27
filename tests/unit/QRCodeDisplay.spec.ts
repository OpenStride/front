import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '@/locales/en.json'
import fr from '@/locales/fr.json'
import QRCodeDisplay from '@/components/QRCodeDisplay.vue'

vi.mock('qrcode', () => ({ default: { toCanvas: vi.fn(async () => {}) } }))

const SHARE_URL =
  'https://openstride.org/add-friend?manifest=https%3A%2F%2Fdrive.google.com%2Fuc%3Fid%3DABC123'

function mountDisplay(locale: 'en' | 'fr' = 'en') {
  const i18n = createI18n({ legacy: false, locale, fallbackLocale: 'en', messages: { en, fr } })
  return mount(QRCodeDisplay, { props: { url: SHARE_URL }, global: { plugins: [i18n] } })
}

describe('QRCodeDisplay', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'share')
  })

  it('shows the link without its query string', () => {
    // It used to sit in a readonly input, cut off mid-URL at "…/add-f"
    const wrapper = mountDisplay()

    expect(wrapper.get('[data-test="share-url"]').text()).toBe('openstride.org/add-friend')
  })

  it('labels its buttons in the active locale', () => {
    // "Copier" was hardcoded, so an English user got a French button
    expect(mountDisplay('en').get('[data-test="copy-url-btn"]').text()).toContain('Copy link')
    expect(mountDisplay('fr').get('[data-test="copy-url-btn"]').text()).toContain('Copier le lien')
  })

  it('offers native sharing only where the browser has it', async () => {
    expect(mountDisplay().find('[data-test="share-url-btn"]').exists()).toBe(false)

    Object.defineProperty(navigator, 'share', { value: vi.fn(async () => {}), configurable: true })

    const wrapper = mountDisplay()
    expect(wrapper.find('[data-test="share-url-btn"]').exists()).toBe(true)

    await wrapper.get('[data-test="share-url-btn"]').trigger('click')
    expect(navigator.share).toHaveBeenCalledWith(expect.objectContaining({ url: SHARE_URL }))
  })

  it('shares the full link, not the shortened display form', async () => {
    const share = vi.fn(async (_data: { url?: string }) => {})
    Object.defineProperty(navigator, 'share', { value: share, configurable: true })

    const wrapper = mountDisplay()
    await wrapper.get('[data-test="share-url-btn"]').trigger('click')

    // The friend needs the manifest parameter; the trimmed form is for reading
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ url: expect.stringContaining('manifest=') })
    )
  })

  it('falls back to copying when sharing fails', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    Object.defineProperty(navigator, 'share', {
      value: vi.fn(async () => {
        throw new Error('not allowed')
      }),
      configurable: true
    })

    const wrapper = mountDisplay()
    await wrapper.get('[data-test="share-url-btn"]').trigger('click')
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(writeText).toHaveBeenCalledWith(SHARE_URL)
  })

  it('stays quiet when the user dismisses the share sheet', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const abort = Object.assign(new Error('cancelled'), { name: 'AbortError' })
    Object.defineProperty(navigator, 'share', {
      value: vi.fn(async () => {
        throw abort
      }),
      configurable: true
    })

    const wrapper = mountDisplay()
    await wrapper.get('[data-test="share-url-btn"]').trigger('click')
    await new Promise(resolve => setTimeout(resolve, 0))

    // Closing the sheet is not a failure — copying instead would be surprising
    expect(writeText).not.toHaveBeenCalled()
  })
})
