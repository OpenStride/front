export async function sha256Hex(input: string): Promise<string> {
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    const enc = new TextEncoder()
    const buf = await window.crypto.subtle.digest('SHA-256', enc.encode(input))
    return Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  }
  // Fallback naïf (non cryptographique) si environment sans subtle
  let h = 0,
    i = 0,
    len = input.length
  while (i < len) {
    h = (Math.imul(31, h) + input.charCodeAt(i++)) | 0
  }
  return ('00000000' + (h >>> 0).toString(16)).slice(-8)
}

export function stableStoreString(items: any[], keyFn: (x: any) => string): string {
  const stripped = items.map(it => {
    if (!it || typeof it !== 'object') return it
    const { lastModified, ...rest } = it as any
    return rest
  })
  stripped.sort((a, b) => {
    const ka = keyFn(a) || ''
    const kb = keyFn(b) || ''
    return ka.localeCompare(kb)
  })
  return JSON.stringify(stripped)
}
