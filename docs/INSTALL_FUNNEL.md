# Proposer l'installation — quel moment, quelle plateforme

Le tunnel d'installation est **asymétrique entre iOS et Android**, et ce n'est pas
un caprice : les deux plateformes ne stockent pas les données au même endroit.

## La contrainte qui commande tout

**Sur iOS, une app ajoutée à l'écran d'accueil a son propre conteneur de
stockage.** Rien n'est copié depuis Safari. Un athlète qui connecte Garmin dans
le navigateur, importe 400 activités, puis installe la PWA **ouvre une app
vide**.

Sur Android, l'app installée partage le stockage du navigateur. Le problème
n'existe pas.

## La règle

| Plateforme             | Quand on propose                                                    | Pourquoi                                                             |
| ---------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------- |
| iOS Safari             | **avant** tout branchement de plugin                                | installer après ferait perdre l'import                               |
| Android Chromium       | après engagement : ≥ 4 jours distincts **et** au moins une activité | stockage partagé, on peut attendre que l'usage se confirme           |
| Chrome/Firefox iOS     | jamais                                                              | ils ne savent pas ajouter à l'écran d'accueil ; guider serait mentir |
| Desktop, déjà installé | jamais                                                              | rien à proposer                                                      |

## Où c'est écrit

- `src/services/InstallService.ts` — plateforme, capture de l'événement, état
- `src/composables/useInstallPrompt.ts` — **la règle ci-dessus**, et rien d'autre
- `src/components/InstallPrompt.vue` — les deux variantes d'affichage

## Le piège technique

`beforeinstallprompt` **ne se déclenche qu'une fois, pendant le chargement**, et
seulement sur Chromium. Sans `preventDefault()` et une référence gardée, il est
perdu et `prompt()` ne pourra plus jamais être appelé.

C'est pour cela que `InstallService.initialize()` est appelé dans `main.ts`
**avant le montage de l'app**, et pas depuis un composant. Ne pas déplacer.

Sur iOS il n'existe aucune API : on ne peut que montrer où se trouve le geste
(Partager → Sur l'écran d'accueil). D'où les deux variantes du composant.

## Ne pas harceler

Deux refus (`dismissCount >= 2`) et on arrête définitivement de proposer.
L'état vit dans `install_prompt_state` — c'est de l'état applicatif qui pilote
une décision, **pas de la mesure** : l'app n'a pas de télémétrie, et un compteur
local ne pourrait de toute façon rien agréger.

Le compte de visites est **par jour distinct**, pas par ouverture : quatre
rechargements dans la même session ne disent rien d'une habitude.

## App native

Pas de lien vers les stores tant qu'il n'y a rien dessus. Le jour où une app
Capacitor existe, HealthKit et Health Connect entrent tels quels dans le contrat
`ProviderPlugin` — un dossier par plateforme dans `plugins/data-providers/`,
sans toucher au core.
