import { cssVar } from '@/utils/cssVar'
export { cssVar }

export function axisTicks() {
  return {
    font: { family: cssVar('--font-mono', 'monospace'), size: 10 },
    color: cssVar('--text-faint')
  }
}

export function gridLines() {
  return { color: cssVar('--border-subtle') }
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
  ctx.fillStyle = cssVar('--surface')
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
