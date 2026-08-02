/// <reference types="vite/client" />

// Global constants injected by Vite during build
declare const __APP_VERSION__: string
declare const __BUILD_TIME__: string

// Extend globalThis for test environments to allow assignment
declare global {
  var __APP_VERSION__: string
  var __BUILD_TIME__: string

  // Merges with vite/client's declaration. This file is a module (it exports),
  // so the augmentation has to live in `declare global` to reach anything.
  interface ImportMetaEnv {
    readonly VITE_GOOGLE_CLIENT_ID: string
    readonly VITE_GOOGLE_CLIENT_SECRET: string
    /**
     * The OAuth client the *native* app authenticates as — a different client
     * from the web one, redirecting to a custom scheme and carrying no secret.
     * Absent from a web build, and absent from a native build nobody
     * configured: the Drive screen says so rather than failing at Google's door.
     */
    readonly VITE_GOOGLE_NATIVE_CLIENT_ID?: string
  }
}

export {}
