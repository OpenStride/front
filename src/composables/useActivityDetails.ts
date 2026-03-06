import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { getActivityService } from '@/services/ActivityService'
import { getInteractionService } from '@/services/InteractionService'
import { IndexedDBService } from '@/services/IndexedDBService'
import { Activity, ActivityDetails, Sample } from '@/types/activity'
import type { Friend } from '@/types/friend'
import { ActivityAnalyzer } from '@/services/ActivityAnalyzer'

export function useActivityDetails() {
  const route = useRoute()
  const activity = ref<Activity | null>(null)
  const activityDetails = ref<ActivityDetails | null>(null)
  const samples = ref<Sample[]>([])
  const loading = ref(true)
  const isFriendActivity = ref(false)
  const friendUsername = ref('')
  const friendId = ref('')
  const originalActivityId = ref('')
  const myUserId = ref<string | null>(null)
  const friendStableUserId = ref<string | null>(null)
  const isMutualFriend = ref<boolean>(false)

  const interactionActivityId = computed(() => {
    if (isFriendActivity.value) {
      return originalActivityId.value
    }
    return activity.value?.id || ''
  })

  const interactionOwnerId = computed(() => {
    if (isFriendActivity.value && friendId.value) {
      return friendStableUserId.value || friendId.value
    }
    return myUserId.value
  })

  const canShowInteractions = computed(() => {
    return interactionOwnerId.value !== null && interactionActivityId.value !== ''
  })

  const activityData = computed(() => ({
    activity: activity.value,
    details: activityDetails.value,
    samples: samples.value
  }))

  async function loadActivity() {
    const id = route.params.activityId as string
    const source = route.query.source as string
    const queryFriendId = route.query.friendId as string
    const activityService = await getActivityService()

    const interactionService = getInteractionService()
    myUserId.value = await interactionService.getMyUserId()

    if (source === 'friend' && queryFriendId) {
      const friendActivity = await activityService.getFriendActivity(queryFriendId, id)
      if (friendActivity) {
        activity.value = {
          id: friendActivity.activityId,
          startTime: friendActivity.startTime,
          duration: friendActivity.duration,
          distance: friendActivity.distance,
          type: friendActivity.type,
          title: friendActivity.title,
          mapPolyline: friendActivity.mapPolyline,
          provider: `friend_${friendActivity.friendId}`,
          version: 1,
          lastModified: Date.now()
        } as Activity

        activityDetails.value = {
          id: friendActivity.activityId,
          startTime: friendActivity.startTime,
          duration: friendActivity.duration,
          distance: friendActivity.distance,
          type: friendActivity.type,
          title: friendActivity.title,
          mapPolyline: friendActivity.mapPolyline,
          samples: [],
          laps: [],
          version: 1,
          lastModified: Date.now()
        } as ActivityDetails

        isFriendActivity.value = true
        friendUsername.value = friendActivity.friendUsername
        friendId.value = queryFriendId
        originalActivityId.value = friendActivity.activityId

        const db = await IndexedDBService.getInstance()
        const friend = (await db.getDataFromStore('friends', queryFriendId)) as Friend | null
        if (friend?.userId) {
          friendStableUserId.value = friend.userId
        }
        isMutualFriend.value = friend?.followsMe === true
      }
    } else {
      activityDetails.value = (await activityService.getDetails(id)) ?? null
      activity.value = (await activityService.getActivity(id)) ?? null
    }

    if (activityDetails.value?.samples?.length) {
      const analyzer = new ActivityAnalyzer(activityDetails.value.samples)
      samples.value = analyzer.sampleAverageByDistance(500)
    }

    loading.value = false
  }

  return {
    activity,
    activityDetails,
    samples,
    loading,
    isFriendActivity,
    friendUsername,
    canShowInteractions,
    interactionActivityId,
    interactionOwnerId,
    isMutualFriend,
    activityData,
    loadActivity
  }
}
