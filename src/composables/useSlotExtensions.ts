// src/composables/useSlotExtensions.ts
import { shallowRef, onMounted } from 'vue'
import { getPluginViewsForSlot } from '@/services/ExtensionPluginRegistry'
import type { Component } from 'vue'

export function useSlotExtensions(slotName: string) {
  const components = shallowRef<Component[]>([])

  onMounted(async () => {
    components.value = await getPluginViewsForSlot(slotName)
  })

  return { components }
}
