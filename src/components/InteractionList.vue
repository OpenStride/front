<template>
  <div class="interaction-list">
    <h3 class="section-title">
      <i class="fas fa-comments" aria-hidden="true"></i>
      Interactions
    </h3>

    <!-- Loading state -->
    <div v-if="loading" class="loading-state">
      <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
      <span>Chargement...</span>
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="error-state">
      <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
      <p>{{ error }}</p>
      <button class="retry-btn" data-test="retry-interactions" @click="loadInteractions">
        <i class="fas fa-sync" aria-hidden="true"></i>
        Réessayer
      </button>
    </div>

    <!-- Likes section -->
    <div v-if="!loading && !error && likes.length > 0" class="likes-section">
      <div class="subsection-header">
        <i class="fas fa-heart" aria-hidden="true"></i>
        <span>{{ likes.length }} {{ likes.length === 1 ? 'like' : 'likes' }}</span>
      </div>
      <div class="likes-list">
        <span v-for="(like, index) in likes" :key="like.id" class="like-author">
          {{ like.authorUsername || 'Utilisateur supprimé'
          }}{{ index < likes.length - 1 ? ', ' : '' }}
        </span>
      </div>
    </div>

    <!-- Comments section -->
    <div v-if="!loading && !error && comments.length > 0" class="comments-section">
      <div class="subsection-header">
        <i class="fas fa-comment" aria-hidden="true"></i>
        <span
          >{{ comments.length }} {{ comments.length === 1 ? 'commentaire' : 'commentaires' }}</span
        >
      </div>

      <div class="comments-list">
        <div v-for="comment in comments" :key="comment.id" class="comment-item">
          <div class="comment-header">
            <span class="comment-author">{{
              comment.authorUsername || 'Utilisateur supprimé'
            }}</span>
            <span class="comment-time">{{ formatRelativeTime(comment.timestamp) }}</span>
            <button
              v-if="comment.authorId === myUserId"
              @click="deleteComment(comment.id)"
              class="delete-btn"
              title="Supprimer"
              :disabled="deleting === comment.id"
            >
              <i class="fas fa-trash-alt" aria-hidden="true"></i>
            </button>
          </div>
          <p class="comment-text">{{ comment.text }}</p>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div
      v-if="!loading && !error && likes.length === 0 && comments.length === 0"
      class="empty-state"
    >
      <i class="far fa-comment-dots" aria-hidden="true"></i>
      <p>Aucune interaction pour le moment</p>
    </div>

    <!-- Interaction bar at bottom -->
    <InteractionBar
      :activity-id="activityId"
      :activity-owner-id="activityOwnerId"
      :show-warning="true"
      :is-mutual-friend="isMutualFriend"
      class="interaction-bar-section"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { getInteractionService } from '@/services/InteractionService'
import InteractionBar from './InteractionBar.vue'
import type { Interaction, InteractionServiceEvent } from '@/types/interaction'

const props = defineProps<{
  activityId: string
  activityOwnerId: string
  isMutualFriend?: boolean
}>()

const interactionService = getInteractionService()

const interactions = ref<Interaction[]>([])
const myUserId = ref<string | null>(null)
const deleting = ref<string | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

// Computed properties for filtering
const likes = computed(() => interactions.value.filter(i => i.type === 'like'))

const comments = computed(() =>
  interactions.value.filter(i => i.type === 'comment').sort((a, b) => b.timestamp - a.timestamp)
)

// Load data
const loadInteractions = async () => {
  loading.value = true
  error.value = null
  try {
    interactions.value = await interactionService.getInteractionsForActivity(
      props.activityId,
      props.activityOwnerId
    )
  } catch (err) {
    console.error('[InteractionList] Error loading interactions:', err)
    error.value = 'Impossible de charger les interactions.'
  } finally {
    loading.value = false
  }
}

const loadMyUserId = async () => {
  myUserId.value = await interactionService.getMyUserId()
}

// Actions
const deleteComment = async (commentId: string) => {
  if (deleting.value) return

  deleting.value = commentId
  try {
    await interactionService.deleteComment(commentId)
    await loadInteractions()
  } catch (error) {
    console.error('[InteractionList] Error deleting comment:', error)
  } finally {
    deleting.value = null
  }
}

// Helpers
const formatRelativeTime = (timestamp: number): string => {
  const now = Date.now()
  const diff = now - timestamp

  const minutes = Math.floor(diff / (1000 * 60))
  const hours = Math.floor(diff / (1000 * 60 * 60))
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (minutes < 1) return "à l'instant"
  if (minutes < 60) return `il y a ${minutes} min`
  if (hours < 24) return `il y a ${hours}h`
  if (days === 1) return 'hier'
  if (days < 7) return `il y a ${days} jours`

  return new Date(timestamp).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short'
  })
}

// Event listener for reactive updates
const handleInteractionEvent = (event: Event) => {
  const detail = (event as CustomEvent<InteractionServiceEvent>).detail
  if (detail.activityId === props.activityId) {
    loadInteractions()
  }
}

onMounted(async () => {
  await loadMyUserId()
  await loadInteractions()
  interactionService.emitter.addEventListener('interaction-event', handleInteractionEvent)
})

onUnmounted(() => {
  interactionService.emitter.removeEventListener('interaction-event', handleInteractionEvent)
})
</script>

<style scoped>
.interaction-list {
  background: var(--color-white);
  padding: 1rem;
  margin-top: 1rem;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-color);
  margin-bottom: 1rem;
}

.section-title i {
  color: var(--color-green-500);
}

.likes-section,
.comments-section {
  margin-bottom: 1rem;
}

.subsection-header {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--color-gray-600);
  margin-bottom: 0.5rem;
}

.subsection-header i {
  font-size: 0.85rem;
}

.likes-section .subsection-header i {
  color: var(--color-red-500);
}

.comments-section .subsection-header i {
  color: var(--color-green-500);
}

.likes-list {
  font-size: 0.9rem;
  color: var(--color-gray-500);
  padding-left: 1.25rem;
}

.like-author {
  color: var(--text-color);
}

.comments-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.comment-item {
  padding: 0.75rem;
  background: var(--color-gray-50);
  border-radius: 0.5rem;
}

.comment-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.375rem;
}

.comment-author {
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--text-color);
}

.comment-time {
  font-size: 0.8rem;
  color: var(--color-gray-400);
}

.delete-btn {
  margin-left: auto;
  padding: 0.25rem 0.375rem;
  background: none;
  border: none;
  color: var(--color-gray-400);
  cursor: pointer;
  border-radius: 0.25rem;
  transition: all 0.15s ease;
}

.delete-btn:hover:not(:disabled) {
  color: var(--color-red-500);
  background: var(--color-red-100);
}

.delete-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.comment-text {
  font-size: 0.9rem;
  color: var(--color-gray-700);
  line-height: 1.4;
  margin: 0;
  word-break: break-word;
}

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 2rem 1rem;
  color: var(--color-gray-400);
  font-size: 0.9rem;
}

.loading-state i {
  color: var(--color-green-500);
}

.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 2rem 1rem;
  gap: 0.5rem;
  color: var(--color-red-500);
  text-align: center;
}

.error-state i {
  font-size: 1.5rem;
}

.error-state p {
  margin: 0;
  font-size: 0.9rem;
  color: var(--color-gray-600);
}

.retry-btn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  margin-top: 0.25rem;
  padding: 0.375rem 0.75rem;
  background: none;
  border: 1px solid var(--color-green-500);
  color: var(--color-green-500);
  border-radius: 0.375rem;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.retry-btn:hover {
  background: var(--color-green-50);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 2rem 1rem;
  color: var(--color-gray-400);
}

.empty-state i {
  font-size: 2rem;
  margin-bottom: 0.5rem;
}

.empty-state p {
  margin: 0;
  font-size: 0.9rem;
}

.interaction-bar-section {
  border-top: 1px solid var(--color-gray-200);
  margin-top: 1rem;
  padding-top: 0.75rem;
}
</style>
