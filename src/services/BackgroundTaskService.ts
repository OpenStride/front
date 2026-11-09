import { computed, reactive } from 'vue'
import type { BackgroundTask } from '@/types/plugin-context'

/**
 * The long jobs running right now, shown on every page by `BackgroundTasks.vue`.
 *
 * A first import from a provider takes minutes. It used to be visible only on
 * the provider's own page, as a line of text: leave the page and nothing said
 * the work was still going, stay on it and nothing said you didn't have to.
 */
const tasks = reactive(new Map<string, BackgroundTask>())

export const backgroundTasks = {
  report(task: BackgroundTask): void {
    tasks.set(task.id, { ...task })
  },
  finish(id: string): void {
    tasks.delete(id)
  },
  /** The running jobs, oldest first. */
  list: computed(() => [...tasks.values()])
}
