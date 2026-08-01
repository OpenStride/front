// src/composables/useAppRefresh.ts
import { readonly, ref } from 'vue'

/**
 * Services answer a refresh request with 'openstride:activities-refreshed'. When
 * none is configured nobody answers, so the spinner needs its own way out.
 */
const SAFETY_TIMEOUT_MS = 15000

/**
 * With nothing to fetch a service can answer in a few dozen milliseconds, and a
 * spinner that appears and vanishes within a frame or two reads as a glitch
 * rather than as an answer. Hold it long enough to be seen.
 */
const MIN_VISIBLE_MS = 600

const refreshing = ref(false)
let safetyTimeout: ReturnType<typeof setTimeout> | null = null
let settleTimeout: ReturnType<typeof setTimeout> | null = null
let startedAt = 0

const stopRefreshing = () => {
  if (safetyTimeout) {
    clearTimeout(safetyTimeout)
    safetyTimeout = null
  }
  if (settleTimeout) {
    clearTimeout(settleTimeout)
    settleTimeout = null
  }
  refreshing.value = false
}

/** A service answered — wind down, but not before the spinner has been seen. */
const onAnswered = () => {
  if (!refreshing.value || settleTimeout) return
  const remaining = MIN_VISIBLE_MS - (Date.now() - startedAt)
  if (remaining <= 0) {
    stopRefreshing()
    return
  }
  settleTimeout = setTimeout(stopRefreshing, remaining)
}

let listening = false
const ensureListening = () => {
  if (listening) return
  listening = true
  window.addEventListener('openstride:activities-refreshed', onAnswered)
}

/**
 * Shared refresh state. The header button and the pull-to-refresh gesture drive
 * the same request, so only one can be in flight and both reflect its progress.
 */
export function useAppRefresh() {
  ensureListening()

  /** Returns false when a refresh is already running. */
  const requestRefresh = (): boolean => {
    if (refreshing.value) return false
    startedAt = Date.now()
    refreshing.value = true
    safetyTimeout = setTimeout(stopRefreshing, SAFETY_TIMEOUT_MS)
    window.dispatchEvent(new Event('openstride:refresh-requested'))
    return true
  }

  return { refreshing: readonly(refreshing), requestRefresh }
}
