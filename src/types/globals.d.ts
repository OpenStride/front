/**
 * Global constants injected at build time by Vite
 */
declare const __APP_VERSION__: string
declare const __BUILD_TIME__: string

/**
 * Minimal ambient types for `pako` (ships no type declarations).
 */
declare module 'pako' {
  export function ungzip(data: Uint8Array | ArrayBuffer): Uint8Array
  export function gzip(data: Uint8Array | string): Uint8Array
  export function inflate(data: Uint8Array | ArrayBuffer): Uint8Array
  export function deflate(data: Uint8Array | string): Uint8Array
  const pako: {
    ungzip: typeof ungzip
    gzip: typeof gzip
    inflate: typeof inflate
    deflate: typeof deflate
  }
  export default pako
}
