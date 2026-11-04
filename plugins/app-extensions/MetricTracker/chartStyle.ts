/**
 * The chart styling the app shares — the dashboard draws the same way — read
 * at draw time, because a canvas cannot resolve `var()`.
 */
export function cssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

export function axisTicks() {
  return {
    font: { family: cssVar('--font-mono', 'monospace'), size: 10 },
    color: cssVar('--text-faint', '#8c8c84')
  }
}

export function gridLines() {
  return { color: cssVar('--border-subtle', '#e6e6e0') }
}

export function tooltipStyle() {
  const family = cssVar('--font-main', 'sans-serif')
  return {
    titleFont: { family, weight: 600 as const },
    bodyFont: { family },
    footerFont: { family, weight: 600 as const }
  }
}

/** Diagonal hatching: the period under way reads as unfinished, not as a drop. */
export function hatch(color: string): CanvasPattern | string {
  if (typeof document === 'undefined') return color
  const size = 8
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return color
  ctx.fillStyle = cssVar('--surface', '#ffffff')
  ctx.fillRect(0, 0, size, size)
  ctx.strokeStyle = color
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(-2, size + 2)
  ctx.lineTo(size + 2, -2)
  ctx.moveTo(-2, 2)
  ctx.lineTo(2, -2)
  ctx.moveTo(size - 2, size + 2)
  ctx.lineTo(size + 2, size - 2)
  ctx.stroke()
  return ctx.createPattern(canvas, 'repeat') ?? color
}
