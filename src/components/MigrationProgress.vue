<template>
  <transition name="fade">
    <div v-if="migrating" class="migration-overlay">
      <div class="migration-card">
        <i class="fas fa-sync fa-spin" aria-hidden="true"></i>
        <h2>{{ t('migration.updating') }}</h2>
        <p>{{ currentMigration }}</p>
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: progress + '%' }"></div>
        </div>
        <small>{{ t('migration.pleaseWait') }}</small>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { getMigrationService } from '@/services/MigrationService'
import type { MigrationEvent } from '@/services/MigrationService'

const { t } = useI18n()
const migrationService = getMigrationService()

const migrating = ref(false)
const currentMigration = ref('')
const progress = ref(0)

const handleMigrationStarted = () => {
  migrating.value = true
  progress.value = 0
  currentMigration.value = ''
}

const handleMigrationProgress = (evt: Event) => {
  const customEvent = evt as CustomEvent<MigrationEvent>
  currentMigration.value = customEvent.detail.currentMigration || ''
  progress.value = customEvent.detail.progress || 0
}

const handleMigrationCompleted = () => {
  progress.value = 100
  setTimeout(() => {
    migrating.value = false
  }, 500)
}

const handleMigrationFailed = () => {
  migrating.value = false
}

onMounted(() => {
  migrationService.emitter.addEventListener('migration-started', handleMigrationStarted)
  migrationService.emitter.addEventListener('migration-progress', handleMigrationProgress)
  migrationService.emitter.addEventListener('migration-completed', handleMigrationCompleted)
  migrationService.emitter.addEventListener('migration-failed', handleMigrationFailed)
})

onUnmounted(() => {
  migrationService.emitter.removeEventListener('migration-started', handleMigrationStarted)
  migrationService.emitter.removeEventListener('migration-progress', handleMigrationProgress)
  migrationService.emitter.removeEventListener('migration-completed', handleMigrationCompleted)
  migrationService.emitter.removeEventListener('migration-failed', handleMigrationFailed)
})
</script>

<style scoped>
.migration-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.migration-card {
  background: white;
  border-radius: 12px;
  padding: 40px;
  max-width: 400px;
  text-align: center;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.migration-card i {
  font-size: 48px;
  color: var(--color-green-500);
  margin-bottom: 20px;
}

.migration-card h2 {
  font-size: 24px;
  margin-bottom: 12px;
  color: #333;
}

.migration-card p {
  font-size: 14px;
  color: #666;
  margin-bottom: 20px;
  min-height: 40px;
}

.progress-bar {
  width: 100%;
  height: 8px;
  background: #e0e0e0;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 12px;
}

.progress-fill {
  height: 100%;
  background: var(--color-green-500);
  transition: width 0.3s ease;
}

.migration-card small {
  font-size: 12px;
  color: #999;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
