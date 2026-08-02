// State of an in-flight Garmin OAuth 2.0 PKCE handshake.
//
// localStorage, not sessionStorage: in a standalone PWA the authorization page is
// not a classic popup. Android hands it to a Custom Tab and COOP nullifies
// `window.opener` on the way back from Garmin, so the callback can land in a
// browsing context whose sessionStorage is empty — a state written there could
// never be matched, and every redirect fallback ended on "state mismatch".
// localStorage is shared by every same-origin context of the profile.

const HANDSHAKE_KEY = 'garmin_oauth_handshake'
const CONSUMED_KEY = 'garmin_oauth_consumed_code'

// A user who leaves the Garmin page open for longer than this restarts the flow.
const HANDSHAKE_TTL_MS = 10 * 60 * 1000

// How long a code stays flagged as already handled. Only has to outlive the
// duplicate delivery it guards against (a callback window redirecting a second
// later), never a real reconnection.
const CONSUMED_TTL_MS = 60 * 1000

export interface OAuthHandshake {
  state: string
  verifier: string
  createdAt: number
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function saveHandshake(state: string, verifier: string): void {
  const handshake: OAuthHandshake = { state, verifier, createdAt: Date.now() }
  localStorage.setItem(HANDSHAKE_KEY, JSON.stringify(handshake))
}

export function readHandshake(): OAuthHandshake | null {
  const handshake = readJson<OAuthHandshake>(HANDSHAKE_KEY)
  if (!handshake?.state || !handshake.verifier) return null

  if (Date.now() - handshake.createdAt > HANDSHAKE_TTL_MS) {
    clearHandshake()
    return null
  }
  return handshake
}

export function clearHandshake(): void {
  localStorage.removeItem(HANDSHAKE_KEY)
}

// An authorization code is single-use. Flagging it lets a second delivery of the
// same callback — postMessage *and* BroadcastChannel, or a callback window that
// redirected before its acknowledgement landed — be ignored in silence instead
// of being reported as a state mismatch the user can do nothing about.
export function markCodeConsumed(code: string): void {
  localStorage.setItem(CONSUMED_KEY, JSON.stringify({ code, at: Date.now() }))
}

export function isCodeConsumed(code: string): boolean {
  const entry = readJson<{ code: string; at: number }>(CONSUMED_KEY)
  if (!entry || entry.code !== code) return false

  if (Date.now() - entry.at > CONSUMED_TTL_MS) {
    localStorage.removeItem(CONSUMED_KEY)
    return false
  }
  return true
}
