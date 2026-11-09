import { describe, it, expect, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import fr from '@/locales/fr.json'
import en from '@/locales/en.json'
import BackgroundTasks from '@/components/BackgroundTasks.vue'
import { backgroundTasks } from '@/services/BackgroundTaskService'

/**
 * A first import takes minutes. The card says, on every page, what is going on
 * and that the reader need not wait for it.
 */
function mountIn(locale: 'fr' | 'en') {
  const i18n = createI18n({ legacy: false, locale, messages: { fr, en } })
  return mount(BackgroundTasks, {
    global: { plugins: [i18n], stubs: { RouterLink: { template: '<a><slot /></a>' } } }
  })
}

describe('BackgroundTasks', () => {
  afterEach(() => backgroundTasks.finish('garmin-initial-import'))

  it('shows nothing while no job runs', () => {
    expect(mountIn('en').find('[data-test="background-tasks"]').exists()).toBe(false)
  })

  it('says what runs, where it is, how far, and that the reader may carry on', async () => {
    const wrapper = mountIn('fr')
    backgroundTasks.report({
      id: 'garmin-initial-import',
      title: { key: 'providers.garmin.import.title' },
      detail: {
        key: 'providers.garmin.import.fetching',
        params: { month: 'septembre 2026', found: 12 }
      },
      done: 3,
      total: 6,
      route: '/data-provider/garmin'
    })
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('Import de ton historique Garmin')
    expect(text).toContain('Récupération de septembre 2026 · sorties trouvées : 12')
    expect(text).toContain('50 %')
    expect(text).toContain("tu peux utiliser l'app")
    expect(wrapper.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('50')
  })

  it('follows the job, and goes once it is finished', async () => {
    const wrapper = mountIn('en')
    backgroundTasks.report({
      id: 'garmin-initial-import',
      title: { key: 'providers.garmin.import.title' },
      detail: { key: 'providers.garmin.import.starting' }
    })
    await flushPromises()
    // No total yet: an indeterminate bar, no percentage
    expect(wrapper.find('.bg-task__fill--indeterminate').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('%')

    backgroundTasks.finish('garmin-initial-import')
    await flushPromises()
    expect(wrapper.find('[data-test="background-tasks"]').exists()).toBe(false)
  })
})
