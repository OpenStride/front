import { DataProviderPluginManager } from '@/services/DataProviderPluginManager'
import type { ProviderPlugin } from '@/types/provider'

export class DataProviderService {
  private static instance: DataProviderService
  private pluginManager = DataProviderPluginManager.getInstance()
  public emitter = new EventTarget()
  private refreshRequestedListener: ((evt: Event) => void) | null = null

  private constructor() {
    /* singleton */
  }

  public static getInstance(): DataProviderService {
    if (!DataProviderService.instance) {
      DataProviderService.instance = new DataProviderService()
    }
    return DataProviderService.instance
  }

  /**
   * Subscribe to window 'openstride:refresh-requested' events.
   * When fired, triggers data refresh and emits 'openstride:activities-refreshed' on completion.
   */
  startListening(): void {
    this.refreshRequestedListener = () => {
      this.triggerRefresh()
        .then(() => {
          window.dispatchEvent(new Event('openstride:activities-refreshed'))
        })
        .catch(err => console.error('[DataProviderService] Refresh failed:', err))
    }
    window.addEventListener('openstride:refresh-requested', this.refreshRequestedListener)
    console.log('[DataProviderService] Started listening to refresh-requested events')
  }

  /**
   * Unsubscribe from window 'openstride:refresh-requested' events.
   */
  stopListening(): void {
    if (this.refreshRequestedListener) {
      window.removeEventListener('openstride:refresh-requested', this.refreshRequestedListener)
      this.refreshRequestedListener = null
      console.log('[DataProviderService] Stopped listening')
    }
  }

  public async triggerRefresh(): Promise<void> {
    const plugins: ProviderPlugin[] = await this.pluginManager.getMyDataProviderPlugins()
    for (const plugin of plugins) {
      try {
        if (plugin.refreshData) {
          await plugin.refreshData()

          // Emit event after successful refresh
          this.emitter.dispatchEvent(
            new CustomEvent('provider-activities-imported', {
              detail: {
                providerId: plugin.id,
                providerLabel: plugin.label,
                timestamp: Date.now()
              }
            })
          )
        } else {
          console.warn(`⚠️ Plugin ${plugin.label} does not implement refreshData.`)
        }
      } catch (error) {
        console.error(`❌ DataProvider failed for plugin ${plugin.label}:`, error)
      }
    }
  }
}
