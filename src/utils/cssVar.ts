/**
 * A design token's value as the browser resolved it, for what cannot read
 * `var()` itself — a canvas, Chart.js, Leaflet. Without the stylesheet (a test)
 * it returns `fallback`, which is never a colour: the palette lives in
 * `variables.css` alone (see the colour contract).
 */
export function cssVar(name: string, fallback = ''): string {
  if (typeof document === 'undefined') return fallback
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}
