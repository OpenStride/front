# Configuration Dropbox pour OpenStride

Ce guide explique comment configurer le plugin de stockage Dropbox, alternative à Google Drive
pour la sauvegarde chiffrée côté utilisateur et le partage de profil entre amis.

## Pourquoi Dropbox ?

Par rapport à Google Drive, Dropbox a deux avantages concrets pour une PWA sans backend :

1. **Pas de client secret** : Dropbox supporte PKCE pour les clients publics. Aucun secret n'est
   embarqué dans le bundle, contrairement au client OAuth Google de type « Web application ».
2. **Pas de clé API pour la lecture publique** : les liens de partage servis par
   `dl.dropboxusercontent.com` autorisent la lecture cross-origin. Le navigateur d'un ami peut
   récupérer le manifeste directement, là où Google Drive impose de passer par une API Key
   (`VITE_GOOGLE_DRIVE_API_KEY`, voir `GOOGLE_DRIVE_SETUP.md`).

L'accès est limité au type **App folder** : le plugin ne voit que `Apps/OpenStride/`, jamais le
reste du Dropbox de l'utilisateur.

## Étapes de Configuration

### 1. Créer l'application Dropbox

1. Aller sur [Dropbox App Console](https://www.dropbox.com/developers/apps)
2. Cliquer sur **Create app**
3. **Choose an API** : `Scoped access`
4. **Choose the type of access you need** : `App folder`
   - **IMPORTANT** : ne pas choisir `Full Dropbox`. Les chemins du plugin sont relatifs à la racine
     du dossier applicatif ; avec un accès complet, les fichiers atterriraient à la racine du
     Dropbox de l'utilisateur.
5. **Name your app** : `OpenStride` (le nom doit être unique chez Dropbox, en ajouter un suffixe si
   nécessaire — il détermine le nom du dossier `Apps/<nom>`)

### 2. Déclarer les redirect URIs

Onglet **Settings** → section **OAuth 2** → **Redirect URIs**, ajouter :

```
http://localhost:3000/storage-provider/dropbox
https://openstride.org/storage-provider/dropbox
```

Le chemin correspond à la route du composant de setup du plugin (`/storage-provider/:id`). C'est ce
qui permet à plusieurs providers OAuth de cohabiter : chacun reçoit son callback sur sa propre route.

### 3. Activer les permissions

Onglet **Permissions**, cocher :

| Permission            | Utilité                                               |
| --------------------- | ----------------------------------------------------- |
| `files.content.read`  | Lire les fichiers de sauvegarde                       |
| `files.content.write` | Écrire les fichiers de sauvegarde et les publications |
| `sharing.read`        | Retrouver un lien public existant                     |
| `sharing.write`       | Créer les liens publics pour le partage entre amis    |

Cliquer sur **Submit** en bas de page.

> Les permissions doivent être validées **avant** la première autorisation. Si elles sont modifiées
> après coup, les utilisateurs déjà connectés doivent se reconnecter pour obtenir un token portant
> les nouveaux scopes.

### 4. Récupérer le client id

Onglet **Settings** → **App key**. C'est la valeur à mettre dans `VITE_DROPBOX_CLIENT_ID`.

L'**App secret** n'est **pas** utilisé : le flow PKCE s'en passe, et il ne doit pas être exposé
côté client.

### 5. Configurer OpenStride

#### Développement local

Dans `.env` :

```env
VITE_DROPBOX_CLIENT_ID=votre-app-key
```

#### Production

Ajouter `VITE_DROPBOX_CLIENT_ID` aux variables d'environnement du build (GitHub Actions secrets /
variables d'environnement de la plateforme de déploiement).

Sans cette variable, le plugin reste visible mais affiche « Dropbox n'est pas configuré dans cette
version » au lieu d'un bouton de connexion qui échouerait.

## Structure des fichiers

Dans `Apps/OpenStride/` :

```
activities_backup.json          # sauvegarde du store "activities"
activity_details_backup.json    # sauvegarde du store "activity_details"
public/
  manifest.json                 # manifeste de partage (lien public)
  activities-2025.json          # données publiques par année (lien public)
```

Seuls les fichiers de `public/` reçoivent un lien de partage. Les sauvegardes restent privées.

## Détection de changement distant

`SyncService` demande au plugin un jeton de changement avant de télécharger quoi que ce soit. Le
plugin Dropbox renvoie le `content_hash` du fichier (à défaut `rev`, puis `server_modified`), obtenu
via `files/get_metadata` — sans télécharger le contenu.

## Dépannage

| Symptôme                                            | Cause probable                                                                               |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Redirection vers Dropbox puis retour sans connexion | Redirect URI non déclarée, ou différente de la route exacte du plugin                        |
| `missing_scope` dans la console                     | Permission non cochée, ou token émis avant l'ajout de la permission                          |
| Les fichiers arrivent à la racine du Dropbox        | L'app a été créée en `Full Dropbox` au lieu de `App folder`                                  |
| `settings_error` au moment du partage               | Compte Business restreignant les liens publics — le plugin retente sans forcer la visibilité |
| Un ami ne peut pas charger le manifeste             | Le lien a été copié depuis `www.dropbox.com` au lieu de l'URL directe générée par le plugin  |

## Voir aussi

- `docs/GOOGLE_DRIVE_SETUP.md` — le provider équivalent chez Google
- `docs/PLUGIN_GUIDELINES.md` — architecture des plugins
