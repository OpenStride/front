<template>
  <!-- One line high on the page — like, comment, who liked — and the comments
       under it when there are some. Nothing more when there are none. -->
  <section class="interaction-list" data-test="interaction-list">
    <InteractionBar
      :activity-id="activityId"
      :activity-owner-id="activityOwnerId"
      :show-warning="true"
      :is-mutual-friend="isMutualFriend"
      allow-reply
      compact
    />

    <div v-if="error" class="error-state">
      <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
      <span>{{ error }}</span>
      <button class="retry-btn" data-test="retry-interactions" @click="loadInteractions">
        <i class="fas fa-sync" aria-hidden="true"></i>
        {{ t('interactions.retry') }}
      </button>
    </div>

    <ul v-if="!error && comments.length > 0" class="comments-list" data-test="comments">
      <li v-for="comment in comments" :key="comment.id" class="comment-item">
        <div class="comment-header">
          <span class="comment-author">{{
            comment.authorUsername || t('interactions.deletedUser')
          }}</span>
          <span class="comment-time">{{ formatRelativeTime(comment.timestamp) }}</span>
          <button
            v-if="comment.authorId === myUserId"
            @click="deleteComment(comment.id)"
            class="delete-btn"
            :title="t('interactions.delete')"
            :aria-label="t('interactions.delete')"
            :disabled="deleting === comment.id"
          >
            <i class="fas fa-trash-alt" aria-hidden="true"></i>
          </button>
        </div>
        <p class="comment-text">{{ comment.text }}</p>
      </li>
    </ul>
  </section>
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
    error.value = t('interactions.loadFailed')
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
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 16px;
  border-top: 1px solid var(--border-subtle);
  color: var(--color-ink);
}

.comments-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.comment-item {
  padding: 10px 14px;
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
}

.comment-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
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

.error-state {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 14px;
  color: var(--text-muted);
}

.retry-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--color-ink);
  font-size: 13px;
  cursor: pointer;
}
</style>
