# App native (Capacitor) — guide pour l'agent qui la fera

Ce document existe pour que la personne — ou l'agent — qui attaquera le wrapper
natif ne redécouvre pas les pièges à ses dépens. Rien de ceci n'est encore fait.

> Contexte : `docs/INSTALL_FUNNEL.md` explique pourquoi le tunnel d'installation
> PWA ne propose aucun lien vers les stores aujourd'hui.

## Pourquoi Capacitor

L'app est déjà une PWA Vue complète. Capacitor l'emballe **sans réécriture** :
le même `dist/` est servi dans un WebView, et les API natives arrivent par des
plugins JS. React Native ou Flutter voudraient dire tout refaire.

Ce qui apparaît : `capacitor.config.ts`, `ios/`, `android/`. Ce qui ne change
pas : `src/`, `plugins/`, le build Vite.

## L'essentiel : santé = plugin de données, pas de modification du core

HealthKit et Health Connect entrent **tels quels** dans le contrat existant.

```
plugins/data-providers/AppleHealth/client/index.ts     → ProviderPlugin
plugins/data-providers/HealthConnect/client/index.ts   → ProviderPlugin
```

L'adaptateur produit des `Activity` / `ActivityDetails` en SI, comme Garmin et
Strava. `checkActivityContract` (voir `src/services/activityContract.ts`) les
contrôle à la même porte, sans qu'on ait à l'inscrire nulle part.

Le mapping des sports se calque sur `GarminProvider/client/sportTypes.ts` :
`HKWorkoutActivityType` (iOS) et `ExerciseSessionRecord` (Android) → `SportType`
canonique, inconnu → `'other'`.

**Ne rien ajouter à `ActivityDetails.stats`** pour une donnée propre à une
plateforme : passer par `MEASUREMENT_KEYS` / `MEASUREMENTS`
(`docs/SPORT_AND_UNITS.md` §7).

## Les quatre pièges

### 1. Le registre de plugins est _eager_

```ts
// src/services/ProviderPluginRegistry.ts
const modules = import.meta.glob('@plugins/data-providers/**/client/index.ts', { eager: true })
```

Un plugin santé sera donc **découvert et exécuté dans le build web**, où
`@capacitor/...` n'existe pas. Deux conséquences :

- L'`index.ts` du plugin ne doit **jamais** importer un module Capacitor au
  niveau du module. L'import va dans `setupComponent()` / `refreshData()`, en
  dynamique (`await import(...)`).
- Il faut pouvoir le masquer sur les plateformes où il n'a pas de sens. Ajouter
  à `ProviderPlugin` un champ jumeau de `deprecated`, filtré au même endroit :

```ts
/** Plateformes où ce provider a un sens. Absent = partout. */
availableOn?: Array<'web' | 'ios' | 'android'>
```

et l'appliquer dans `installableProviderPlugins`. Garder `allProviderPlugins`
complet, pour la même raison que `deprecated` : une activité déjà importée doit
continuer à résoudre son provider.

### 2. Le WebView iOS se présente comme Safari

`InstallService.platform` (`src/services/InstallService.ts`) lit l'user-agent.
Dans un WKWebView Capacitor, il ressemble à Safari iOS — donc le tunnel
**proposerait d'installer la PWA depuis l'app native déjà installée**.

Il faut une branche `'native'` avant toute autre détection :

```ts
import { Capacitor } from '@capacitor/core'
if (Capacitor.isNativePlatform()) return 'native'
```

et `canInstall` doit valoir `false` pour elle. Les tests de
`tests/unit/InstallService.spec.ts` sont le bon endroit pour verrouiller ça.

### 3. Le stockage repart de zéro — encore

C'est le même problème que celui décrit dans `docs/INSTALL_FUNNEL.md`, un cran
plus loin : le WebView natif a **son propre conteneur IndexedDB**. Un utilisateur
qui passe de la PWA à l'app native ouvre une app vide.

La seule sortie propre est celle qui existe déjà : un storage provider connecté,
et `ctx.storage.importFromRemote()` au premier lancement pour réhydrater. Le
parcours de première ouverture de l'app native doit donc proposer la connexion
cloud **avant** toute autre chose, et non l'import santé.

### 4. Le service worker n'a plus de rôle

L'app native sert son bundle depuis le disque. `PWAUpdateService` (36 tests) ne
doit pas proposer de mise à jour dans ce contexte — la mise à jour passe par le
store. Vérifier son comportement sous `Capacitor.isNativePlatform()` avant de
livrer, sinon l'utilisateur voit une invite à recharger qui ne fait rien.

## Ce qu'un agent ne peut pas faire

Ces étapes demandent un humain avec des comptes et une carte bancaire :

- **Apple** : compte développeur (99 $/an), entitlement HealthKit, chaînes de
  confidentialité `NSHealthShareUsageDescription` /
  `NSHealthUpdateUsageDescription`. Les apps HealthKit passent une revue
  renforcée : Apple refuse celles qui n'expliquent pas clairement l'usage des
  données.
- **Google** : Play Console, déclaration Health Connect (formulaire séparé, avec
  justification par type de donnée demandé), politique de confidentialité
  publiée.

Prévoir que la première soumission soit refusée. Ce n'est pas un échec, c'est le
déroulé normal.

## Ordre de travail suggéré

1. Capacitor autour du build existant, sans aucune API native — vérifier que
   l'app tourne dans les deux WebViews.
2. Piège 2 (branche `'native'` d'`InstallService`) et piège 4 (service worker),
   qui sont des régressions visibles dès cette étape.
3. `availableOn` sur `ProviderPlugin` et son filtrage.
4. Un seul plugin santé, complet, testé — Health Connect d'abord, la revue
   Google étant plus rapide qu'Apple.
5. Le second plugin.
6. Rouvrir la carte « app mobile » du tunnel d'installation, une fois qu'il y a
   vraiment quelque chose sur un store.
