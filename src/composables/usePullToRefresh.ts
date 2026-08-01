// src/composables/usePullToRefresh.ts
import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'

/** Indicator travel, in px, that arms the refresh. */
export const TRIGGER_DISTANCE = 64
/** Asymptote of the damping curve — the indicator never travels past this. */
const MAX_DISTANCE = 140
/** Where the indicator parks while the refresh runs. */
const RESTING_DISTANCE = 56
/** Finger travel before we claim the gesture from the page scroller. */
const TOUCH_SLOP = 8

/** Elements that own their vertical drags and must never start a pull. */
const BLOCKING_SELECTOR = 'canvas, .leaflet-container, [data-no-pull-refresh]'

export type PullState = 'idle' | 'pulling' | 'armed' | 'refreshing'

interface PullToRefreshOptions {
  /** Starts the refresh. Returns false when one is already running. */
  onTrigger: () => boolean
  /** True while a refresh is in flight — the indicator unwinds when it clears. */
  active: Ref<boolean>
}

/**
 * Pull-to-refresh over the document scroller.
 *
 * The page scrolls the window (the views hang their infinite scroll off it), so
 * the gesture only starts at scrollY 0. `overscroll-behavior: none` in
 * global.css already suppresses the browser's own pull-to-refresh and the iOS
 * rubber band, which is what makes a custom one viable in the installed PWA as
 * well as in a tab — nothing competes for the overscroll.
 */
export function usePullToRefresh({ onTrigger, active }: PullToRefreshOptions) {
  /** How far the indicator has travelled, in px. */
  const distance = ref(0)
  const state = ref<PullState>('idle')
  /** True while a finger drives the indicator — transitions are off then. */
  const dragging = ref(false)

  let startX = 0
  let startY = 0
  let tracking = false

  const atTop = () => (window.scrollY || document.documentElement.scrollTop || 0) <= 0

  /**
   * Canvases, maps and fixed overlays (the nav menu, modals) handle their own
   * drags, and an ancestor that is itself scrolled should scroll back up first.
   */
  const isBlocked = (target: EventTarget | null): boolean => {
    let node = target instanceof Element ? target : null
    while (node) {
      if (node.matches(BLOCKING_SELECTOR)) return true
      const style = window.getComputedStyle(node)
      if (style.position === 'fixed') return true
      if (node.scrollTop > 0 && /auto|scroll/.test(style.overflowY)) return true
      node = node.parentElement
    }
    return false
  }

  /** Asymptotic damping: the pull gets heavier the further it goes. */
  const damp = (raw: number) => (raw * MAX_DISTANCE) / (raw + MAX_DISTANCE)

  const reset = () => {
    tracking = false
    dragging.value = false
    distance.value = 0
    state.value = 'idle'
  }

  const onTouchStart = (e: TouchEvent) => {
    tracking =
      state.value !== 'refreshing' && e.touches.length === 1 && atTop() && !isBlocked(e.target)
    if (!tracking) return
    startX = e.touches[0].clientX
    startY = e.touches[0].clientY
  }

  const onTouchMove = (e: TouchEvent) => {
    if (!tracking || e.touches.length !== 1) return
    const dy = e.touches[0].clientY - startY
    const dx = e.touches[0].clientX - startX

    if (!dragging.value) {
      // Only claim the gesture once the finger commits to a downward drag. A
      // horizontal swipe or an upward scroll belongs to the page, and once it
      // has gone that way we stay out of it for the rest of the touch.
      if (Math.abs(dx) > Math.abs(dy) || dy < TOUCH_SLOP) {
        if (Math.abs(dx) > TOUCH_SLOP || dy < -TOUCH_SLOP) tracking = false
        return
      }
      dragging.value = true
    }

    if (dy <= TOUCH_SLOP) {
      // Dragged back to where it started — release the gesture so the page can
      // scroll again, but keep tracking in case the finger comes back down.
      distance.value = 0
      state.value = 'idle'
      return
    }

    e.preventDefault()
    distance.value = damp(dy - TOUCH_SLOP)
    const armed = distance.value >= TRIGGER_DISTANCE
    if (armed && state.value !== 'armed') navigator.vibrate?.(8)
    state.value = armed ? 'armed' : 'pulling'
  }

  const onTouchEnd = () => {
    if (!tracking) return
    tracking = false
    dragging.value = false
    if (state.value === 'armed' && onTrigger()) {
      state.value = 'refreshing'
      distance.value = RESTING_DISTANCE
      return
    }
    distance.value = 0
    state.value = 'idle'
  }

  /** The system took the touch away (call, gesture) — abort, never refresh. */
  const onTouchCancel = () => {
    if (tracking) reset()
  }

  watch(active, running => {
    if (!running && state.value === 'refreshing') reset()
  })

  onMounted(() => {
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    // Not passive: holding the page still during the pull needs preventDefault.
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    window.addEventListener('touchcancel', onTouchCancel, { passive: true })
  })

  onBeforeUnmount(() => {
    window.removeEventListener('touchstart', onTouchStart)
    window.removeEventListener('touchmove', onTouchMove)
    window.removeEventListener('touchend', onTouchEnd)
    window.removeEventListener('touchcancel', onTouchCancel)
  })

  return { distance, state, dragging }
}
