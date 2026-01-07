# Créer OAuth Client "Desktop app" pour PKCE pur

## Étapes sur Google Cloud Console

1. **Aller sur** https://console.cloud.google.com/apis/credentials

2. **Créer nouveau OAuth Client :**
   - Cliquer **"+ CREATE CREDENTIALS"** → **"OAuth client ID"**

3. **Sélectionner type :**
   - **Application type:** Desktop app
   - **Name:** OpenStride Desktop Client (ou autre nom)

4. **Créer**
   - Google va générer un CLIENT_ID et CLIENT_SECRET
   - ⚠️ **IGNORER le CLIENT_SECRET** (ne pas l'utiliser côté code)

5. **Copier le nouveau CLIENT_ID**
   - Format: `xxxxx.apps.googleusercontent.com`

6. **Pas besoin de Redirect URIs** pour Desktop app
   - Google accepte automatiquement localhost et custom schemes

7. **Mettre à jour `.env` :**
   ```bash
   VITE_GOOGLE_CLIENT_ID=nouveau-client-id.apps.googleusercontent.com
   ```

8. **Redémarrer serveur :**
   ```bash
   npm run dev
   ```

## Pourquoi "Desktop app" pour une web app ?

C'est contre-intuitif mais **autorisé** par Google. Les Desktop apps utilisent PKCE sans client_secret, exactement ce qu'on veut pour une SPA serverless.

## Alternative si Desktop app ne marche pas

Si Google bloque les Desktop clients depuis le web, utiliser Option 2 (client_secret dans .env).
