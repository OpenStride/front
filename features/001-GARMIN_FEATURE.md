# GARMIN FEATURE — Activités Garmin dans OpenStride

## CONTEXTE

OpenStride utilisait un proxy Cloud Run avec OAuth 1.0a pour récupérer les activités Garmin.
Garmin a migré vers OAuth 2.0. Le Cloud Run est down (503). Il faut migrer.

### Contrainte Garmin OAuth 2.0

Avec OAuth 2.0, la Wellness API de Garmin **interdit le pull direct** (Bearer auth retourne `InvalidPullTokenException`).
Le seul moyen de récupérer les données est le modèle **push** :

```
1. Client déclenche un backfill (Bearer auth) → Garmin retourne 202 (accepté, traitement async)
2. Garmin traite en arrière-plan → push POST les données à notre Firebase Function
3. Firebase Function stocke temporairement en Cloud Storage
4. Client poll la Function → récupère les données → sauve en IndexedDB
```

---

## MISSION

Faire fonctionner le flow complet : quand l'utilisateur ouvre `http://localhost:3000/data-provider/garmin` et clique "Actualiser", ses activités Garmin apparaissent.

### Résultat attendu

L'utilisateur voit ses activités dans la page. Il y a une activité du 20 mars 2026 qui doit apparaître.

---

## SCOPE

- Firebase Function : `functions/src/index.ts` (proxy OAuth2 + push receiver)
- Plugin client : `plugins/data-providers/GarminProvider/client/`
- Tests E2E : `plugin/garmin/tests/`

---

## ARCHITECTURE

### Firebase Function (`garminProxy`)

| Endpoint               | Rôle                                                |
| ---------------------- | --------------------------------------------------- |
| `POST /token`          | Échange OAuth2 (code → tokens, refresh)             |
| `GET /api/*`           | Proxy vers Wellness API (backfill avec Bearer auth) |
| `POST /ping`           | Reçoit les push de Garmin, stocke en Cloud Storage  |
| `GET /push/:userId`    | Client récupère les données push en attente         |
| `DELETE /push/:userId` | Client nettoie après consommation                   |
| `GET /user-id`         | Résout le userId Garmin depuis les données push     |

### Client (GarminSyncManager)

| Action                     | Méthode                                                                |
| -------------------------- | ---------------------------------------------------------------------- |
| Import initial             | `startInitialImportAsync()` → backfill 6 mois → poll push data         |
| Refresh quotidien          | `dailyRefresh()` → poll push data (Garmin push auto quand montre sync) |
| Bouton "10 derniers jours" | `fetchRecentDays(10)` → backfill ciblé → poll push data                |

### Stockage

| Où                      | Quoi                                  | Durée                                    |
| ----------------------- | ------------------------------------- | ---------------------------------------- |
| IndexedDB (client)      | Tokens, userId, activités, sync state | Permanent                                |
| Cloud Storage (serveur) | Données push brutes de Garmin         | Temporaire (supprimé après consommation) |

---

## ENDPOINTS GARMIN (API officielle — Wellness API)

```
# Backfill (déclenche l'envoi async des données historiques)
GET https://apis.garmin.com/wellness-api/rest/backfill/activityDetails
  ?summaryStartTimeInSeconds=UNIX_SECONDS
  &summaryEndTimeInSeconds=UNIX_SECONDS
  Authorization: Bearer {access_token}

# Push notification (Garmin → notre serveur)
POST https://{notre-function}/ping
  Body: { "activityDetails": [{ "userId": "xxx", "summary": {...}, "samples": [...] }] }
```

---

## STRATÉGIE D'IMPLÉMENTATION

1. **Merger PR #66** (Cloud Storage + push receiver + daily refresh fix)
2. **Déployer les functions** (`cd functions && npm run build && firebase deploy --only functions`)
3. **Configurer le push endpoint** dans la Garmin Developer Console
4. **Reset Garmin Connect** (révoquer + reconnecter) pour re-trigger le backfill
5. **Vérifier dans les logs** que le push arrive et est stocké
6. **Tester le bouton "Actualiser"** → les activités doivent apparaître
7. **Tests Playwright** — ouvrir la page, cliquer refresh, vérifier les activités

---

## TESTS PLAYWRIGHT

Les tests E2E mockent les réponses du push (pas besoin de cookie Garmin) :

1. `activities.spec.ts` — Ouvre la page Garmin, mock le endpoint `/push/:userId` avec des données d'activité, clique "Actualiser", vérifie que les activités s'affichent
2. `activity-detail.spec.ts` — Clique sur une activité, vérifie les détails (duration, distance, HR)

---

## CRITÈRES DE SUCCÈS

- [ ] Le push Garmin arrive et est stocké en Cloud Storage (visible dans les logs)
- [ ] Le client poll et récupère les données (visible dans la console)
- [ ] Les activités s'affichent dans la page après "Actualiser"
- [ ] L'activité du 20 mars 2026 est visible
- [ ] Tests Playwright passent

---

## RÈGLE ANTI-BOUCLE

Si la **même approche** échoue **3 fois consécutives** :

- **STOP** — ne pas réessayer la même chose
- Documenter dans `JOURNAL` ce qui a été tenté et l'erreur exacte
- Changer d'approche
- Si toutes les pistes sont épuisées → créer `BLOCKED.md`

---

## JOURNAL D'EXPLORATION

| #   | Date       | Approche                     | Résultat | Apprentissage                                                           |
| --- | ---------- | ---------------------------- | -------- | ----------------------------------------------------------------------- |
| 1   | 2026-03-23 | OAuth2 PKCE + Firebase proxy | OK       | Token exchange + backfill fonctionnent avec Bearer auth                 |
| 2   | 2026-03-23 | Pull direct activityDetails  | FAIL     | `InvalidPullTokenException` — Garmin refuse le pull avec Bearer OAuth2  |
| 3   | 2026-03-24 | Pull token API               | FAIL     | `/pullToken` n'existe pas comme endpoint API, c'est un outil web        |
| 4   | 2026-03-24 | Push model (Firestore)       | FAIL     | Firestore limit 1 MiB par doc, activités avec samples GPS font 2+ MiB   |
| 5   | 2026-03-25 | Push model (Cloud Storage)   | En cours | Pas de limite de taille. Push reçu (10 activités) mais reset nécessaire |
| 6   | 2026-03-26 | API non officielle (cookies) | Rejeté   | L'user veut l'API officielle, pas de cookies en prod                    |
