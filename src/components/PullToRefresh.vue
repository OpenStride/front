<script setup lang="ts">
import { computed } from 'vue'
import { useAppRefresh } from '@/composables/useAppRefresh'
import { usePullToRefresh, TRIGGER_DISTANCE } from '@/composables/usePullToRefresh'

const { refreshing, requestRefresh } = useAppRefresh()
const { distance, state, dragging } = usePullToRefresh({
  onTrigger: requestRefresh,
  active: refreshing
})

/** 0 → 1 as the pull approaches the point where it arms. */
const progress = computed(() => Math.min(distance.value / TRIGGER_DISTANCE, 1))

const indicatorStyle = computed(() => ({
  transform: `translate3d(-50%, ${distance.value}px, 0)`,
  opacity: String(Math.min(progress.value * 1.6, 1))
}))

// While pulling, the arrows follow the finger; once refreshing, they spin.
const iconStyle = computed(() =>
  state.value === 'refreshing' ? undefined : { transform: `rotate(${progress.value * 270}deg)` }
)
</script>

<template>
  <div class="ptr" aria-hidden="true">
    <div
      class="ptr__indicator"
      :class="{
        'ptr__indicator--armed': state === 'armed',
        'ptr__indicator--settling': !dragging
      }"
      :style="indicatorStyle"
    >
      <span
        class="ptr__icon"
        :class="{ 'ptr__icon--spinning': state === 'refreshing' }"
        :style="iconStyle"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.4"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M4.5 8.5a7.5 7.5 0 0 1 12.4-3.9l1.1 1.1" />
          <path d="M18 3.5v4.2h-4.2" />
          <path d="M19.5 15.5a7.5 7.5 0 0 1-12.4 3.9L6 18.3" />
          <path d="M6 20.5v-4.2h4.2" />
        </svg>
      </span>
    </div>
  </div>
</template>

<style scoped>
/* Sits right under the header in the flow but takes no height, so the badge's
   rest position is the header's bottom edge whatever the header measures. */
.ptr {
  position: relative;
  height: 0;
  /* Below the header's z-index 100: the badge slides out from behind it. */
  z-index: 99;
  pointer-events: none;
}

.ptr__indicator {
  position: absolute;
  top: 0;
  left: 50%;
  /* Parked above the container, i.e. hidden behind the opaque header. */
  margin-top: -46px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: var(--radius-pill);
  background: var(--surface);
  box-shadow: var(--shadow-card);
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
  will-change: transform;
}

.ptr__indicator--armed {
  color: var(--color-green-500);
  border-color: var(--color-green-200);
}

/* Transitions only once the finger is off — during the drag the badge tracks it. */
.ptr__indicator--settling {
  transition:
    transform 0.3s cubic-bezier(0.2, 0.8, 0.3, 1),
    opacity 0.25s ease,
    color 0.2s ease;
}

.ptr__icon {
  display: block;
  transition: transform 0.1s linear;
}

.ptr__icon svg {
  display: block;
  width: 20px;
  height: 20px;
}

@keyframes ptr-spin {
  to {
    transform: rotate(360deg);
  }
}

.ptr__icon--spinning {
  animation: ptr-spin 0.8s linear infinite;
  transition: none;
}

@media (prefers-reduced-motion: reduce) {
  .ptr__icon {
    transition: none;
  }
  .ptr__icon--spinning {
    animation-duration: 2.4s;
  }
}
</style>
