/**
 * Migration 0.2.0
 *
 * Example migration that initializes default aggregation preferences.
 * This serves as a template for future migrations.
 */

import type { Migration } from '@/services/MigrationService'
import { IndexedDBService } from '@/services/IndexedDBService'

export default {
  version: '0.2.0',
  description: 'Initialize default aggregation preferences',

  up: async () => {
    const db = await IndexedDBService.getInstance()
    const config = await db.getData('aggregationConfig')

    // Only create if doesn't exist
    if (!config) {
      await db.saveData('aggregationConfig', {
        enabled: true,
        groupBy: 'week',
        metrics: ['distance', 'duration', 'elevation']
      })
      console.log('[Migration 0.2.0] ✅ Default aggregation config created')
    } else {
      console.log('[Migration 0.2.0] Aggregation config already exists, skipping')
    }
  },

  down: async () => {
    const db = await IndexedDBService.getInstance()
    await db.deleteData('aggregationConfig')
    console.log('[Migration 0.2.0] ⏪ Aggregation config removed')
  }
} as Migration
