# Design Guidelines - OpenStride

Ce document définit les règles de design pour maintenir la cohérence visuelle du projet OpenStride.

## Table des matières
- [Couleurs](#couleurs)
- [Icônes](#icônes)
- [Rayons (arrondis)](#rayons-arrondis)
- [Typographie](#typographie)
- [Espacement](#espacement)

---

## Couleurs

### Règle Générale
**TOUJOURS utiliser les variables CSS définies dans `src/assets/styles/variables.css`**

### Couleurs Principales

#### Vert OpenStride (Couleur de marque)
```css
/* ❌ INTERDIT */
background: #10b981;  /* Tailwind green */
background: #88aa00;  /* Hardcodé */

/* ✅ CORRECT */
background: var(--color-green-500);  /* #88aa00 - Vert principal */
background: var(--color-green-600);  /* #6d8a00 - Vert foncé */
background: var(--color-green-400);  /* #b4d647 - Vert clair */
```

#### Palette Complète OpenStride
```css
--color-green-50:  #f8fbea;  /* Très clair (backgrounds) */
--color-green-100: #edf6c8;  /* Clair */
--color-green-200: #dff19a;  /* */
--color-green-300: #cbe56d;  /* */
--color-green-400: #b4d647;  /* Clair accent */
--color-green-500: #88aa00;  /* ⭐ Principal - Boutons, CTA */
--color-green-600: #6d8a00;  /* ⭐ Hover states */
--color-green-700: #566d00;  /* Foncé */
--color-green-800: #415200;  /* Très foncé */
--color-green-900: #2f3c00;  /* Maximum foncé */
```

#### Variables Sémantiques
```css
--primary-color: #333333;     /* Couleur texte principal */
--secondary-color: #88aa00;   /* Alias de green-500 */
--text-color: #333333;        /* Texte par défaut */
--bg-color: #fafafa;          /* Background principal */
```

### Cas d'Usage

#### Boutons Primaires
```vue
<style scoped>
.btn-primary {
  background: var(--color-green-500);
  color: white;
}

.btn-primary:hover {
  background: var(--color-green-600);
}
</style>
```

#### Backgrounds Subtils
```vue
<style scoped>
.info-card {
  background: var(--color-green-50);
  border: 1px solid var(--color-green-200);
}
</style>
```

#### Textes Colorés
```vue
<style scoped>
.success-text {
  color: var(--color-green-700);
}
</style>
```

### Règle de Vérification
Avant de commit, exécutez :
```bash
# Vérifier qu'aucune couleur hardcodée n'existe
grep -r "#88aa00\|#6d8a00\|#10b981\|#059669" src/ plugins/
```

Si des couleurs hardcodées sont trouvées, remplacez-les par les variables CSS.

---

## Icônes

### Règle Générale
**TOUJOURS utiliser Font Awesome 6 (Free)** pour les icônes. **JAMAIS d'emojis** dans le code de production.

### Pourquoi Éviter les Emojis ?

❌ **Problèmes des emojis** :
- Rendu différent selon OS/navigateur (🏃 peut être très différent entre iOS et Android)
- Accessibilité limitée (screen readers)
- Difficile à styler (couleur, taille)
- Manque de cohérence visuelle
- Pas de variantes (outline, solid)

✅ **Avantages Font Awesome** :
- Rendu identique partout
- Accessible par défaut (`aria-hidden`, `role`)
- Stylable via CSS
- Cohérence garantie
- Large catalogue (2000+ icônes gratuites)

### Classes Font Awesome Disponibles

#### Solid (par défaut - `fas`)
```html
<i class="fas fa-user"></i>          <!-- Utilisateur solide -->
<i class="fas fa-heart"></i>         <!-- Coeur plein -->
<i class="fas fa-check-circle"></i>  <!-- Check plein -->
```

#### Regular (outline - `far`)
```html
<i class="far fa-user"></i>          <!-- Utilisateur outline -->
<i class="far fa-heart"></i>         <!-- Coeur vide -->
<i class="far fa-check-circle"></i>  <!-- Check outline -->
```

#### Brands (`fab`)
```html
<i class="fab fa-google"></i>        <!-- Logo Google -->
<i class="fab fa-github"></i>        <!-- Logo GitHub -->
```

### Icônes par Contexte

#### Navigation & Interface
```html
<!-- Menu -->
<i class="fas fa-bars"></i>              <!-- ☰ Hamburger menu -->
<i class="fas fa-times"></i>             <!-- ✖ Fermer -->
<i class="fas fa-chevron-left"></i>      <!-- ← Retour -->
<i class="fas fa-chevron-right"></i>     <!-- → Suivant -->

<!-- Actions -->
<i class="fas fa-plus"></i>              <!-- Ajouter -->
<i class="fas fa-trash"></i>             <!-- Supprimer -->
<i class="fas fa-pen"></i>               <!-- Éditer -->
<i class="fas fa-sync"></i>              <!-- Refresh -->
```

#### Utilisateurs & Social
```html
<i class="fas fa-user"></i>              <!-- 👤 Utilisateur -->
<i class="fas fa-users"></i>             <!-- Groupe d'utilisateurs -->
<i class="fas fa-user-plus"></i>         <!-- Ajouter ami -->
<i class="fas fa-user-friends"></i>      <!-- Amis -->
<i class="fas fa-share-nodes"></i>       <!-- Partager -->
```

#### Activités Sportives
```html
<i class="fas fa-person-running"></i>    <!-- 🏃 Course -->
<i class="fas fa-person-biking"></i>     <!-- Vélo -->
<i class="fas fa-person-swimming"></i>   <!-- Natation -->
<i class="fas fa-person-hiking"></i>     <!-- Randonnée -->
<i class="fas fa-dumbbell"></i>          <!-- Fitness -->
```

#### États & Notifications
```html
<i class="fas fa-check-circle"></i>      <!-- ✓ Succès -->
<i class="fas fa-exclamation-circle"></i><!-- ⚠ Attention -->
<i class="fas fa-times-circle"></i>      <!-- ✗ Erreur -->
<i class="fas fa-info-circle"></i>       <!-- ℹ️ Info -->
```

#### Confidentialité & Sécurité
```html
<i class="fas fa-globe"></i>             <!-- 🌐 Public -->
<i class="fas fa-lock"></i>              <!-- 🔒 Privé -->
<i class="fas fa-eye"></i>               <!-- Visible -->
<i class="fas fa-eye-slash"></i>         <!-- Caché -->
<i class="fas fa-shield-alt"></i>        <!-- Protection -->
```

#### Données & Statistiques
```html
<i class="fas fa-chart-line"></i>        <!-- Graphique ligne -->
<i class="fas fa-chart-bar"></i>         <!-- Graphique barres -->
<i class="fas fa-calendar-alt"></i>      <!-- Calendrier -->
<i class="fas fa-clock"></i>             <!-- Temps -->
<i class="fas fa-tachometer-alt"></i>    <!-- Vitesse -->
<i class="fas fa-ruler-horizontal"></i>  <!-- Distance -->
```

#### Paramètres & Configuration
```html
<i class="fas fa-cog"></i>               <!-- ⚙ Paramètres -->
<i class="fas fa-sliders-h"></i>         <!-- Réglages -->
<i class="fas fa-plug"></i>              <!-- Connexion -->
<i class="fas fa-unlink"></i>            <!-- Déconnexion -->
```

### Bonnes Pratiques

#### 1. Toujours ajouter aria-hidden
```html
<!-- ❌ MAUVAIS -->
<i class="fas fa-user"></i>

<!-- ✅ BON -->
<i class="fas fa-user" aria-hidden="true"></i>
<span class="sr-only">Profil utilisateur</span>
```

#### 2. Cohérence des styles
```html
<!-- Dans un même contexte, utilisez le même style -->
<!-- ❌ MAUVAIS - Mélange solid et regular -->
<i class="fas fa-user"></i>
<i class="far fa-heart"></i>

<!-- ✅ BON - Tous solid OU tous regular -->
<i class="fas fa-user"></i>
<i class="fas fa-heart"></i>
```

#### 3. Tailles cohérentes
```css
/* Définir des tailles standardisées */
.icon-sm { font-size: 0.875rem; }  /* 14px */
.icon-md { font-size: 1rem; }      /* 16px - défaut */
.icon-lg { font-size: 1.5rem; }    /* 24px */
.icon-xl { font-size: 2rem; }      /* 32px */
```

#### 4. Couleurs via CSS (pas inline)
```vue
<!-- ❌ MAUVAIS -->
<i class="fas fa-user text-green-500"></i>

<!-- ✅ BON -->
<i class="fas fa-user icon-primary"></i>

<style scoped>
.icon-primary {
  color: var(--color-green-500);
}
</style>
```

### Migration d'Emojis vers Icons

Utilisez ce tableau de correspondance :

| Emoji | Font Awesome | Classe |
|-------|--------------|--------|
| 🏃 | Running | `fas fa-person-running` |
| 👤 | User | `fas fa-user` |
| 👥 | Users | `fas fa-users` |
| 🌐 | Globe | `fas fa-globe` |
| 🔒 | Lock | `fas fa-lock` |
| 🔓 | Unlock | `fas fa-lock-open` |
| ✖ | Close | `fas fa-times` |
| ☰ | Menu | `fas fa-bars` |
| ℹ️ | Info | `fas fa-info-circle` |
| ✓ | Check | `fas fa-check` |
| ⚠️ | Warning | `fas fa-exclamation-triangle` |
| ❌ | Error | `fas fa-times-circle` |
| 🔄 | Refresh | `fas fa-sync` |
| 🎯 | Target | `fas fa-bullseye` |

### Règle de Vérification
Avant de commit, exécutez :
```bash
# Vérifier qu'aucun emoji n'est utilisé dans le code
grep -rP "[\x{1F300}-\x{1F9FF}]" src/ plugins/ --color=always
```

---

## Rayons (arrondis)

### Règle Générale

**TOUJOURS** un token `--radius-*` de `variables.css`, **JAMAIS** une valeur en dur.

Un arrondi n'est pas un réglage libre : c'est ce qui dit à quelle famille
appartient un élément. Deux contrôles côte à côte qui ne partagent pas leur
rayon se lisent comme deux composants étrangers l'un à l'autre — c'est ce qui
est arrivé au filtre de sport du tableau de bord, en pill à côté de boutons de
bascule à 5 px.

### L'Échelle

| Token            | Valeur | Famille                                                             |
| ---------------- | ------ | ------------------------------------------------------------------- |
| `--radius-sm`    | 5px    | **Contrôles** : selects, inputs, boutons de bascule, petits badges  |
| `--radius-md`    | 12px   | **Surfaces internes** : tuiles, encarts, modales, blocs recessés    |
| `--radius-lg`    | 16px   | Blocs métriques mis en avant                                         |
| `--radius-xl`    | 24px   | Rare — grandes surfaces                                              |
| `--radius-2xl`   | 30px   | Cadre mobile                                                         |
| `--radius-pill`  | 999px  | **Chips et pastilles uniquement**                                    |
| `0`              | —      | **Cartes de contenu** (`.section-card`, `.acard`) : carré assumé     |
| `50%`            | —      | Avatars et points ronds                                              |

### Les Trois Règles

#### 1. Une carte de contenu est carrée

`.section-card` et `.acard` portent `border-radius: 0`. C'est un choix, pas un
oubli : ne pas l'arrondir « pour faire doux ».

#### 2. Le pill est réservé à ce dont la forme EST la fonction

Une chip est un pill. Un select, un bouton de barre, un champ ne le sont pas —
même quand ils veulent attirer l'œil. Ce qui rend un contrôle primaire, c'est sa
taille, sa graisse et sa bordure, pas un rayon plus rond.

#### 3. Deux contrôles voisins partagent leur rayon

Avant d'écrire un `border-radius`, regarder ce que porte le contrôle d'à côté.
Un select posé au-dessus d'une rangée de boutons de bascule prend le rayon de
ces boutons.

```css
/* ❌ MAUVAIS */
.sport-select {
  border-radius: 999px; /* pill, à côté de toggles à 5px */
}
.tile {
  border-radius: 10px; /* valeur inventée, hors échelle */
}

/* ✅ BON */
.sport-select {
  border-radius: var(--radius-sm);
}
.tile {
  border-radius: var(--radius-md);
}
```

### Pièges

- **`--border-radius` et `--border-radius-sm` n'existent pas.** Quelques
  composants écrivent `var(--border-radius)` : le token n'étant défini nulle
  part, la propriété est invalide et l'élément rend un angle droit — un carré
  involontaire, pas un choix. Les tokens s'appellent `--radius-*`.
- **Les tokens vivent dans le bloc `@theme`** de `variables.css`, pas dans
  `:root` : Tailwind injecte ses propres `--radius-*` après le fichier et
  écraserait les nôtres. Voir le commentaire sur place avant d'en déplacer un.
- L'existant n'est pas entièrement aligné (des `6px`, `20px`, `3px` en dur
  traînent encore). La règle vaut pour tout code neuf ou touché ; migrer le
  reste au fil des passages, pas en une fois.

### Règle de Vérification

```bash
# Rayons en dur (hors 50%, légitime pour un rond)
grep -rn "border-radius: *[0-9]" src plugins --include=*.vue --include=*.css | grep -v "50%"

# Tokens fantômes
grep -rn "var(--border-radius" src plugins --include=*.vue --include=*.css
```

---

## Typographie

### Règles à venir
(À compléter selon les besoins du projet)

---

## Espacement

### Règles à venir
(À compléter selon les besoins du projet)

---

## Ressources

- [Font Awesome 6 Free Icons](https://fontawesome.com/search?o=r&m=free)
- [Variables CSS OpenStride](./src/assets/styles/variables.css)
- [Guide Claude Code](./CLAUDE.md)

---

**Version**: 1.1
**Dernière mise à jour**: Août 2026
**Mainteneur**: Équipe OpenStride
