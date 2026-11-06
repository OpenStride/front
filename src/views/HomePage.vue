<template>
  <div class="home-page" :class="{ 'is-selecting': selecting }">
    <!-- Blocks that ask for an action rather than report a figure -->
    <div v-if="topSlotComponents.length" class="home-top">
      <component v-for="(comp, i) in topSlotComponents" :is="comp" :key="`home-top-${i}`" />
    </div>

    <!-- Android only, and only once the app has proven useful -->
    <InstallPrompt variant="banner" />

    <div class="home-controls">
      <ActivitySearchBar
        :model-value="filters.text || ''"
        :filters-open="filtersOpen"
        :has-active-filters="hasActiveFilters"
        :active-filter-count="activeFilterCount"
        data-test="search-bar"
        @update:model-value="setTextFilter"
        @toggle-filters="toggleFiltersPanel"
      />

      <!-- Always offered, including with nobody followed: the Friends tab is
           now the only door to adding one, so hiding it until you already have
           a friend would close the door on the people who need it. -->
      <div class="scope-tabs" role="tablist" data-test="scope-tabs">
        <button
          v-for="option in SCOPES"
          :key="option"
          class="scope-tab"
          :class="{ 'is-active': scope === option }"
          role="tab"
          :aria-selected="scope === option"
          :data-test="`scope-${option}`"
          @click="scope = option"
        >
          {{ t(`feed.scopes.${option}`) }}
        </button>
      </div>

      <!-- Showing your code, adding someone and managing the list follow the
           scope that needs them, rather than a page of their own. -->
      <FriendsQuickActions v-if="scope === 'friends'" data-test="friends-actions" />

      <Transition name="slide">
        <ActivityFiltersPanel
          v-if="filtersOpen"
          :model-value="filters"
          :has-active-filters="hasActiveFilters"
          :available-sports="facets.sports"
          :has-distance="facets.hasDistance"
          @update:model-value="onFiltersChange"
          @reset="resetFilters"
        />
      </Transition>

      <div v-if="(hasActiveFilters && !loading) || canSelect" class="home-controls__row">
        <p v-if="hasActiveFilters && !loading" class="result-count" data-test="result-count">
          <template v-if="indexingAscent">{{ t('filters.indexingClimb') }}</template>
          <template v-else>{{ t('filters.resultCount', { count: totalCount }) }}</template>
        </p>
        <!-- Only when an extension has something to do with a selection. -->
        <button
          v-if="canSelect && !selecting"
          type="button"
          class="select-toggle"
          data-test="select-start"
          @click="selecting = true"
        >
          <i class="fas fa-list-check" aria-hidden="true"></i>
          {{ t('feed.select.start') }}
        </button>
      </div>
    </div>

    <!-- Activities Feed -->
    <div ref="scrollArea" class="feed-container">
      <ActivityCard
        v-for="activity in activities"
        :key="activity.id"
        :activity="activity"
        :friend-username="activity.source === 'friend' ? activity.friendUsername : undefined"
        :selectable="selecting && activity.source === 'own'"
        :selected="selected.has(activity.id)"
        data-test="activity-card"
        @toggle="toggle(activity.id)"
      />

      <p v-if="loading" class="loading-text" data-test="loading-message">
        {{ t('activities.loading') }}
      </p>

      <!-- Nothing to show splits in two: filters that match nothing, and a
           list with nothing behind it. The router sends a first visitor to the
           landing page, so the second case is not a welcome — it is a reader
           who narrowed to their own outings while only friends' are stored, or
           who just deleted their last one. -->
      <p v-if="isEmpty && hasActiveFilters" class="end-text" data-test="no-results-message">
        {{ t('filters.noResults') }}
      </p>
      <!-- Under the Friends scope the way out is the row of actions just above,
           so this only names what is missing instead of repeating the buttons. -->
      <div
        v-else-if="isEmpty && scope === 'friends'"
        class="friends-empty"
        data-test="friends-empty"
      >
        <i class="fas fa-user-friends" aria-hidden="true"></i>
        <p class="friends-empty__title">{{ t('friends.noActivities') }}</p>
        <p class="friends-empty__hint">{{ t('friends.noActivitiesDescription') }}</p>
      </div>
      <ActivityEmptyState
        v-else-if="isEmpty"
        :title="t('activities.noActivity')"
        :description="t('activities.noActivityDescription')"
        show-friends
      />
      <p v-else-if="!hasMore && !loading" class="end-text" data-test="all-loaded-message">
        {{ t('activities.allLoaded') }}
      </p>
    </div>

    <!-- Selection mode: what is picked, and what can be done with it. The actions
         come from extensions, so core holds the selection and nothing else. -->
    <div
      v-if="selecting"
      class="select-bar"
      role="region"
      :aria-label="t('feed.select.region')"
      data-test="select-bar"
    >
      <div class="select-bar__inner">
        <span class="select-bar__count" aria-live="polite">{{
          t('feed.select.count', selected.size)
        }}</span>
        <button
          v-if="selected.size < selectableIds.length"
          type="button"
          class="select-bar__link"
          data-test="select-all"
          @click="selectAll"
        >
          {{ t('feed.select.all', { count: selectableIds.length }) }}
        </button>
        <button v-else type="button" class="select-bar__link" @click="selected = new Set()">
          {{ t('feed.select.none') }}
        </button>
        <div class="select-bar__actions">
          <component
            :is="comp"
            v-for="(comp, i) in bulkComponents"
            :key="`bulk-${i}`"
            :ids="[...selected]"
            @done="stopSelecting"
          />
          <BulkSportAction :ids="[...selected]" :sports="ownSports" @done="onSportChanged" />
          <button
            type="button"
            class="select-bar__close"
            :aria-label="t('feed.select.stop')"
            :title="t('feed.select.stop')"
            data-test="select-stop"
            @click="stopSelecting"
          >
            <i class="fas fa-xmark" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import ActivityCard from '@/components/ActivityCard.vue'
import BulkSportAction from '@/components/BulkSportAction.vue'
import ActivityEmptyState from '@/components/ActivityEmptyState.vue'
import ActivitySearchBar from '@/components/ActivitySearchBar.vue'
import ActivityFiltersPanel from '@/components/ActivityFilters.vue'
import FriendsQuickActions from '@/components/FriendsQuickActions.vue'
import InstallPrompt from '@/components/InstallPrompt.vue'
import { useMixedFeed, type FeedScope } from '@/composables/useMixedFeed'
import { useActivityFilters } from '@/composables/useActivityFilters'
import { useSlotExtensions } from '@/composables/useSlotExtensions'
import { useFeedMetricsIndex } from '@/composables/useActivityMetricsIndex'
import { getActivityService, type ActivityServiceEvent } from '@/services/ActivityService'
import type { ActivityFilters } from '@/types/activity'
import { debounce } from '@/utils/debounce'

const SCOPES: FeedScope[] = ['all', 'own', 'friends']

const { t } = useI18n()

const { components: topRaw } = useSlotExtensions('home.top')
const topSlotComponents = computed(() => topRaw.value)

const {
  filters,
  scope,
  filtersOpen,
  hasActiveFilters,
  activeFilterCount,
  serviceFilters,
  resetFilters,
  setTextFilter,
  toggleFiltersPanel
} = useActivityFilters()

const {
  activities,
  loading,
  hasMore,
  loadMore,
  reload,
  facets,
  totalCount,
  matching,
  indexingAscent
} = useMixedFeed({
  filters: serviceFilters,
  scope
})

// ── Selection ───────────────────────────────────────────────────────────────
const { components: bulkRaw } = useSlotExtensions('activities.bulk')
const bulkComponents = computed(() => bulkRaw.value)

/** Own outings only: nothing a selection can do applies to a friend's. */
const canSelect = computed(() => scope.value !== 'friends')

// `?select=1` opens the list ready to pick, for links such as "apply this gear
// to past outings" that land on a pre-filtered list.
const selecting = ref(useRoute().query.select === '1')
const selected = ref<Set<string>>(new Set())

/** Everything the filters match, scrolled to or not. */
const selectableIds = computed(() => matching.value.filter(a => a.source === 'own').map(a => a.id))

function toggle(id: string) {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}

function selectAll() {
  selected.value = new Set(selectableIds.value)
}

function stopSelecting() {
  selecting.value = false
  selected.value = new Set()
}

// The selection is what the list shows: narrowing the filters drops what falls out
// of it, so an action never reaches an outing the reader can no longer see.
watch(selectableIds, ids => {
  const keep = new Set(ids)
  const next = new Set([...selected.value].filter(id => keep.has(id)))
  if (next.size !== selected.value.size) selected.value = next
})
watch(canSelect, can => {
  if (!can) stopSelecting()
})

/** The sports the reader's outings carry, offered first when correcting one. */
const ownSports = computed(() => matching.value.filter(a => a.source === 'own').map(a => a.type))

/** A sport moves a card between filters and changes its label: read the list again. */
function onSportChanged() {
  stopSelecting()
  void reload()
}

// Lifts calories, climb and the rest out of the details of the page on screen,
// so the cards can show what only the details hold.
useFeedMetricsIndex(activities)

const scrollArea = ref<HTMLElement | null>(null)

// Nothing left to fetch and nothing fetched: the list is settled on empty,
// rather than merely between two pages.
const isEmpty = computed(() => !loading.value && !hasMore.value && activities.value.length === 0)

// A single refresh is answered by every service that listens, so the events
// arrive in a burst — reload once for the whole burst.
const onRefresh = debounce(() => {
  reload()
}, 500)

const handleActivityChanged = (event: Event) => {
  const { type } = (event as CustomEvent<ActivityServiceEvent>).detail
  if (type === 'saved' || type === 'deleted') onRefresh()
}

let activityService: Awaited<ReturnType<typeof getActivityService>> | null = null

onMounted(async () => {
  loadMore()
  window.addEventListener('scroll', handleScroll)
  window.addEventListener('openstride:activities-refreshed', onRefresh)

  activityService = await getActivityService()
  activityService.emitter.addEventListener('activity-changed', handleActivityChanged)
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', handleScroll)
  window.removeEventListener('openstride:activities-refreshed', onRefresh)
  activityService?.emitter.removeEventListener('activity-changed', handleActivityChanged)
})

const handleScroll = () => {
  const bottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 100
  if (bottom) {
    loadMore()
  }
}

function onFiltersChange(newFilters: ActivityFilters) {
  filters.value = newFilters
}
</script>

<style scoped>
/* One rhythm for the whole column: `--home-gap` is the gap the cards already
   keep between themselves, so the goals block, the controls and the first card
   are all spaced alike instead of each picking their own value. */
.home-page {
  --home-gap: 1.25rem;
  max-width: 600px;
  margin: 0 auto;
  padding: 0;
}

.home-top {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: var(--home-gap);
}

/* Same treatment as a card — surface, hairline, shadow, square corners — so
   the controls read as a block of the page rather than as an extension of the
   sticky header they sit under. Two white boxes a few pixels apart read as one
   region, which is what put the search bar inside the header. */
.home-controls {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.85rem;
  margin-bottom: var(--home-gap);
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  box-shadow: var(--shadow-card);
}

/* A track inside a panel, so it takes the recessed surface rather than the
   grey it used to borrow from the page background. Capped, because three short
   words stretched across six hundred pixels read as an empty row rather than as
   a control — on a phone the cap is wider than the screen, so it fills. */
.scope-tabs {
  display: flex;
  max-width: 22rem;
  gap: 0.2rem;
  background: var(--surface-2);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 0.2rem;
}

.scope-tab {
  flex: 1;
  padding: 0.4rem 0.6rem;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-muted);
  font-family: var(--font-main);
  font-size: 0.85rem;
  font-weight: 500;
  /* Global button styling shouts in uppercase; a scope is a label, not a call
     to action, and the friend chips below already opted out of it */
  text-transform: none;
  letter-spacing: 0;
  cursor: pointer;
  transition: all 0.2s;
}

.scope-tab:hover:not(.is-active) {
  color: var(--text-color);
}

.scope-tab.is-active {
  background: var(--surface);
  color: var(--text-color);
  box-shadow: var(--shadow-card);
}

.friends-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  padding: 3rem 1.5rem;
  text-align: center;
  color: var(--color-gray-500);
}

.friends-empty i {
  font-size: 2.5rem;
  color: var(--color-green-300);
  margin-bottom: 0.5rem;
}

.friends-empty__title {
  margin: 0;
  font-weight: 600;
  color: var(--color-gray-900);
}

.friends-empty__hint {
  margin: 0;
  font-size: 0.875rem;
}

.home-controls__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.select-toggle {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  min-height: 2.75rem;
  padding: 0 0.5rem;
  border: 0;
  background: none;
  color: var(--color-green-700);
  font-family: var(--font-main);
  font-size: 0.85rem;
  font-weight: 600;
  text-transform: none;
  letter-spacing: 0;
  cursor: pointer;
}

/* Room for the bar, so the last card can scroll clear of it. */
.home-page.is-selecting {
  padding-bottom: 5rem;
}

.select-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1000;
  background: var(--surface);
  border-top: 1px solid var(--border-subtle);
  box-shadow: var(--shadow-float);
  padding: 0.6rem 1rem calc(0.6rem + env(safe-area-inset-bottom));
}

.select-bar__inner {
  max-width: 600px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.25rem 0.75rem;
}

.select-bar__count {
  font-weight: 600;
  color: var(--text-color);
}

.select-bar__link {
  min-height: 2.75rem;
  padding: 0 0.25rem;
  border: 0;
  background: none;
  color: var(--color-green-700);
  font-family: var(--font-main);
  font-size: 0.85rem;
  font-weight: 600;
  text-transform: none;
  letter-spacing: 0;
  cursor: pointer;
}

.select-bar__actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.select-bar__close {
  width: 2.75rem;
  height: 2.75rem;
  border: 0;
  border-radius: var(--radius-sm);
  background: none;
  color: var(--text-muted);
  font-size: 1.1rem;
  cursor: pointer;
}

/* Sits last inside the panel, so it needs no margin of its own */
.result-count {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin: 0;
}

.feed-container {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.loading-text,
.end-text {
  text-align: center;
  padding: 2rem 1rem;
  color: var(--color-gray-500);
  font-size: 0.875rem;
}

.slide-enter-active,
.slide-leave-active {
  transition: all 0.25s ease;
  overflow: hidden;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  max-height: 0;
}

.slide-enter-to,
.slide-leave-from {
  opacity: 1;
  max-height: 500px;
}

@media (max-width: 640px) {
  .home-page {
    padding: 0;
  }

  .home-page {
    --home-gap: 1rem;
  }
}
</style>
