# Testing Best Practices - OpenStride

Ce document détaille les bonnes pratiques pour éviter les erreurs courantes et garantir la robustesse du code.

## Problèmes Résolus (2026-01-21)

### Erreur: Cannot read properties of undefined (reading 'samples')

**Fichiers concernés:**
- `ActivityTopBlock.vue:57`
- `ActivityBests.vue:82`

### Erreur: Cannot read properties of undefined (reading 'id')

**Fichiers concernés:**
- `PrivacyToggle.vue:117`

**Cause:**
```typescript
// ❌ MAUVAIS - Crash si activity est undefined
const togglePrivacy = async () => {
  await db.saveData(`activityPrivacy_${props.activity.id}`, ...)  // Crash ici
}
```

**Solution:**
```typescript
// ✅ BON - Vérifie d'abord si activity existe
const togglePrivacy = async () => {
  if (!props.activity || !props.activity.id) {
    console.warn('[PrivacyToggle] Cannot toggle privacy: activity is undefined')
    return
  }
  await db.saveData(`activityPrivacy_${props.activity.id}`, ...)
}

// ✅ BON - Conditional rendering dans le template
<template>
  <div v-if="props.activity && props.activity.id" class="privacy-toggle-container">
    <!-- ... -->
  </div>
</template>
```

---

**Cause (samples):**
```typescript
// ❌ MAUVAIS - Crash si details est undefined
const polyline = computed(() => {
  if (!details.value.samples || details.value.samples.length === 0) return []
  // ...
})

// ❌ MAUVAIS - Crash si details est undefined
const analyzer = new ActivityAnalyzer(props.data.details.samples ?? [])
```

**Solution:**
```typescript
// ✅ BON - Vérifie d'abord si details existe
const polyline = computed(() => {
  if (!details.value || !details.value.samples || details.value.samples.length === 0) return []
  // ...
})

// ✅ BON - Utilise optional chaining
const analyzer = new ActivityAnalyzer(props.data.details?.samples ?? [])

// ✅ BON - Gère les erreurs gracieusement
let bestRaw = {}
try {
  bestRaw = analyzer.bestSegments(targets)
} catch (error) {
  console.warn('[Component] Cannot compute:', error)
}
```

---

## Convention App Extensions (Obligatoire)

**IMPORTANT**: Tous les composants App Extensions **DOIVENT** utiliser cette signature de props.

### Root Cause

Le composant parent `ActivityDetails.vue` passe **TOUJOURS** les données via un prop `data`:

```typescript
// src/views/ActivityDetails.vue
<component :is="comp?.default || comp" :data="activityData" />

// où activityData = { activity, details, samples }
```

### Signature Correcte

#### ✅ CORRECT - Convention Obligatoire

```typescript
// plugins/app-extensions/*/index.ts
const props = defineProps<{
  data: { activity: Activity; details: ActivityDetails }
}>();

// Utilisation via computed properties
const activity = computed(() => props.data?.activity)
const details = computed(() => props.data?.details)

// Template avec optional chaining
<template>
  <div v-if="props.data?.activity?.id" class="widget">
    <!-- Utiliser activity.value et details.value -->
  </div>
</template>
```

#### ❌ INCORRECT - Ne Fonctionne Pas

```typescript
// ❌ Cette signature ne reçoit JAMAIS les données
const props = defineProps<{
  activity: Activity;        // props.activity === undefined !!!
  details: ActivityDetails;  // props.details === undefined !!!
}>();

// Accès direct échoue partout:
props.activity.id  // TypeError: Cannot read properties of undefined
```

### Tests - Passer les Props Correctement

#### ✅ CORRECT - Wrappé dans `data`

```typescript
import { mount } from '@vue/test-utils'
import MyExtension from '@plugins/app-extensions/MyExtension/index.vue'

const wrapper = mount(MyExtension, {
  props: {
    data: {                    // ✅ Wrapper "data" requis
      activity: mockActivity,
      details: mockDetails
    }
  }
})
```

#### ❌ INCORRECT - Props Séparés

```typescript
// ❌ Ne matche pas la structure réelle
const wrapper = mount(MyExtension, {
  props: {
    activity: mockActivity,    // ❌ Ces props n'existent pas
    details: mockDetails       // ❌ Sera toujours undefined
  }
})
```

### Exemples de Référence

**Composants qui suivent la convention:**
- `plugins/app-extensions/StandardDetails/ActivityTopBlock.vue:51`
- `plugins/app-extensions/AggregatedDetails/ActivityBests.vue:78-80`
- `plugins/app-extensions/ActivityPrivacy/PrivacyToggle.vue:49-54`

**Code de référence:**

```vue
<!-- ActivityTopBlock.vue (CORRECT) -->
<script setup lang="ts">
import { computed } from 'vue'
import type { Activity, ActivityDetails } from '@/types/activity'

const props = defineProps<{
  data: { activity: Activity; details: ActivityDetails }
}>()

const activity = computed(() => props.data?.activity)
const details = computed(() => props.data?.details)

// Utilisation:
console.log(activity.value.id)           // ✅ Fonctionne
console.log(details.value.samples)       // ✅ Fonctionne
</script>

<template>
  <div v-if="activity?.id" class="widget">
    <h3>{{ activity.type }}</h3>
    <p>Samples: {{ details?.samples.length }}</p>
  </div>
</template>
```

---

## Bonnes Pratiques Générales

### 1. Toujours Vérifier les Propriétés Optionnelles

#### ❌ À ÉVITER

```typescript
// Assume que details existe toujours
const samples = props.details.samples
const distance = activity.stats.totalDistance
```

#### ✅ RECOMMANDÉ

```typescript
// Utilise optional chaining + nullish coalescing
const samples = props.details?.samples ?? []
const distance = activity.stats?.totalDistance ?? 0

// Ou vérifie explicitement
if (!props.details || !props.details.samples) {
  return []
}
```

### 2. Gestion d'Erreurs dans les Composants

#### ❌ À ÉVITER

```typescript
// Laisse les erreurs remonter sans gestion
const result = someComplexComputation(data)
```

#### ✅ RECOMMANDÉ

```typescript
// Entoure le code à risque dans try-catch
let result = defaultValue
try {
  result = someComplexComputation(data)
} catch (error) {
  console.warn('[ComponentName] Computation failed:', error)
  // Continue with default value
}
```

### 3. Rendu Conditionnel

#### ❌ À ÉVITER

```typescript
// Rend le widget même s'il n'y a pas de données
<template>
  <div class="widget">
    <div v-for="item in items">...</div>
  </div>
</template>
```

#### ✅ RECOMMANDÉ

```typescript
// N'affiche le widget que s'il y a des données
<template>
  <div v-if="items.length > 0" class="widget">
    <div v-for="item in items">...</div>
  </div>
  <div v-else class="empty-state">No data available</div>
</template>
```

---

## Tests Unitaires

### 1. Tester les Cas Edge

**TOUJOURS** tester les scénarios suivants :

```typescript
describe('MyComponent', () => {
  // ✅ Données valides
  it('renders correctly with valid data', () => {
    const wrapper = mount(MyComponent, { props: validProps })
    expect(wrapper.vm).toBeDefined()
  })

  // ✅ Données undefined
  it('handles undefined data gracefully', () => {
    const wrapper = mount(MyComponent, { props: { data: undefined } })
    expect(wrapper.vm).toBeDefined() // Ne devrait pas crasher
  })

  // ✅ Tableaux vides
  it('handles empty arrays', () => {
    const wrapper = mount(MyComponent, { props: { items: [] } })
    expect(wrapper.vm).toBeDefined()
  })

  // ✅ Propriétés manquantes
  it('handles missing properties', () => {
    const wrapper = mount(MyComponent, { props: { data: { samples: undefined } } })
    expect(wrapper.vm).toBeDefined()
  })
})
```

### 2. Mocker les Dépendances

#### Vue Router

```typescript
// Pour les composants utilisant RouterLink
const mockRouter = {
  push: () => {},
  resolve: () => ({ href: '/mock' })
}

const mockRoute = {
  params: {},
  query: {}
}

const wrapper = mount(Component, {
  global: {
    mocks: {
      $router: mockRouter,
      $route: mockRoute
    },
    stubs: {
      RouterLink: {
        template: '<a><slot /></a>'
      }
    }
  }
})
```

#### Services

```typescript
// Mock des services avec données réalistes
const mockActivityService = {
  getActivity: vi.fn().mockResolvedValue(mockActivity),
  getAllActivities: vi.fn().mockResolvedValue([])
}
```

### 3. Données de Test Réalistes

#### ❌ À ÉVITER

```typescript
// Données incomplètes
const mockSamples = [
  { timeOffset: 0, speed: 3.5 }
]
```

#### ✅ RECOMMANDÉ

```typescript
// Données complètes et réalistes
const mockSamples = Array.from({ length: 100 }, (_, i) => ({
  time: i * 36,           // seconds cumulative
  distance: i * 100,      // meters cumulative
  speed: 2.5 + Math.random() * 0.5,
  heartRate: 140 + Math.floor(Math.random() * 20),
  lat: 48.8566 + Math.random() * 0.01,
  lng: 2.3522 + Math.random() * 0.01
}))
```

---

## Checklist Pre-Commit

Avant de commiter du code, vérifiez :

- [ ] Les propriétés optionnelles utilisent `?.` ou sont vérifiées avec `if`
- [ ] Les opérations à risque sont dans des `try-catch`
- [ ] Les rendus conditionnels (`v-if`) sont utilisés quand nécessaire
- [ ] Au moins 3 tests par composant : valid, undefined, empty
- [ ] Les tests passent : `npm run test:unit`
- [ ] L'app compile : `npm run build`

---

## Scripts de Test

```bash
# Lancer tous les tests
npm run test:unit

# Lancer tous les tests de plugins
npm run test:unit tests/unit/plugins/

# Lancer les tests d'un fichier spécifique
npm run test:unit tests/unit/plugins/ActivityBests.spec.ts

# Lancer les tests en mode watch
npm run test:unit --watch

# Lancer les tests avec coverage
npm run test:unit --coverage
```

**Résultat actuel des tests de plugins (2026-01-21):**
- ✅ ActivityTopBlock.spec.ts: 5/5 tests
- ✅ ActivityBests.spec.ts: 5/5 tests
- ✅ PrivacyToggle.spec.ts: 9/9 tests
- **Total: 19/19 tests passing**

---

## Ressources

- [Vue Test Utils Documentation](https://test-utils.vuejs.org/)
- [Vitest Documentation](https://vitest.dev/)
- [TypeScript Optional Chaining](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-7.html#optional-chaining)
- [Nullish Coalescing](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-7.html#nullish-coalescing)

---

## Exemples Complets

### Composant Robuste

```vue
<template>
  <div v-if="hasData" class="widget">
    <h3>{{ title }}</h3>
    <div v-for="item in processedItems" :key="item.id">
      {{ item.label }}
    </div>
  </div>
  <div v-else class="empty-state">
    No data available
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  data: Object
})

const hasData = computed(() => {
  return props.data &&
         props.data.items &&
         Array.isArray(props.data.items) &&
         props.data.items.length > 0
})

const processedItems = computed(() => {
  if (!hasData.value) return []

  try {
    return props.data.items.map(item => ({
      id: item.id,
      label: item.name ?? 'Unknown'
    }))
  } catch (error) {
    console.warn('[MyWidget] Failed to process items:', error)
    return []
  }
})

const title = computed(() => props.data?.title ?? 'Default Title')
</script>
```

### Test Complet

```typescript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MyWidget from './MyWidget.vue'

describe('MyWidget.vue', () => {
  const validData = {
    title: 'My Title',
    items: [
      { id: '1', name: 'Item 1' },
      { id: '2', name: 'Item 2' }
    ]
  }

  it('renders with valid data', () => {
    const wrapper = mount(MyWidget, {
      props: { data: validData }
    })

    expect(wrapper.find('h3').text()).toBe('My Title')
    expect(wrapper.findAll('div[class="item"]')).toHaveLength(2)
  })

  it('handles undefined data', () => {
    const wrapper = mount(MyWidget, {
      props: { data: undefined }
    })

    expect(wrapper.find('.empty-state').exists()).toBe(true)
    expect(wrapper.find('.widget').exists()).toBe(false)
  })

  it('handles empty items array', () => {
    const wrapper = mount(MyWidget, {
      props: { data: { items: [] } }
    })

    expect(wrapper.find('.empty-state').exists()).toBe(true)
  })

  it('handles missing title', () => {
    const wrapper = mount(MyWidget, {
      props: { data: { items: validData.items } }
    })

    expect(wrapper.find('h3').text()).toBe('Default Title')
  })

  it('handles items with missing names', () => {
    const wrapper = mount(MyWidget, {
      props: {
        data: {
          items: [{ id: '1' }] // missing name
        }
      }
    })

    expect(wrapper.text()).toContain('Unknown')
  })
})
```

---

**Dernière mise à jour:** 2026-01-21
**Contributeurs:** Refactoring Team 2026
