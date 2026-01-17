<template>
  <div class="privacy-toggle-container">
    <div class="privacy-card">
      <div class="privacy-header">
        <div class="privacy-icon">
          <i v-if="isPublic" class="fas fa-globe" aria-hidden="true"></i>
          <i v-else class="fas fa-lock" aria-hidden="true"></i>
        </div>
        <div class="privacy-info">
          <h4 class="privacy-title">Confidentialité</h4>
          <p class="privacy-description">
            {{ isPublic ? 'Cette activité est publique' : 'Cette activité est privée' }}
          </p>
        </div>
      </div>

      <div class="privacy-toggle">
        <button
          @click="togglePrivacy"
          :class="['toggle-btn', { active: isPublic }]"
          :disabled="saving"
        >
          <span class="toggle-slider"></span>
        </button>
        <span class="toggle-label">{{ isPublic ? 'Public' : 'Privé' }}</span>
      </div>
    </div>

    <div v-if="hasOverride" class="privacy-note">
      <i class="fas fa-info-circle note-icon" aria-hidden="true"></i>
      <span class="note-text">
        Paramètre personnalisé (défaut: {{ defaultPrivacy === 'public' ? 'public' : 'privé' }})
      </span>
      <button @click="resetToDefault" class="reset-btn" :disabled="saving">
        Réinitialiser
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { IndexedDBService } from '@/services/IndexedDBService';
import { FriendService } from '@/services/FriendService';
import { ToastService } from '@/services/ToastService';
import type { Activity, ActivityDetails } from '@/types/activity';

const props = defineProps<{
  activity: Activity;
  details: ActivityDetails;
}>();

const friendService = FriendService.getInstance();

const defaultPrivacy = ref<'public' | 'private'>('private');
const activityPrivacy = ref<'public' | 'private' | null>(null);
const saving = ref(false);

const isPublic = computed(() => {
  if (activityPrivacy.value !== null) {
    return activityPrivacy.value === 'public';
  }
  return defaultPrivacy.value === 'public';
});

const hasOverride = computed(() => {
  return activityPrivacy.value !== null;
});

onMounted(async () => {
  await loadPrivacySettings();
});

const loadPrivacySettings = async () => {
  const db = await IndexedDBService.getInstance();

  // Load default privacy
  const defaultSetting = await db.getData('defaultPrivacy');
  defaultPrivacy.value = defaultSetting || 'private';

  // Load activity-specific override
  const override = await db.getData(`activityPrivacy_${props.activity.id}`);
  if (override !== null && override !== undefined) {
    activityPrivacy.value = override === true || override === 'public' ? 'public' : 'private';
  }
};

const togglePrivacy = async () => {
  saving.value = true;
  try {
    const db = await IndexedDBService.getInstance();
    const newValue = !isPublic.value;

    // Save override
    await db.saveData(`activityPrivacy_${props.activity.id}`, newValue ? 'public' : 'private');
    activityPrivacy.value = newValue ? 'public' : 'private';

    ToastService.push(
      newValue ? 'Activité rendue publique' : 'Activité rendue privée',
      { type: 'success', timeout: 2000 }
    );

    // Trigger re-publication in background
    republishInBackground();
  } catch (error) {
    console.error('[PrivacyToggle] Error toggling privacy:', error);
    ToastService.push('Erreur lors de la modification', { type: 'error', timeout: 3000 });
  } finally {
    saving.value = false;
  }
};

const resetToDefault = async () => {
  saving.value = true;
  try {
    const db = await IndexedDBService.getInstance();

    // Remove override
    await db.deleteData(`activityPrivacy_${props.activity.id}`);
    activityPrivacy.value = null;

    ToastService.push('Paramètre réinitialisé', { type: 'success', timeout: 2000 });

    // Trigger re-publication in background
    republishInBackground();
  } catch (error) {
    console.error('[PrivacyToggle] Error resetting privacy:', error);
    ToastService.push('Erreur lors de la réinitialisation', { type: 'error', timeout: 3000 });
  } finally {
    saving.value = false;
  }
};

const republishInBackground = () => {
  // Non-blocking re-publication
  setTimeout(async () => {
    try {
      await friendService.publishPublicData();
    } catch (error) {
      console.error('[PrivacyToggle] Background republish failed:', error);
    }
  }, 500);
};
</script>

<style scoped>
.privacy-toggle-container {
  margin-bottom: 1.5rem;
}

.privacy-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  background: white;
  border-radius: 0.75rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  gap: 1rem;
}

.privacy-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex: 1;
}

.privacy-icon {
  font-size: 1.5rem;
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f3f4f6;
  border-radius: 50%;
  color: var(--color-green-600);
}

.privacy-icon i {
  font-size: 1.25rem;
}

.privacy-info {
  flex: 1;
}

.privacy-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: #111827;
}

.privacy-description {
  margin: 0.25rem 0 0;
  font-size: 0.75rem;
  color: #6b7280;
}

.privacy-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.toggle-btn {
  position: relative;
  width: 3rem;
  height: 1.75rem;
  background: #d1d5db;
  border: none;
  border-radius: 1rem;
  cursor: pointer;
  transition: background 0.2s;
  padding: 0;
}

.toggle-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.toggle-btn.active {
  background: var(--color-green-500);
}

.toggle-slider {
  position: absolute;
  top: 0.25rem;
  left: 0.25rem;
  width: 1.25rem;
  height: 1.25rem;
  background: white;
  border-radius: 50%;
  transition: transform 0.2s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.toggle-btn.active .toggle-slider {
  transform: translateX(1.25rem);
}

.toggle-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
  min-width: 3.5rem;
}

.privacy-note {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.75rem;
  padding: 0.75rem;
  background: #fffbeb;
  border-radius: 0.5rem;
  border: 1px solid #fef3c7;
  font-size: 0.75rem;
}

.note-icon {
  font-size: 0.875rem;
  color: #d97706;
}

.note-text {
  flex: 1;
  color: #78350f;
}

.reset-btn {
  padding: 0.25rem 0.75rem;
  background: #f59e0b;
  color: white;
  border: none;
  border-radius: 0.375rem;
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.reset-btn:hover:not(:disabled) {
  background: #d97706;
}

.reset-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 640px) {
  .privacy-card {
    flex-direction: column;
    align-items: flex-start;
  }

  .privacy-toggle {
    width: 100%;
    justify-content: space-between;
  }
}
</style>
