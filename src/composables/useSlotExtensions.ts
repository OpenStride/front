// src/composables/useSlotExtensions.ts
import { shallowRef, onMounted, watch } from 'vue'
import { getPluginViewsForSlot } from '@/services/ExtensionPluginRegistry'
import type { Component } from 'vue'
import type { SlotContext } from '@/types/extension'

/**
 * Components contributed to a slot by the active plugins.
 *
 * `getContext` is optional and lazily evaluated. Slots resolve on mount, which
 * is before the activity has loaded, so entries that filter on the activity
 * need the resolution to run again once it arrives — hence the watch rather
 * than a one-shot read.
 */
export function useSlotExtensions(slotName: string, getContext?: () => SlotContext) {
  const components = shallowRef<Component[]>([])

  const resolve = async () => {
    try {
      components.value = await getPluginViewsForSlot(slotName, getContext?.() ?? {})
    } catch {
      // IndexedDB may not be available (e.g. in test environment)
    }
  }

  onMounted(resolve)

  if (getContext) {
    watch(getContext, resolve)
  }

  return { components }
}
