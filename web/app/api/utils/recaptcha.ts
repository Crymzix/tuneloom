/**
 * Utility for verifying reCAPTCHA tokens on the backend
 */

interface RecaptchaVerificationResponse {
    success: boolean;
    challenge_ts?: string;
    hostname?: string;
    'error-codes'?: string[];
}

/**
 * Verifies a reCAPTCHA token with Google's verification API
 *
 * @param token - The reCAPTCHA token to verify
 * @returns Promise<boolean> - True if verification successful, false otherwise
 */
export async function verifyRecaptchaToken(token: string): Promise<boolean> {
    const secretKey = process.env.RECAPTCHA_SECRET_KEY;

    if (!secretKey) {
        console.error('RECAPTCHA_SECRET_KEY is not configured');
        // In development, you might want to skip verification if not configured
        if (process.env.NODE_ENV === 'development') {
            console.warn('⚠️  RECAPTCHA_SECRET_KEY not set - skipping verification in development mode');
            return true;
        }
        return false;
    }

    if (!token) {
        console.error('No reCAPTCHA token provided');
        return false;
    }

    try {
        const response = await fetch(
            'https://www.google.com/recaptcha/api/siteverify',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: `secret=${secretKey}&response=${token}`,
            }
        );

        const data: RecaptchaVerificationResponse = await response.json();

        if (!data.success) {
            console.error('reCAPTCHA verification failed:', data['error-codes']);
            return false;
        }

        return true;
    } catch (error) {
        console.error('Error verifying reCAPTCHA:', error);
        return false;
    }
}

/**
 * Middleware-style function to verify reCAPTCHA token from request body
 * Throws an error if verification fails
 *
 * @param recaptchaToken - The reCAPTCHA token from the request body
 * @throws Error if verification fails
 */
export async function requireRecaptcha(recaptchaToken: string | undefined): Promise<void> {
    if (!recaptchaToken) {
        throw new Error('reCAPTCHA token is required');
    }

    const isValid = await verifyRecaptchaToken(recaptchaToken);

    if (!isValid) {
        throw new Error('reCAPTCHA verification failed');
    }
}
