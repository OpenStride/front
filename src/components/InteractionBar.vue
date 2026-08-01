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
        :class="['action-btn', 'like-btn', { liked: summary.hasLiked, blocked: !canInteract }]"
        :disabled="loading"
        :title="canInteract ? t('interactions.like') : t('interactions.whyBlocked')"
        data-test="like-btn"
      >
        <i :class="summary.hasLiked ? 'fas fa-heart' : 'far fa-heart'" aria-hidden="true"></i>
        <span class="btn-label">{{
          summary.hasLiked ? t('interactions.liked') : t('interactions.like')
        }}</span>
      </button>

      <button
        @click="onComment"
        :class="['action-btn', 'comment-btn', { blocked: !canInteract }]"
        :title="canInteract ? t('interactions.comment') : t('interactions.whyBlocked')"
        data-test="comment-btn"
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

    <!-- Why the buttons do nothing, and the one thing that fixes it. A disabled
         button and a sentence left the reader with no way forward. -->
    <div
      v-else-if="!canInteract && (showWarning || blockedShown)"
      class="blocked"
      data-test="interaction-blocked"
    >
      <i class="fas fa-circle-info" aria-hidden="true"></i>
      <div class="blocked-content">
        <span>{{ blocked.text }}</span>
        <router-link
          v-if="blocked.route"
          :to="blocked.route"
          class="blocked-action"
          data-test="blocked-action"
        >
          <i :class="blocked.icon" aria-hidden="true"></i>
          {{ blocked.action }}
        </router-link>
        <button v-else @click="qrOpen = true" class="blocked-action" data-test="blocked-action">
          <i :class="blocked.icon" aria-hidden="true"></i>
          {{ blocked.action }}
        </button>
      </div>
    </div>

    <MyQrCodeModal :is-open="qrOpen" @close="qrOpen = false" />
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { getInteractionService } from '@/services/InteractionService'
import MyQrCodeModal from '@/components/MyQrCodeModal.vue'
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
// Revealed by pressing a button that cannot act — the press is the question,
// this is the answer
const blockedShown = ref(false)
const qrOpen = ref(false)

// Detect if this is the user's own activity (read-only mode)
const isMyActivity = computed(
  () => myUserId.value !== null && myUserId.value === props.activityOwnerId
)

/**
 * What stands between the reader and a like, and the one action that removes it.
 *
 * Liking writes into your own public files, so an unpublished profile has
 * nowhere to put it; and a friend who has not added you back never reads them.
 * Both are fixable, so both get a button rather than a sentence.
 */
const blocked = computed(() => {
  if (myUserId.value === null) {
    return {
      text: t('interactions.publishRequired'),
      action: t('interactions.publishAction'),
      icon: 'fas fa-upload',
      route: '/profile?tab=friends'
    }
  }
  return {
    text: t('interactions.mutualRequired'),
    action: t('myQr.title'),
    icon: 'fas fa-qrcode',
    route: ''
  }
})

/** A press on a button that cannot act asks why; answer instead of doing nothing */
const revealBlocked = () => {
  blockedShown.value = true
  showCommentInput.value = false
}

const onComment = () => {
  if (!canInteract.value) return revealBlocked()
  showCommentInput.value = !showCommentInput.value
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
  if (!canInteract.value) return revealBlocked()
  if (loading.value) return

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

/* Message : discret, mais toujours avec une sortie */
.blocked {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  background: var(--surface-2);
  border: 1px solid var(--border-subtle);
  border-radius: 0;
  font-size: 13px;
  color: var(--text-muted);
}

.blocked > i {
  color: var(--color-green-600);
  margin-top: 2px;
}

.blocked-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
}

.blocked-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: var(--color-green-500);
  color: var(--color-white);
  border: none;
  border-radius: 0;
  font-family: var(--font-condensed);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-decoration: none;
  cursor: pointer;
  transition: background 0.15s ease;
  width: fit-content;
}

.blocked-action:hover {
  background: var(--color-green-600);
}

/* Un bouton qui ne peut pas agir reste lisible, mais s'annonce comme tel */
.action-btn.blocked {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  background: none;
  border: none;
  opacity: 0.55;
}
</style>
