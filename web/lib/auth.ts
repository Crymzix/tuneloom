import { auth } from './firebase';

/**
 * Gets the current Firebase ID token for API authorization.
 * This token can be attached to API calls via the Authorization header.
 *
 * @returns Promise<string> The Firebase ID token
 * @throws Error if no user is authenticated or token retrieval fails
 *
 * @example
 * const token = await getAuthToken();
 * const response = await fetch('/api/endpoint', {
 *   headers: {
 *     'Authorization': `Bearer ${token}`
 *   }
 * });
 */
export async function getAuthToken(): Promise<string> {
    const currentUser = auth.currentUser;

    if (!currentUser) {
        throw new Error('No authenticated user found');
    }

    try {
        // Get the ID token, forcing refresh if older than 5 minutes
        const token = await currentUser.getIdToken(false);
        return token;
    } catch (error) {
        throw new Error(`Failed to get auth token: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}