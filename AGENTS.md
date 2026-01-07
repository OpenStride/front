# Repository Guidelines

## Project Structure & Module Organization
- App code in `src/` with aliases: `@ -> src`, `@plugins -> plugins`.
- Key folders: `components/`, `views/`, `services/`, `utils/`, `types/`, `router/`, `assets/`.
- Plugins live under `plugins/` (`app-extensions/`, `data-providers/`, `storage-providers/`).
- Static assets in `public/`; Vite entry is `index.html`; PWA assets via `vite-plugin-pwa`.
- Tests in `tests/unit/` (Vitest). E2E folder exists but is not wired by a script.

## Build, Test, and Development Commands
- `npm run dev` — start Vite dev server at `http://localhost:3000`.
- `npm run build` — production build to `dist/`.
- `npm run preview` — serve the built app locally.
- `npm run lint` — run ESLint on `.ts` and `.vue` files.
- `npm run test:unit` — run unit tests with Vitest (`happy-dom`).

## Coding Style & Naming Conventions
- Language: TypeScript + Vue 3 SFCs.
- Indentation: 2 spaces; keep lines concise and readable.
- Filenames: Vue components `PascalCase.vue` (e.g., `ActivityCard.vue`); services/utilities `CamelCase.ts` (e.g., `ActivityDBService.ts`, `debounce.ts`).
- Imports use aliases (`@/services/...`, `@plugins/...`).
- Linting: ESLint with `plugin:vue/vue3-essential` and TS rules. Fix issues before pushing.

## Testing Guidelines
- Framework: Vitest + Vue Test Utils; DOM: `happy-dom`.
- Location: `tests/unit/*.spec.ts`. Name tests `<feature>.spec.ts`.
- Scope: test components’ rendering and navigation, and services’ logic.
- Run locally with `npm run test:unit`. Optional coverage: `vitest --coverage`.

## Commit & Pull Request Guidelines
- Use Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`.
- Keep messages imperative and scoped: `feat(home): add CTA redirect`.
- PRs must include: summary, linked issues, screenshots for UI, steps to test, and a note on risk/rollback.
- Ensure CI passes (build, lint, tests) before requesting review.

## Security & Configuration
- Use Vite variables: only `VITE_*` keys are exposed to the client. Do not put true secrets in front-end envs.
- Commit `.env.example` only; keep `.env` and `.env.*.local` out of git. Rotate keys if previously committed.
- Firebase client config is project-specific (not secret) and now sourced from `import.meta.env`.
- For real secrets, call a secure backend or Firebase Functions; never ship private API keys to the browser.
- Firebase Hosting: `firebase.json` serves `dist/` with SPA rewrites; verify `npm run build` before deploy.
- PWA: service worker auto-updates via `vite-plugin-pwa`.

## Deployment
- Prereqs: Firebase CLI installed and logged in (`firebase login`). Ensure the right project is selected (`firebase use`).
- Build: `npm ci` (or `npm install`) then `npm run build` → outputs to `dist/`.
- Deploy: `firebase deploy --only hosting` (uses SPA rewrites from `firebase.json`).
- Preview locally: `npm run preview` at `http://localhost:4173`.

## Plugin Module Checklist
- Data provider: `plugins/data-providers/<id>/client/index.ts` exports `default` as `ProviderPlugin` from `@/types/provider`.
  - Minimal example:
    - `export default { id: 'garmin', label: 'Garmin', setupComponent: () => import('./Setup.vue') }`
- Storage provider: `plugins/storage-providers/<id>/client/index.ts` exports `StoragePlugin` from `@/types/storage` with `readRemote` and `writeRemote`.
- App extension: `plugins/app-extensions/<id>/index.ts` exports `ExtensionPlugin` from `@/types/extension` with `slots` mapping to async component loaders.
- No manual registry edits needed: registries use `import.meta.glob` to auto-discover entries.
