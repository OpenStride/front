# Test Google OAuth avec PKCE (sans CLIENT_SECRET)

**Date:** 2026-01-02
**Changements:** Suppression de CLIENT_SECRET, passage à PKCE pur

---

## ✅ Modifications Effectuées

1. **CLIENT_SECRET supprimé** du code (était exposé publiquement)
2. **CLIENT_ID déplacé** vers variable d'environnement `.env`
3. **PKCE utilisé** pour toutes les requêtes OAuth (plus sécurisé)

---

## 🧪 Étapes de Test

### Étape 1 : Redémarrer le serveur de dev

```bash
# Arrêter le serveur actuel (Ctrl+C)
npm run dev
```

**Important:** Vite doit redémarrer pour charger les nouvelles variables d'environnement `.env`

---

### Étape 2 : Vérifier que CLIENT_ID est chargé

Ouvrir la console du navigateur et tester :

```javascript
console.log(import.meta.env.VITE_GOOGLE_CLIENT_ID)
// Doit afficher : 9754076900-qh6339oncr1ha10l50jme66ogpod9atm.apps.googleusercontent.com
```

Si `undefined`, redémarrer le serveur dev.

---

### Étape 3 : Se déconnecter de Google Drive

1. Aller dans **Paramètres** ou **Providers de stockage**
2. Cliquer sur **Déconnexion** Google Drive
3. Vérifier dans DevTools > Application > IndexedDB > openStride que :
   - `gdrive_access_token` est supprimé
   - `gdrive_refresh_token` est supprimé
   - `gdrive_access_token_expire_timestamp` est supprimé

**OU** manuellement :

```javascript
// Console navigateur
const db = await indexedDB.open('openStride', 7);
const tx = db.transaction('settings', 'readwrite');
const store = tx.objectStore('settings');
await store.delete('gdrive_access_token');
await store.delete('gdrive_refresh_token');
await store.delete('gdrive_access_token_expire_timestamp');
```

---

### Étape 4 : Se reconnecter (Premier login)

1. Cliquer sur **Connecter Google Drive**
2. **Écran Google OAuth** devrait apparaître (popup ou redirect)
3. Accepter les permissions
4. **Vérifications :**

   **Console réseau (DevTools > Network) :**
   - Requête vers `https://oauth2.googleapis.com/token`
   - Body devrait contenir :
     ```
     code=...
     client_id=9754076900-qh6339oncr1ha10l50jme66ogpod9atm.apps.googleusercontent.com
     code_verifier=... (chaîne aléatoire)
     grant_type=authorization_code
     redirect_uri=...
     ```
   - ❌ **PAS de `client_secret`** dans le body !

   **Réponse attendue :**
   ```json
   {
     "access_token": "ya29.a0...",
     "expires_in": 3599,
     "refresh_token": "1//0g...",
     "scope": "https://www.googleapis.com/auth/drive.file",
     "token_type": "Bearer"
   }
   ```

5. **Vérifier IndexedDB :**
   - `gdrive_access_token` : doit contenir `ya29.a0...`
   - `gdrive_refresh_token` : doit contenir `1//0g...`
   - `gdrive_access_token_expire_timestamp` : timestamp futur

---

### Étape 5 : Tester la sauvegarde automatique

1. Créer ou modifier une activité
2. Attendre 2-3 secondes (debounce)
3. **Vérifier console :**
   ```
   [GDrive] Backup file updated successfully.
   ```

4. **Vérifier Google Drive :**
   - Aller sur https://drive.google.com
   - Chercher dossier `OpenStride`
   - Vérifier fichiers `activities_backup.json`, `activity_details_backup.json`
   - Dernière modification devrait être récente

---

### Étape 6 : Tester le refresh automatique (CRUCIAL)

**Option A : Attendre 1 heure (lent)**

1. Laisser l'app ouverte 1h
2. Faire une modification d'activité
3. Devrait sauvegarder sans popup de réauth

**Option B : Forcer expiration (rapide)**

```javascript
// Console navigateur
const db = await indexedDB.open('openStride', 7);
const tx = db.transaction('settings', 'readwrite');
const store = tx.objectStore('settings');

// Mettre une expiration dans le passé (30 min avant maintenant)
const pastTimestamp = Date.now() - (30 * 60 * 1000);
await store.put({ key: 'gdrive_access_token_expire_timestamp', value: pastTimestamp });
```

Ensuite :
1. Modifier une activité
2. La sauvegarde devrait :
   - Détecter que le token est expiré
   - Automatiquement appeler refresh avec `refresh_token`
   - **PAS de popup Google**
   - Sauvegarde réussie

**Vérifier Network :**
- Requête `POST https://oauth2.googleapis.com/token`
- Body :
  ```
  client_id=9754076900-...
  refresh_token=1//0g...
  grant_type=refresh_token
  ```
- ❌ **PAS de `client_secret`**

**Réponse :**
```json
{
  "access_token": "ya29.a0... (nouveau)",
  "expires_in": 3599,
  "scope": "...",
  "token_type": "Bearer"
  // Note: refresh_token n'est PAS retourné (on garde l'ancien)
}
```

---

### Étape 7 : Tester hydration au démarrage

1. Fermer complètement le navigateur
2. Rouvrir l'app
3. **Sans aucune interaction**, l'app devrait :
   - Charger les activités depuis IndexedDB
   - En arrière-plan, vérifier Google Drive
   - Synchroniser si changements distants

**Vérifier console :**
```
[GDrive] hydration after refresh failed OU success
[GDrive] Remote store="activities" items=X
```

---

## ✅ Critères de Succès

- [ ] Première connexion Google fonctionne
- [ ] `refresh_token` est sauvegardé dans IndexedDB
- [ ] Sauvegarde manuelle fonctionne
- [ ] Sauvegarde automatique (2s debounce) fonctionne
- [ ] Refresh automatique après expiration fonctionne
- [ ] **Aucune popup de réauth** après le premier login
- [ ] Aucun `client_secret` visible dans les requêtes réseau
- [ ] Synchronisation bidirectionnelle fonctionne

---

## ❌ Erreurs Possibles

### Erreur 1 : `CLIENT_ID is undefined`

**Cause :** Variable d'environnement pas chargée

**Solution :**
```bash
# Arrêter serveur
# Vérifier .env existe et contient VITE_GOOGLE_CLIENT_ID
cat .env
# Redémarrer
npm run dev
```

---

### Erreur 2 : `invalid_client` lors du token exchange

**Cause :** Google rejette car CLIENT_ID pas reconnu

**Solutions possibles :**
1. Vérifier que le CLIENT_ID dans `.env` est correct
2. Vérifier que le redirect URI correspond à celui configuré dans Google Cloud Console
3. S'assurer que le projet Google Cloud est actif

---

### Erreur 3 : `unauthorized_client` avec message "client_secret required"

**Cause :** Le OAuth Client n'est pas configuré comme "Public" dans Google Cloud Console

**Solution :**
1. Aller sur https://console.cloud.google.com/apis/credentials
2. Éditer le OAuth 2.0 Client ID
3. Type application : Doit être **"Application Web"** OU **"Single Page Application"**
4. Si "Application Web" :
   - ✅ Laisser le client_secret (ne pas l'utiliser côté code)
   - Google accepte PKCE même avec un secret configuré
5. Si erreur persiste, créer un nouveau OAuth Client de type **"Application Web"** avec PKCE activé

---

### Erreur 4 : Refresh token pas reçu

**Cause :** Pas de `access_type=offline` ou déjà connecté précédemment

**Solution :**
1. Vérifier ligne 132-133 de `GoogleDriveAuthService.ts` :
   ```typescript
   + "&access_type=offline"
   + "&prompt=consent"
   ```
2. Se déconnecter complètement de Google Drive
3. Révoquer l'accès sur https://myaccount.google.com/permissions
4. Se reconnecter → écran consent devrait apparaître

---

## 📊 Comparaison Avant/Après

| Aspect | Avant (avec CLIENT_SECRET) | Après (PKCE pur) |
|--------|---------------------------|------------------|
| Sécurité | ❌ Secret exposé | ✅ Aucun secret |
| Requêtes réseau | `client_secret` visible | ✅ `code_verifier` unique |
| Refresh token | ✅ Fonctionne | ✅ Fonctionne |
| Durée session | Indéfinie (refresh) | Indéfinie (refresh) |
| Serverless | ✅ Oui | ✅ Oui |
| Conforme OAuth 2.0 | ❌ Non (secret client public) | ✅ Oui (PKCE standard) |

---

## 🔧 Rollback en cas de problème

Si ça ne marche pas, rollback temporaire :

```bash
git diff plugins/storage-providers/GDrive/client/GoogleDriveAuthService.ts
git checkout plugins/storage-providers/GDrive/client/GoogleDriveAuthService.ts
git checkout .env
```

**Mais** : signaler l'erreur pour qu'on puisse la corriger !

---

## 📚 Ressources

- **Google OAuth 2.0 PKCE :** https://developers.google.com/identity/protocols/oauth2/native-app
- **RFC 7636 (PKCE spec) :** https://datatracker.ietf.org/doc/html/rfc7636
- **Best practices OAuth SPA :** https://auth0.com/blog/oauth2-implicit-grant-and-spa/

---

**Prochaine étape si test réussi :**
- [ ] Commit des changements
- [ ] Régénérer OAuth credentials (anciens compromis)
- [ ] Déployer en production

**Dernière mise à jour :** 2026-01-02
