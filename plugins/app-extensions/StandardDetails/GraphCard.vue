<template>
  <section class="graph-card">
    <header class="graph-card__header">
      <h3 class="graph-card__title">
        <i class="fas" :class="icon" :style="{ color: accent }" aria-hidden="true"></i>
        <span>{{ title }}</span>
      </h3>
      <div v-if="$slots.actions" class="graph-card__actions">
        <slot name="actions" />
      </div>
    </header>

    <div class="graph-card__body">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * Shared wrapper for every activity-detail graph so cards and headers stay
 * visually consistent (surface, radius, shadow, title + icon, controls slot).
 * Purely presentational — charts render their own canvas inside the default slot.
 */
withDefaults(
  defineProps<{
    title: string
    /** Font Awesome 6 icon class, e.g. "fa-heart-pulse" */
    icon: string
    /** Accent colour for the icon (a CSS variable), defaults to brand green */
    accent?: string
  }>(),
  { accent: 'var(--color-green-500)' }
)
</script>

<style scoped>
.graph-card {
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  padding: 1rem 1.25rem;
}

.graph-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.85rem;
}

.graph-card__title {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.05rem;
  font-weight: var(--font-weight-bold);
  color: var(--text-color);
}

.graph-card__title i {
  font-size: 1rem;
  line-height: 1;
}

.graph-card__actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.graph-card__body :deep(canvas) {
  width: 100% !important;
  max-width: 100%;
}
</style>
