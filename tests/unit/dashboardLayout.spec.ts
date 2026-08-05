import { describe, it, expect } from 'vitest'
import {
  DASHBOARD_SECTIONS,
  DEFAULT_LAYOUT,
  isVisible,
  moveSection,
  normalizeLayout,
  toggleSection,
  visibleSections,
  type DashboardLayout
} from '@plugins/app-extensions/Statistics/dashboardLayout'

const layoutOf = (order: string[], hidden: string[] = []) =>
  ({ order, hidden }) as unknown as DashboardLayout

describe('normalizeLayout', () => {
  it('falls back to the shipped order when nothing was ever saved', () => {
    expect(normalizeLayout(undefined)).toEqual(DEFAULT_LAYOUT)
    expect(normalizeLayout(null).order).toEqual([...DASHBOARD_SECTIONS])
  })

  it('keeps the arrangement the reader saved', () => {
    const stored = layoutOf(['records', 'summary', 'aggregates'])

    expect(normalizeLayout(stored).order.slice(0, 3)).toEqual(['records', 'summary', 'aggregates'])
  })

  /**
   * The failure this exists for: a layout saved before a section existed does
   * not name it, and without this the new block would be invisible to everyone
   * who had ever opened these settings.
   */
  it('appends a section the stored layout has never heard of', () => {
    const stored = layoutOf(['summary', 'records'])
    const { order } = normalizeLayout(stored)

    expect(order).toHaveLength(DASHBOARD_SECTIONS.length)
    expect(order.slice(0, 2)).toEqual(['summary', 'records'])
    expect(order).toContain('aggregates')
  })

  /** A name that no longer exists would render nothing and leave a dead row. */
  it('drops a section that no longer exists', () => {
    const stored = layoutOf(['summary', 'ghost-section', 'records'])

    expect(normalizeLayout(stored).order).not.toContain('ghost-section')
  })

  it('survives a stored value of the wrong shape entirely', () => {
    expect(normalizeLayout('nonsense').order).toEqual([...DASHBOARD_SECTIONS])
    expect(normalizeLayout({ order: 42, hidden: 'no' }).order).toEqual([...DASHBOARD_SECTIONS])
  })

  it('keeps hidden sections hidden, and only the real ones', () => {
    const stored = layoutOf([...DASHBOARD_SECTIONS], ['trends', 'ghost'])
    const layout = normalizeLayout(stored)

    expect(layout.hidden).toEqual(['trends'])
    expect(isVisible(layout, 'trends')).toBe(false)
    expect(isVisible(layout, 'summary')).toBe(true)
  })

  it('does not repeat a section listed twice', () => {
    const stored = layoutOf([...DASHBOARD_SECTIONS], ['trends', 'trends'])

    expect(normalizeLayout(stored).hidden).toEqual(['trends'])
  })
})

describe('visibleSections', () => {
  it('renders in the stored order, skipping what is hidden', () => {
    const layout = normalizeLayout(layoutOf(['records', 'summary', 'trends'], ['summary']))

    expect(visibleSections(layout).slice(0, 2)).toEqual(['records', 'trends'])
  })
})

describe('moveSection', () => {
  it('swaps a section with the one above it', () => {
    const layout = normalizeLayout(layoutOf(['summary', 'records', 'trends']))

    expect(moveSection(layout, 'records', -1).order.slice(0, 3)).toEqual([
      'records',
      'summary',
      'trends'
    ])
  })

  it('swaps a section with the one below it', () => {
    const layout = normalizeLayout(layoutOf(['summary', 'records', 'trends']))

    expect(moveSection(layout, 'summary', 1).order.slice(0, 3)).toEqual([
      'records',
      'summary',
      'trends'
    ])
  })

  /** Nobody pressing "up" on the first row means "send it to the bottom". */
  it('refuses to wrap around either end', () => {
    const layout = normalizeLayout(layoutOf([...DASHBOARD_SECTIONS]))
    const first = layout.order[0]
    const last = layout.order[layout.order.length - 1]

    expect(moveSection(layout, first, -1).order).toEqual(layout.order)
    expect(moveSection(layout, last, 1).order).toEqual(layout.order)
  })

  it('leaves the original untouched', () => {
    const layout = normalizeLayout(layoutOf([...DASHBOARD_SECTIONS]))
    const before = [...layout.order]

    moveSection(layout, layout.order[2], -1)

    expect(layout.order).toEqual(before)
  })
})

describe('toggleSection', () => {
  it('hides a visible section and brings it back', () => {
    const layout = normalizeLayout(undefined)

    const hidden = toggleSection(layout, 'trends')
    expect(isVisible(hidden, 'trends')).toBe(false)

    expect(isVisible(toggleSection(hidden, 'trends'), 'trends')).toBe(true)
  })

  /** Hiding a section must not move it: bringing it back puts it where it was. */
  it('leaves the order alone', () => {
    const layout = normalizeLayout(undefined)

    expect(toggleSection(layout, 'trends').order).toEqual(layout.order)
  })
})
