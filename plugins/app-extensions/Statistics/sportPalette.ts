import { cssVar } from '@/utils/cssVar'
export { cssVar }
/**
 * Colours for sports drawn side by side, read from the design tokens.
 *
 * By rank, not by sport: the reader's main sport always gets the app's green,
 * whatever it is, and a chart never runs out of a colour for a sport nobody
 * anticipated. The neighbours differ in lightness as well as hue, so a stacked
 * bar still reads for a colour-blind reader.
 */
const TOKENS: string[] = [
  '--color-green-500',
  '--color-blue-600',
  '--color-orange-400',
  '--color-purple-500',
  '--color-teal-500',
  '--text-faint'
]

export function sportColor(rank: number): string {
  return cssVar(TOKENS[Math.min(rank, TOKENS.length - 1)])
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
