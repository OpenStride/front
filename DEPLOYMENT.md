# Guide de Déploiement OpenStride

## Prérequis

1. **Firebase CLI** installé globalement :
   ```bash
   npm install -g firebase-tools
   ```

2. **Authentification Firebase** :
   ```bash
   firebase login
   ```

3. **Variables d'environnement** configurées dans `.env.production`

4. **Google Drive API Key** configurée (obligatoire pour le partage d'amis)
   - Voir [GOOGLE_DRIVE_SETUP.md](./GOOGLE_DRIVE_SETUP.md) pour les instructions complètes
   - Sans API key, le partage d'amis via Google Drive ne fonctionnera pas (erreur CORS)

## Configuration Google Drive API (Important !)

⚠️ **OBLIGATOIRE** pour que le partage d'amis fonctionne sans erreur CORS.

**Résumé rapide :**
1. Aller sur [Google Cloud Console](https://console.cloud.google.com)
2. Créer un projet ou en sélectionner un
3. Activer "Google Drive API"
4. Créer une API Key (Credentials → Create credentials → API key)
5. Copier la clé dans `.env.production` :
   ```bash
   VITE_GOOGLE_DRIVE_API_KEY=AIzaSyC...VOTRE_CLE
   ```

**Documentation complète** : [GOOGLE_DRIVE_SETUP.md](./GOOGLE_DRIVE_SETUP.md)

## Déploiement Rapide

### Option 1 : Script Automatique (Recommandé)

```bash
npm run deploy
```

Ce script va :
- ✅ Installer les dépendances
- ✅ Lancer les tests unitaires
- ✅ Vérifier le linting
- ✅ Builder pour production avec `VITE_APP_BASE_URL=https://openstride.org`
- ✅ Demander confirmation
- ✅ Déployer sur Firebase Hosting

### Option 2 : Déploiement Manuel

```bash
# 1. Build avec la bonne config
npm run build:prod

# 2. Déployer
npm run deploy:firebase
```

### Option 3 : Commandes Détaillées

```bash
# 1. Vérifier que tout fonctionne
npm run test:unit
npm run lint

# 2. Build avec VITE_APP_BASE_URL
VITE_APP_BASE_URL=https://openstride.org npm run build

# 3. Preview local du build (optionnel)
npm run preview
# Ouvrir http://localhost:4173

# 4. Déployer sur Firebase
firebase deploy --only hosting
```

## Configuration Importante

### Variables d'Environnement

**⚠️ CRITIQUE** : Pour que le deep linking fonctionne, `VITE_APP_BASE_URL` doit être défini !

Vérifier dans `.env.production` :
```bash
VITE_APP_BASE_URL=https://openstride.org
```

Sans cette variable, les URLs de partage d'amis utiliseront `window.location.origin` (localhost en dev).

### Firebase Project

Le projet Firebase configuré est : **`openstrive-edd63`**

Voir dans `.firebaserc` :
```json
{
  "projects": {
    "default": "openstrive-edd63"
  }
}
```

## Vérification Post-Déploiement

### 1. Vérifier que l'app fonctionne
```
https://openstride.org
```

### 2. Tester le Deep Linking

1. Aller sur `/profile`
2. Publier des données
3. Vérifier que l'URL générée commence par :
   ```
   https://openstride.org/add-friend?manifest=...
   ```
4. Scanner le QR code ou copier l'URL
5. Ouvrir dans un nouvel onglet → devrait ajouter l'ami automatiquement

### 3. Vérifier les Logs Firebase

```bash
# Voir les logs de déploiement
firebase hosting:channel:list

# Voir les releases
firebase hosting:releases:list
```

## Rollback en Cas de Problème

```bash
# Voir les versions précédentes
firebase hosting:releases:list

# Rollback à une version spécifique
firebase hosting:rollback
```

## Domaine Custom

Si tu veux utiliser `openstride.org` :

1. **Ajouter le domaine dans Firebase Console** :
   - Firebase Console → Hosting → Add custom domain
   - Suivre les instructions pour configurer les DNS

2. **Configurer les DNS** :
   - Type A : `@` → IP Firebase
   - Type CNAME : `www` → `openstrive-edd63.web.app`

3. **Attendre la propagation DNS** (peut prendre 24-48h)

## Troubleshooting

### Erreur : "VITE_APP_BASE_URL undefined"

**Solution** : Définir la variable avant le build :
```bash
VITE_APP_BASE_URL=https://openstride.org npm run build
```

### Erreur : "Firebase not found"

**Solution** : Installer Firebase CLI :
```bash
npm install -g firebase-tools
firebase login
```

### Erreur : "Permission denied"

**Solution** : Vérifier que tu es bien connecté au bon projet :
```bash
firebase projects:list
firebase use openstrive-edd63
```

### Les QR codes pointent vers localhost

**Problème** : `VITE_APP_BASE_URL` n'était pas défini lors du build

**Solution** : Rebuilder avec la variable d'environnement :
```bash
rm -rf dist/
VITE_APP_BASE_URL=https://openstride.org npm run build
npm run deploy:firebase
```

## Scripts Disponibles

| Script | Description |
|--------|-------------|
| `npm run dev` | Dev server (localhost:3000) |
| `npm run build` | Build avec variables .env |
| `npm run build:prod` | Build avec VITE_APP_BASE_URL prod |
| `npm run preview` | Preview du build (localhost:4173) |
| `npm run test:unit` | Tests unitaires |
| `npm run lint` | Vérifier le code |
| `npm run deploy` | Script complet de déploiement |
| `npm run deploy:firebase` | Déployer direct (après build) |

## Monitoring

### Firebase Console
- Hosting : https://console.firebase.google.com/project/openstrive-edd63/hosting
- Analytics : https://console.firebase.google.com/project/openstrive-edd63/analytics

### Performance
- Lighthouse score : https://pagespeed.web.dev/
- Core Web Vitals dans Firebase Console

## CI/CD Pipeline

OpenStride utilise GitHub Actions pour automatiser les tests, le build et le déploiement.

### Workflows Automatiques

#### 1. CI Pipeline (.github/workflows/ci.yml)

**Déclencheurs** : Pull requests + push sur main

**Jobs parallèles** :
- Lint & TypeCheck : Validation ESLint + TypeScript strict
- Unit Tests : Tests Vitest avec coverage (minimum 60%)
- E2E Tests : Tests Cypress (Chrome)
- Build Validation : Vérification du build production

**Durée** : 3-5 minutes

#### 2. Code Quality (.github/workflows/code-quality.yml)

**Déclencheurs** : Pull requests + push sur main

**Vérifications** :
- Prettier : Formatage du code
- ESLint : Qualité du code
- TypeScript : Type checking strict

#### 3. Security Audit (.github/workflows/security-audit.yml)

**Déclencheurs** : Daily (9h UTC) + pull requests + push sur main

**Audits** :
- npm audit : Vulnérabilités des dépendances (fail sur high/critical)
- CodeQL : Analyse de sécurité statique (SAST)
- Dependency Review : Revue des nouvelles dépendances (PRs uniquement)

#### 4. Deploy Production (.github/workflows/deploy-production.yml)

**Déclencheur** : Push sur main (automatique après CI)

**Actions** :
- Build production avec VITE_APP_BASE_URL=https://openstride.org
- Déploiement vers Firebase Hosting (live channel)
- Vérification post-déploiement

**URL** : https://openstride.org

**Durée** : 2-3 minutes

#### 5. Deploy Preview (.github/workflows/deploy-preview.yml)

**Déclencheurs** : Pull requests (opened, synchronize, reopened)

**Actions** :
- Build production
- Déploiement vers Firebase preview channel (pr-{NUMBER})
- Commentaire PR avec URL de preview
- Cleanup automatique à la fermeture PR

**Format URL** : https://openstrive-edd63--pr-{NUMBER}-{HASH}.web.app

**Expiration** : 7 jours

#### 7. Lighthouse Performance (.github/workflows/lighthouse.yml)

**Déclencheur** : Après déploiement production réussi

**Budgets** :
- Performance : ≥90
- PWA : ≥100
- Accessibility : ≥90
- Best Practices : ≥90
- SEO : ≥90

### Déploiement Manuel (Fallback)

Si GitHub Actions est down ou pour un déploiement urgent :

#### Via GitHub Actions UI

1. Aller sur Actions → Deploy Production
2. Cliquer "Run workflow"
3. Sélectionner la branche main
4. Cliquer "Run workflow"

#### Via CLI Local

```bash
# 1. Build production
npm run build:prod

# 2. Déployer sur Firebase
firebase deploy --only hosting

# Ou utiliser le script complet
npm run deploy
```

### Secrets GitHub Requis

Ces secrets doivent être configurés dans **GitHub Repository Settings → Secrets and variables → Actions** :

| Secret | Description | Obtention |
|--------|-------------|-----------|
| `FIREBASE_SERVICE_ACCOUNT_OPENSTRIDE` | Service account JSON Firebase | Firebase Console → Project Settings → Service Accounts → Generate new private key |
| `VITE_GOOGLE_DRIVE_API_KEY` | API key Google Drive | Voir [GOOGLE_DRIVE_SETUP.md](./GOOGLE_DRIVE_SETUP.md) |
| `FIREBASE_TOKEN` (optionnel) | Token CLI Firebase pour cleanup preview | `firebase login:ci` |

### Procédure de Rollback

#### Option 1 : Via Firebase Console (Recommandé)

1. Aller sur [Firebase Console](https://console.firebase.google.com/project/openstrive-edd63/hosting)
2. Section "Hosting" → "Release history"
3. Sélectionner la version stable précédente
4. Cliquer "Rollback"

**Durée** : <1 minute

#### Option 2 : Via Firebase CLI

```bash
# Voir l'historique des releases
firebase hosting:releases:list

# Rollback à la version précédente
firebase hosting:rollback
```

**Durée** : <1 minute

#### Option 3 : Via GitHub (Revert + Redéploiement)

```bash
# 1. Identifier le commit problématique
git log --oneline

# 2. Revert le commit
git revert <commit-sha>

# 3. Push vers main
git push origin main

# 4. CI/CD redéploie automatiquement la version précédente
```

**Durée** : ~5 minutes (temps de CI/CD inclus)

### Monitoring Post-Déploiement

**GitHub Actions** :
- Workflow runs : https://github.com/OpenStride/front/actions
- Success rates, durée moyenne, artifacts

**Firebase Console** :
- Hosting metrics : https://console.firebase.google.com/project/openstrive-edd63/hosting
- Performance monitoring
- Release history

**Dependabot** :
- Security alerts : https://github.com/OpenStride/front/security/dependabot
- Mises à jour automatiques (hebdomadaires, lundi 9h)

### Optimisations de Coût

- Node modules cachés (gain ~30-40% temps)
- Jobs annulés si nouveau push (concurrency)
- Skip E2E sur changes docs uniquement
- **Coût estimé** : $0/mois (GitHub Actions free tier : 2000 min/mois pour repos publics)

## Support

En cas de problème :
1. Vérifier les logs : `firebase hosting:channel:list`
2. Tester en local : `npm run preview`
3. Vérifier la configuration Firebase : `firebase use --list`
