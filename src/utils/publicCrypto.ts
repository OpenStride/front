/**
 * Encryption of the files a reader publishes for their friends.
 *
 * A public file lives at an unguessable but readable link (Google Drive "anyone
 * with the link"). Sealing it means that link alone reveals nothing: the key
 * travels only in the share link's fragment (`#k=…`), which a browser never
 * sends to a server, so neither the storage nor openstride.org ever holds both.
 *
 * AES-GCM 256, a fresh IV per file, JSON in and out. A payload that is not
 * sealed is returned as it is, so profiles published before this keep reading.
 */

const ALGO = 'AES-GCM'

/**
 * Settings key of the reader's own share key. Replicated with their settings:
 * every device of theirs must seal with the same key their friends hold.
 */
export const OWNER_SHARE_KEY = 'publicShareKey'

/** The envelope a sealed file is stored as. */
export interface SealedPayload {
  openstride: 'sealed'
  v: 1
  iv: string
  data: string
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** A new random key, as the text that goes after `#k=` in a share link. */
export function generateShareKey(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(32)))
}

function importKey(key: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', fromBase64Url(key).buffer as ArrayBuffer, ALGO, false, [
    'encrypt',
    'decrypt'
  ])
}

export function isSealed(payload: unknown): payload is SealedPayload {
  return (
    !!payload && typeof payload === 'object' && (payload as SealedPayload).openstride === 'sealed'
  )
}

export async function sealJson(content: unknown, key: string): Promise<SealedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plain = new TextEncoder().encode(JSON.stringify(content))
  const cipher = await crypto.subtle.encrypt({ name: ALGO, iv }, await importKey(key), plain)
  return {
    openstride: 'sealed',
    v: 1,
    iv: toBase64Url(iv),
    data: toBase64Url(new Uint8Array(cipher))
  }
}

/**
 * The content of a fetched public file: decrypted when sealed, as-is otherwise.
 * Throws when it is sealed and the key is missing or wrong — the caller treats
 * that as an unreachable profile, which is what it is to this reader.
 */
export async function openJson<T>(payload: unknown, key: string | undefined): Promise<T> {
  if (!isSealed(payload)) return payload as T
  if (!key) throw new Error('Sealed public file and no key to open it')
  const plain = await crypto.subtle.decrypt(
    { name: ALGO, iv: fromBase64Url(payload.iv).buffer as ArrayBuffer },
    await importKey(key),
    fromBase64Url(payload.data).buffer as ArrayBuffer
  )
  return JSON.parse(new TextDecoder().decode(plain)) as T
}
