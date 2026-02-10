// src/composables/useSlotExtensions.ts
import { shallowRef, onMounted } from 'vue'
import { getPluginViewsForSlot } from '@/services/ExtensionPluginRegistry'
import type { Component } from 'vue'

export function useSlotExtensions(slotName: string) {
  const components = shallowRef<Component[]>([])

  onMounted(async () => {
    try {
      components.value = await getPluginViewsForSlot(slotName)
    } catch {
      // IndexedDB may not be available (e.g. in test environment)
    }
  })

  return { components }
}
