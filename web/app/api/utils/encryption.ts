import crypto from 'crypto';

/**
 * Encryption utilities for sensitive data like API keys
 * Uses AES-256-GCM for authenticated encryption
 */
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Get the encryption key from environment variable
 * In production, this should be stored in Google Secret Manager
 */
function getEncryptionKey(): Buffer {
    const key = process.env.API_KEY_ENCRYPTION_SECRET;

    if (!key) {
        throw new Error('API_KEY_ENCRYPTION_SECRET environment variable is not set');
    }

    // Ensure the key is 32 bytes for AES-256
    return crypto.createHash('sha256').update(key).digest();
}

/**
 * Encrypt a string value
 * @param plaintext The value to encrypt
 * @returns Base64-encoded encrypted value with IV and auth tag
 */
export function encrypt(plaintext: string): string {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const authTag = cipher.getAuthTag();

    // Combine IV + authTag + encrypted data, all base64 encoded
    const combined = Buffer.concat([
        iv,
        authTag,
        Buffer.from(encrypted, 'base64')
    ]);

    return combined.toString('base64');
}

/**
 * Decrypt an encrypted string value
 * @param encryptedData Base64-encoded encrypted value with IV and auth tag
 * @returns The decrypted plaintext
 */
export function decrypt(encryptedData: string): string {
    const key = getEncryptionKey();
    const combined = Buffer.from(encryptedData, 'base64');

    // Extract IV, auth tag, and encrypted data
    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, undefined, 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
}
