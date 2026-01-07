<template>
  <div class="activity-card" data-test="activity-card">
    <MapPreview
      v-if="hasMap"
      class="map-top"
      :polyline="activity.mapPolyline"
      theme="osm"
    />
    <div class="card-content">
      <!-- header inchangé -->
      <div class="activity-card-header">
        <div class="icon-label">
          <h3 class="text-xl font-bold mb-6 flex items-center gap-2">
            <i :class="iconClass" class="text-[1.5rem]" style="color:#88aa00;"></i>
            {{ activity.title || formatSport(activity.type) }}
          </h3>
        </div>
        <div class="right-side">
          <span class="date">{{ formatDate(activity.startTime) }}</span>
          <button class="menu-button" @click="toggleMenu">⋮</button>
        </div>
      </div>

      <!-- grille simplifiée -->
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm text-gray-700 mt-4">
        <div class="flex items-center gap-2">
          <i class="fas fa-ruler-horizontal text-lg text-gray-600"></i>
          <span>{{ formatDistance(activity.distance) }}</span>
        </div>
        <div class="flex items-center gap-2">
          <i class="fas fa-stopwatch text-lg text-gray-600"></i>
          <span>{{ formatDuration(activity.duration) }}</span>
        </div>
        <div class="flex items-center gap-2">
          <i class="fas fa-tachometer-alt text-lg text-gray-600"></i>
          <span>{{ formatPace(activity.distance, activity.duration) }}</span>
        </div>
        <div class="flex items-center gap-2">
          <i class="fas fa-calendar-alt text-lg text-gray-600"></i>
          <span>{{ formatDate(activity.startTime) }}</span>
        </div>

      </div>

      <!-- footer inchangé -->
      <div class="footer">
        <button @click="showDetails" class="details-button">Voir détails →</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import MapPreview from './MapPreview.vue';
import router from '@/router';
import { Activity } from '@/types/activity';

const props = defineProps<{ activity: Activity }>();
const activity = props.activity;
const showMenu = ref(false);

// formatage date en français
const formatDate = (ts: number) =>
  new Date(ts * 1000).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });

// formatage durée hh mm ss ou mm ss
const formatDuration = (sec: number) => {
  if (sec > 3600) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${h}h ${m}m ${s}s`;
  }
  const m = Math.floor(sec / 60);
  return `${m}m ${sec % 60}s`;
};

// formatage distance en km
const formatDistance = (m: number) =>
  `${(m / 1000).toFixed(2)} km`;

// calcul du pace (min/km) à partir de distance (m) et durée (s)
const formatPace = (distanceMeters: number, durationSec: number) => {
  if (!distanceMeters || !durationSec) return '-';
  const secPerKm = durationSec / (distanceMeters / 1000);
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}'${s.toString().padStart(2, '0')}" /km`;
};


const formatSport = (sport: string): string => {
  const map: Record<string, string> = {
    RUNNING: 'Course à pied',
    RUN: 'Course à pied',
    CYCLING: 'Vélo',
    SWIMMING: 'Natation',
    HIKING: 'Randonnée',
    YOGA: 'Yoga'
  };
  return map[sport] || 'Activité';
};
const faIcons: Record<string, string> = {
  RUNNING : 'fas fa-person-running',
  RUN : 'fas fa-person-running',
  CYCLING : 'fas fa-person-biking',
  SWIMMING: 'fas fa-person-swimming',
  HIKING  : 'fas fa-person-hiking',
  YOGA    : 'fas fa-person-praying'   // choisis l’icône qui te convient
}
const iconClass = computed(() =>
  faIcons[props.activity.type?.toUpperCase() as string] ?? 'fas fa-medal'
)


// présence de carte
const hasMap = computed(() =>
  Array.isArray(activity.mapPolyline) && activity.mapPolyline.length > 1
);

const showDetails = () =>
  router.push({ name: 'ActivityDetails', params: { activityId: activity.id } });

const toggleMenu = () => {
  showMenu.value = !showMenu.value;
};
</script>

<style scoped>
.activity-card {
  background: #fff;
  overflow: hidden;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
  margin-bottom: 1.5rem;
  width: 100%;
}

.map-top {
  width: 100%;
  height: 240px;
}

.card-content {
  padding: 1rem;
}

.activity-card-header {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 0.5rem;
}

.icon-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.icon {
  font-size: 1.2rem;
}

.right-side {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.date {
  font-size: 0.85rem;
  color: #888;
}

.menu-button {
  background: none;
  border: none;
  font-size: 1.3rem;
  cursor: pointer;
  padding: 0;
  line-height: 1;
  color: #999;
}

.details {
  font-size: 0.9rem;
  color: #444;
  margin-top: 0.75rem;
}

.footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 1rem;
}

.details-button {
  background: #f3f3f3;
  border: none;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: background 0.2s ease;
}

.details-button:hover {
  background: #e1e1e1;
}

/* 💡 Full-width sur mobile */
@media (max-width: 640px) {
  .activity-card {
    border-radius: 0;
    width: 100vw;
  }

  .card-content {
    padding: 1rem;
  }
}
</style>
