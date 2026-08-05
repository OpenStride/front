/**
 * The blocks of the dashboard, in the order they ship.
 *
 * `extensions` is the slot other plugins render into. It is one entry rather
 * than one per plugin because the slot hands back components, not identities —
 * there is nothing stable to store an order against. Moving the block moves
 * whatever it contains, which is the honest granularity.
 */
export const DASHBOARD_SECTIONS = [
  'aggregates',
  'extensions',
  'summary',
  'heatmap',
  'trends',
  'distribution',
  'records'
] as const

export type DashboardSectionId = (typeof DASHBOARD_SECTIONS)[number]

export interface DashboardLayout {
  order: DashboardSectionId[]
  hidden: DashboardSectionId[]
}

export const LAYOUT_STORAGE_KEY = 'dashboardLayout'

export const DEFAULT_LAYOUT: DashboardLayout = {
  order: [...DASHBOARD_SECTIONS],
  hidden: []
}

function isSection(value: unknown): value is DashboardSectionId {
  return (DASHBOARD_SECTIONS as readonly string[]).includes(value as string)
}

/**
 * Read a stored layout back, whatever shape it is in.
 *
 * The two failure modes this exists for are opposite and both silent. A layout
 * saved before a section existed does not name it, and appending it is what
 * stops a new block from being invisible to everyone who ever opened these
 * settings. A layout naming a section that has since been removed would render
 * nothing and leave a dead row in the panel, so unknown names are dropped.
 *
 * Order is preserved for what the reader arranged; anything new lands at the
 * end, where it is noticed rather than silently inserted mid-page.
 */
export function normalizeLayout(stored: unknown): DashboardLayout {
  const raw = (stored ?? {}) as Partial<DashboardLayout>

  const kept = Array.isArray(raw.order) ? raw.order.filter(isSection) : []
  const seen = new Set(kept)
  const order = [...kept, ...DASHBOARD_SECTIONS.filter(id => !seen.has(id))]

  const hidden = Array.isArray(raw.hidden) ? raw.hidden.filter(isSection) : []

  return { order, hidden: [...new Set(hidden)] }
}

/** True when the section should be rendered. */
export function isVisible(layout: DashboardLayout, id: DashboardSectionId): boolean {
  return !layout.hidden.includes(id)
}

/** The sections to render, in order. */
export function visibleSections(layout: DashboardLayout): DashboardSectionId[] {
  return layout.order.filter(id => isVisible(layout, id))
}

/**
 * Move a section one step up or down.
 *
 * Returns the layout unchanged when the step would fall off either end, so a
 * button at the top of the list is a no-op rather than a wrap-around — nobody
 * pressing "up" on the first row means "send it to the bottom".
 */
export function moveSection(
  layout: DashboardLayout,
  id: DashboardSectionId,
  delta: -1 | 1
): DashboardLayout {
  const from = layout.order.indexOf(id)
  const to = from + delta
  if (from === -1 || to < 0 || to >= layout.order.length) return layout

  const order = [...layout.order]
  order.splice(to, 0, ...order.splice(from, 1))
  return { ...layout, order }
}

export function toggleSection(layout: DashboardLayout, id: DashboardSectionId): DashboardLayout {
  const hidden = isVisible(layout, id)
    ? [...layout.hidden, id]
    : layout.hidden.filter(other => other !== id)

  return { ...layout, hidden }
}
