import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import PullToRefresh from '@/components/PullToRefresh.vue'

/**
 * happy-dom has no TouchEvent constructor, so build the shape the composable
 * reads: touches[0].clientX/clientY plus a cancelable preventDefault.
 */
const touch = (type: string, x: number, y: number) => {
  const evt = new Event(type, { bubbles: true, cancelable: true })
  const list = type === 'touchend' || type === 'touchcancel' ? [] : [{ clientX: x, clientY: y }]
  Object.defineProperty(evt, 'touches', { value: list })
  return evt
}

const setScrollY = (value: number) => {
  Object.defineProperty(window, 'scrollY', { value, configurable: true, writable: true })
}

/** Drag from (x0, y0) to (x1, y1) in a few steps, then lift. */
const drag = async (from: [number, number], to: [number, number], target: EventTarget = window) => {
  target.dispatchEvent(touch('touchstart', from[0], from[1]))
  for (const step of [0.3, 0.7, 1]) {
    const x = from[0] + (to[0] - from[0]) * step
    const y = from[1] + (to[1] - from[1]) * step
    target.dispatchEvent(touch('touchmove', x, y))
  }
  target.dispatchEvent(touch('touchend', to[0], to[1]))
  await nextTick()
}

describe('PullToRefresh', () => {
  let wrapper: VueWrapper
  let requested: number
  const countRequest = () => {
    requested += 1
  }

  beforeEach(() => {
    requested = 0
    setScrollY(0)
    window.addEventListener('openstride:refresh-requested', countRequest)
    wrapper = mount(PullToRefresh)
  })

  afterEach(() => {
    window.removeEventListener('openstride:refresh-requested', countRequest)
    wrapper.unmount()
    // useAppRefresh is a module singleton — clear its in-flight state.
    window.dispatchEvent(new Event('openstride:activities-refreshed'))
  })

  it('requests a refresh when the pull passes the threshold', async () => {
    await drag([100, 10], [100, 200])

    expect(requested).toBe(1)
    expect(wrapper.find('.ptr__icon--spinning').exists()).toBe(true)
  })

  it('unwinds without requesting anything when the pull is too short', async () => {
    await drag([100, 10], [100, 50])

    expect(requested).toBe(0)
    expect(wrapper.find('.ptr__icon--spinning').exists()).toBe(false)
  })

  it('ignores the gesture when the page is scrolled away from the top', async () => {
    setScrollY(240)

    await drag([100, 10], [100, 200])

    expect(requested).toBe(0)
  })

  it('leaves horizontal swipes to the page', async () => {
    await drag([20, 100], [260, 130])

    expect(requested).toBe(0)
  })

  it('stops spinning once a service reports the refresh is done', async () => {
    await drag([100, 10], [100, 200])
    expect(wrapper.find('.ptr__icon--spinning').exists()).toBe(true)

    window.dispatchEvent(new Event('openstride:activities-refreshed'))
    await nextTick()

    expect(wrapper.find('.ptr__icon--spinning').exists()).toBe(false)
  })

  it('does not stack a second request while one is in flight', async () => {
    await drag([100, 10], [100, 200])
    await drag([100, 10], [100, 200])

    expect(requested).toBe(1)
  })

  it('does not start on elements that own their drags', async () => {
    const canvas = document.createElement('canvas')
    document.body.appendChild(canvas)

    await drag([100, 10], [100, 200], canvas)

    expect(requested).toBe(0)
    canvas.remove()
  })

  it('does not start inside a fixed overlay such as the nav menu', async () => {
    const overlay = document.createElement('div')
    overlay.setAttribute('data-no-pull-refresh', '')
    document.body.appendChild(overlay)

    await drag([100, 10], [100, 200], overlay)

    expect(requested).toBe(0)
    overlay.remove()
  })
})

describe('usePullToRefresh damping', () => {
  it('keeps the indicator ahead of the threshold only after a real pull', async () => {
    setScrollY(0)
    const wrapper = mount(PullToRefresh)

    window.dispatchEvent(touch('touchstart', 100, 10))
    window.dispatchEvent(touch('touchmove', 100, 70))
    await nextTick()
    expect(wrapper.find('.ptr__indicator--armed').exists()).toBe(false)

    window.dispatchEvent(touch('touchmove', 100, 200))
    await nextTick()
    expect(wrapper.find('.ptr__indicator--armed').exists()).toBe(true)

    window.dispatchEvent(touch('touchcancel', 100, 200))
    wrapper.unmount()
    window.dispatchEvent(new Event('openstride:activities-refreshed'))
  })
})

describe('useAppRefresh', () => {
  it('clears the in-flight flag on the safety timeout when nothing answers', async () => {
    vi.useFakeTimers()
    setScrollY(0)
    const wrapper = mount(PullToRefresh)

    await drag([100, 10], [100, 200])
    expect(wrapper.find('.ptr__icon--spinning').exists()).toBe(true)

    vi.advanceTimersByTime(15000)
    await nextTick()

    expect(wrapper.find('.ptr__icon--spinning').exists()).toBe(false)
    wrapper.unmount()
    vi.useRealTimers()
  })
})
