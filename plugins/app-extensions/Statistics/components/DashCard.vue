<template>
  <section class="dash-card">
    <header class="dash-card__header">
      <h3 class="dash-card__title">
        <i class="fas" :class="icon" aria-hidden="true"></i>
        <span>{{ title }}</span>
      </h3>
      <div v-if="$slots.aside" class="dash-card__aside">
        <slot name="aside" />
      </div>
    </header>
    <slot />
  </section>
</template>

<script setup lang="ts">
/**
 * The card every dashboard block sits in.
 *
 * The same surface, header and title as the activity-detail graphs
 * (`StandardDetails/GraphCard.vue`): a reader going from an outing to the
 * dashboard should not feel they changed app. Restated here rather than
 * imported, because a plugin does not reach into another plugin's files.
 */
defineProps<{
  title: string
  /** Font Awesome 6 icon class, e.g. "fa-chart-column". */
  icon: string
}>()
</script>

<style scoped>
.dash-card {
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  border-radius: 0;
  box-shadow: var(--shadow-card);
  padding: 1rem 1.25rem;
  min-width: 0;
}

.dash-card__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem 0.75rem;
  margin-bottom: 0.85rem;
}

.dash-card__title {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.05rem;
  font-weight: var(--font-weight-bold);
  color: var(--text-color);
}

.dash-card__title i {
  font-size: 1rem;
  line-height: 1;
  color: var(--color-green-500);
}

.dash-card__aside {
  font-size: 0.82rem;
  color: var(--text-muted);
}

@media (max-width: 640px) {
  .dash-card {
    padding: 1rem;
  }
}
</style>
