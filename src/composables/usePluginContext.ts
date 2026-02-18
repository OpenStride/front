import { inject } from 'vue'
import type { PluginContext } from '@/types/plugin-context'

const PLUGIN_CONTEXT_KEY = 'pluginContext'

/**
 * Composable to access the PluginContext in plugin Vue components.
 *
 * Usage:
 * ```ts
 * const { activity, storage, notifications } = usePluginContext()
 * ```
 *
 * Throws if used outside a component where PluginContext was provided.
 */
export function usePluginContext(): PluginContext {
  const ctx = inject<PluginContext>(PLUGIN_CONTEXT_KEY)
  if (!ctx) {
    throw new Error(
      '[usePluginContext] PluginContext not found. ' +
        'Ensure app.provide("pluginContext", ...) is called in main.ts.'
    )
  }
  return ctx
}

export { PLUGIN_CONTEXT_KEY }
