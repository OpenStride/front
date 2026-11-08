import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '@/locales/en.json'
import { PLUGIN_CONTEXT_KEY } from '@/composables/usePluginContext'
import ActivityPhotos from '@plugins/app-extensions/StandardDetails/ActivityPhotos.vue'
import type { ActivityPhoto, PhotoAddResult } from '@/types/photo'

const photo = (id: string, takenAt: number): ActivityPhoto => ({
  id,
  activityId: 'a1',
  takenAt,
  addedAt: takenAt,
  width: 2048,
  height: 1536,
  mime: 'image/jpeg',
  size: 400_000,
  version: 1,
  lastModified: 1
})

function setup(initial: ActivityPhoto[], canEdit = true) {
  let stored = [...initial]
  const photos = {
    list: vi.fn(async () => stored),
    blob: vi.fn(async () => new Blob(['img'], { type: 'image/jpeg' })),
    add: vi.fn(async (_id: string, files: File[]): Promise<PhotoAddResult> => {
      const added = files.map((_, i) => photo(`new${i}`, 1000 + i))
      stored = [...stored, ...added]
      return { added, failed: 0, refused: 0 }
    }),
    remove: vi.fn(async (id: string) => {
      stored = stored.filter(p => p.id !== id)
      return true
    }),
    onChanged: vi.fn(() => () => undefined)
  }
  const notify = vi.fn()
  const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })
  const wrapper = mount(ActivityPhotos, {
    attachTo: document.body,
    props: { activityId: 'a1', canEdit },
    global: {
      plugins: [i18n],
      provide: { [PLUGIN_CONTEXT_KEY]: { photos, notifications: { notify } } }
    }
  })
  return { wrapper, photos, notify }
}

const pickFiles = async (wrapper: ReturnType<typeof setup>['wrapper'], files: File[]) => {
  const input = wrapper.get('[data-test="photo-input"]')
  Object.defineProperty(input.element, 'files', { value: files, configurable: true })
  await input.trigger('change')
  await flushPromises()
}

describe('ActivityPhotos', () => {
  beforeEach(() => {
    let n = 0
    URL.createObjectURL = vi.fn(() => `blob:${++n}`)
    URL.revokeObjectURL = vi.fn()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
  })

  it('renders nothing for an outing without photos', async () => {
    const { wrapper } = setup([])
    await flushPromises()
    expect(wrapper.find('[data-test="activity-photos"]').exists()).toBe(false)
  })

  it('shows a thumbnail per photo, and room to add more', async () => {
    const { wrapper } = setup([photo('p1', 1), photo('p2', 2)])
    await flushPromises()
    expect(wrapper.findAll('[data-test="photo-thumb"]')).toHaveLength(2)
    expect(wrapper.find('[data-test="photo-add-more"]').exists()).toBe(true)
  })

  it("offers no way to add to someone else's outing", async () => {
    const { wrapper } = setup([photo('p1', 1)], false)
    await flushPromises()
    expect(wrapper.find('[data-test="photo-input"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="photo-add-more"]').exists()).toBe(false)
  })

  it('adds the picked files and shows them', async () => {
    const { wrapper, photos } = setup([])
    await flushPromises()
    await pickFiles(wrapper, [new File(['a'], 'a.jpg'), new File(['b'], 'b.jpg')])

    expect(photos.add).toHaveBeenCalledWith('a1', expect.any(Array))
    expect(photos.add.mock.calls[0][1]).toHaveLength(2)
    expect(wrapper.findAll('[data-test="photo-thumb"]')).toHaveLength(2)
  })

  it('says when a file could not be read, through the locale', async () => {
    const { wrapper, photos, notify } = setup([])
    photos.add.mockResolvedValueOnce({ added: [], failed: 2, refused: 0 })
    await flushPromises()
    await pickFiles(wrapper, [new File(['a'], 'a.heic'), new File(['b'], 'b.heic')])

    expect(notify).toHaveBeenCalledWith('2 photos could not be read.', { type: 'error' })
  })

  it('opens a photo full screen and walks through them', async () => {
    const { wrapper } = setup([photo('p1', 1), photo('p2', 2)])
    await flushPromises()
    await wrapper.findAll('[data-test="photo-thumb"]')[1].trigger('click')
    await flushPromises()

    const viewer = document.querySelector('[data-test="photo-viewer"]')
    expect(viewer?.textContent).toContain('2 / 2')

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    await flushPromises()
    expect(document.querySelector('[data-test="photo-viewer"]')?.textContent).toContain('1 / 2')

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(document.querySelector('[data-test="photo-viewer"]')).toBeNull()
  })

  it('deletes the photo on screen once confirmed', async () => {
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true)
    )
    const { wrapper, photos } = setup([photo('p1', 1), photo('p2', 2)])
    await flushPromises()
    await wrapper.findAll('[data-test="photo-thumb"]')[0].trigger('click')
    await flushPromises()
    ;(document.querySelector('[data-test="photo-delete"]') as HTMLButtonElement).click()
    await flushPromises()

    expect(photos.remove).toHaveBeenCalledWith('p1')
    expect(wrapper.findAll('[data-test="photo-thumb"]')).toHaveLength(1)
    expect(document.querySelector('[data-test="photo-viewer"]')?.textContent).toContain('1 / 1')
  })

  it('keeps the photo when the deletion is not confirmed', async () => {
    vi.stubGlobal(
      'confirm',
      vi.fn(() => false)
    )
    const { wrapper, photos } = setup([photo('p1', 1)])
    await flushPromises()
    await wrapper.get('[data-test="photo-thumb"]').trigger('click')
    await flushPromises()
    ;(document.querySelector('[data-test="photo-delete"]') as HTMLButtonElement).click()
    await flushPromises()
    expect(photos.remove).not.toHaveBeenCalled()
  })
})

describe("ActivityPhotos on a friend's outing", () => {
  it('shows the photos they share, read from their public files, with nothing to edit', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
    const getSharedPhoto = vi.fn(async () => new Blob(['img'], { type: 'image/jpeg' }))
    const photos = { list: vi.fn(), blob: vi.fn(), onChanged: vi.fn() }
    const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })
    const shared = {
      friendId: 'f1',
      photos: [
        { id: 'p1', thumb: 'https://x/t1', full: 'https://x/f1', width: 2048, height: 1536 },
        { id: 'p2', thumb: 'https://x/t2', full: 'https://x/f2', width: 2048, height: 1536 }
      ]
    }
    const wrapper = mount(ActivityPhotos, {
      attachTo: document.body,
      props: { activityId: 'run', canEdit: false, shared },
      global: {
        plugins: [i18n],
        provide: { [PLUGIN_CONTEXT_KEY]: { photos, friends: { getSharedPhoto } } }
      }
    })
    await flushPromises()

    expect(wrapper.findAll('[data-test="photo-thumb"] img')).toHaveLength(2)
    expect(getSharedPhoto).toHaveBeenCalledWith('f1', 'https://x/t1')
    expect(photos.list).not.toHaveBeenCalled()
    expect(photos.onChanged).not.toHaveBeenCalled()
    expect(wrapper.find('[data-test="photo-add-more"]').exists()).toBe(false)

    await wrapper.findAll('[data-test="photo-thumb"]')[1].trigger('click')
    await flushPromises()
    expect(getSharedPhoto).toHaveBeenCalledWith('f1', 'https://x/f2')
    expect(document.querySelector('[data-test="photo-delete"]')).toBeNull()
    wrapper.unmount()
    document.body.innerHTML = ''
  })
})
