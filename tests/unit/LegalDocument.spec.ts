import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '@/locales/en.json'
import fr from '@/locales/fr.json'
import LegalDocument from '@/components/LegalDocument.vue'

const LOCALES = ['en', 'fr'] as const
const DOCUMENTS = ['privacy', 'terms'] as const

const files = import.meta.glob('@/content/legal/*.html', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>

function mountDoc(doc: (typeof DOCUMENTS)[number], locale: string) {
  const i18n = createI18n({ legacy: false, locale, fallbackLocale: 'en', messages: { en, fr } })
  return mount(LegalDocument, { props: { doc }, global: { plugins: [i18n] } })
}

describe('legal documents on disk', () => {
  it('ships every document in every supported locale', () => {
    for (const doc of DOCUMENTS) {
      for (const locale of LOCALES) {
        const found = Object.keys(files).some(p => p.endsWith(`/${doc}.${locale}.html`))
        expect(found, `missing ${doc}.${locale}.html`).toBe(true)
      }
    }
  })

  it('gives every version a heading and the same sections as the original', () => {
    for (const doc of DOCUMENTS) {
      const sectionCounts = LOCALES.map(locale => {
        const path = Object.keys(files).find(p => p.endsWith(`/${doc}.${locale}.html`))!
        const html = files[path]
        expect(html, `${doc}.${locale} has no <h1>`).toMatch(/<h1>/)
        return (html.match(/<h2>/g) || []).length
      })

      // A translation that lost a clause is worse than no translation
      expect(new Set(sectionCounts).size, `${doc} has diverging section counts`).toBe(1)
    }
  })
})

describe('LegalDocument.vue', () => {
  it('renders the document of the active locale', () => {
    expect(mountDoc('privacy', 'fr').text()).toContain('Politique de confidentialité')
    expect(mountDoc('privacy', 'en').text()).toContain('Privacy Policy')
    expect(mountDoc('terms', 'fr').text()).toContain("Conditions d'utilisation")
    expect(mountDoc('terms', 'en').text()).toContain('Terms of Service')
  })

  it('flags a translation as a courtesy, since the English text governs', () => {
    expect(mountDoc('privacy', 'fr').find('.legal-notice').text()).toBe(fr.legal.translationNotice)
  })

  it('shows no notice on the version that governs', () => {
    expect(mountDoc('privacy', 'en').find('.legal-notice').exists()).toBe(false)
  })

  it('falls back to English, and says so, for a locale with no version', () => {
    const wrapper = mountDoc('privacy', 'es')

    expect(wrapper.text()).toContain('Privacy Policy')
    expect(wrapper.find('.legal-notice').text()).toBe(en.legal.onlyInEnglish)
  })
})
