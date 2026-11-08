<template>
  <svg
    class="logo-heart"
    :class="{ 'logo-heart--liked': liked, 'logo-heart--beat': beating }"
    viewBox="55.5 148 70 73"
    aria-hidden="true"
    focusable="false"
    @animationend="beating = false"
  >
    <path :d="OUTLINE" />
  </svg>
</template>

<script setup lang="ts">
/**
 * The logo itself, as the sign of a like: its leaf, its dark shield and the
 * pulse between them, as one silhouette. Liked, filled with the like colour;
 * not yet, drawn in the colour of the text around it.
 */
import { ref, watch } from 'vue'

const props = defineProps<{ liked: boolean }>()

/**
 * The logo's outline, in one piece: its leaf and its shield joined, the pulse
 * between them filled in. Taken from src/assets/logo.svg (its layer's local
 * coordinates): the tail on the left, the slanted cut, the point below.
 */
const OUTLINE =
  'M 58.643,185.458 L 66.598,185.03 L 66.598,182.05 ' +
  'C 66.78,174.512 73.633,166.567 73.633,166.56 ' +
  'C 73.633,166.56 97.538,180.745 111.467,151.421 ' +
  'C 117.717,154.145 119.219,155.066 123.334,157.301 ' +
  'C 126.147,165.173 124.563,172.718 123.158,178.827 ' +
  'L 122.782,181.888 ' +
  'C 116.79,207.178 93.072,218.571 93.072,218.571 ' +
  'C 93.072,218.571 67.06,206.759 66.689,186.779 ' +
  'C 64.087,186.344 58.643,185.458 58.643,185.458 Z'

/** One beat when a like is given — not when the page opens on one already given. */
const beating = ref(false)
watch(
  () => props.liked,
  (now, before) => {
    if (now && before === false) beating.value = true
  }
)
</script>

<style scoped>
.logo-heart {
  width: 1.15em;
  height: 1.15em;
  flex-shrink: 0;
  overflow: visible;
}

.logo-heart path {
  fill: none;
  stroke: currentColor;
  stroke-width: 4;
  stroke-linejoin: round;
  transition:
    fill 0.2s ease,
    stroke-width 0.2s ease;
}

.logo-heart--liked path {
  stroke-width: 0;
}
.logo-heart--liked path {
  fill: var(--color-like);
}

/* A heartbeat: two pulses, the second softer, from the point of the shield */
.logo-heart--beat {
  transform-origin: 50% 90%;
  animation: logo-heart-beat 0.6s ease-out;
}

@keyframes logo-heart-beat {
  0% {
    transform: scale(1);
  }
  25% {
    transform: scale(1.3);
  }
  45% {
    transform: scale(0.95);
  }
  65% {
    transform: scale(1.15);
  }
  100% {
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .logo-heart--beat {
    animation: none;
  }
}
</style>
