// types/extensionPlugin.ts
import type { Component } from 'vue'

export interface ExtensionPlugin {
    id: string
    label: string
    icon?: string

    // Slots dynamiques où injecter des composants Vue
    // Exemple : 'activity.top', 'dashboard.left'...
    slots?: {
        [slotName: string]: Array<() => Promise<Component>>
    }
}