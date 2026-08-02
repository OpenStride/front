import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  saveHandshake,
  readHandshake,
  clearHandshake,
  markCodeConsumed,
  isCodeConsumed
} from '@plugins/data-providers/GarminProvider/client/oauthHandshake'

describe('Garmin OAuth handshake', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('round-trips the state and the verifier', () => {
    saveHandshake('state-abc', 'verifier-xyz')

    const handshake = readHandshake()
    expect(handshake?.state).toBe('state-abc')
    expect(handshake?.verifier).toBe('verifier-xyz')
  })

  // The whole point of the move away from sessionStorage: in a PWA the callback
  // can land in a browsing context that never saw the request being started.
  it('survives in localStorage, not sessionStorage', () => {
    saveHandshake('state-abc', 'verifier-xyz')

    expect(sessionStorage.length).toBe(0)
    expect(localStorage.length).toBeGreaterThan(0)
  })

  it('returns nothing once cleared', () => {
    saveHandshake('state-abc', 'verifier-xyz')
    clearHandshake()

    expect(readHandshake()).toBeNull()
  })

  it('expires a handshake the user left behind', () => {
    vi.useFakeTimers()
    saveHandshake('state-abc', 'verifier-xyz')

    vi.advanceTimersByTime(9 * 60 * 1000)
    expect(readHandshake()).not.toBeNull()

    vi.advanceTimersByTime(2 * 60 * 1000)
    expect(readHandshake()).toBeNull()
  })

  it('survives a corrupted entry without throwing', () => {
    localStorage.setItem('garmin_oauth_handshake', '{not json')
    expect(readHandshake()).toBeNull()
  })

  describe('consumed codes', () => {
    it('flags only the code that was consumed', () => {
      markCodeConsumed('code-1')

      expect(isCodeConsumed('code-1')).toBe(true)
      expect(isCodeConsumed('code-2')).toBe(false)
    })

    it('reports nothing consumed on a fresh device', () => {
      expect(isCodeConsumed('code-1')).toBe(false)
    })

    it('stops flagging a code once the duplicate window has passed', () => {
      vi.useFakeTimers()
      markCodeConsumed('code-1')

      vi.advanceTimersByTime(30 * 1000)
      expect(isCodeConsumed('code-1')).toBe(true)

      vi.advanceTimersByTime(40 * 1000)
      expect(isCodeConsumed('code-1')).toBe(false)
    })
  })
})
