/**
 * The `publicFileProvider` preference, declared identically by every storage
 * plugin able to publish public files.
 *
 * Each plugin proposes *itself* as the default. Because a default is only
 * written when the key holds no value, the first capable plugin the user
 * installs claims the preference and every later one leaves it untouched —
 * which is what keeps already-shared links pointing at the same provider.
 * The user can still switch, from the preferences screen.
 */
import type { PluginPreferenceDeclaration } from '@/types/plugin-preferences'
import { PUBLIC_FILE_PROVIDER_PREFERENCE } from '@/types/storage'
import { getPluginContext } from '@/services/PluginContextFactory'

export function publicFileProviderPreference(
  ownPluginId: string
): PluginPreferenceDeclaration<string> {
  return {
    key: PUBLIC_FILE_PROVIDER_PREFERENCE,
    shared: true,
    default: ownPluginId,
    label: 'preferences.publicFileProvider.label',
    description: 'preferences.publicFileProvider.description',
    type: 'select',
    // Resolved on render: the choices are whichever capable plugins are
    // connected right now, which the declaration cannot know statically.
    options: async () => {
      const ctx = await getPluginContext()
      const providers = await ctx.friends.listPublicFileProviders()
      return providers.map(provider => ({ value: provider.id, label: provider.label }))
    }
  }
}
