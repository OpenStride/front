<template>
  <div class="interaction-list">
    <h3 class="section-title">
      <i class="fas fa-comments" aria-hidden="true"></i>
      Interactions
    </h3>

    <!-- Likes section -->
    <div v-if="likes.length > 0" class="likes-section">
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
    <div v-if="comments.length > 0" class="comments-section">
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
    <div v-if="likes.length === 0 && comments.length === 0" class="empty-state">
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

// Computed properties for filtering
const likes = computed(() => interactions.value.filter(i => i.type === 'like'))

const comments = computed(() =>
  interactions.value.filter(i => i.type === 'comment').sort((a, b) => b.timestamp - a.timestamp)
)

// Load data
const loadInteractions = async () => {
  try {
    interactions.value = await interactionService.getInteractionsForActivity(
      props.activityId,
      props.activityOwnerId
    )
  } catch (error) {
    console.error('[InteractionList] Error loading interactions:', error)
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
  background: white;
  padding: 1rem;
  margin-top: 1rem;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.1rem;
  font-weight: 600;
  color: #333;
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
  color: #555;
  margin-bottom: 0.5rem;
}

.subsection-header i {
  font-size: 0.85rem;
}

.likes-section .subsection-header i {
  color: #e74c3c;
}

.comments-section .subsection-header i {
  color: var(--color-green-500);
}

.likes-list {
  font-size: 0.9rem;
  color: #666;
  padding-left: 1.25rem;
}

.like-author {
  color: #333;
}

.comments-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.comment-item {
  padding: 0.75rem;
  background: #f9f9f9;
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
  color: #333;
}

.comment-time {
  font-size: 0.8rem;
  color: #999;
}

.delete-btn {
  margin-left: auto;
  padding: 0.25rem 0.375rem;
  background: none;
  border: none;
  color: #999;
  cursor: pointer;
  border-radius: 0.25rem;
  transition: all 0.15s ease;
}

.delete-btn:hover:not(:disabled) {
  color: #e74c3c;
  background: #fee2e2;
}

.delete-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.comment-text {
  font-size: 0.9rem;
  color: #444;
  line-height: 1.4;
  margin: 0;
  word-break: break-word;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 2rem 1rem;
  color: #999;
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
  border-top: 1px solid #eee;
  margin-top: 1rem;
  padding-top: 0.75rem;
}
</style>
