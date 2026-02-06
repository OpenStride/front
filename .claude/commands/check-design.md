Check OpenStride design compliance. Run the following verifications:

1. **Hardcoded colors**: Search in `src/` and `plugins/` for forbidden colors (#88aa00, #6d8a00, #10b981, #059669, or any hex color in .vue files that isn't in variables.css). Use Grep.

2. **Emojis in code**: Search for Unicode emojis in .vue and .ts files under `src/` and `plugins/`. Emojis are forbidden in production code (OK in doc comments).

3. **Icons without aria-hidden**: Search for `<i class="fa` elements missing `aria-hidden="true"` in .vue files.

4. **Forbidden imports in plugins**: Search in `plugins/` for direct imports of core services:
   - `import.*from.*@/services/ActivityDBService`
   - `import.*from.*@/services/IndexedDBService`
   - `import.*from.*@/services/ToastService`

For each violation found:

- Show the file, line number, and content
- Explain why it's forbidden
- Suggest the fix (reference DESIGN_GUIDELINES.md or PLUGIN_GUIDELINES.md)

At the end, show a summary: X violations found (Y colors, Z emojis, W icons, V imports).
If 0 violations: "Design check passed"
