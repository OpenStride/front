# Templating par sport — proposition d'architecture

> Document de conception. Rien n'est implémenté. À valider avant écriture de code.

## 1. Le problème

Une nage en bassin et une sortie course s'affichent aujourd'hui de façon identique :
trois métriques figées dans la card, tous les widgets dans le détail. Concrètement,
un 1500 m en piscine s'affiche « 1.50 km » avec une allure en min/km, et la page de
détail lui propose un profil d'altitude.

### État des lieux

| Couche      | Fichier                                      | Constat                                                                 |
| ----------- | -------------------------------------------- | ----------------------------------------------------------------------- |
| Vocabulaire | `src/types/sport.ts`                         | ~90 slugs canoniques, i18n + icônes, testés. Base saine mais **plate**. |
| Card        | `src/components/ActivityCard.vue:104-127`    | 3 métriques en dur ; branche sport via regex sur la chaîne brute.       |
| Détail      | `src/views/ActivityDetails.vue:22-31`        | Rend **tous** les widgets du slot, sans condition.                      |
| Widgets     | `src/types/extension.ts:13-15`               | Loaders anonymes : ni id, ni applicabilité.                             |
| Stockage    | `src/types/activity.ts:46-54`                | `stats` = struct figée de 7 champs génériques.                          |
| Ingestion   | `.../GarminProvider/client/adapter.ts:71-82` | **Écrase** les données spécifiques au sport.                            |

### La cause racine est à l'ingestion

`adapter.ts:77-79` fusionne trois cadences physiquement différentes :

```ts
averageCadence: averageRunCadenceInStepsPerMinute ??
  averageBikingCadenceInRevPerMinute ??
  averageSwimCadenceInStrokesPerMinute
```

En aval, plus rien ne permet de savoir si `62` est des pas/min, des tours/min ou des
coups/min. Et tout ce qui est propre à la natation — longueur de bassin, SWOLF, type
de nage, nombre de longueurs — n'est jamais lu.

**Aucun système de templating ne récupère une donnée jetée à l'ingestion.** La couche
présentation ne peut pas être la première brique.

### Contrainte actée

Aucun payload brut n'est conservé (`GarminProvider/client/storage.ts` ne stocke que la
configuration du plugin). L'historique déjà importé restera donc appauvri : **décision
prise de ne pas prévoir de rattrapage**. Seules les activités importées après la mise
en place bénéficieront des données riches.

## 2. L'observation qui réduit le périmètre

Le réflexe naturel est d'écrire « un template par sport listant ses widgets ». C'est
plus lourd que nécessaire.

Le profil d'altitude est absurde sur une nage en bassin **parce qu'il n'y a pas de
données d'altitude**, pas parce que c'est de la natation. Un garde générique de
disponibilité — « ce widget a-t-il ses données ? » — élimine l'essentiel du bruit,
sans table à maintenir et sans que le core ait à connaître chaque sport.

Le templating par sport n'est réellement nécessaire que dans deux cas :

1. **La même donnée change de sens** : allure min/km (course) vs vitesse km/h (vélo)
   vs allure min/100 m (natation) ; pas/min vs tours/min vs coups/min.
2. **La donnée n'existe que pour un sport** : SWOLF, longueurs, longueur de bassin.

Tout le reste se règle par disponibilité. Cela rend le système beaucoup plus petit
et évite une table de configuration qui dériverait à chaque nouveau sport.

## 3. Architecture proposée

### Couche 1 — Contrat de données : sac de mesures porteur d'unité

Élargir `stats` avec `poolLength?`, `swolf?`, `strokeType?`… obligerait chaque provider
à connaître les besoins de tous les sports, et le type grossirait indéfiniment.
À la place, une map namespacée :

```ts
// src/types/activity.ts
export interface Measurement {
  value: number
  unit: string // unité canonique : 'm' | 's' | 'm/s' | 'bpm' | 'spm' | 'rpm' | 'W' | 'count'
}

export interface ActivityDetails extends Timestamped {
  samples?: Sample[]
  laps?: {...}[]
  stats?: {...}                              // inchangé
  measurements?: Record<string, Measurement> // nouveau, additif
  notes?: string
}
```

Exemples de clés : `swim.swolf`, `swim.poolLength`, `swim.strokeCount`,
`run.cadence`, `bike.cadence`, `bike.normalizedPower`.

Propriétés recherchées :

- **Additif** : `stats` intact, donc aucune migration en lecture ; les plugins qui ne
  produisent pas de mesures continuent de fonctionner tels quels.
- **Unité explicite** : règle définitivement le problème de la cadence fusionnée.
- **Ouvert** : un nouveau provider ou un nouveau sport ajoute des clés sans toucher au core.

> **Nom** : `measurements`, pas `metrics` — `activity_metrics` est déjà pris
> (`IndexedDBService.ts:132`, cache local des meilleurs temps, listé dans
> `LOCAL_ONLY_STORES`). Réutiliser le mot créerait une ambiguïté durable.

**Risque** : une map ouverte se fragmente (`swim.swolf` vs `swimming.swolf`). À cadrer
par un registre de clés connues en core, sur le modèle déjà en place pour `SPORT_TYPES` :
un tableau `const`, un type dérivé, et un test qui vérifie que chaque clé a son libellé
i18n. Les clés inconnues sont tolérées en stockage mais non rendues par défaut.

**Où stocker ?** Dans `activity_details`, pas dans `activities`. Ce sont des données de
détail, elles suivent le cycle de vie des samples et n'ont pas à peser sur la liste.

### Couche 2 — Familles de sports et profil de présentation

~90 slugs se ramènent à ~10 familles :

```ts
// src/types/sport.ts
export const SPORT_FAMILIES = [
  'running', 'cycling', 'swimming', 'walking', 'winter',
  'water', 'indoor', 'team', 'racket', 'other'
] as const
export type SportFamily = (typeof SPORT_FAMILIES)[number]

export const SPORT_FAMILY: Record<SportType, SportFamily> = { ... }
```

Puis un profil de présentation, **par famille, avec surcharge par slug** :

```ts
export interface SportProfile {
  /** 3e métrique (accent) de la card. */
  primaryMetric: 'pace' | 'pace100m' | 'speed' | 'none'
  /** Une nage se lit en mètres, une sortie vélo en kilomètres. */
  distanceUnit: 'km' | 'm'
  /** Unité de cadence à afficher, si l'activité en porte une. */
  cadenceUnit?: 'spm' | 'rpm' | 'strokes'
}
```

La surcharge par slug est nécessaire : `pool_swimming` et `open_water_swimming`
partagent la famille mais pas la présentation (bassin vs GPS).

Ce profil remplace la regex de `ActivityCard.vue:106` :

```ts
const isCycling = computed(() =>
  /cycl|bike|bik|velo|vélo|vtt|ride/i.test(props.activity.type || '')
)
```

qui contourne le vocabulaire canonique déjà en place et classe tout le reste — natation
comprise — en « allure min/km ».

**Ce qui ne nécessite pas de configuration** : la carte. Une nage en bassin n'a pas de
`mapPolyline`, donc `hasMap` (`ActivityCard.vue:132`) est déjà faux. Pas de champ
`showMap` dans le profil : ce serait dupliquer en configuration ce que la donnée dit déjà.

### Couche 3 — Widgets adressables et filtrables

Aujourd'hui (`extension.ts:13-15`) :

```ts
slots?: { [slotName: string]: Array<() => Promise<Component>> }
```

Proposé — forme enrichie, l'ancienne restant acceptée :

```ts
export interface SlotEntry {
  id: string
  component: () => Promise<Component>
  /** Le widget décide lui-même s'il a de quoi s'afficher. */
  appliesTo?: (ctx: { activity: Activity; details?: ActivityDetails }) => boolean
}

slots?: {
  [slotName: string]: Array<SlotEntry | (() => Promise<Component>)>
}
```

Un loader nu vaut « s'applique toujours » : les plugins existants ne bougent pas.

**Deux mécanismes possibles pour la sélection**, et c'est le vrai arbitrage :

| Option                                                         | Avantage                           | Coût                                                   |
| -------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------ |
| (a) Le profil de sport liste les widgets (`detailWidgets: []`) | Mise en page maîtrisée par le core | Le core doit connaître les ids des widgets des plugins |
| (b) Chaque widget déclare son applicabilité                    | Plugins autonomes, core ignorant   | Ordre d'affichage subi                                 |

**Recommandation : (b)**, complétée par un ordre indicatif dans le profil pour les ids
connus, les inconnus s'ajoutant à la suite. C'est le seul choix cohérent avec la règle
du projet — « un plugin n'importe jamais le core » (`PLUGIN_GUIDELINES.md`) : avec (a),
le core devrait embarquer une liste d'ids appartenant aux plugins, ce qui inverse la
dépendance et casse à chaque plugin ajouté ou désactivé.

Point d'implantation : `getPluginViewsForSlot()`
(`ExtensionPluginRegistry.ts:19-35`) retourne aujourd'hui des composants nus. Il devra
retourner `{ id, component }` et appliquer `appliesTo`. Le filtrage doit s'y faire, pas
dans `ActivityDetails.vue`, sinon chaque consommateur de slot devra le refaire.

**Attention** : `getPluginViewsForSlot` charge chaque composant avec `await load()`
_avant_ tout filtrage. Évaluer `appliesTo` **avant** le chargement, sinon on télécharge
les chunks de widgets qu'on ne rendra pas — la page de détail d'une nage paierait le
coût des graphes vélo.

## 4. Points de bascule

Récapitulatif des fichiers à toucher, dans l'ordre de dépendance :

1. `src/types/activity.ts` — `Measurement`, `ActivityDetails.measurements`
2. `src/types/measurements.ts` _(nouveau)_ — registre des clés connues + unités
3. `src/types/sport.ts` — `SPORT_FAMILIES`, `SPORT_FAMILY`, `SportProfile`, table des profils
4. `plugins/data-providers/GarminProvider/client/adapter.ts:71-82` — cesser d'écraser les
   cadences, alimenter `measurements`, lire les champs natation
5. `src/composables/useUnits.ts` _(nouveau)_ — source réactive + `format()`
6. `src/types/plugin-context.ts` — exposer `ctx.units`
7. `src/components/ActivityCard.vue:104-127` — `distanceValue` et `primaryMetric` pilotés
   par le profil, formatés par `useUnits`
8. `src/types/extension.ts` — `SlotEntry`
9. `src/services/ExtensionPluginRegistry.ts:19-35` — filtrage avant chargement
10. `plugins/app-extensions/StandardDetails/index.ts` — déclarer ids et `appliesTo`
11. Reprise des ~14 conversions ad hoc (`/1000`, calculs d'allure) vers `format()` :
    `ActivityFilters.vue`, `Statistics/*`, `MetricTracker/metrics.ts`, `MCP/ProfileMCP.vue`,
    `StandardDetails/{SpeedSampled,CadenceGraph,SpeedPerKm}.vue`
12. Widgets natation _(nouveaux)_ — longueurs, SWOLF

Trois chantiers indépendants, parallélisables :

- **Unités** (5-6, puis 11) — se suffit à lui-même, agit sur les données existantes,
  et referme le réglage mort de `ProfilePreferences`.
- **Présentation par sport** (3, 7) — gain visible immédiat, données existantes.
- **Données riches** (1-2, 4, 12) — ne produit d'effet que sur les nouveaux imports.

L'étape 7 dépend des deux premiers chantiers ; c'est le seul point de rendez-vous.

## 5. Migration

Aucune migration de schéma IndexedDB n'est requise : `measurements` est un champ
optionnel d'un objet déjà stocké, pas un nouveau store.

- **Lecture** : les `ActivityDetails` sans `measurements` restent valides ; le champ est
  simplement absent et les widgets qui en dépendent ne s'affichent pas.
- **Écriture** : les nouvelles activités le portent.
- **Historique** : appauvri, sans rattrapage — décision actée (§1).
- **Sync** : `activity_details` est déjà répliqué ; un champ supplémentaire circule sans
  changement. À vérifier tout de même côté fusion (`StorageService.merge`) qu'un objet
  distant sans `measurements` n'écrase pas un local qui en a.

## 6. Risques

| Risque                                                  | Gravité    | Traitement                                                         |
| ------------------------------------------------------- | ---------- | ------------------------------------------------------------------ |
| Fragmentation des clés de mesures                       | Moyen      | Registre en core + test i18n, comme `SPORT_TYPES`                  |
| Le core apprend les ids des plugins (si option (a))     | Élevé      | Retenir l'option (b)                                               |
| Chargement de chunks inutiles                           | Moyen      | Filtrer avant `await load()`                                       |
| Collision de nom avec `activity_metrics`                | Moyen      | Nommer `measurements`                                              |
| Table de profils qui dérive à chaque sport ajouté       | Moyen      | Profil par **famille**, surcharge par slug uniquement si justifiée |
| Fusion sync effaçant `measurements`                     | À vérifier | Test dédié dans `StorageService.merge.spec.ts`                     |
| Préférence d'unité non réactive (écrans non rafraîchis) | Élevé      | Singleton réactif, pas de relecture par `onMounted`                |
| Plugins bloqués en métrique en dur                      | Élevé      | Exposer le formateur sur `PluginContext`                           |
| Valeur convertie stockée ou mise en cache               | Élevé      | Invariant §7 + test sur `activity_metrics` et l'agrégation         |
| Graphes `<canvas>` restant en métrique                  | Moyen      | Redessin explicite au changement de préférence                     |

## 7. Unités et préférences utilisateur

**Décision : stocker en SI, convertir au rendu.**

### Le réglage existe déjà — et il ne fait rien

`src/components/profile/ProfilePreferences.vue:93` déclare
`units: 'metric' | 'imperial'` et le persiste sous la clé `app_preferences` —
mais le groupe de boutons radio est **commenté** dans le template, et **aucun code
ne lit la valeur**. Un utilisateur peut choisir « imperial »,
le réglage est sauvegardé, et rien ne change à l'écran. Il ne s'agit donc pas
d'ajouter une fonctionnalité mais de terminer celle qui est à moitié posée.

### Le stockage est déjà en SI

Vérifié sur l'ensemble du modèle : distances en mètres, durées en secondes, vitesses
en m/s (`averageSpeedInMetersPerSecond` côté Garmin), altitudes en mètres,
températures en °C, puissance en watts. **Aucune migration de données n'est requise** —
la règle est déjà respectée de fait, il s'agit de l'énoncer et de la tenir.

Cela vaut aussi pour `measurements` (couche 1) : `Measurement.unit` porte l'unité
_canonique SI_, jamais l'unité d'affichage.

### Deux axes orthogonaux à ne pas confondre

C'est le point de conception central :

| Axe                                           | Décidé par             | Exemple                         |
| --------------------------------------------- | ---------------------- | ------------------------------- |
| **Nature de la grandeur** (allure vs vitesse) | Profil de sport (§3.2) | course → allure, vélo → vitesse |
| **Système d'unités** (métrique vs impérial)   | Préférence utilisateur | km vs miles                     |

Les deux se composent : le profil dit « allure », la préférence dit « impérial »,
le résultat est min/mi. Les fondre en un seul réglage — l'erreur classique — rendrait
impossible « je cours en min/km mais je roule en mph », et surtout ferait dépendre la
présentation du sport d'un choix utilisateur qui n'a rien à voir.

### Ce qui se convertit, et ce qui ne se convertit pas

Seules quelques dimensions dépendent du système d'unités :

| Dimension     | Stockage (SI) | Métrique  | Impérial   |
| ------------- | ------------- | --------- | ---------- |
| `distance`    | m             | km / m    | mi / ft    |
| `elevation`   | m             | m         | ft         |
| `speed`       | m/s           | km/h      | mph        |
| `pace`        | s/m           | min/km    | min/mi     |
| `pace100`     | s/m           | min/100 m | min/100 yd |
| `temperature` | °C            | °C        | °F         |

Cadence (spm/rpm), fréquence cardiaque (bpm), puissance (W) et calories sont
invariantes : aucune conversion. Cela limite fortement le périmètre — six dimensions,
pas « toutes les valeurs de l'app ».

`pace100` est le point où les deux axes se croisent réellement : les bassins impériaux
se comptent en yards, donc le profil `pool_swimming` combiné à la préférence impériale
donne min/100 yd, et la longueur de bassin s'affiche en yards.

### Forme proposée

Une seule fonction de formatage, alimentée par une source réactive :

```ts
// src/composables/useUnits.ts
type Dimension = 'distance' | 'elevation' | 'speed' | 'pace' | 'pace100' | 'temperature'

interface Formatted {
  value: string // déjà arrondi selon la dimension
  unit: string // libellé i18n : 'km', 'mi', '/km'…
  text: string // value + unit, prêt à afficher
}

function useUnits(): {
  system: Readonly<Ref<'metric' | 'imperial'>>
  format: (dimension: Dimension, si: number) => Formatted
}
```

Point d'attention : la préférence est aujourd'hui relue par `onMounted` dans chaque
composant qui en a besoin (`ProfilePreferences.vue:107`). Ce motif ne propage rien —
changer le réglage ne rafraîchirait pas les écrans déjà montés. Il faut une source
réactive partagée, singleton de module, sur le modèle de `useAppRefresh`.

### Les plugins doivent y accéder

Sur les ~14 conversions ad hoc recensées, **la majorité est dans les plugins** :
`Statistics` (`DistributionSection`, `TrendsSection`, `CalendarHeatmap`,
`usePersonalRecords`), `MetricTracker` (`metrics.ts:65`), `MCP`, `StandardDetails`
(`SpeedSampled`, `CadenceGraph`, `SpeedPerKm`).

Or la règle du projet interdit à un plugin d'importer un service du core. Le formateur
doit donc être exposé sur `PluginContext` :

```ts
ctx.units.format(dimension, siValue)
```

Ce n'est pas optionnel : sans cela, la moitié de l'app resterait en dur en métrique.

### L'invariant à tenir

> Les valeurs converties ne sont **jamais** stockées, ni mises en cache, ni agrégées.
> La conversion a lieu au dernier moment, à la frontière du rendu.

Ce n'est pas de la cosmétique : `activity_metrics` est un cache dérivé (local-only,
cf. `LOCAL_ONLY_STORES`). Si une valeur convertie y entrait, le cache dépendrait d'une
préférence et devrait être invalidé à chaque changement de réglage. Idem pour
l'agrégation et les objectifs. À couvrir par un test.

### Cas particulier des graphes

Les widgets de `StandardDetails` dessinent leurs axes sur `<canvas>`. Ils ne
bénéficient pas de la réactivité de Vue sur le contenu dessiné : il leur faudra
redessiner explicitement au changement de préférence. À prévoir dans le périmètre,
sinon les graphes resteront en métrique alors que le reste aura basculé.

## 8. Tests

Le projet a déjà le bon motif dans `tests/unit/sportTypes.spec.ts` (chaque slug a son
libellé et son icône, les manques sont des choix explicites). À reproduire :

- Chaque `SportType` a une famille ; chaque famille a un profil.
- Chaque clé de mesure connue a une unité et un libellé i18n dans **toutes** les locales.
- `ActivityCard` : une nage affiche des mètres et une allure /100 m ; une sortie vélo
  affiche des km/h ; une course des min/km.
- `getPluginViewsForSlot` : un widget dont `appliesTo` est faux n'est **pas chargé**
  (assertion sur le loader, pas seulement sur le rendu).
- Adaptateur Garmin : une charge utile natation produit les bonnes clés avec les bonnes
  unités, et les trois cadences ne se recouvrent plus.
- `format()` : aller-retour SI → impérial → SI sans dérive au-delà de l'arrondi affiché ;
  `pace100` en impérial donne bien min/100 yd.
- Changement de préférence : un composant déjà monté se met à jour sans remontage
  (c'est le piège de réactivité du §7).
- Invariant SI : `activity_metrics` et les valeurs agrégées sont identiques quelle que
  soit la préférence — le test échoue si une conversion fuit vers le stockage.

## 9. Questions ouvertes

1. **Granularité de la préférence** : un unique préréglage `metric | imperial` — ce que
   l'UI propose déjà — ou des surcharges par dimension (distance en km mais altitude en
   pieds) ? Recommandation : garder le préréglage unique. La demande réelle derrière
   « je veux des km/h ici et des min/km là » est couverte par le profil de sport, pas
   par une surcharge d'unités. Ajouter les surcharges plus tard reste possible sans
   changer la signature de `format()`.
2. **Multisport / triathlon** : le slug `transition` existe déjà. Une activité
   multisport a-t-elle vocation à porter plusieurs profils ? Hors périmètre proposé,
   mais le contrat de données ne doit pas l'interdire.
3. **Autres providers** : seul Garmin est traité ici. Strava expose un jeu de champs
   différent ; le registre de clés doit être défini en pensant aux deux, sinon le
   second provider le fera diverger.
