import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import LandingPage from '@/views/LandingPage.vue'
import fr from '@/locales/fr.json'
import en from '@/locales/en.json'

// The install gate reads platform state through a service that touches the DOM
// and IndexedDB; the landing page's own copy is what is under test here.
vi.mock('@/composables/useInstallPrompt', () => ({
  useInstallPrompt: () => ({
    offerBeforePlugins: { value: false },
    offerAfterEngagement: { value: false },
    canPrompt: { value: false },
    promptInstall: vi.fn(),
    dismiss: vi.fn()
  })
}))

function mountIn(locale: 'fr' | 'en') {
  const i18n = createI18n({ legacy: false, locale, messages: { fr, en } })
  return mount(LandingPage, {
    global: {
      plugins: [i18n],
      stubs: { RouterLink: { template: '<a><slot /></a>' } }
    }
  })
}

describe('LandingPage.vue', () => {
  /**
   * The page is almost entirely copy, so the failure that matters is a key that
   * does not resolve: vue-i18n renders the key itself, and `landing.hero.title`
   * in 48px on the front page is the kind of thing that ships.
   *
   * This is what happened to the `home.*` namespace this page replaces — it was
   * written, translated into both locales, and never wired to a view at all.
   */
  for (const locale of ['fr', 'en'] as const) {
    it(`resolves every key it renders in ${locale}`, () => {
      const text = mountIn(locale).text()
      expect(text).not.toMatch(/\blanding\./)
      expect(text.length).toBeGreaterThan(400)
    })
  }

  it('names only the sources that actually work', () => {
    const text = mountIn('en').text()
    expect(text).toContain('Garmin')
    expect(text).toContain('Strava')

    // Coros is a ten-line stub and the zip provider is deprecated. Neither can
    // import anything, so neither may appear on the page that promises they do.
    expect(text).not.toMatch(/Coros/i)
    expect(text).not.toMatch(/\bZIP import\b/i)
  })

  it('gives the page exactly one first-level heading', () => {
    const wrapper = mountIn('en')
    expect(wrapper.findAll('h1')).toHaveLength(1)
    expect(wrapper.get('h1').text()).toBe(en.landing.hero.title)
  })

  it('sends both calls to action into the onboarding flow', () => {
    const wrapper = mountIn('en')
    const ctas = wrapper.findAll('a').filter(a => a.text() === en.landing.hero.cta)
    expect(ctas.length).toBe(2)
  })
})
