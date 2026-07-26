/**
 * Plugin-declared preferences
 *
 * A plugin does not read the app's settings and hope a key exists: it *declares*
 * the preferences it needs, with the value it would like when nothing has been
 * decided yet. The default is proposed once, when the plugin is installed, and
 * only if the key has no value — a preference the user has already set is never
 * overwritten, including when the plugin is disabled and re-enabled later.
 *
 * Keys are namespaced under the plugin id by default. `shared: true` puts a key
 * in the global namespace so several plugins can propose a default for the same
 * preference — the first one installed wins, the others leave it alone.
 */

export type PluginPreferenceValue = string | number | boolean | null

export interface PluginPreferenceOption {
  value: string | number
  /**
   * i18n key, or a literal label when the text is only known at runtime
   * (another plugin's name, for instance). The UI translates it when the key
   * exists and shows it as-is otherwise.
   */
  label: string
}

/**
 * Options can depend on runtime state (which plugins are enabled, what the user
 * connected), so a declaration may resolve them lazily instead of listing them.
 */
export type PluginPreferenceOptionsResolver = () =>
  | PluginPreferenceOption[]
  | Promise<PluginPreferenceOption[]>

export interface PluginPreferenceDeclaration<
  T extends PluginPreferenceValue = PluginPreferenceValue
> {
  /** Key, namespaced as `<pluginId>.<key>` unless `shared` is set. */
  key: string

  /**
   * Value written at install time when the key has no value yet.
   * Never overwrites an existing one.
   */
  default: T

  /**
   * Use the global namespace instead of the plugin's own, so several plugins can
   * propose a default for the same preference.
   */
  shared?: boolean

  /** i18n key for the label. Omit to keep the preference out of the UI. */
  label?: string

  /** i18n key for the help text shown under the control. */
  description?: string

  /** Control to render. Defaults to a plain text input. */
  type?: 'boolean' | 'string' | 'number' | 'select'

  /** Choices for `type: 'select'`. */
  options?: PluginPreferenceOption[] | PluginPreferenceOptionsResolver
}

/** A declaration paired with its current value, ready to render. */
export interface ResolvedPluginPreference {
  storageKey: string
  declaration: PluginPreferenceDeclaration
  /** Plugin whose declaration is being rendered. */
  pluginId: string
  pluginLabel: string
  value: PluginPreferenceValue
  options: PluginPreferenceOption[]
}

/**
 * Storage key for a declaration: namespaced under the plugin unless shared.
 */
export function resolvePreferenceKey(
  pluginId: string,
  declaration: Pick<PluginPreferenceDeclaration, 'key' | 'shared'>
): string {
  return declaration.shared ? declaration.key : `${pluginId}.${declaration.key}`
}

/** Structural read: every plugin type may carry declarations, none must. */
export function preferenceDeclarationsOf(plugin: unknown): PluginPreferenceDeclaration[] {
  const declarations = (plugin as { preferences?: PluginPreferenceDeclaration[] } | null)
    ?.preferences
  return Array.isArray(declarations) ? declarations : []
}
