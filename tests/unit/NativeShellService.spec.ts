import { describe, it, expect, vi, beforeEach } from 'vitest'

const isNativePlatform = vi.fn(() => false)
const open = vi.fn().mockResolvedValue(undefined)
const close = vi.fn().mockResolvedValue(undefined)
const listeners: Record<string, (payload: never) => void> = {}
const remove = vi.fn().mockResolvedValue(undefined)

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => isNativePlatform() },
  registerPlugin: (name: string) => {
    if (name === 'Browser') {
      return {
        open,
        close,
        addListener: async (event: string, cb: (p: never) => void) => {
          listeners[`Browser:${event}`] = cb
          return { remove }
        }
      }
    }
    return {
      addListener: async (event: string, cb: (p: never) => void) => {
        listeners[`App:${event}`] = cb
        return { remove }
      }
    }
  }
}))

const { nativeShell, reversedClientId } = await import('@/services/NativeShellService')

const CLIENT = '123-abc.apps.googleusercontent.com'
const SCHEME = 'com.googleusercontent.apps.123-abc'

/** Wait for the service to have subscribed before firing an event at it. */
async function settled() {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

describe('reversedClientId', () => {
  it('builds the only redirect shape Google accepts for a native client', () => {
    expect(reversedClientId(CLIENT)).toBe(SCHEME)
  })
})

describe('oauthRedirectUri', () => {
  beforeEach(() => isNativePlatform.mockReturnValue(false))

  it('is null on the web, where the page origin is a fine redirect target', () => {
    expect(nativeShell.oauthRedirectUri(CLIENT)).toBeNull()
  })

  it('is the custom scheme on native, never the WebView origin', () => {
    isNativePlatform.mockReturnValue(true)
    const uri = nativeShell.oauthRedirectUri(CLIENT)
    expect(uri).toBe(`${SCHEME}:/oauth2redirect`)
    // https://localhost is what window.location.origin would have given, and it
    // is exactly the value that produced redirect_uri_mismatch.
    expect(uri).not.toContain('localhost')
  })
})

describe('authorize', () => {
  beforeEach(() => {
    isNativePlatform.mockReturnValue(true)
    open.mockClear()
    close.mockClear()
    remove.mockClear()
  })

  it('sends the user to the system browser, not the WebView', async () => {
    const pending = nativeShell.authorize('https://accounts.google.com/o/oauth2/v2/auth', SCHEME)
    await settled()

    expect(open).toHaveBeenCalledWith({ url: 'https://accounts.google.com/o/oauth2/v2/auth' })

    listeners['App:appUrlOpen']({ url: `${SCHEME}:/oauth2redirect?code=abc&state=xyz` } as never)
    await expect(pending).resolves.toContain('code=abc')
  })

  it('closes the browser once the callback lands', async () => {
    const pending = nativeShell.authorize('https://auth', SCHEME)
    await settled()
    listeners['App:appUrlOpen']({ url: `${SCHEME}:/oauth2redirect?code=abc` } as never)
    await pending

    expect(close).toHaveBeenCalled()
  })

  it('ignores a deep link meant for something else', async () => {
    const pending = nativeShell.authorize('https://auth', SCHEME)
    await settled()

    listeners['App:appUrlOpen']({ url: 'app.openstride://something-else' } as never)
    await settled()
    expect(close).not.toHaveBeenCalled()

    listeners['App:appUrlOpen']({ url: `${SCHEME}:/oauth2redirect?code=ok` } as never)
    await expect(pending).resolves.toContain('code=ok')
  })

  it('rejects when the user closes the browser instead of signing in', async () => {
    const pending = nativeShell.authorize('https://auth', SCHEME)
    await settled()

    listeners['Browser:browserFinished'](undefined as never)
    await expect(pending).rejects.toThrow('cancelled')
  })

  it('lets go of its listeners either way', async () => {
    const pending = nativeShell.authorize('https://auth', SCHEME)
    await settled()
    listeners['App:appUrlOpen']({ url: `${SCHEME}:/oauth2redirect?code=ok` } as never)
    await pending

    expect(remove).toHaveBeenCalledTimes(2)
  })
})
