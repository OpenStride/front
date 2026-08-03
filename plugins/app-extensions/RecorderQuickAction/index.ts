import { Capacitor } from '@capacitor/core'
import type { ExtensionPlugin } from '@/types/extension'

/**
 * Start, pause and finish a recording without going through the provider's
 * setup page.
 *
 * It lives here rather than in `RecorderProvider` because only an app extension
 * can contribute to a slot, and it drives that provider's session module
 * directly — the two are one feature wearing two plugin types.
 *
 * `appliesTo` answers on the platform, synchronously, so the web build never
 * loads the chunk: everything behind it talks to a native geolocation plugin
 * that is not there. Whether the recorder itself is switched on is a question
 * with an async answer, so the component asks it on mount.
 */
const plugin: ExtensionPlugin = {
  id: 'recorder-quick-action',
  label: 'Record activity — quick action',
  description: 'Start, pause and finish a GPS recording from the home screen',
  icon: 'fas fa-circle-dot',
  slots: {
    'home.top': [
      {
        id: 'recorder-quick-action',
        component: () => import('./RecorderQuickAction.vue'),
        appliesTo: () => Capacitor.isNativePlatform()
      }
    ]
  }
}

export default plugin
