import { cssVar } from './sportPalette'

/**
 * The axis styling every chart of the app shares (see the metric tracker and
 * the activity-detail graphs): figures in the mono face, faint, small; a light
 * horizontal grid and no axis lines. Read at draw time, because a canvas
 * cannot resolve `var()` itself.
 */
export function axisTicks() {
  return {
    font: { family: cssVar('--font-mono', 'monospace'), size: 10 },
    color: cssVar('--text-faint', '#8c8c84')
  }
}

export function gridLines() {
  return { color: cssVar('--border-subtle', '#e6e6e0') }
}

/** Tooltip in the app's body face, figures included. */
export function tooltipStyle() {
  const family = cssVar('--font-main', 'sans-serif')
  return {
    titleFont: { family, weight: 600 as const },
    bodyFont: { family },
    footerFont: { family, weight: 600 as const }
  }
}
