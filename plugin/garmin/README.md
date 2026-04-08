# Garmin Connect API Plugin

Firebase Functions that fetch activities from Garmin's Connect API using session cookies.

## Setup

### 1. Set cookie in Firestore

Create document `/config/garmin` in Firestore with:

```json
{
  "cookie": "GARMIN-SSO-GUID=xxx; JWT_FGP=yyy; SESSIONID=zzz",
  "nk": "NT",
  "xAppVer": "4.70.2.0",
  "diBackend": "connectapi.garmin.com"
}
```

### How to get the cookie

1. Open Chrome DevTools > Network
2. Log in on connect.garmin.com
3. Inspect a request to `connectapi.garmin.com`
4. Copy cookies: `GARMIN-SSO-GUID`, `JWT_FGP`, `SESSIONID`

### 2. Deploy

```bash
cd functions && npm run build && npx firebase-tools deploy --only functions --project openstrive-edd63 --force
```

### 3. Test

```bash
npx playwright test plugin/garmin/tests/
```

## Endpoints

- `GET /getActivities?days=7` — list activities
- `GET /getActivityDetails?activityId=123` — activity detail
