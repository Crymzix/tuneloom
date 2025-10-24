import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';

let adminApp: App;
let adminAuth: Auth;

/**
 * Initialize Firebase Admin SDK
 * This should only be called on the server-side
 */
function initializeFirebaseAdmin() {
    if (getApps().length === 0) {
        // Check if we're using service account JSON file or individual credentials
        if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
            // Option 1: Using service account JSON string
            const serviceAccount = JSON.parse(
                process.env.FIREBASE_SERVICE_ACCOUNT_KEY
            );

            adminApp = initializeApp({
                credential: cert(serviceAccount),
                projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
            });
        } else {
            throw new Error(
                'Firebase Admin credentials not found. Please set FIREBASE_SERVICE_ACCOUNT_KEY or individual credentials in environment variables.'
            );
        }

        adminAuth = getAuth(adminApp);
    } else {
        adminApp = getApps()[0];
        adminAuth = getAuth(adminApp);
    }

    return { adminApp, adminAuth };
}

/**
 * Get Firebase Admin Auth instance
 * Lazy initialization to avoid initializing on client-side
 */
export function getAdminAuth(): Auth {
    if (!adminAuth) {
        const { adminAuth: auth } = initializeFirebaseAdmin();
        return auth;
    }
    return adminAuth;
}

/**
 * Get Firebase Admin App instance
 * Lazy initialization to avoid initializing on client-side
 */
export function getAdminApp(): App {
    if (!adminApp) {
        const { adminApp: app } = initializeFirebaseAdmin();
        return app;
    }
    return adminApp;
}

export { adminApp, adminAuth };
