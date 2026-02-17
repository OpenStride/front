// types/extensionPlugin.ts
import type { Component } from 'vue'
import type { PluginContext } from './plugin-context'

export interface ExtensionPlugin {
  id: string
  label: string
  description?: string
  icon?: string

  // Slots dynamiques où injecter des composants Vue
  // Exemple : 'activity.top', 'dashboard.left'...
  slots?: {
    [slotName: string]: Array<() => Promise<Component>>
  }

  // Routes à injecter dynamiquement dans le routeur
  routes?: Array<{
    path: string
    name?: string
    component: () => Promise<Component>
  }>

  context?: PluginContext
}
