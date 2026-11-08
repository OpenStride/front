import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LogoHeart from '@/components/icons/LogoHeart.vue'

describe('LogoHeart', () => {
  it('is the logo: its leaf and its shield, hidden from screen readers', () => {
    const wrapper = mount(LogoHeart, { props: { liked: false } })
    expect(wrapper.findAll('path')).toHaveLength(2)
    expect(wrapper.attributes('aria-hidden')).toBe('true')
    expect(wrapper.classes()).not.toContain('logo-heart--liked')
  })

  it('beats once when a like is given, not when one is already there', async () => {
    const already = mount(LogoHeart, { props: { liked: true } })
    expect(already.classes()).toContain('logo-heart--liked')
    expect(already.classes()).not.toContain('logo-heart--beat')

    const wrapper = mount(LogoHeart, { props: { liked: false } })
    await wrapper.setProps({ liked: true })
    expect(wrapper.classes()).toContain('logo-heart--beat')
    await wrapper.trigger('animationend')
    expect(wrapper.classes()).not.toContain('logo-heart--beat')

    // Taking it back does not beat
    await wrapper.setProps({ liked: false })
    expect(wrapper.classes()).not.toContain('logo-heart--beat')
  })
})
