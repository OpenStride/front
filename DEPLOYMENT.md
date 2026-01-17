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

## CI/CD (Optionnel)

Pour automatiser les déploiements, ajouter GitHub Actions :

```yaml
# .github/workflows/deploy.yml
name: Deploy to Firebase
on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run test:unit
      - run: npm run lint
      - run: VITE_APP_BASE_URL=https://openstride.org npm run build
      - uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: '${{ secrets.GITHUB_TOKEN }}'
          firebaseServiceAccount: '${{ secrets.FIREBASE_SERVICE_ACCOUNT }}'
          channelId: live
          projectId: openstrive-edd63
```

## Support

En cas de problème :
1. Vérifier les logs : `firebase hosting:channel:list`
2. Tester en local : `npm run preview`
3. Vérifier la configuration Firebase : `firebase use --list`
