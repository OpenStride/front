import type { Component } from 'vue'

/** A page a plugin adds to the app. */
export interface PluginRoute {
  path: string
  name?: string
  component: () => Promise<Component>
}
