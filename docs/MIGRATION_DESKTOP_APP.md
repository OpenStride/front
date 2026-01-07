# Migration vers Desktop App OAuth Client

## ✅ Étape 1 : Créer Desktop App OAuth Client

1. Aller sur https://console.cloud.google.com/apis/credentials
2. Cliquer "CREATE CREDENTIALS" → "OAuth client ID"
3. **Application type:** Desktop app
4. **Name:** OpenStride PWA Client
5. **CREATE**
6. Copier le nouveau **Client ID** (format: xxxxx.apps.googleusercontent.com)
7. ❌ IGNORER le Client Secret (ne pas l'utiliser)

---

## ✅ Étape 2 : Mettre à jour .env

Remplacer dans `.env` :

```bash
# AVANT :
VITE_GOOGLE_CLIENT_ID=9754076900-qh6339oncr1ha10l50jme66ogpod9atm.apps.googleusercontent.com
VITE_GOOGLE_CLIENT_SECRET=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

# APRÈS :
VITE_GOOGLE_CLIENT_ID=VOTRE-NOUVEAU-CLIENT-ID.apps.googleusercontent.com
# VITE_GOOGLE_CLIENT_SECRET supprimé complètement
```

---

## ✅ Étape 3 : Modifier GoogleDriveAuthService.ts

### Changement 1 : Lignes 6-14

```typescript
// AVANT :
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const CLIENT_SECRET = import.meta.env.VITE_GOOGLE_CLIENT_SECRET;

// APRÈS :
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
// Pas de CLIENT_SECRET avec Desktop app OAuth client (PKCE pur)
```

### Changement 2 : Ligne 55-59 (refresh token)

```typescript
// AVANT :
body: new URLSearchParams({
    'client_id': CLIENT_ID,
    'client_secret': CLIENT_SECRET,
    'refresh_token': refreshToken,
    'grant_type': 'refresh_token',
}),

// APRÈS :
body: new URLSearchParams({
    'client_id': CLIENT_ID,
    // Pas de client_secret avec Desktop app
    'refresh_token': refreshToken,
    'grant_type': 'refresh_token',
}),
```

### Changement 3 : Ligne 96-102 (exchange code)

```typescript
// AVANT :
body: new URLSearchParams({
    'code': code,
    'client_id': CLIENT_ID,
    'client_secret': CLIENT_SECRET,
    'redirect_uri': `${window.location.origin}${window.location.pathname}`,
    'grant_type': 'authorization_code',
    'code_verifier': code_verifier,
}),

// APRÈS :
body: new URLSearchParams({
    'code': code,
    'client_id': CLIENT_ID,
    // Pas de client_secret avec Desktop app (PKCE utilise code_verifier)
    'redirect_uri': `${window.location.origin}${window.location.pathname}`,
    'grant_type': 'authorization_code',
    'code_verifier': code_verifier,
}),
```

---

## ✅ Étape 4 : Redémarrer et Tester

```bash
# 1. Redémarrer serveur dev
npm run dev

# 2. Se déconnecter de Google Drive (si déjà connecté)

# 3. Se reconnecter

# 4. Vérifier Network tab :
# - Requête POST https://oauth2.googleapis.com/token
# - Body ne doit PAS contenir client_secret
# - Body doit contenir code_verifier
```

---

## ✅ Vérification Finale

### Console navigateur (DevTools > Network)

Lors de la connexion, chercher la requête `POST oauth2.googleapis.com/token` :

**Payload attendu :**
```
code=4/0AY...
client_id=xxxxx.apps.googleusercontent.com
code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
grant_type=authorization_code
redirect_uri=http://localhost:3000/callback
```

**❌ PAS de `client_secret` !**

**Réponse attendue (200 OK) :**
```json
{
  "access_token": "ya29.a0...",
  "expires_in": 3599,
  "refresh_token": "1//0g...",
  "scope": "https://www.googleapis.com/auth/drive.file",
  "token_type": "Bearer"
}
```

---

## ❌ Troubleshooting

### Erreur: "invalid_client"

**Cause :** CLIENT_ID incorrect ou désactivé

**Solution :**
1. Vérifier que le CLIENT_ID dans `.env` est bien celui du Desktop app
2. Vérifier que le projet Google Cloud est actif

---

### Erreur: "redirect_uri_mismatch"

**Cause :** Les Desktop apps n'ont pas de redirect URIs pré-configurés, mais Google accepte automatiquement localhost

**Solution :**
1. Vérifier que votre redirect_uri est bien `http://localhost:3000/callback` (ou votre URL)
2. Pour production, vous devrez peut-être ajouter le domaine dans les "Authorized redirect URIs"

---

### Ça marche en dev mais pas en prod ?

**Solution :**
1. Sur Google Cloud Console, éditer le Desktop app OAuth client
2. Ajouter votre domaine de production dans "Authorized redirect URIs" :
   ```
   https://votre-domaine.com/callback
   ```

---

## 🎉 Résultat Final

- ✅ Aucun secret exposé côté client
- ✅ PKCE pur (code_verifier comme preuve)
- ✅ 100% serverless
- ✅ PWA compatible
- ✅ Refresh token fonctionne indéfiniment
- ✅ Conforme OAuth 2.0 best practices

---

## 🔄 Révoquer l'ancien OAuth Client (optionnel)

Une fois que tout fonctionne avec le nouveau Desktop app client :

1. Aller sur https://console.cloud.google.com/apis/credentials
2. Trouver l'ancien client (Web application)
3. Cliquer sur l'icône ⋮ → "Delete" / "Supprimer"
4. Confirmer

**Attention :** Les utilisateurs déjà connectés avec l'ancien client devront se reconnecter.

---

**Date :** 2026-01-02
**Status :** Prêt à migrer
