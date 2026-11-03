import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '@/locales/en.json'
import fr from '@/locales/fr.json'
import { PLUGIN_CONTEXT_KEY } from '@/composables/usePluginContext'
import { convertQuantity, formatQuantity } from '@/composables/useUnits'
import type { Activity } from '@/types/activity'
import WeekSummary from '@plugins/app-extensions/Statistics/components/WeekSummary.vue'

function run(id: string, iso: string, km: number): Activity {
  return {
    id,
    type: 'running',
    provider: 'test',
    startTime: new Date(iso).getTime(),
    distance: km * 1000,
    duration: km * 330,
    version: 1,
    lastModified: 1
  } as Activity
}

// Wednesday 4 November 2026
const NOW = new Date('2026-11-04T18:00:00')

function render(activities: Activity[]) {
  const i18n = createI18n({
    legacy: false,
    locale: 'en',
    fallbackLocale: 'en',
    messages: { en, fr }
  })
  return mount(WeekSummary, {
    props: { activities, selectedSport: 'running' },
    global: {
      plugins: [i18n],
      provide: {
        [PLUGIN_CONTEXT_KEY]: { units: { format: formatQuantity, convert: convertQuantity } }
      }
      // Vue Test Utils stubs <Transition> by default, so each page renders at once.
    }
  })
}

const volume = (w: ReturnType<typeof render>) =>
  w.find('[data-test="summary-volume"]').text().replace(/\s+/g, ' ')

afterEach(() => vi.useRealTimers())

describe('WeekSummary — going back a week', () => {
  const activities = [
    run('this', '2026-11-03T07:00:00', 10),
    run('last', '2026-10-28T07:00:00', 12),
    run('before', '2026-10-21T07:00:00', 8)
  ]

  it('opens on the week under way, the newest dot lit', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    const wrapper = render(activities)

    expect(volume(wrapper)).toContain('10.0')
    expect(wrapper.text()).toContain('This week')
    expect(wrapper.find('[data-test="week-newer"]').attributes('disabled')).toBeDefined()
    const dots = wrapper.findAll('.dot')
    expect(dots[dots.length - 1].attributes('aria-current')).toBe('true')
  })

  it('shows last week, dated and compared with the whole week before it', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    const wrapper = render(activities)

    await wrapper.find('[data-test="week-older"]').trigger('click')

    expect(volume(wrapper)).toContain('12.0')
    expect(wrapper.text()).toContain('Last week')
    expect(wrapper.text()).toContain('4.0 km more than the week before')
    expect(wrapper.find('.range').text()).toMatch(/Oct 26.*Nov 1/)
    // Read at its last instant, a finished week has no "today"
    expect(wrapper.findAll('.day.today')).toHaveLength(0)
  })

  it('goes back with a swipe to the right, and not with a vertical scroll', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    const wrapper = render(activities)
    const section = wrapper.find('[data-test="week-summary"]')
    const touch = (x: number, y: number) => ({ changedTouches: [{ clientX: x, clientY: y }] })

    await section.trigger('touchstart', touch(100, 300))
    await section.trigger('touchend', touch(110, 120))
    expect(volume(wrapper)).toContain('10.0')

    await section.trigger('touchstart', touch(100, 300))
    await section.trigger('touchend', touch(220, 305))
    expect(volume(wrapper)).toContain('12.0')

    await section.trigger('touchstart', touch(100, 300))
    await section.trigger('touchend', touch(220, 305))
    expect(volume(wrapper)).toContain('8.0')

    // No fourth page: the oldest stays put
    await section.trigger('touchstart', touch(100, 300))
    await section.trigger('touchend', touch(220, 305))
    expect(volume(wrapper)).toContain('8.0')
    expect(wrapper.find('[data-test="week-older"]').attributes('disabled')).toBeDefined()
  })

  it('jumps to a week from its dot', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    const wrapper = render(activities)

    await wrapper.findAll('.dot')[0].trigger('click')
    expect(volume(wrapper)).toContain('8.0')
    expect(wrapper.text()).toContain('2 weeks ago')
  })
})
