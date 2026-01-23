import { initializeApp, type FirebaseApp } from "firebase/app";
import { getMessaging, type Messaging } from "firebase/messaging";

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
} as const;

let app: FirebaseApp | null = null;
let messaging: Messaging | null = null;

/**
 * Initialize Firebase app and messaging.
 * Returns null if Firebase is not properly configured (missing env variables).
 */
export function initializeFirebase(): { app: FirebaseApp; messaging: Messaging } | null {
    try {
        // Check if all required config values are present
        const requiredKeys = ['apiKey', 'authDomain', 'projectId', 'messagingSenderId', 'appId'];
        const missingKeys = requiredKeys.filter(key => !firebaseConfig[key as keyof typeof firebaseConfig]);

        if (missingKeys.length > 0) {
            console.warn(`[Firebase Notifications] Missing configuration: ${missingKeys.join(', ')}`);
            return null;
        }

        if (!app) {
            app = initializeApp(firebaseConfig);
            messaging = getMessaging(app);
            console.log('[Firebase Notifications] Initialized successfully');
        }

        // At this point, both app and messaging are guaranteed to be non-null
        if (!messaging) {
            throw new Error('Messaging initialization failed');
        }

        return { app, messaging };
    } catch (error) {
        console.error('[Firebase Notifications] Initialization failed:', error);
        return null;
    }
}

/**
 * Get the Firebase messaging instance.
 * Returns null if Firebase is not initialized.
 */
export function getFirebaseMessaging(): Messaging | null {
    if (!messaging) {
        const result = initializeFirebase();
        return result?.messaging || null;
    }
    return messaging;
}

/**
 * Check if Firebase is properly configured.
 */
export function isFirebaseConfigured(): boolean {
    return !!(
        import.meta.env.VITE_FIREBASE_API_KEY &&
        import.meta.env.VITE_FIREBASE_PROJECT_ID &&
        import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID
    );
}
