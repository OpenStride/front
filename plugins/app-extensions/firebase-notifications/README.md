# Firebase Push Notifications Plugin

Push notification plugin for OpenStride using Firebase Cloud Messaging (FCM). Notifies users when new activities are imported from data providers.

## Features

- Push notifications when new activities are imported
- Browser permission management
- FCM token lifecycle management (auto-refresh after 30 days)
- Event-driven architecture (listens to `DataProviderService` events)
- Self-disabling when Firebase is not configured
- Clean UI integration via `profile.settings` slot

## Prerequisites

1. **Firebase Project**: Create a Firebase project at [Firebase Console](https://console.firebase.google.com/)
2. **Firebase App**: Add a web app to your Firebase project
3. **Cloud Messaging**: Enable Firebase Cloud Messaging in your project
4. **VAPID Key**: Generate a Web Push certificate (VAPID key) in Project Settings → Cloud Messaging

## Installation & Setup

### 1. Configure Firebase

Copy `.env.example` to `.env` and fill in your Firebase configuration:

```bash
# Firebase Configuration
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef
VITE_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX
VITE_FIREBASE_VAPID_KEY=your-vapid-key-here
```

**Finding your configuration:**
- Firebase Console → Project Settings → General → Your apps → Web app
- VAPID Key: Project Settings → Cloud Messaging → Web Push certificates → Generate key pair

### 2. Enable the Plugin

The plugin is **auto-discovered** by OpenStride's extension system. No manual registration needed.

### 3. User Activation

Users enable notifications from their profile page:

1. Navigate to `/profile`
2. Scroll to "Notifications Push" section
3. Toggle "Activer les notifications"
4. Grant browser permission when prompted

## Architecture

### Components

```
plugins/app-extensions/firebase-notifications/
├── index.ts                      # Plugin entry point
├── lib/
│   └── firebase.ts              # Firebase SDK initialization
├── components/
│   └── NotificationSettings.vue # UI widget for profile page
├── services/
│   ├── NotificationService.ts   # FCM token management & event listening
│   └── sw-messaging.ts          # Service Worker messaging handler
└── README.md                    # This file
```

### Event Flow

```
1. User clicks "Refresh" in AppHeader
   ↓
2. DataProviderService.triggerRefresh()
   ↓
3. Each provider fetches new activities
   ↓
4. DataProviderService emits 'provider-activities-imported' event
   ↓
5. NotificationService listens to event
   ↓
6. (Future) Backend receives FCM token and sends push notification
   ↓
7. Service Worker receives background message
   ↓
8. Notification displayed to user
   ↓
9. User clicks notification → navigates to /my-activities
```

### Self-Disable Behavior

The plugin gracefully self-disables if:
- Firebase environment variables are missing
- VAPID key is not configured
- Browser doesn't support notifications

No errors are thrown, warnings are logged to console.

## Backend Integration (Future)

Currently, the plugin is **frontend-only**. The FCM token is collected and stored in IndexedDB but not sent to a backend.

### To enable full push notifications:

1. **Create a backend endpoint** to receive FCM tokens:
   ```typescript
   POST /api/users/fcm-token
   Body: { fcmToken: "...", userId: "..." }
   ```

2. **Send token from frontend**:
   ```typescript
   // In NotificationService.enable()
   await fetch('/api/users/fcm-token', {
     method: 'POST',
     body: JSON.stringify({ fcmToken: token, userId: currentUserId })
   });
   ```

3. **Backend sends notifications** using Firebase Admin SDK:
   ```typescript
   import admin from 'firebase-admin';

   await admin.messaging().send({
     token: userFcmToken,
     notification: {
       title: 'Nouvelles activités disponibles',
       body: '5 nouvelles activités ont été importées'
     },
     data: {
       url: '/my-activities'
     }
   });
   ```

## Usage

### Enable Notifications (User)

```typescript
const notificationService = NotificationService.getInstance();
const result = await notificationService.enable();

if (result.success) {
  console.log('Notifications enabled!');
} else {
  console.error('Failed:', result.error);
}
```

### Disable Notifications (User)

```typescript
await notificationService.disable();
```

### Check Notification State

```typescript
const state = await notificationService.getState();
console.log(state);
// {
//   enabled: true,
//   token: "fcm-token-here",
//   tokenTimestamp: 1234567890,
//   permissionStatus: "granted"
// }
```

## Testing

### Local Testing

1. **Build the app**:
   ```bash
   npm run build
   npm run preview
   ```

2. **Enable notifications** from `/profile`
3. **Trigger a data provider refresh** from AppHeader
4. **Check console** for event logs:
   ```
   [Firebase Notifications] New activities detected: { providerId: 'garmin', ... }
   ```

### Testing Push Notifications

Use Firebase Console to send test notifications:

1. Firebase Console → Cloud Messaging → Send your first message
2. Enter notification title and body
3. Test on device: Select "Send test message"
4. Paste your FCM token from browser console
5. Send

## Troubleshooting

### Plugin doesn't appear in Profile

**Check**:
- Plugin is in `plugins/app-extensions/firebase-notifications/`
- `index.ts` exports a valid `ExtensionPlugin` object
- Browser console for errors during plugin discovery

### "Firebase not configured" warning

**Fix**: Add all required Firebase env variables to `.env`:
```bash
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_VAPID_KEY=...
```

### Permission denied

**User Action**: Grant notification permission in browser settings, then re-enable in profile.

### Token not refreshing

**Check**: `fcm_token_timestamp` in IndexedDB. Token refreshes automatically after 30 days.

### Service Worker not receiving messages

**Check**:
1. Service Worker is registered: `navigator.serviceWorker.controller`
2. Firebase messaging setup in SW: Check browser console for `[SW Firebase]` logs
3. VAPID key matches Firebase project

## Security Notes

- **FCM tokens are sensitive**: Treat them like API keys
- **HTTPS required**: Firebase Messaging only works over HTTPS (or localhost)
- **VAPID key is public**: Safe to expose in client, but specific to your Firebase project
- **Token rotation**: Tokens are refreshed every 30 days for security

## Browser Support

- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Requires iOS 16.4+ / macOS 13+
- Opera: Full support

**Note**: Browser must support `Notification API` and `Service Workers`.

## License

Same as OpenStride (open-source, privacy-focused).

## Contributing

Improvements welcome! Key areas:
- Backend integration example
- Token refresh optimization
- Notification customization (sound, vibration)
- Multi-language support
- Analytics integration

---

**Plugin Version**: 1.0.0
**OpenStride Compatibility**: 0.1+
**Last Updated**: January 2026
