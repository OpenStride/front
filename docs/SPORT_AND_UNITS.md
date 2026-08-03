# Sports et unités — quel cas, quelle façon de faire

Guide pratique. Chaque règle vient d'un bug réellement rencontré : la raison est
donnée, parce qu'une règle dont on a oublié le motif finit par être contournée.

> Conception et arbitrages : `docs/SPORT_TEMPLATES.md`.
> Ce document-ci est la référence pour **faire**, l'autre pour **comprendre pourquoi**.

## En un coup d'œil

| J'ai besoin de…                                   | J'utilise                                |
| ------------------------------------------------- | ---------------------------------------- |
| Afficher une valeur chiffrée                      | `format(dimension, si)`                  |
| Alimenter un axe ou une série de graphe           | `convert(dimension, si).value`           |
| Savoir quelle métrique mettre en avant            | `primaryMetricSpec(sport, …)`            |
| Afficher une distance totale                      | `distanceDimension(sport)` puis `format` |
| Ajouter un sport                                  | `SPORT_TYPES` + `SPORT_FAMILY`           |
| Ajouter une donnée propre à un sport              | `MEASUREMENT_KEYS` + `MEASUREMENTS`      |
| Ajouter un widget de détail                       | un `SlotEntry` avec `appliesTo`          |
| Accéder à un service core depuis un plugin        | `PluginContext`                          |
| Afficher sur une card une valeur des détails      | `computeValues()` + `DERIVED`            |
| Lire une valeur chiffrée saisie par l'utilisateur | `toSI(dimension, valeur)`                |
| Nommer un champ agrégeable                        | `ACTIVITY_SOURCES`                       |
| Afficher une durée                                | `formatClock` / `formatCompactDuration`  |
| Afficher une date ou un « il y a X »              | `@/utils/dateFormat`                     |

---

## 1. Afficher une valeur chiffrée

**Jamais** `/ 1000`, `* 3.6`, `* 0.9144`, ni `'km'` en dur.

```ts
// Core (composant Vue)
const { format } = useUnits()
format('distance', activity.distance) // → { value: '10.00', unit: 'km', text: '10.00 km' }

// Plugin — un plugin n'importe jamais un service du core
const { units } = usePluginContext()
units.format('elevation', stats.totalAscent)
```

Les dimensions disponibles sont dans `src/types/units.ts`. Les paces prennent des
**secondes par mètre** (`duration / distance`), pas des m/s.

> **Pourquoi.** Un utilisateur en impérial lisait encore des kilomètres dans ses
> statistiques, ses filtres, ses records et tous ses axes de graphe. Chaque
> conversion écrite à la main est un endroit qui ignore sa préférence.

> **Piège vécu.** Un inventaire fait en cherchant `/ 1000` a manqué
> `ActivityBests`, qui convertissait avec `* 3.6`. Chercher **le facteur**, pas
> une de ses écritures — ou mieux, ne jamais en écrire.

Cadence, fréquence cardiaque, puissance et calories sont identiques dans les deux
systèmes : elles n'ont pas de dimension et s'affichent telles quelles.

## 2. Alimenter un graphe

Un axe a besoin d'un **nombre**, pas d'une chaîne :

```ts
const { units } = usePluginContext()
const y = units.convert('distance', meters).value
const axisLabel = `${t('…')} (${units.convert('distance', 0).unit})`
```

Un graphe `<canvas>` sort de la réactivité de Vue : il faut le redessiner.

```ts
watch(
  () => units.system,
  () => drawCanvas()
)
```

Pour un graphe Chart.js déjà reconstruit par un `watch`, ajouter
`() => units.system` aux sources suffit.

> **Pourquoi.** `convert()` et `format()` partagent la même table de facteurs. Un
> axe qui recalcule ses km lui-même redevient une deuxième vérité.

**Paliers de granularité** : proposer des valeurs rondes dans l'unité lue
(`¼ mi`, `½ mi`, `1 mi`) et garder les valeurs en mètres. `0.62 mi` n'est pas un
palier qu'on choisit. Une valeur enregistrée depuis l'autre échelle doit se
rabattre sur le palier le plus proche, sinon le `<select>` reste vide.

## 3. Choisir la métrique mise en avant

```ts
const spec = primaryMetricSpec(activity.type, {
  distance: activity.distance,
  duration: activity.duration,
  speed: stats?.averageSpeed // optionnel, prioritaire s'il existe
})
if (spec) format(spec.dimension, spec.si)
```

`null` signifie que le sport n'a pas de métrique de vitesse pertinente (salle,
yoga) : **supprimer le bloc**, ne pas afficher un tiret.

> **Pourquoi.** Ce choix a existé en double dans `ActivityCard` et
> `ActivityTopBlock`, avec des conventions d'entrée différentes (m/s d'un côté,
> s/m de l'autre). Deux implémentations d'une même règle divergent toujours.

## 4. Afficher une distance totale

```ts
format(distanceDimension(activity.type), activity.distance)
```

Une nage en bassin se lit en mètres, une sortie vélo en kilomètres.
Ne jamais coder `'km'` : c'est le profil du sport qui décide de l'échelle, et la
préférence utilisateur qui décide de l'unité — deux axes indépendants.

## 5. Ajouter un sport

1. Le slug dans `SPORT_TYPES` (`src/types/sport.ts`)
2. Sa famille dans `SPORT_FAMILY` — **le compilateur refuse l'oubli**
   (`Record<SportType, SportFamily>`)
3. Son libellé dans `sports.<slug>` des deux locales
4. Son icône dans `SPORT_ICONS`, ou l'assumer dans le test des icônes manquantes

Rien d'autre : la card, la page de détail et les unités suivent automatiquement.

**Le sport ne rentre pas dans sa famille ?** `SPORT_OVERRIDES`, et seulement
alors. Chaque entrée est une règle que quelqu'un devra maintenir — il n'y en a
que trois aujourd'hui, et chacune a une raison écrite.

## 6. Chercher un profil, un libellé ou une icône par type

**Toujours normaliser la casse.** Les activités antérieures au vocabulaire
canonique portent la chaîne brute du provider (`"RUNNING"`, `"Ride"`).

```ts
const slug = (sport ?? '').trim().toLowerCase()
```

> **Pourquoi.** `getSportProfile` faisait une correspondance exacte alors que les
> libellés, les icônes et les statistiques normalisaient déjà. Résultat : une
> activité `"RUNNING"` retombait sur `other` et **perdait son allure**. Le code
> remplacé, lui, était insensible à la casse — c'était donc une régression sur
> des données déjà présentes chez les utilisateurs.

## 7. Ajouter une donnée propre à un sport

Ne **pas** élargir `ActivityDetails.stats` : chaque provider devrait alors
connaître les besoins de tous les sports.

1. La clé namespacée dans `MEASUREMENT_KEYS` (`src/types/measurements.ts`)
2. Sa définition dans `MEASUREMENTS` : `unit` canonique SI, `labelKey`, et
   `dimension` **uniquement si la valeur se convertit**
3. Le libellé dans les deux locales — un test le vérifie

L'adaptateur du provider la remplit :

```ts
measurements['swim.swolf'] = { value: 38, unit: 'swolf' }
```

Le widget concerné l'affiche **sans être modifié** : il itère sur les clés du
registre pour son namespace.

> **Pourquoi.** Le registre a d'abord existé sans être lu par personne :
> `MEASUREMENTS[key].dimension` était mort, et `SwimSummary` ré-encodait de son
> côté « poolLength est une distance, SWOLF non ». La même vérité à deux endroits.

**Unité obligatoire.** `stats.averageCadence` fusionnait pas/min, tours/min et
coups/min en un seul nombre sans unité : plus personne en aval ne pouvait savoir
ce qu'était `62`. Une mesure porte toujours son unité.

## 8. Ajouter un widget de page de détail

```ts
'activity.widgets': [
  {
    id: 'heart-rate',
    component: async () => (await import('./HeartRateGraph.vue')).default,
    appliesTo: ctx => hasSampleData(ctx, 'heartRate')
  }
]
```

`appliesTo` teste **la donnée**, pas le sport. Un profil d'altitude est absurde
sur une nage en bassin parce qu'il n'y a pas d'altitude — pas parce que c'est de
la natation. Le sport n'intervient que quand la même donnée change de sens.

La sélection renvoie des _loaders_ et filtre **avant** l'import : un widget écarté
ne coûte pas son chunk. Ne jamais filtrer après chargement.

Un loader nu (sans `id`) reste accepté et signifie « s'applique toujours ».

> **Pourquoi (b) plutôt qu'une table par sport.** Si le core listait les widgets
> de chaque sport, il embarquerait les ids appartenant aux plugins : dépendance
> inversée, cassée à chaque plugin ajouté ou désactivé.

## 9. Un bloc n'a pas de données à montrer

Ne pas le rendre. Ne pas rendre un substitut qui annonce l'absence.

La card réservait 186 px de gris pour dire qu'il n'y avait pas de trace GPS, et
la page de détail affichait « No GPS route ». Une nage en bassin n'a pas de GPS :
signaler ce manque, c'est du bruit. Une card de nage est passée de 330 à 144 px.

Même chose pour une valeur nulle : une séance de yoga n'affiche pas
« 0.00 km ». Mais un rameur d'intérieur garde sa distance — **le test porte sur
la donnée, pas sur le sport**.

Quand un élément disparaît, penser à ce qu'il portait : la date et le badge ami
vivaient dans le bloc carte et ont dû être relogés.

## 10. Stocker une valeur dérivée

**En SI, jamais en unité d'affichage.** Mètres, secondes, m/s, s/m, °C.

> **Pourquoi.** `usePersonalRecords` stockait l'allure en min/km et la vitesse en
> km/h : un record dépendait alors de la préférence de lecture. `activity_metrics`
> est un cache dérivé (`LOCAL_ONLY_STORES`) — une conversion qui y fuit oblige à
> l'invalider à chaque changement de réglage.

La conversion a lieu **au dernier moment, à la frontière du rendu**.

## 10 bis. Afficher sur une card une valeur qui vit dans les détails

**Ajouter la valeur à `computeValues()` dans `useActivityMetricsIndex`, bumper
`INDEX_VERSION`, lire `derived.value.get(id)` côté composant.**

Une card de feed ne reçoit qu'un `Activity` : ni `stats`, ni `samples`, ni
`measurements`. Charger les détails par card est exclu — ce sont les samples, la
partie lourde du stockage, pour afficher un nombre.

Le store `activity_metrics` existe pour ça. Il tient une ligne par activité :

```ts
{ id, startTime, sport, indexVersion, values: Record<string, number> }
```

`values` est volontairement ouvert. `DERIVED` en nomme les clés connues
(`calories`, `ascent`, `descent`, `maxSpeed`, `avgHeartRate`, `maxHeartRate`),
`timeMetricId(m)` celles des meilleurs temps.

Le scan est **incrémental et paresseux** : `useFeedMetricsIndex(activities)` dans
une vue de feed n'indexe que la page affichée, et une ligne déjà à jour n'est
jamais recalculée. Une card sans ligne n'affiche simplement rien — elle ne
patiente pas, elle se remplit quand la valeur arrive.

Trois contraintes, chacune payée une fois :

- **SI uniquement** (§10) — c'est un cache, une conversion qui y fuit le lie à
  une préférence d'affichage.
- **Bumper `INDEX_VERSION`** dès qu'on ajoute une valeur ou change un calcul,
  sinon les lignes existantes restent muettes pour la nouvelle clé.
- **Rien de sensible** : le store est dans `LOCAL_ONLY_STORES`, il ne quitte
  jamais l'appareil. Le perdre coûte un recalcul, jamais une donnée.

> **Zéro calculé ≠ zéro déclaré.** Un `totalDescent` à 0 renvoyé par le provider
> dit « c'était plat ». Un dénivelé recalculé à 0 dit seulement « la trace n'a
> jamais dépassé le seuil de bruit » : on ne le stocke pas, sinon la card
> afficherait « 0 m » là où il n'y a rien à dire (§9).

## 10 ter. Faire _saisir_ une valeur chiffrée

**`toSI(dimension, valeur)` avant de stocker.** Jamais la valeur brute du champ.

```ts
const { units } = usePluginContext()
// L'utilisateur tape 50 ; en impérial cela veut dire 50 miles.
targetValue = units.toSI('distance', 50) // → 80 467 m
```

Et le champ annonce l'unité qu'il attend, au lieu de l'écrire en dur :

```ts
const unitLabel = computed(() => units.convert('distance', 0).unit) // 'km' | 'mi'
```

`toSI` est l'inverse exact de `convert` et sort de la même table — offset compris,
donc 212 °F redonne bien 100 °C.

> **Pourquoi.** Les objectifs stockaient `targetValue` en km et en heures, dans
> `goals_config` — donc dans `settings`, qui **est répliqué**. Un lecteur impérial
> visant « 50 » obtenait 50 km, et ce nombre faux voyageait ensuite vers tous ses
> appareils. §10 interdit la valeur convertie dans un cache local ; c'est encore
> plus vrai d'un réglage synchronisé.

**Unité ≠ langue.** `t('goals.units.km')` traduisait l'unité sans jamais la
convertir : l'i18n employée comme couche d'unités. Un kilomètre n'est pas une
langue. Ne passer par `t()` que pour ce qui se lit pareil dans les deux systèmes
— un nombre d'activités, des heures.

## 10 quater. Rendre un champ agrégeable

**Une entrée dans `ACTIVITY_SOURCES` (`src/types/activitySources.ts`), pas un
chemin en chaîne.**

```ts
export const ACTIVITY_SOURCES = {
  distance: a => a.distance,
  'stats.totalAscent': (_, d) => d?.stats?.totalAscent
} satisfies Record<string, SourceAccessor>
```

Le nom est **persisté** (config d'agrégation, définition de métrique) donc il doit
survivre à un refactor. Écrit en accesseur, le compilateur tient le lien :
renommer `totalAscent` casse ce fichier, qui casse les définitions qui le citent.

> **Pourquoi.** C'était `sourceRef: string`, résolu au runtime par un
> `getValueByPath` générique. Renommer un champ laissait chaque agrégation lire
> `undefined` — rien ne plantait, la courbe devenait plate et personne ne le
> voyait.

Un nom absent du registre est **ignoré**, jamais agrégé en `NaN` : une config
écrite par une version antérieure peut nommer un champ disparu.

## 11. Longueur de bassin

Dimension `poolLength`, jamais `distanceShort`.

Un bassin est un objet construit à une longueur normalisée, pas une mesure. Les
providers renvoient des mètres quelle que soit la montre : un bassin américain de
25 yd arrive à 22,86 m. Convertir donnait « 27 yd » pour un 25 m — faux de 2 m par
longueur, assez pour raisonner de travers sur une allure au 100.

`poolLength` restitue le bassin réel dans le système où il a été construit.

## 12. Un plugin a besoin d'un service du core

`PluginContext`, jamais un import direct. Voir `docs/PLUGIN_GUIDELINES.md`.

Pour les unités : `ctx.units.format()` / `ctx.units.convert()` / `ctx.units.system`.

> **Pourquoi ce n'est pas optionnel.** La majorité des graphes et statistiques
> vivent dans des plugins. Sans accès au formateur, ils resteraient figés en
> métrique et la moitié de l'app ignorerait la préférence.

## 12 bis. Écrire un provider de données

Le contrat que le provider doit à core, vérifié à l'écriture par
`checkActivityContract` (`src/services/activityContract.ts`) :

| Champ                | Attendu                                                        |
| -------------------- | -------------------------------------------------------------- |
| `type`               | un slug canonique — mapper dans le `sportTypes.ts` du provider |
| `distance`           | mètres                                                         |
| `duration`           | secondes                                                       |
| `stats.averageSpeed` | m/s                                                            |
| `measurements`       | clés du registre, avec l'unité que le registre déclare         |

`saveActivityWithDetails()` appelle la vérification et **avertit en console en
développement** — sans jamais refuser l'écriture : une base réelle contient des
activités antérieures au vocabulaire, et les rejeter perdrait des données que
l'app affiche très bien par ailleurs.

> **Pourquoi à la frontière d'écriture.** Le contrat était tenu par convention :
> un test nommait les mappers un par un, donc il ne couvrait que les providers
> déjà corrects. ZipImport, lui, ne mappait rien — `"Trail Running"` devenait
> `"trail running"`, tombait sur le profil `other` et perdait sa métrique. Un
> contrôle à la porte que tout provider franchit n'a pas besoin qu'on pense à
> l'inscrire quelque part. Le test des mappers découvre désormais les providers
> par `import.meta.glob` pour la même raison.

## 12 ter. Afficher une durée, une date, un « il y a »

Une durée et une date ne passent **pas** par `format()` : elles ne dépendent pas
du système d'unités. Elles ont chacune leur module, et une seule implémentation.

**Durées — `@/utils/duration` :**

| Je veux                              | J'appelle                                  | Rendu        |
| ------------------------------------ | ------------------------------------------ | ------------ |
| Un chrono                            | `formatClock(sec)`                         | `38:52`      |
| Un chrono aligné en colonne          | `formatClock(sec, { padLeading: true })`   | `05:30`      |
| Un volume total                      | `formatCompactDuration(sec)`               | `3h05`       |
| Un temps de record                   | `formatRecordTime(sec)`                    | `5'30"`      |

**Dates — `@/utils/dateFormat` :** `formatDate`, `formatWeekday`, `monthShort`,
`formatRelativeTime`. Toutes lisent la langue choisie dans l'app.

> **Pourquoi.** Le chrono existait en six exemplaires — card, en-tête d'activité,
> metric tracker, meilleurs efforts, zones cardio, HUD de l'enregistreur —
> d'accord sur le rendu et en désaccord sur les bords : l'un rendait `-` là où
> les autres rendaient `—`, et celui bâti sur `new Date(sec * 1000)
> .toISOString()` repassait à zéro au-delà de 24 h, ce qu'un enregistrement GPS
> laissé tourner atteint. Côté dates, trois façons de perdre la préférence de
> langue cohabitaient : un `'fr-FR'` en dur qui datait en français les
> commentaires d'un lecteur anglophone, un `undefined` qui suit le **navigateur**
> et non la préférence, et une table de mois français écrite à la main dans le
> calendrier. Deux contrats dans `tests/unit/contracts.spec.ts` refusent
> désormais les deux familles de récidive.

## 13. Écrire un test qui touche aux sports ou aux unités

Partir de `tests/fixtures/activities.ts`, pas d'un objet écrit à la main :

```ts
import { createActivity, createSwimActivity, createSwimDetails } from '../fixtures/activities'
```

| Fixture                          | Ce qu'elle représente                                  |
| -------------------------------- | ------------------------------------------------------ |
| `createActivity()`               | Course avec tracé — allure /km, échelle longue         |
| `createRideActivity()`           | Vélo — vitesse                                         |
| `createSwimActivity()`           | Bassin — sans GPS, échelle courte, allure /100         |
| `createSwimDetails()`            | Les mesures natation telles qu'un provider les fournit |
| `createGymActivity()`            | Salle — sans distance ni allure                        |
| `createLegacyActivity()`         | Type brut `"RUNNING"`, antérieur au vocabulaire        |
| `createActivitiesAcrossSports()` | Une de chaque, pour balayer les formes                 |

Un test unitaire qui bascule les unités doit **remettre la préférence** à la fin
(`setUnitSystem('metric')`) : c'est un singleton de module.

> **Pourquoi.** Le fixture partagé portait `type: 'run'`, qui n'est pas un
> `SportType`. Il retombait donc sur le profil `other` : tout test rendant une
> card à partir de lui aurait constaté une absence d'allure sans que ce soit un
> bug du code. Un fixture qui ment fait mentir tout ce qui s'appuie dessus.
> `tests/unit/fixtures.spec.ts` vérifie désormais que chaque type est canonique
> et que chaque clé de mesure existe au registre avec la bonne unité.

---

## Avant de merger

- [ ] `grep -rn "/ 1000\|\* 3\.6\|'km'" src/ plugins/` ne remonte que des timestamps
- [ ] Aucune valeur convertie n'est écrite en base ni en cache
- [ ] Les nouveaux sports ont famille, libellé et icône
- [ ] Les nouvelles clés de mesure ont libellé dans **les deux** locales
- [ ] Les graphes canvas touchés redessinent au changement de préférence
- [ ] Testé en impérial **et** en métrique, pas seulement l'un des deux
- [ ] Les nouveaux tests partent de `tests/fixtures/activities.ts`
- [ ] Aucune durée ni date formatée à la main (§12 ter)

## Symptôme → cause → règle

| Symptôme                                         | Cause                                              | Règle      |
| ------------------------------------------------ | -------------------------------------------------- | ---------- |
| Des km apparaissent en mode impérial             | Conversion écrite à la main                        | §1         |
| Un graphe reste en métrique après changement     | Canvas non redessiné                               | §2         |
| Une allure disparaît sur d'anciennes activités   | Recherche sensible à la casse                      | §6         |
| `62` sans savoir si ce sont des pas ou des coups | Mesure stockée sans unité                          | §7         |
| Un widget vide sur un sport                      | `appliesTo` absent ou basé sur le sport            | §8         |
| Un grand bloc gris sans information              | Substitut affiché au lieu de rien                  | §9         |
| Un record change avec la préférence              | Valeur convertie stockée                           | §10        |
| Un bassin de « 27 yd »                           | `distanceShort` au lieu de `poolLength`            | §11        |
| Une valeur des détails absente de la card        | Pas remontée au scan, ou `INDEX_VERSION` non bumpé | §10 bis    |
| Un objectif saisi en miles enregistré en km      | Valeur du champ stockée sans `toSI`                | §10 ter    |
| Une agrégation devenue plate sans erreur         | Champ renommé, `sourceRef` en chaîne               | §10 quater |
| Une date en français pour un lecteur anglais     | Locale en dur, ou `undefined` (= navigateur)       | §12 ter    |
| Un chrono qui repasse à zéro après 24 h          | Formatage de durée réécrit sur place               | §12 ter    |
