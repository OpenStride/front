/// <reference types="vite/client" />

// Global constants injected by Vite during build
declare const __APP_VERSION__: string
declare const __BUILD_TIME__: string

// Extend globalThis for test environments to allow assignment
declare global {
  var __APP_VERSION__: string
  var __BUILD_TIME__: string
}

export {}