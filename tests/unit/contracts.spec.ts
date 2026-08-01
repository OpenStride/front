import { describe, it, expect } from 'vitest'
import { createI18n } from 'vue-i18n'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A user-facing string belongs to the locale files, never to the call site.
 *
 * This is written down in CLAUDE.md and in the plugin guidelines, and it was
 * still broken twelve times: six sync toasts and two backup toasts in the app
 * header, three share toasts in the interaction bar, and two privacy toasts in
 * a plugin — all in French, all shown to English readers. A rule nobody checks
 * is a rule that drifts, so this checks it.
 */

const ROOT = join(import.meta.dirname, '..', '..')

/**
 * Walks by hand rather than through `fs.globSync`, which only landed in Node 22
 * — CI pins 20.19.1, so the glob version passed here and threw there.
 */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'locales' && entry.name !== 'node_modules') walk(full, out)
    } else if (/\.(ts|vue)$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

function sourceFiles(): string[] {
  return [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'plugins'))]
}

/**
 * A guard that scans nothing passes, and passes silently. `globSync` returning
 * `undefined` on Node 20 would have read as three green contracts had it not
 * thrown outright, so the corpus itself is asserted first.
 */
describe('the guards below have something to scan', () => {
  it('finds the source tree', () => {
    expect(sourceFiles().length).toBeGreaterThan(150)
  })
})

/**
 * Matches a notification whose first argument opens with a quote.
 *
 * `t('…')`, a template literal built from `t()`, or a variable all pass; only a
 * bare literal is caught.
 */
const LITERAL_NOTIFICATION = /(?:ToastService\.push|notifications\.notify)\(\s*['"`][^'"`)]/

describe('notifications are translated, never hardcoded', () => {
  it('no call site passes a bare string literal', () => {
    const offenders: string[] = []

    for (const file of sourceFiles()) {
      const content = readFileSync(file, 'utf8')
      content.split('\n').forEach((line, i) => {
        if (LITERAL_NOTIFICATION.test(line)) {
          offenders.push(`${file.replace(ROOT + '/', '')}:${i + 1}  ${line.trim().slice(0, 70)}`)
        }
      })
    }

    expect(offenders, `A notification must read from the locale:\n${offenders.join('\n')}`).toEqual(
      []
    )
  })
})

/**
 * The registry resolves a slot loader to a component; consumers render it.
 *
 * A loader may return the component or the whole module, and for a while every
 * view that rendered a slot carried its own `comp?.default || comp` to guess
 * between the two — six copies of one question. `unwrapModule` answers it once,
 * inside `getPluginViewsForSlot`, so a consumer that unwraps again is both dead
 * code and a hint that someone did not trust the contract.
 */
describe('slot consumers trust the registry', () => {
  it('no view unwraps a module the registry already unwrapped', () => {
    const offenders: string[] = []

    for (const file of sourceFiles()) {
      if (file.endsWith('ExtensionPluginRegistry.ts')) continue
      const content = readFileSync(file, 'utf8')
      content.split('\n').forEach((line, i) => {
        if (/\.default \|\| /.test(line)) {
          offenders.push(`${file.replace(ROOT + '/', '')}:${i + 1}  ${line.trim().slice(0, 70)}`)
        }
      })
    }

    expect(
      offenders,
      `getPluginViewsForSlot already returns components:\n${offenders.join('\n')}`
    ).toEqual([])
  })
})

/**
 * A Vue component reaches the context through the composable.
 *
 * `getPluginContext()` is the door for non-Vue code — services, adapters, a
 * plugin's `refreshData`. Both resolve the same singleton, so the difference
 * never shows up as a bug; it shows up as two ways of doing one thing, and the
 * guidelines name only one.
 */
describe('components use the composable, not the factory', () => {
  it('no .vue file imports getPluginContext', () => {
    const offenders = sourceFiles()
      .filter(f => f.endsWith('.vue'))
      .filter(f => /import\s*\{[^}]*getPluginContext/.test(readFileSync(f, 'utf8')))
      .map(f => f.replace(ROOT + '/', ''))

    expect(offenders, `Use usePluginContext() in a component:\n${offenders.join('\n')}`).toEqual([])
  })
})

/**
 * The keys those notifications now point at have to exist, in both locales, and
 * the plural forms have to select correctly.
 *
 * Replacing a literal with `t('sync.synced')` moves the risk rather than
 * removing it: a missing key renders as the key itself, and vue-i18n's
 * `a | b` pluralisation is easy to write and easy to get backwards.
 */
describe('the notification keys resolve in both locales', () => {
  const NOTIFICATION_KEYS = [
    'sync.started',
    'sync.inProgress',
    'sync.noStorage',
    'sync.upToDate',
    'sync.failed',
    'backup.completed',
    'backup.failed',
    'share.publishFirst',
    'share.linkCopied',
    'share.copyFailed',
    'privacy.nowPublic',
    'privacy.nowPrivate',
    'privacy.toggleFailed'
  ]

  for (const locale of ['en', 'fr'] as const) {
    it(`renders every key in ${locale}`, async () => {
      const messages = (await import(`@/locales/${locale}.json`)).default
      const i18n = createI18n({ legacy: false, locale, messages: { [locale]: messages } })
      const t = i18n.global.t as (k: string) => string

      for (const key of NOTIFICATION_KEYS) {
        expect(t(key), `${key} is missing from ${locale}.json`).not.toBe(key)
      }
    })

    it(`selects the right plural form in ${locale}`, async () => {
      const messages = (await import(`@/locales/${locale}.json`)).default
      const i18n = createI18n({ legacy: false, locale, messages: { [locale]: messages } })
      const t = i18n.global.t as (k: string, p: Record<string, unknown>, n: number) => string

      const one = t('sync.synced', { count: 1 }, 1)
      const many = t('sync.synced', { count: 4 }, 4)
      expect(one).toContain('1')
      expect(many).toContain('4')
      expect(one).not.toBe(many)

      expect(t('sync.partial', { count: 1 }, 1)).toContain('1')
      expect(t('sync.partial', { count: 3 }, 3)).toContain('3')
    })
  }
})

/**
 * A French string carries its accents.
 *
 * Nineteen shipped without them, all on the statistics screen: "Duree",
 * "Denivele +", "Calendrier d'activite", "Aucun record trouve", "Les records
 * sont calcules a partir des donnees GPS". Fourteen had been there a while and
 * four arrived with a new section, which is how it spreads — the surrounding
 * copy already looked like that.
 *
 * The list below is deliberately narrow: each entry is a spelling that is not
 * a French word at all. "moyenne" is correctly spelt without one and is not
 * here; neither is anything that doubles as English.
 */
describe('the French locale is written in French', () => {
  const UNACCENTED = [
    'activite',
    'activites',
    'annee',
    'annees',
    'calcule',
    'calcules',
    'calculee',
    'calculees',
    'denivele',
    'deniveles',
    'donnee',
    'donnees',
    'duree',
    'durees',
    'energie',
    'frequence',
    'periode',
    'periodes',
    'repartition',
    'selectionne',
    'selectionnee',
    'trouve',
    'trouvee'
  ]

  it('no value drops an accent that makes the word French', async () => {
    const messages = (await import('@/locales/fr.json')).default as Record<string, unknown>
    const rx = new RegExp(`\\b(${UNACCENTED.join('|')})\\b`, 'i')

    const offenders: string[] = []
    const walk = (node: unknown, path: string) => {
      if (typeof node === 'string') {
        if (rx.test(node)) offenders.push(`${path} = ${node}`)
      } else if (node && typeof node === 'object') {
        for (const [k, v] of Object.entries(node)) walk(v, path ? `${path}.${k}` : k)
      }
    }
    walk(messages, '')

    expect(offenders, `Accents missing in fr.json:\n${offenders.join('\n')}`).toEqual([])
  })
})
