import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

let adminApp: App;
let adminAuth: Auth;
let adminFirestore: Firestore;

/**
 * Initialize Firebase Admin SDK
 * This should only be called on the server-side
 */
function initializeFirebaseAdmin() {
    if (getApps().length === 0) {
        if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
            const serviceAccount = JSON.parse(
                process.env.FIREBASE_SERVICE_ACCOUNT_KEY
            );

            adminApp = initializeApp({
                credential: cert(serviceAccount),
                projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
                storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
            });
        } else {
            throw new Error(
                'Firebase Admin credentials not found. Please set FIREBASE_SERVICE_ACCOUNT_KEY or individual credentials in environment variables.'
            );
        }

        adminAuth = getAuth(adminApp);
        adminFirestore = getFirestore(adminApp);
    } else {
        adminApp = getApps()[0];
        adminAuth = getAuth(adminApp);
        adminFirestore = getFirestore(adminApp);
    }

    return { adminApp, adminAuth, adminFirestore };
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

/**
 * Get Firebase Admin Firestore instance
 * Lazy initialization to avoid initializing on client-side
 */
export function getAdminFirestore(): Firestore {
    if (!adminFirestore) {
        const { adminFirestore: firestore } = initializeFirebaseAdmin();
        return firestore;
    }
    return adminFirestore;
}

export { adminApp, adminAuth, adminFirestore };

