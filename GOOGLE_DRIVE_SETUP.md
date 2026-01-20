# Configuration Google Drive API pour OpenStride

Ce guide explique comment configurer l'API Google Drive pour permettre le partage d'amis sans problème CORS.

## Pourquoi une API Key ?

OpenStride utilise Google Drive de deux manières :

1. **Stockage privé (OAuth)** : Pour que les utilisateurs sauvegardent leurs données personnelles
2. **Partage public (API Key)** : Pour que les utilisateurs puissent partager leurs profils avec des amis **sans que ces amis aient besoin de se connecter à Google**

L'API Key permet à n'importe qui de lire les fichiers publics Google Drive directement depuis le navigateur, en contournant les restrictions CORS.

## Étapes de Configuration

### 1. Créer un Projet Google Cloud

1. Aller sur [Google Cloud Console](https://console.cloud.google.com)
2. Créer un nouveau projet ou sélectionner un projet existant
   - Nom suggéré : "OpenStride"
3. Attendre la création du projet

### 2. Activer l'API Google Drive

1. Dans le menu latéral : **APIs & Services** → **Library**
2. Rechercher "Google Drive API"
3. Cliquer sur **Google Drive API**
4. Cliquer sur **Enable**
5. Attendre quelques secondes pour l'activation

### 3. Créer une API Key

1. Dans le menu latéral : **APIs & Services** → **Credentials**
2. Cliquer sur **+ CREATE CREDENTIALS** en haut
3. Sélectionner **API key**
4. Une clé sera générée automatiquement (ex: `AIzaSyC...`)
5. **IMPORTANT : Copier cette clé immédiatement**

### 4. Restreindre l'API Key (Sécurité Recommandée)

Pour éviter les abus, il est recommandé de restreindre l'API key :

1. Cliquer sur l'icône "Edit" (crayon) à côté de votre API key
2. Dans **Application restrictions** :
   - Sélectionner **HTTP referrers (web sites)**
   - Ajouter vos domaines :
     ```
     http://localhost:3000/*
     https://openstride.org/*
     ```
3. Dans **API restrictions** :
   - Sélectionner **Restrict key**
   - Cocher uniquement **Google Drive API**
4. Cliquer sur **Save**

### 5. Configurer OpenStride

#### Développement Local

Créer ou modifier `.env` :

```bash
# Google Drive API Key (for anonymous read access to public files)
VITE_GOOGLE_DRIVE_API_KEY=AIzaSyC...VOTRE_CLE_ICI
```

#### Production

Modifier `.env.production` :

```bash
# Google Drive API Key (for anonymous read access to public files)
VITE_GOOGLE_DRIVE_API_KEY=AIzaSyC...VOTRE_CLE_ICI
```

### 6. Rebuilder l'Application

```bash
# Développement
npm run dev

# Production
VITE_APP_BASE_URL=https://openstride.org npm run build
npm run deploy:firebase
```

## Vérification

### Test 1 : Vérifier que l'API Key est chargée

Ouvrir la console du navigateur :

```javascript
console.log(import.meta.env.VITE_GOOGLE_DRIVE_API_KEY)
```

Devrait afficher votre API key (ou `undefined` si mal configurée).

### Test 2 : Tester le partage d'amis

1. Aller sur `/profile`
2. Cliquer "Publier mes données"
3. Vérifier que le QR code se génère
4. Copier l'URL de partage
5. Ouvrir dans un nouvel onglet incognito (pour simuler un nouvel utilisateur)
6. **Si ça fonctionne** : l'ami est ajouté automatiquement ✅
7. **Si erreur CORS** : vérifier la console pour les messages d'erreur

## Erreurs Courantes

### Erreur : "Google Drive API key not configured"

**Cause** : La variable `VITE_GOOGLE_DRIVE_API_KEY` n'est pas définie dans `.env`

**Solution** :
1. Vérifier que `.env` contient bien `VITE_GOOGLE_DRIVE_API_KEY=...`
2. Redémarrer le serveur de développement (`npm run dev`)

### Erreur : "Access denied" ou 403

**Cause** : Le fichier n'est pas partagé publiquement

**Solution** :
1. Dans Google Drive, clic droit sur le fichier → "Partager"
2. Changer en **"Anyone with the link"**
3. Cliquer sur "Copy link"

### Erreur : "API key not valid"

**Cause** : API key incorrecte ou restrictions trop strictes

**Solution** :
1. Vérifier que l'API key est correctement copiée (pas d'espaces)
2. Dans Google Cloud Console, vérifier que **Google Drive API** est activée
3. Vérifier les restrictions HTTP referrers (ajouter `http://localhost:3000/*`)

### Erreur : "Failed to load gapi script"

**Cause** : Bloqueur de publicités ou problème réseau

**Solution** :
1. Désactiver les bloqueurs de publicités pour localhost et votre domaine
2. Vérifier la connexion internet
3. Essayer en navigation privée

## Quotas et Limites

Google Drive API avec API key a les limites suivantes (gratuit) :

- **10,000 requêtes par jour** par projet
- **1,000 requêtes par 100 secondes** par utilisateur

Pour OpenStride, ces limites sont largement suffisantes :
- 10,000 utilisateurs pourraient ajouter 1 ami par jour
- Aucun coût jusqu'à ces limites

## Sécurité

### Est-ce que l'API Key doit être secrète ?

**NON**, l'API Key est exposée côté client, c'est normal et attendu pour les applications web. C'est comme les clés Firebase ou MapTiler.

**Cependant** :
- ✅ Restreindre par domaine (HTTP referrers)
- ✅ Restreindre à Google Drive API uniquement
- ✅ Monitorer l'utilisation dans Google Cloud Console
- ❌ Ne pas utiliser d'OAuth token comme API key

### Que peut faire quelqu'un avec mon API Key ?

Avec les restrictions configurées, quelqu'un pourrait :
- ✅ Lire les fichiers **publics** Google Drive (c'est le but)
- ❌ **PAS** accéder aux fichiers privés
- ❌ **PAS** modifier ou supprimer des fichiers
- ❌ **PAS** utiliser d'autres APIs Google (si restrictions activées)

## Alternative : Pas d'API Key

Si tu ne veux **pas** utiliser d'API key Google, tu as deux options :

### Option 1 : Plugin de Partage Alternatif

Créer un plugin de partage utilisant un service CORS-friendly :
- Firebase Storage
- GitHub Gists
- IPFS (vraiment décentralisé)

### Option 2 : Mode Dégradé

Sans API key, le partage Google Drive ne fonctionne pas directement :
- L'utilisateur A génère un QR code
- L'utilisateur B **télécharge** le fichier manuellement
- L'utilisateur B **importe** le fichier dans OpenStride

## Support

En cas de problème :
1. Vérifier la console du navigateur pour les erreurs détaillées
2. Vérifier les quotas dans [Google Cloud Console](https://console.cloud.google.com/apis/dashboard)
3. Ouvrir une issue sur GitHub avec les logs

## Ressources

- [Google Drive API Documentation](https://developers.google.com/drive/api/guides/about-sdk)
- [API Key Best Practices](https://cloud.google.com/docs/authentication/api-keys)
- [Google Cloud Console](https://console.cloud.google.com)
