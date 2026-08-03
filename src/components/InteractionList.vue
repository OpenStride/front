<template>
  <div class="interaction-list">
    <h3 class="section-title">
      <i class="fas fa-comments" aria-hidden="true"></i>
      Interactions
    </h3>

    <!-- Loading state -->
    <div v-if="loading" class="loading-state">
      <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
      <span>{{ t('common.loading') }}</span>
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
              :title="t('interactions.delete')"
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
      <p>{{ t('interactions.none') }}</p>
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
import { useI18n } from 'vue-i18n'
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { getInteractionService } from '@/services/InteractionService'
import InteractionBar from './InteractionBar.vue'
import type { Interaction, InteractionServiceEvent } from '@/types/interaction'
import { formatRelativeTime } from '@/utils/dateFormat'

const { t } = useI18n()

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
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  border-radius: 0;
  padding: 18px 20px;
  margin-top: 1.25rem;
  color: var(--color-ink);
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-condensed);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-ink);
  margin: 0 0 16px;
}

.section-title i {
  color: var(--color-green-600);
  font-size: 14px;
}

.likes-section,
.comments-section {
  margin-bottom: 16px;
}

.subsection-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-condensed);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-faint);
  margin-bottom: 8px;
}

.subsection-header i {
  font-size: 13px;
}

.likes-section .subsection-header i,
.comments-section .subsection-header i {
  color: var(--color-green-600);
}

.likes-list {
  font-size: 14px;
  color: var(--text-muted);
}

.like-author {
  color: var(--color-ink);
}

.comments-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.comment-item {
  padding: 12px 14px;
  background: var(--surface-2);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
}

.comment-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 5px;
}

.comment-author {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 14px;
  color: var(--color-ink);
}

.comment-time {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-faint);
}

.delete-btn {
  margin-left: auto;
  padding: 4px 6px;
  background: none;
  border: none;
  color: var(--text-faint);
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: all 0.15s ease;
}

.delete-btn:hover:not(:disabled) {
  color: var(--color-red-600);
  background: var(--color-red-50);
}

.delete-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.comment-text {
  font-size: 14px;
  color: var(--color-ink-soft);
  line-height: 1.45;
  margin: 0;
  word-break: break-word;
}

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 2rem 1rem;
  color: var(--text-faint);
  font-size: 14px;
}

.loading-state i {
  color: var(--color-green-600);
}

.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 2rem 1rem;
  gap: 8px;
  color: var(--text-muted);
  text-align: center;
}

.error-state i {
  font-size: 1.5rem;
  color: var(--color-orange-500);
}

.error-state p {
  margin: 0;
  font-size: 14px;
  color: var(--text-muted);
}

.retry-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 0.25rem;
  padding: 8px 14px;
  background: none;
  border: 1px solid var(--color-green-500);
  color: var(--color-green-700);
  border-radius: var(--radius-md);
  font-family: var(--font-condensed);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
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
  color: var(--text-faint);
}

.empty-state i {
  font-size: 2rem;
  margin-bottom: 8px;
  color: var(--color-green-400);
}

.empty-state p {
  margin: 0;
  font-size: 14px;
}

.interaction-bar-section {
  border-top: 1px solid var(--border-subtle);
  margin-top: 16px;
  padding-top: 14px;
}
</style>
