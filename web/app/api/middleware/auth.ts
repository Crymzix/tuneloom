import { Context, Next } from 'hono';
import { getAdminAuth } from '@/lib/firebase-admin';
import { ApiError } from './error-handler';

/**
 * Extended context with authenticated user
 */
export interface AuthContext extends Context {
    user?: {
        uid: string;
        email?: string;
        emailVerified?: boolean;
        displayName?: string;
        photoURL?: string;
        isAnonymous?: boolean;
    };
}

/**
 * Authentication middleware
 * Verifies Firebase ID token from Authorization header
 *
 * @example
 * app.post('/protected-route', authMiddleware, async (c) => {
 *   const user = c.get('user');
 *   return c.json({ message: `Hello ${user.email}` });
 * });
 */
export async function authMiddleware(c: AuthContext, next: Next) {
    try {
        const authHeader = c.req.header('Authorization');

        if (!authHeader) {
            throw new ApiError(401, 'No authorization header provided', 'Unauthorized');
        }

        // Extract token from "Bearer <token>" format
        const token = authHeader.startsWith('Bearer ')
            ? authHeader.slice(7)
            : authHeader;

        if (!token) {
            throw new ApiError(401, 'Invalid authorization header format', 'Unauthorized');
        }

        // Verify the ID token
        const adminAuth = getAdminAuth();
        const decodedToken = await adminAuth.verifyIdToken(token);
        const isAnonymous = decodedToken.firebase.sign_in_provider === 'anonymous';

        // Attach user info to context
        c.set('user', {
            uid: decodedToken.uid,
            email: decodedToken.email,
            emailVerified: decodedToken.email_verified,
            displayName: decodedToken.name,
            photoURL: decodedToken.picture,
            isAnonymous,
        });

        await next();
    } catch (error) {
        if (error instanceof ApiError) {
            throw error;
        }

        // Handle Firebase Auth errors
        if (error instanceof Error) {
            if (error.message.includes('auth/id-token-expired')) {
                throw new ApiError(401, 'Token has expired', 'Token Expired');
            }
            if (error.message.includes('auth/argument-error')) {
                throw new ApiError(401, 'Invalid token format', 'Invalid Token');
            }
        }

        console.error('Authentication error:', error);
        throw new ApiError(401, 'Authentication failed', 'Unauthorized');
    }
}

/**
 * Optional authentication middleware
 * Attaches user info if token is provided, but doesn't fail if missing
 * Useful for routes that have different behavior for authenticated users
 */
export async function optionalAuthMiddleware(c: AuthContext, next: Next) {
    try {
        const authHeader = c.req.header('Authorization');

        if (authHeader) {
            const token = authHeader.startsWith('Bearer ')
                ? authHeader.slice(7)
                : authHeader;

            if (token) {
                const adminAuth = getAdminAuth();
                const decodedToken = await adminAuth.verifyIdToken(token);

                c.set('user', {
                    uid: decodedToken.uid,
                    email: decodedToken.email,
                    emailVerified: decodedToken.email_verified,
                    displayName: decodedToken.name,
                    photoURL: decodedToken.picture,
                });
            }
        }
    } catch (error) {
        // Silently fail for optional auth
        console.warn('Optional auth failed:', error);
    }

    await next();
}
