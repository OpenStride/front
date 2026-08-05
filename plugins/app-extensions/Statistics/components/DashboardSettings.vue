<template>
  <div class="settings" data-test="dashboard-settings">
    <p class="lead">{{ t('statistics.layout.lead') }}</p>

    <ul class="rows">
      <li
        v-for="(id, index) in layout.order"
        :key="id"
        class="row"
        :class="{ 'row--off': !isVisible(layout, id) }"
        :data-test="`layout-row-${id}`"
      >
        <label class="switch">
          <input
            type="checkbox"
            role="switch"
            :checked="isVisible(layout, id)"
            :aria-checked="isVisible(layout, id)"
            :aria-label="t('statistics.layout.show', { name: t(`statistics.layout.names.${id}`) })"
            :data-test="`layout-toggle-${id}`"
            @change="$emit('toggle', id)"
          />
          <span class="switch__track" aria-hidden="true"></span>
        </label>

        <span class="row__label">{{ t(`statistics.layout.names.${id}`) }}</span>

        <div class="row__actions">
          <button
            type="button"
            class="btn-icon"
            :disabled="index === 0"
            :aria-label="t('statistics.layout.up', { name: t(`statistics.layout.names.${id}`) })"
            :data-test="`layout-up-${id}`"
            @click="$emit('move', id, -1)"
          >
            <i class="fas fa-arrow-up" aria-hidden="true"></i>
          </button>
          <button
            type="button"
            class="btn-icon"
            :disabled="index === layout.order.length - 1"
            :aria-label="t('statistics.layout.down', { name: t(`statistics.layout.names.${id}`) })"
            :data-test="`layout-down-${id}`"
            @click="$emit('move', id, 1)"
          >
            <i class="fas fa-arrow-down" aria-hidden="true"></i>
          </button>
        </div>
      </li>
    </ul>

    <button type="button" class="btn-secondary" data-test="layout-reset" @click="$emit('reset')">
      <i class="fas fa-rotate-left" aria-hidden="true"></i>
      {{ t('statistics.layout.reset') }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { isVisible, type DashboardLayout, type DashboardSectionId } from '../dashboardLayout'

defineProps<{ layout: DashboardLayout }>()

defineEmits<{
  toggle: [id: DashboardSectionId]
  move: [id: DashboardSectionId, delta: -1 | 1]
  reset: []
}>()

const { t } = useI18n()
</script>

<style scoped>
.settings {
  padding: 1rem;
  margin-bottom: 1.5rem;
  background: var(--card-background);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
}

.lead {
  margin: 0 0 0.7rem;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.rows {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0;
  margin: 0 0 0.8rem;
  list-style: none;
}

.row {
  display: flex;
  gap: 0.7rem;
  align-items: center;
  padding: 0.5rem 0.7rem;
  background: var(--background-color);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm, 6px);
}

/* A hidden section stays legible — it is a row you can bring back, not a
   disabled control. */
.row--off .row__label {
  color: var(--text-secondary);
  text-decoration: line-through;
}

.row__label {
  flex: 1;
  min-width: 0;
  font-size: 0.9rem;
  color: var(--text-color);
}

.row__actions {
  display: flex;
  gap: 0.25rem;
}

.switch {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
  cursor: pointer;
}

.switch input {
  position: absolute;
  width: 100%;
  height: 100%;
  margin: 0;
  cursor: pointer;
  opacity: 0;
}

.switch__track {
  width: 2.2rem;
  height: 1.2rem;
  background: var(--border-color);
  border-radius: 999px;
  transition: background 0.15s ease;
}

.switch__track::after {
  display: block;
  width: 0.9rem;
  height: 0.9rem;
  margin: 0.15rem;
  content: '';
  background: var(--card-background);
  border-radius: 50%;
  transition: transform 0.15s ease;
}

.switch input:checked + .switch__track {
  background: var(--primary-color);
}

.switch input:checked + .switch__track::after {
  transform: translateX(1rem);
}

.btn-secondary,
.btn-icon {
  display: inline-flex;
  gap: 0.4rem;
  align-items: center;
  padding: 0.4rem 0.65rem;
  font-size: 0.85rem;
  color: var(--text-color);
  cursor: pointer;
  background: var(--card-background);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm, 6px);
}

.btn-icon:disabled {
  cursor: not-allowed;
  opacity: 0.35;
}
</style>
