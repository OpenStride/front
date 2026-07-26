/**
 * PKCE helpers shared by every OAuth-based storage provider.
 *
 * Kept dependency-free (WebCrypto only) so each provider plugin can build its
 * authorization URL without duplicating the challenge derivation.
 */

/**
 * Random string usable both as a PKCE `code_verifier` and as an OAuth `state`.
 *
 * The base36 encoding yields 1-2 characters per byte, so the default 64 bytes
 * land between 64 and 128 characters — inside the 43-128 range the PKCE spec
 * requires, and within the 500-character `state` limit providers enforce.
 */
export function generateRandomString(length = 64): string {
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  return Array.from(array, b => b.toString(36)).join('')
}

/** S256 challenge: base64url(sha256(verifier)). */
export async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const data = new TextEncoder().encode(codeVerifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}
