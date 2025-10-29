import { google } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { JobsClient } from '@google-cloud/run';

/**
 * Custom provider configuration for ModelSmith
 * Connects to OpenAI-compatible inference service
 */
export const customProvider = createOpenAICompatible({
    name: 'tuneloom',
    baseURL: process.env.OPENAI_COMPATIBLE_BASE_URL || 'http://localhost:8880/v1',
    apiKey: process.env.BASE_MODEL_API_KEY || '',
});

/**
 * Create a custom provider with dynamic baseURL
 */
export function createCustomProvider(modelId: string, apiKey: string) {
    const baseURL = `${process.env.OPENAI_COMPATIBLE_BASE_URL}/${modelId}`
    return createOpenAICompatible({
        name: 'tuneloom',
        baseURL,
        apiKey
    });
}

/**
 * Google provider instance for Gemini models
 */
export const googleProvider = google;

/**
 * Available model configurations
 */
export const MODELS = {
    GOOGLE_GEMINI_FLASH: 'gemini-2.5-flash',
} as const;


let jobsClient: JobsClient | null = null;

/**
 * Get or create the JobsClient instance
 * Uses FIREBASE_SERVICE_ACCOUNT_KEY environment variable for authentication
 */
export function getJobsClient(): JobsClient {
    if (!jobsClient) {
        // Get service account credentials from environment variable
        const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
        if (!serviceAccountKey) {
            throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY environment variable not set');
        }

        const credentials = JSON.parse(serviceAccountKey);
        jobsClient = new JobsClient({
            credentials,
            projectId: credentials.project_id,
        });
    }
    return jobsClient;
}