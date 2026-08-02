import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * The native app must talk to Google as a different OAuth client than the web
 * app, and reach it through a different door. Both were assumptions the web
 * build could make and the APK could not:
 *
 * - `window.location.origin` is `https://localhost` in the WebView, so a
 *   redirect_uri built from it is one no console has ever listed;
 * - a Web OAuth client only accepts http(s) redirects, and carries a secret an
 *   APK cannot keep.
 */

const store = new Map<string, unknown>()
const isNative = { value: false }

const shell = {
  get isNative() {
    return isNative.value
  },
  oauthRedirectUri: (clientId: string) =>
    isNative.value ? `${clientId.split('.').reverse().join('.')}:/oauth2redirect` : null,
  authorize: vi.fn()
}

vi.mock('@/services/PluginContextFactory', () => ({
  getPluginContext: async () => ({
    storage: {
      getData: async (k: string) => store.get(k),
      saveData: async (k: string, v: unknown) => void store.set(k, v),
      deleteData: async (k: string) => void store.delete(k),
      importFromRemote: async () => {}
    },
    shell
  })
}))

const WEB_CLIENT = 'web-1.apps.googleusercontent.com'
const NATIVE_CLIENT = 'native-9.apps.googleusercontent.com'

type AuthModule = typeof import('@plugins/storage-providers/GDrive/client/GoogleDriveAuthService')

async function loadService(native: boolean) {
  isNative.value = native
  vi.resetModules()
  const mod: AuthModule =
    await import('@plugins/storage-providers/GDrive/client/GoogleDriveAuthService')
  return mod.GoogleDriveAuthService.getInstance()
}

function paramsOf(url: string) {
  return new URL(url).searchParams
}

describe('Drive sign-in URL', () => {
  beforeEach(() => {
    store.clear()
    localStorage.clear()
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', WEB_CLIENT)
    vi.stubEnv('VITE_GOOGLE_CLIENT_SECRET', 'web-secret')
    vi.stubEnv('VITE_GOOGLE_NATIVE_CLIENT_ID', NATIVE_CLIENT)
    shell.authorize.mockReset()
  })

  afterEach(() => vi.unstubAllEnvs())

  it('redirects to the page origin on the web', async () => {
    const service = await loadService(false)
    const params = paramsOf((await service.getOauthSignInUri()) as string)

    expect(params.get('client_id')).toBe(WEB_CLIENT)
    expect(params.get('redirect_uri')).toBe(`${window.location.origin}${window.location.pathname}`)
  })

  it('redirects to the custom scheme on native, never to the WebView origin', async () => {
    const service = await loadService(true)
    const params = paramsOf((await service.getOauthSignInUri()) as string)

    expect(params.get('client_id')).toBe(NATIVE_CLIENT)
    expect(params.get('redirect_uri')).toBe('com.googleusercontent.apps.native-9:/oauth2redirect')
    expect(params.get('redirect_uri')).not.toContain('localhost')
  })

  it('still asks for PKCE on native, where there is no secret to send', async () => {
    const service = await loadService(true)
    const params = paramsOf((await service.getOauthSignInUri()) as string)

    expect(params.get('code_challenge_method')).toBe('S256')
    expect(params.get('code_challenge')).toBeTruthy()
  })
})

describe('signIn', () => {
  beforeEach(() => {
    store.clear()
    localStorage.clear()
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', WEB_CLIENT)
    vi.stubEnv('VITE_GOOGLE_CLIENT_SECRET', 'web-secret')
    vi.stubEnv('VITE_GOOGLE_NATIVE_CLIENT_ID', NATIVE_CLIENT)
    shell.authorize.mockReset()
    vi.unstubAllGlobals()
  })

  afterEach(() => vi.unstubAllEnvs())

  it('hands the web caller a URL to navigate to, and does nothing else', async () => {
    const service = await loadService(false)
    const result = await service.signIn()

    expect(result.handled).toBe(false)
    expect(result.url).toContain('accounts.google.com')
    expect(shell.authorize).not.toHaveBeenCalled()
  })

  it('runs the whole exchange on native, and posts no client_secret', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'at', refresh_token: 'rt', expires_in: 3600 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const service = await loadService(true)
    shell.authorize.mockImplementation(async () => {
      const state = localStorage.getItem('pkce_state')
      return `com.googleusercontent.apps.native-9:/oauth2redirect?code=the-code&state=${state}`
    })

    const result = await service.signIn()
    expect(result.handled).toBe(true)

    const body = fetchMock.mock.calls[0][1].body as URLSearchParams
    expect(body.get('code')).toBe('the-code')
    expect(body.get('client_id')).toBe(NATIVE_CLIENT)
    expect(body.get('client_secret')).toBeNull()
    expect(body.get('code_verifier')).toBeTruthy()
    expect(store.get('gdrive_refresh_token')).toBe('rt')
  })

  it('refuses a callback whose state is not the one it sent', async () => {
    const service = await loadService(true)
    shell.authorize.mockResolvedValue(
      'com.googleusercontent.apps.native-9:/oauth2redirect?code=x&state=forged'
    )

    await expect(service.signIn()).rejects.toThrow('state_mismatch')
  })

  it('surfaces the provider error when no code comes back', async () => {
    const service = await loadService(true)
    shell.authorize.mockImplementation(async () => {
      const state = localStorage.getItem('pkce_state')
      return `com.googleusercontent.apps.native-9:/oauth2redirect?error=access_denied&state=${state}`
    })

    await expect(service.signIn()).rejects.toThrow('access_denied')
  })

  it('says so rather than guessing when the build has no native client', async () => {
    vi.stubEnv('VITE_GOOGLE_NATIVE_CLIENT_ID', '')
    const service = await loadService(true)

    await expect(service.signIn()).rejects.toThrow('VITE_GOOGLE_NATIVE_CLIENT_ID is not set')
  })
})
