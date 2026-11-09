<template>
  <!-- Long jobs (a first import) shown on every page: leaving the plugin's
       screen must not look like stopping the work -->
  <section v-if="tasks.length" class="bg-tasks" aria-live="polite" data-test="background-tasks">
    <component
      :is="task.route ? RouterLink : 'div'"
      v-for="task in tasks"
      :key="task.id"
      :to="task.route"
      class="bg-task"
      data-test="background-task"
    >
      <i class="fas fa-circle-notch fa-spin bg-task__icon" aria-hidden="true"></i>
      <div class="bg-task__body">
        <p class="bg-task__title">
          {{ t(task.title.key, task.title.params ?? {}) }}
          <span v-if="percent(task) !== null" class="bg-task__pct">{{ percent(task) }} %</span>
        </p>
        <p v-if="task.detail" class="bg-task__detail">
          {{ t(task.detail.key, task.detail.params ?? {}) }}
        </p>
        <div
          class="bg-task__bar"
          role="progressbar"
          :aria-label="t(task.title.key, task.title.params ?? {})"
          :aria-valuenow="percent(task) ?? undefined"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <div
            class="bg-task__fill"
            :class="{ 'bg-task__fill--indeterminate': percent(task) === null }"
            :style="percent(task) !== null ? { width: `${percent(task)}%` } : undefined"
          ></div>
        </div>
        <p class="bg-task__hint">{{ t('backgroundTasks.carryOn') }}</p>
      </div>
    </component>
  </section>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { backgroundTasks } from '@/services/BackgroundTaskService'
import type { BackgroundTask } from '@/types/plugin-context'

const { t } = useI18n()
const tasks = backgroundTasks.list

function percent(task: BackgroundTask): number | null {
  if (!task.total) return null
  return Math.min(100, Math.round(((task.done ?? 0) / task.total) * 100))
}
</script>

<style scoped>
.bg-tasks {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 20px 0;
}
.bg-task {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 12px 14px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--text-color);
  text-decoration: none;
}
.bg-task__icon {
  margin-top: 2px;
  color: var(--color-green-500);
}
.bg-task__body {
  flex: 1;
  min-width: 0;
}
.bg-task__title {
  margin: 0;
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-weight: 600;
}
.bg-task__pct {
  color: var(--text-muted);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.bg-task__detail {
  margin: 2px 0 0;
  color: var(--text-muted);
  font-size: 0.9rem;
}
.bg-task__bar {
  position: relative;
  height: 4px;
  margin-top: 8px;
  overflow: hidden;
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
}
.bg-task__fill {
  height: 100%;
  border-radius: var(--radius-sm);
  background: var(--color-green-500);
  transition: width 0.6s ease;
}
.bg-task__fill--indeterminate {
  position: absolute;
  width: 35%;
  animation: bg-task-slide 1.4s ease-in-out infinite;
}
@keyframes bg-task-slide {
  from {
    left: -35%;
  }
  to {
    left: 100%;
  }
}
.bg-task__hint {
  margin: 6px 0 0;
  color: var(--text-faint);
  font-size: 0.8rem;
}
@media (prefers-reduced-motion: reduce) {
  .bg-task__fill--indeterminate {
    animation: none;
    left: 0;
  }
}
</style>
