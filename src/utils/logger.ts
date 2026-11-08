/**
 * The app's diagnostics. `debug` speaks in development and in tests, and is
 * silent in production — 170 `console.log` calls used to narrate every sync
 * and every render to anyone opening the console. To hear it in production
 * (helping someone debug their install): `localStorage.setItem('openstride:debug', '1')`.
 * Warnings and errors always go through: they are what a bug report needs.
 */
const DEBUG_KEY = 'openstride:debug'

function verbose(): boolean {
  if (import.meta.env.DEV) return true
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(DEBUG_KEY) === '1'
  } catch {
    return false
  }
}

export const logger = {
  debug: (...args: unknown[]): void => {
    if (verbose()) console.log(...args)
  },
  warn: (...args: unknown[]): void => console.warn(...args),
  error: (...args: unknown[]): void => console.error(...args)
}
