<template>
  <div class="interaction-bar">
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

    <!-- Action buttons -->
    <div class="interaction-actions">
      <button
        @click="toggleLike"
        :class="['action-btn', 'like-btn', { liked: summary.hasLiked }]"
        :disabled="loading || !canInteract"
        :title="summary.hasLiked ? 'Retirer le like' : 'J\'aime'"
      >
        <i :class="summary.hasLiked ? 'fas fa-heart' : 'far fa-heart'" aria-hidden="true"></i>
        <span class="btn-label">{{ summary.hasLiked ? 'Aimé' : 'J\'aime' }}</span>
      </button>

      <button
        @click="showCommentInput = !showCommentInput"
        class="action-btn comment-btn"
        :disabled="!canInteract"
        title="Commenter"
      >
        <i class="far fa-comment" aria-hidden="true"></i>
        <span class="btn-label">Commenter</span>
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
        placeholder="Ajouter un commentaire..."
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
          {{ submitting ? 'Envoi...' : 'Publier' }}
        </button>
      </div>
    </div>

    <!-- Info message for own activity (read-only mode) -->
    <div v-if="isMyActivity" class="info-message">
      <i class="fas fa-eye" aria-hidden="true"></i>
      <span>Interactions reçues sur votre activité</span>
    </div>
    <!-- Mutual friendship required message -->
    <div v-else-if="needsMutualFriendship && showWarning" class="mutual-required-message">
      <i class="fas fa-user-friends" aria-hidden="true"></i>
      <div class="message-content">
        <span>Amitié mutuelle requise pour interagir</span>
        <button @click="copyShareUrl" class="share-btn">
          <i class="fas fa-share-alt" aria-hidden="true"></i>
          Partager mon profil
        </button>
      </div>
    </div>
    <!-- Not published warning (only for friend activities) -->
    <div v-else-if="!canInteract && showWarning" class="warning-message">
      <i class="fas fa-info-circle" aria-hidden="true"></i>
      <span>Publiez vos données pour interagir</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { getInteractionService } from '@/services/InteractionService';
import type { InteractionSummary, InteractionServiceEvent } from '@/types/interaction';

const props = defineProps<{
  activityId: string;
  activityOwnerId: string;
  showWarning?: boolean;
  isMutualFriend?: boolean;  // true if friendship is mutual (required for interactions)
}>();

const interactionService = getInteractionService();

const summary = ref<InteractionSummary>({
  activityId: props.activityId,
  likeCount: 0,
  commentCount: 0,
  hasLiked: false
});

const loading = ref(false);
const submitting = ref(false);
const showCommentInput = ref(false);
const commentText = ref('');
const canInteract = ref(false);
const myUserId = ref<string | null>(null);

// Detect if this is the user's own activity (read-only mode)
const isMyActivity = computed(() => myUserId.value !== null && myUserId.value === props.activityOwnerId);

// Detect if this is a friend activity that requires mutual friendship
const needsMutualFriendship = computed(() => {
  // Not own activity, user is published, but not mutual friend
  return !isMyActivity.value &&
         myUserId.value !== null &&
         props.isMutualFriend === false;
});

// Copy share URL to clipboard
const copyShareUrl = async () => {
  try {
    const db = (await import('@/services/IndexedDBService')).IndexedDBService;
    const dbInstance = await db.getInstance();
    const myPublicUrl = await dbInstance.getData('myPublicUrl');
    if (myPublicUrl) {
      await navigator.clipboard.writeText(myPublicUrl);
      console.log('[InteractionBar] Share URL copied to clipboard');
    }
  } catch (error) {
    console.error('[InteractionBar] Error copying share URL:', error);
  }
};

// Load initial data
const loadSummary = async () => {
  try {
    summary.value = await interactionService.getInteractionSummary(
      props.activityId,
      props.activityOwnerId
    );
  } catch (error) {
    console.error('[InteractionBar] Error loading summary:', error);
  }
};

const checkCanInteract = async () => {
  const userId = await interactionService.getMyUserId();
  myUserId.value = userId;
  // Can interact only if:
  // 1. User is published (has userId)
  // 2. It's not their own activity
  // 3. Friendship is mutual (if viewing friend's activity)
  const isPublished = userId !== null;
  const isNotOwnActivity = userId !== props.activityOwnerId;
  // For own activities, mutual friendship check doesn't apply
  // For friend activities, require mutual friendship
  const mutualOk = isMyActivity.value || props.isMutualFriend === true;
  canInteract.value = isPublished && isNotOwnActivity && mutualOk;
};

// Actions
const toggleLike = async () => {
  if (loading.value || !canInteract.value) return;

  loading.value = true;
  try {
    if (summary.value.hasLiked) {
      await interactionService.removeLike(props.activityId, props.activityOwnerId);
    } else {
      await interactionService.addLike(props.activityId, props.activityOwnerId);
    }
    await loadSummary();
  } catch (error) {
    console.error('[InteractionBar] Error toggling like:', error);
  } finally {
    loading.value = false;
  }
};

const submitComment = async () => {
  const text = commentText.value.trim();
  if (!text || submitting.value || !canInteract.value) return;

  submitting.value = true;
  try {
    await interactionService.addComment(props.activityId, props.activityOwnerId, text);
    commentText.value = '';
    showCommentInput.value = false;
    await loadSummary();
  } catch (error) {
    console.error('[InteractionBar] Error submitting comment:', error);
  } finally {
    submitting.value = false;
  }
};

// Helpers
const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

// Event listener for reactive updates
const handleInteractionEvent = (event: Event) => {
  const detail = (event as CustomEvent<InteractionServiceEvent>).detail;
  if (detail.activityId === props.activityId) {
    loadSummary();
  }
};

onMounted(async () => {
  await checkCanInteract();
  await loadSummary();
  interactionService.emitter.addEventListener('interaction-event', handleInteractionEvent);

  // Debug logs for ID mismatch investigation
  console.log('[InteractionBar] activityOwnerId:', props.activityOwnerId);
  console.log('[InteractionBar] myUserId:', myUserId.value);
});

onUnmounted(() => {
  interactionService.emitter.removeEventListener('interaction-event', handleInteractionEvent);
});
</script>

<style scoped>
.interaction-bar {
  padding: 0.75rem 0;
  border-top: 1px solid #eee;
}

.interaction-counters {
  display: flex;
  gap: 1rem;
  margin-bottom: 0.5rem;
}

.counter {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.85rem;
  color: #666;
}

.counter i {
  font-size: 0.9rem;
}

.like-counter i {
  color: #e74c3c;
}

.comment-counter i {
  color: var(--color-green-500);
}

.interaction-actions {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid #ddd;
  border-radius: 0.375rem;
  background: white;
  font-size: 0.85rem;
  color: #555;
  cursor: pointer;
  transition: all 0.15s ease;
}

.action-btn:hover:not(:disabled) {
  background: #f5f5f5;
  border-color: #ccc;
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.like-btn.liked {
  color: #e74c3c;
  border-color: #e74c3c;
  background: #fef2f2;
}

.like-btn.liked:hover:not(:disabled) {
  background: #fee2e2;
}

.btn-label {
  font-weight: 500;
}

.last-comment-preview {
  padding: 0.5rem;
  background: #f9f9f9;
  border-radius: 0.375rem;
  font-size: 0.85rem;
  margin-bottom: 0.5rem;
}

.comment-author {
  font-weight: 600;
  color: #333;
  margin-right: 0.375rem;
}

.comment-text {
  color: #666;
}

.comment-input-section {
  margin-top: 0.5rem;
}

.comment-textarea {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 0.375rem;
  font-size: 0.9rem;
  resize: none;
  font-family: inherit;
}

.comment-textarea:focus {
  outline: none;
  border-color: var(--color-green-500);
}

.comment-input-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 0.375rem;
}

.char-count {
  font-size: 0.75rem;
  color: #999;
}

.char-count.warning {
  color: #e67e22;
}

.submit-btn {
  padding: 0.375rem 0.75rem;
  background: var(--color-green-500);
  color: white;
  border: none;
  border-radius: 0.375rem;
  font-size: 0.85rem;
  font-weight: 500;
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

.warning-message {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem;
  background: #fff3cd;
  border-radius: 0.375rem;
  font-size: 0.8rem;
  color: #856404;
}

.info-message {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem;
  background: #e8f5e9;
  border-radius: 0.375rem;
  font-size: 0.8rem;
  color: #2e7d32;
}

.mutual-required-message {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.75rem;
  background: #e3f2fd;
  border-radius: 0.375rem;
  font-size: 0.85rem;
  color: #1565c0;
}

.mutual-required-message .message-content {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  flex: 1;
}

.mutual-required-message .share-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  background: #1976d2;
  color: white;
  border: none;
  border-radius: 0.375rem;
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease;
  width: fit-content;
}

.mutual-required-message .share-btn:hover {
  background: #1565c0;
}
</style>
