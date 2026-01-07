# Rollback vers client_secret (si Desktop app ne marche pas)

## Contexte

Google refuse PKCE sans client_secret pour ce cas d'usage. Probablement parce que :
- Desktop app clients ne sont pas supportés depuis le navigateur
- OU le client créé est de type "Web application" (qui exige toujours un secret)

## Solution : Utiliser l'ancien client Web application avec secret dans .env

### Étape 1 : Récupérer l'ancien CLIENT_ID et CLIENT_SECRET

Ancien client (Web application) :
```
CLIENT_ID=9754076900-qh6339oncr1ha10l50jme66ogpod9atm.apps.googleusercontent.com
CLIENT_SECRET=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
```

### Étape 2 : Modifier .env

```bash
VITE_GOOGLE_CLIENT_ID=9754076900-qh6339oncr1ha10l50jme66ogpod9atm.apps.googleusercontent.com
VITE_GOOGLE_CLIENT_SECRET=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
```

### Étape 3 : Modifier GoogleDriveAuthService.ts

Ligne 8 : Ajouter CLIENT_SECRET
```typescript
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const CLIENT_SECRET = import.meta.env.VITE_GOOGLE_CLIENT_SECRET;
```

Ligne 54 : Ajouter client_secret au refresh
```typescript
body: new URLSearchParams({
    'client_id': CLIENT_ID,
    'client_secret': CLIENT_SECRET,
    'refresh_token': refreshToken,
    'grant_type': 'refresh_token',
}),
```

Ligne 96 : Ajouter client_secret à l'échange
```typescript
body: new URLSearchParams({
    'code': code,
    'client_id': CLIENT_ID,
    'client_secret': CLIENT_SECRET,
    'redirect_uri': `${window.location.origin}${window.location.pathname}`,
    'grant_type': 'authorization_code',
    'code_verifier': code_verifier,
}),
```

### Étape 4 : Redémarrer et tester

```bash
npm run dev
```

### Conclusion

C'est un compromis acceptable :
- ✅ Fonctionne immédiatement
- ✅ Serverless (pas de backend)
- ✅ Secret pas hardcodé dans le code
- ✅ Secret pas committé (gitignore)
- ⚠️ Secret exposé dans bundle JS (visible avec DevTools)

Pour une sécurité maximale, il faudrait un backend proxy. Mais pour un MVP/POC, c'est acceptable.
