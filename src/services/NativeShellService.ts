/**
 * What the native shell can do that a browser tab cannot — and what it cannot
 * do that a browser tab can.
 *
 * The second half is the reason this exists. An OAuth redirect flow assumes two
 * things a Capacitor WebView does not provide:
 *
 * 1. **A real origin.** With `androidScheme: "https"` the app is served from
 *    `https://localhost`, so every `redirect_uri` built from
 *    `window.location.origin` is a URI no provider has ever heard of —
 *    `Error 400: redirect_uri_mismatch`.
 * 2. **A browser Google will talk to.** Google refuses its sign-in page inside
 *    an embedded WebView (`disallowed_useragent`, "this app may not be
 *    secure"). That is policy, not configuration: no redirect URI makes
 *    navigating the WebView to `accounts.google.com` work.
 *
 * So on native the authorization step leaves the app entirely — a Custom Tab on
 * Android, `SFSafariViewController` on iOS — and comes back through a deep link
 * on a custom scheme. `authorize()` is that round trip.
 *
 * The two Capacitor plugins are reached through `registerPlugin`, not through
 * an import of their packages: they are installed only in the native CI build,
 * and an import of a package the web build cannot resolve is exactly the bug
 * that kept the GPS recorder from ever starting (see
 * `docs/plans/CAPACITOR_GEOLOCATION.md`).
 */

import { Capacitor, registerPlugin } from '@capacitor/core'

interface BrowserPlugin {
  open(options: { url: string }): Promise<void>
  close(): Promise<void>
  addListener(event: 'browserFinished', cb: () => void): Promise<{ remove: () => Promise<void> }>
}

interface AppPlugin {
  addListener(
    event: 'appUrlOpen',
    cb: (data: { url: string }) => void
  ): Promise<{ remove: () => Promise<void> }>
}

const Browser = registerPlugin<BrowserPlugin>('Browser')
const App = registerPlugin<AppPlugin>('App')

/** The path a provider redirects back to, appended to the custom scheme. */
const REDIRECT_PATH = '/oauth2redirect'

/**
 * Google identifies a native client by the reverse of its client id, and only
 * accepts a custom-scheme redirect built from it:
 * `123-abc.apps.googleusercontent.com` → `com.googleusercontent.apps.123-abc`.
 */
export function reversedClientId(clientId: string): string {
  return clientId.split('.').reverse().join('.')
}

export interface INativeShell {
  /** Running inside the native shell rather than a browser. */
  readonly isNative: boolean

  /**
   * The redirect URI a native OAuth client must use, or null on the web, where
   * the caller's own origin is a perfectly good redirect target.
   */
  oauthRedirectUri(clientId: string): string | null

  /**
   * Send the user to the system browser to authorize, and resolve with the
   * callback URL the provider deep-links back to.
   *
   * Rejects if the user closes the browser without finishing — a cancelled
   * sign-in has to be a rejected promise, not a promise that never settles.
   */
  authorize(url: string, redirectScheme: string): Promise<string>
}

export const nativeShell: INativeShell = {
  get isNative() {
    return Capacitor.isNativePlatform()
  },

  oauthRedirectUri(clientId: string): string | null {
    if (!Capacitor.isNativePlatform()) return null
    return `${reversedClientId(clientId)}:${REDIRECT_PATH}`
  },

  async authorize(url: string, redirectScheme: string): Promise<string> {
    let resolveCallback!: (callbackUrl: string) => void
    let rejectCallback!: (reason: Error) => void
    const callback = new Promise<string>((resolve, reject) => {
      resolveCallback = resolve
      rejectCallback = reject
    })
    let settled = false

    // Subscribed before the browser opens: a fast provider can deep-link back
    // before `open()` has even resolved.
    const urlListener = await App.addListener('appUrlOpen', ({ url: incoming }) => {
      if (settled || !incoming.startsWith(redirectScheme)) return
      settled = true
      resolveCallback(incoming)
      void Browser.close().catch(() => {
        // Already gone — the OS closed the tab when it followed the deep link.
      })
    })
    const closeListener = await Browser.addListener('browserFinished', () => {
      // Fires on our own close() too, so it only means "the user gave up" while
      // no callback has arrived.
      if (settled) return
      settled = true
      rejectCallback(new Error('cancelled'))
    })

    try {
      await Browser.open({ url })
      return await callback
    } finally {
      // A listener the bridge has already dropped is not a failure worth
      // propagating over the token we just went to fetch.
      await urlListener.remove().catch(() => {
        /* already gone */
      })
      await closeListener.remove().catch(() => {
        /* already gone */
      })
    }
  }
}
