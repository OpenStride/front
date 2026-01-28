/* eslint-disable */
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

// Global constants injected by Vite during build
declare global {
  const __APP_VERSION__: string
  const __BUILD_TIME__: string
}
