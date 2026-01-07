<template>
  <div class="chart-container">
    <canvas ref="canvas"></canvas>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch, nextTick } from 'vue';
import Chart from 'chart.js/auto';
import type { AggregatedRecord } from '@/types/aggregation';

const props = defineProps<{
  weeks: string[];
  distance: number[];
  yLabel?: string;
}>();

const canvas = ref<HTMLCanvasElement|null>(null);
let chart: Chart|null = null;

onMounted(async () => {
  await nextTick();
  if (canvas.value) {
    chart = new Chart(canvas.value, {
      type: 'line',
      data: {
        labels: props.weeks,
        datasets: [
          {
            label: '',
            data: props.distance,
            borderColor: '#18794e',
            backgroundColor: 'rgba(24,121,78,0.12)',
            fill: false,
            tension: 0.2,
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
        },
        scales: {
          x: { title: { display: false, text: '' } },
          y: {
            title: { display: false, text: '' },
            beginAtZero: true
          }
        }
      }
    });
  }
});

watch(() => [props.weeks, props.distance, props.yLabel], ([weeks, distance, yLabel]) => {
  if (chart) {
    chart.data.labels = Array.isArray(weeks) ? weeks : [];
    chart.data.datasets[0].data = Array.isArray(distance) ? distance as number[] : [];
    // No axis title update needed since labels are hidden
    chart.update();
  }
});
</script>

<style scoped>
.chart-container {
  width: 100%;
  min-height: 220px;
  margin-bottom: 1.2rem;
}
canvas {
  width: 100% !important;
  height: 220px !important;
}
</style>
