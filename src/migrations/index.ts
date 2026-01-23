/**
 * Migration Registry
 *
 * Central registry of all app-level migrations.
 * Add new migrations here as versions evolve.
 */

import type { Migration } from '@/services/MigrationService'
import migration_0_2_0 from './0.2.0'

// Add new migrations in version order
export const migrations: Migration[] = [
  migration_0_2_0
  // Future migrations go here:
  // migration_0_3_0,
  // migration_1_0_0,
]
