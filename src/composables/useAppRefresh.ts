// src/composables/useAppRefresh.ts
import { readonly, ref } from 'vue'

/**
 * Services answer a refresh request with 'openstride:activities-refreshed'. When
 * none is configured nobody answers, so the spinner needs its own way out.
 */
const SAFETY_TIMEOUT_MS = 15000

const refreshing = ref(false)
let safetyTimeout: ReturnType<typeof setTimeout> | null = null
let listening = false

const stopRefreshing = () => {
  if (safetyTimeout) {
    clearTimeout(safetyTimeout)
    safetyTimeout = null
  }
  refreshing.value = false
}

const ensureListening = () => {
  if (listening) return
  listening = true
  window.addEventListener('openstride:activities-refreshed', stopRefreshing)
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
    refreshing.value = true
    safetyTimeout = setTimeout(stopRefreshing, SAFETY_TIMEOUT_MS)
    window.dispatchEvent(new Event('openstride:refresh-requested'))
    return true
  }

  return { refreshing: readonly(refreshing), requestRefresh }
}
