import { createI18n } from 'vue-i18n'
import en from './en.json'
import fr from './fr.json'
import { IndexedDBService } from '@/services/IndexedDBService'

export type Locale = 'en' | 'fr'

const SUPPORTED_LOCALES: Locale[] = ['en', 'fr']
const DEFAULT_LOCALE: Locale = 'en'

/**
 * Detects the browser's preferred language
 */
export function getBrowserLocale(): Locale {
  const browserLang = navigator.language || (navigator as any).userLanguage || ''
  const lang = browserLang.split('-')[0].toLowerCase()
  return SUPPORTED_LOCALES.includes(lang as Locale) ? (lang as Locale) : DEFAULT_LOCALE
}

/**
 * Loads the user's locale preference from IndexedDB
 * Falls back to browser detection if not set
 */
export async function getInitialLocale(): Promise<Locale> {
  try {
    const db = await IndexedDBService.getInstance()
    const savedLocale = await db.getData('user_locale')
    if (savedLocale && SUPPORTED_LOCALES.includes(savedLocale)) {
      return savedLocale as Locale
    }
  } catch (e) {
    console.warn('[i18n] Failed to load locale from IndexedDB', e)
  }
  return getBrowserLocale()
}

/**
 * Saves the locale preference to IndexedDB
 */
export async function saveLocale(locale: Locale): Promise<void> {
  try {
    const db = await IndexedDBService.getInstance()
    await db.saveData('user_locale', locale)
  } catch (e) {
    console.warn('[i18n] Failed to save locale to IndexedDB', e)
  }
}

/**
 * Changes the current locale, saves to IndexedDB, and updates HTML lang attribute
 */
export async function changeLocale(locale: Locale): Promise<void> {
  if (!SUPPORTED_LOCALES.includes(locale)) {
    console.warn(`[i18n] Unsupported locale: ${locale}`)
    return
  }

  i18n.global.locale.value = locale
  document.documentElement.setAttribute('lang', locale)
  await saveLocale(locale)
}

/**
 * Sets the HTML lang attribute based on the current locale
 */
export function setHtmlLang(locale: Locale): void {
  document.documentElement.setAttribute('lang', locale)
}

export const i18n = createI18n({
  legacy: false,
  locale: DEFAULT_LOCALE,
  fallbackLocale: DEFAULT_LOCALE,
  messages: {
    en,
    fr
  }
})

export default i18n
