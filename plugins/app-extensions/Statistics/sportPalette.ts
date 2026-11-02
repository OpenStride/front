/**
 * Colours for sports drawn side by side, read from the design tokens.
 *
 * By rank, not by sport: the reader's main sport always gets the app's green,
 * whatever it is, and a chart never runs out of a colour for a sport nobody
 * anticipated. The neighbours differ in lightness as well as hue, so a stacked
 * bar still reads for a colour-blind reader.
 */
const TOKENS: [string, string][] = [
  ['--color-green-500', '#5f8f1a'],
  ['--color-blue-600', '#2563eb'],
  ['--color-orange-400', '#f49268'],
  ['--color-purple-500', '#9b59b6'],
  ['--color-teal-500', '#1abc9c'],
  ['--text-faint', '#8c8c84']
]

export function sportColor(rank: number): string {
  const [name, fallback] = TOKENS[Math.min(rank, TOKENS.length - 1)]
  return cssVar(name, fallback)
}

/** A CSS variable's value, for a canvas that cannot read `var()` itself. */
export function cssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

/**
 * Diagonal hatching in a sport's colour, for the week still under way: a bar
 * that is half drawn reads as unfinished, where a full one read as a drop.
 */
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
