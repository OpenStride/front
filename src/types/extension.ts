// types/extensionPlugin.ts
import type { Component, InjectionKey } from 'vue'
import type { PluginContext } from './plugin-context'
import type { Activity, ActivityDetails } from './activity'

/**
 * What the activity page lends the panel that opens it: its likes and
 * comments, so they close that panel rather than float under it. Provided by
 * the page, rendered by whichever extension draws the panel — which so never
 * reaches for a core component itself.
 */
export const ACTIVITY_PANEL_FOOTER: InjectionKey<Component> = Symbol('activityPanelFooter')

/** What a slot entry gets to decide whether it is worth showing. */
export interface SlotContext {
  activity?: Activity
  details?: ActivityDetails
}

/**
 * A slot entry that can opt out of being rendered.
 *
 * Most "wrong widget for this sport" cases are really "no data for this
 * widget" — an elevation profile is absurd on a pool swim because there is no
 * elevation, not because it is swimming. Letting each widget answer that itself
 * keeps core from having to hold a list of plugin widget ids, which would
 * invert the dependency the plugin guidelines are built on.
 */
export interface SlotEntry {
  id: string
  component: () => Promise<Component>
  /** Omitted means "always applies". */
  appliesTo?: (ctx: SlotContext) => boolean
}

export interface ExtensionPlugin {
  id: string
  label: string
  description?: string
  icon?: string

  // Slots dynamiques où injecter des composants Vue
  // Exemple : 'activity.top', 'dashboard.left'...
  // A bare loader is accepted and means "always applies", so existing plugins
  // keep working untouched.
  slots?: {
    [slotName: string]: Array<SlotEntry | (() => Promise<Component>)>
  }

  // Routes à injecter dynamiquement dans le routeur
  routes?: Array<{
    path: string
    name?: string
    component: () => Promise<Component>
  }>

  context?: PluginContext
}
