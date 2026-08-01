import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createI18n } from 'vue-i18n'
import fr from '@/locales/fr.json'
import en from '@/locales/en.json'
import { allAppPlugins } from '@/services/ExtensionPluginRegistry'

const ROOT = join(import.meta.dirname, '..', '..')
const PANELS = join(ROOT, 'src', 'components', 'profile')

/**
 * A tab is a tab whether core or a plugin renders it.
 *
 * The MCP extension contributes one through the `profile.tabs` slot, and it
 * was the single largest holdout — 61 utility classes, more than the five core
 * panels put together.
 */
const PLUGIN_PANELS = [join(ROOT, 'plugins', 'app-extensions', 'MCP', 'ProfileMCP.vue')]

const panelFiles = () => [
  ...readdirSync(PANELS)
    .filter(f => f.endsWith('.vue'))
    .map(f => join(PANELS, f)),
  ...PLUGIN_PANELS
]

/**
 * Six panels carried six copies of "a card", "a section title" and "a button",
 * expressed in Tailwind utilities, and they had drifted: square cards next to
 * rounded ones, three heading sizes, buttons green here and outlined there.
 *
 * The primitives now live once in `profile.css`, under `.profile-panel`. A
 * panel that reaches for a utility class again is a panel that has started its
 * own copy.
 */
describe('the profile panels share one vocabulary', () => {
  const UTILITY =
    /\bclass="[^"]*\b(space-y-\d|bg-white|bg-gray-\d+|text-(gray|green)-\d+|text-(sm|lg|xl|2xl)|font-(bold|semibold)|p-\d|px-\d|py-\d|rounded(-\w+)?|shadow)\b/

  it('no panel styles itself with utility classes', () => {
    const offenders = panelFiles()
      .filter(f => UTILITY.test(readFileSync(f, 'utf8')))
      .map(f => f.replace(ROOT + '/', ''))

    expect(offenders, `Use the primitives in profile.css:\n${offenders.join('\n')}`).toEqual([])
  })

  it('every panel opts into the shared primitives', () => {
    const files = panelFiles()
    expect(files.length).toBeGreaterThan(4)

    const offenders = files
      .filter(f => !readFileSync(f, 'utf8').includes('profile-panel'))
      .map(f => f.replace(ROOT + '/', ''))

    expect(offenders, `Root element needs class="profile-panel":\n${offenders.join('\n')}`).toEqual(
      []
    )
  })

  /**
   * The tab strip sits a few pixels above the panel and already names it. A
   * panel repeating that name produced three headings for one list — "SOURCES
   * DE DONNÉES", then "Fournisseurs de données connectés", then "Mes sources
   * de données", three vocabularies for one thing.
   */
  it('no panel repeats the tab label as its own title', () => {
    // Comments are stripped first: a panel explaining why it has no <h2> is
    // not a panel with an <h2>, and the first run of this guard said otherwise.
    const offenders = panelFiles()
      .filter(f => /<h2[\s>]/.test(readFileSync(f, 'utf8').replace(/<!--[\s\S]*?-->/g, '')))
      .map(f => f.replace(ROOT + '/', ''))

    expect(offenders, `The tab strip is the title:\n${offenders.join('\n')}`).toEqual([])
  })
})

/**
 * Nine extensions declared an English `label` and `description` in their
 * `index.ts`, and the tab rendered all nine in English to a French reader —
 * the mirror image of the hardcoded French toasts.
 */
describe('every extension has a translated name', () => {
  for (const locale of ['fr', 'en'] as const) {
    it(`names and describes each extension in ${locale}`, () => {
      const i18n = createI18n({ legacy: false, locale, messages: { fr, en } })
      const te = i18n.global.te as (k: string) => boolean

      const missing = allAppPlugins
        .filter(p => !te(`extensions.${p.id}.label`))
        .map(p => `extensions.${p.id}.label`)

      expect(allAppPlugins.length).toBeGreaterThan(5)
      expect(missing, `Missing from ${locale}.json:\n${missing.join('\n')}`).toEqual([])
    })
  }
})
