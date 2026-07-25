<template>
  <div
    v-if="
      sharingPluginActive && (!isMyActivity || summary.likeCount > 0 || summary.commentCount > 0)
    "
    class="interaction-bar"
  >
    <!-- Counters -->
    <div class="interaction-counters">
      <span v-if="summary.likeCount > 0" class="counter like-counter">
        <i class="fas fa-heart" aria-hidden="true"></i>
        {{ summary.likeCount }}
      </span>
      <span v-if="summary.commentCount > 0" class="counter comment-counter">
        <i class="fas fa-comment" aria-hidden="true"></i>
        {{ summary.commentCount }}
      </span>
    </div>

    <!-- Action buttons (hidden on your own activity — you can't like/comment it) -->
    <div v-if="!isMyActivity" class="interaction-actions">
      <button
        @click="toggleLike"
        :class="['action-btn', 'like-btn', { liked: summary.hasLiked }]"
        :disabled="loading || !canInteract"
        :title="summary.hasLiked ? 'Retirer le like' : 'J\'aime'"
      >
        <i :class="summary.hasLiked ? 'fas fa-heart' : 'far fa-heart'" aria-hidden="true"></i>
        <span class="btn-label">{{ summary.hasLiked ? 'Aimé' : "J'aime" }}</span>
      </button>

      <button
        @click="showCommentInput = !showCommentInput"
        class="action-btn comment-btn"
        :disabled="!canInteract"
        :title="t('interactions.comment')"
      >
        <i class="far fa-comment" aria-hidden="true"></i>
        <span class="btn-label">{{ t('interactions.comment') }}</span>
      </button>
    </div>

    <!-- Last comment preview -->
    <div v-if="summary.lastComment" class="last-comment-preview">
      <span class="comment-author">{{ summary.lastComment.authorUsername }}</span>
      <span class="comment-text">{{ truncateText(summary.lastComment.text || '', 80) }}</span>
    </div>

    <!-- Comment input (expandable) -->
    <div v-if="showCommentInput" class="comment-input-section">
      <textarea
        v-model="commentText"
        class="comment-textarea"
        :placeholder="t('interactions.addComment')"
        maxlength="280"
        rows="2"
        @keydown.enter.ctrl="submitComment"
      ></textarea>
      <div class="comment-input-footer">
        <span class="char-count" :class="{ warning: commentText.length > 250 }">
          {{ commentText.length }}/280
        </span>
        <button
          @click="submitComment"
          class="submit-btn"
          :disabled="!commentText.trim() || submitting"
        >
          {{ submitting ? t('interactions.sending') : t('interactions.publish') }}
        </button>
      </div>
    </div>

    <!-- Mutual friendship required message -->
    <div v-else-if="needsMutualFriendship && showWarning" class="mutual-required-message">
      <i class="fas fa-user-friends" aria-hidden="true"></i>
      <div class="message-content">
        <span>{{ t('interactions.mutualRequired') }}</span>
        <button @click="copyShareUrl" class="share-btn">
          <i class="fas fa-share-alt" aria-hidden="true"></i>
          {{ t('interactions.shareProfile') }}
        </button>
      </div>
    </div>
    <!-- Not published warning (only for friend activities) -->
    <div v-else-if="!canInteract && showWarning" class="warning-message">
      <i class="fas fa-info-circle" aria-hidden="true"></i>
      <span>{{ t('interactions.publishRequired') }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { getInteractionService } from '@/services/InteractionService'
import type { InteractionSummary, InteractionServiceEvent } from '@/types/interaction'

const { t } = useI18n()

const props = defineProps<{
  activityId: string
  activityOwnerId: string
  showWarning?: boolean
  isMutualFriend?: boolean // true if friendship is mutual (required for interactions)
}>()

const interactionService = getInteractionService()

const summary = ref<InteractionSummary>({
  activityId: props.activityId,
  likeCount: 0,
  commentCount: 0,
  hasLiked: false
})

const sharingPluginActive = ref(false)
const loading = ref(false)
const submitting = ref(false)
const showCommentInput = ref(false)
const commentText = ref('')
const canInteract = ref(false)
const myUserId = ref<string | null>(null)

// Detect if this is the user's own activity (read-only mode)
const isMyActivity = computed(
  () => myUserId.value !== null && myUserId.value === props.activityOwnerId
)

// Detect if this is a friend activity that requires mutual friendship
const needsMutualFriendship = computed(() => {
  // Not own activity, user is published, but not mutual friend
  return !isMyActivity.value && myUserId.value !== null && props.isMutualFriend === false
})

// Copy share URL to clipboard
const copyShareUrl = async () => {
  try {
    const { IndexedDBService } = await import('@/services/IndexedDBService')
    const { ShareUrlService } = await import('@/services/ShareUrlService')
    const { ToastService } = await import('@/services/ToastService')
    const db = await IndexedDBService.getInstance()
    const rawUrl = (await db.getData('myPublicUrl')) as string | null

    if (!rawUrl) {
      ToastService.push('Publiez vos données d\u2019abord depuis votre profil', {
        type: 'warning',
        timeout: 4000
      })
      return
    }

    const shareUrl = ShareUrlService.wrapManifestUrl(rawUrl)
    await navigator.clipboard.writeText(shareUrl)
    ToastService.push('Lien de profil copié !', { type: 'success', timeout: 2000 })
  } catch (error) {
    console.error('[InteractionBar] Error copying share URL:', error)
    const { ToastService } = await import('@/services/ToastService')
    ToastService.push('Impossible de copier le lien', { type: 'error', timeout: 3000 })
  }
}

// Load initial data
const loadSummary = async () => {
  try {
    summary.value = await interactionService.getInteractionSummary(
      props.activityId,
      props.activityOwnerId
    )
  } catch (error) {
    console.error('[InteractionBar] Error loading summary:', error)
  }
}

const checkCanInteract = async () => {
  const userId = await interactionService.getMyUserId()
  myUserId.value = userId
  // Can interact only if:
  // 1. User is published (has userId)
  // 2. It's not their own activity
  // 3. Friendship is mutual (if viewing friend's activity)
  const isPublished = userId !== null
  const isNotOwnActivity = userId !== props.activityOwnerId
  // For own activities, mutual friendship check doesn't apply
  // For friend activities, require mutual friendship
  const mutualOk = isMyActivity.value || props.isMutualFriend === true
  canInteract.value = isPublished && isNotOwnActivity && mutualOk
}

// Actions
const toggleLike = async () => {
  if (loading.value || !canInteract.value) return

  loading.value = true
  try {
    if (summary.value.hasLiked) {
      await interactionService.removeLike(props.activityId, props.activityOwnerId)
    } else {
      await interactionService.addLike(props.activityId, props.activityOwnerId)
    }
    await loadSummary()
  } catch (error) {
    console.error('[InteractionBar] Error toggling like:', error)
  } finally {
    loading.value = false
  }
}

const submitComment = async () => {
  const text = commentText.value.trim()
  if (!text || submitting.value || !canInteract.value) return

  submitting.value = true
  try {
    await interactionService.addComment(props.activityId, props.activityOwnerId, text)
    commentText.value = ''
    showCommentInput.value = false
    await loadSummary()
  } catch (error) {
    console.error('[InteractionBar] Error submitting comment:', error)
  } finally {
    submitting.value = false
  }
}

// Helpers
const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength) + '...'
}

// Event listener for reactive updates
const handleInteractionEvent = (event: Event) => {
  const detail = (event as CustomEvent<InteractionServiceEvent>).detail
  if (detail.activityId === props.activityId) {
    loadSummary()
  }
}

onMounted(async () => {
  // Only show interactions if the profile-sharing extension is enabled
  const { AppExtensionPluginManager } = await import('@/services/AppExtensionPluginManager')
  const manager = AppExtensionPluginManager.getInstance()
  sharingPluginActive.value = await manager.isPluginEnabled('profile-sharing')
  if (!sharingPluginActive.value) return

  await checkCanInteract()
  await loadSummary()
  interactionService.emitter.addEventListener('interaction-event', handleInteractionEvent)
})

onUnmounted(() => {
  interactionService.emitter.removeEventListener('interaction-event', handleInteractionEvent)
})
</script>

<style scoped>
.interaction-bar {
  padding: 4px 0 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.interaction-counters {
  display: flex;
  gap: 16px;
}

.counter {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--text-muted);
}

.counter i {
  font-size: 14px;
}

.like-counter i {
  color: var(--color-green-600);
}

.comment-counter i {
  color: var(--color-green-600);
}

.interaction-actions {
  display: flex;
  gap: 8px;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 15px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--surface);
  font-family: var(--font-condensed);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.action-btn:hover:not(:disabled) {
  border-color: var(--color-green-300);
  color: var(--color-ink);
}

.action-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.like-btn.liked {
  color: var(--color-green-700);
  border-color: var(--color-green-200);
  background: var(--color-green-50);
}

.like-btn.liked i {
  color: var(--color-green-600);
}

.btn-label {
  font-weight: 600;
}

.last-comment-preview {
  padding: 10px 12px;
  background: var(--surface-2);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  font-size: 14px;
}

.comment-author {
  font-weight: 600;
  color: var(--color-ink);
  margin-right: 6px;
}

.comment-text {
  color: var(--text-muted);
}

.comment-input-section {
  margin-top: 2px;
}

.comment-textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  font-size: 14px;
  resize: none;
  font-family: var(--font-main);
  background: var(--surface);
  color: var(--color-ink);
}

.comment-textarea:focus {
  outline: none;
  border-color: var(--color-green-500);
}

.comment-input-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 6px;
}

.char-count {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-faint);
}

.char-count.warning {
  color: var(--color-orange-500);
}

.submit-btn {
  padding: 8px 16px;
  background: var(--color-green-500);
  color: var(--color-white);
  border: none;
  border-radius: var(--radius-md);
  font-family: var(--font-condensed);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  transition: background 0.15s ease;
}

.submit-btn:hover:not(:disabled) {
  background: var(--color-green-600);
}

.submit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Messages : discrets, pas de boîtes criardes */
.warning-message {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: var(--surface-2);
  border: 1px solid var(--border-subtle);
  border-left: 3px solid var(--color-green-400);
  border-radius: var(--radius-md);
  font-size: 13px;
  color: var(--text-muted);
}

.warning-message i {
  color: var(--color-green-600);
}

.mutual-required-message {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  background: var(--surface-2);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  font-size: 13px;
  color: var(--text-muted);
}

.mutual-required-message i {
  color: var(--color-green-600);
  margin-top: 2px;
}

.mutual-required-message .message-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
}

.mutual-required-message .share-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: var(--color-green-500);
  color: var(--color-white);
  border: none;
  border-radius: var(--radius-md);
  font-family: var(--font-condensed);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  transition: background 0.15s ease;
  width: fit-content;
}

.mutual-required-message .share-btn:hover {
  background: var(--color-green-600);
}
</style>
