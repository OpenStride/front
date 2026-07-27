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
5. `src/components/ActivityCard.vue:104-127` — `distanceValue` et `primaryMetric` pilotés par le profil
6. `src/types/extension.ts` — `SlotEntry`
7. `src/services/ExtensionPluginRegistry.ts:19-35` — filtrage avant chargement
8. `plugins/app-extensions/StandardDetails/index.ts` — déclarer ids et `appliesTo`
9. Widgets natation _(nouveaux)_ — longueurs, SWOLF

Les étapes 5 et 6-8 sont indépendantes l'une de l'autre et peuvent avancer en parallèle.
L'étape 5 seule apporte déjà un gain visible sur les données existantes.

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

| Risque                                              | Gravité    | Traitement                                                         |
| --------------------------------------------------- | ---------- | ------------------------------------------------------------------ |
| Fragmentation des clés de mesures                   | Moyen      | Registre en core + test i18n, comme `SPORT_TYPES`                  |
| Le core apprend les ids des plugins (si option (a)) | Élevé      | Retenir l'option (b)                                               |
| Chargement de chunks inutiles                       | Moyen      | Filtrer avant `await load()`                                       |
| Collision de nom avec `activity_metrics`            | Moyen      | Nommer `measurements`                                              |
| Table de profils qui dérive à chaque sport ajouté   | Moyen      | Profil par **famille**, surcharge par slug uniquement si justifiée |
| Fusion sync effaçant `measurements`                 | À vérifier | Test dédié dans `StorageService.merge.spec.ts`                     |

## 7. Tests

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

## 8. Questions ouvertes

1. **Unités affichées** : le profil fixe l'unité par sport. Faut-il prévoir une
   préférence utilisateur (miles, yards en bassin) ? Cela changerait la signature —
   le profil donnerait une unité _canonique_, et une couche de formatage traduirait.
   Plus simple à prévoir maintenant qu'à rétro-ajouter.
2. **Multisport / triathlon** : le slug `transition` existe déjà. Une activité
   multisport a-t-elle vocation à porter plusieurs profils ? Hors périmètre proposé,
   mais le contrat de données ne doit pas l'interdire.
3. **Autres providers** : seul Garmin est traité ici. Strava expose un jeu de champs
   différent ; le registre de clés doit être défini en pensant aux deux, sinon le
   second provider le fera diverger.
