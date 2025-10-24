import { google } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

/**
 * Custom provider configuration for ModelSmith
 * Connects to OpenAI-compatible inference service
 */
export const customProvider = createOpenAICompatible({
  name: 'modelsmith',
  baseURL: process.env.OPENAI_COMPATIBLE_BASE_URL || 'http://localhost:8880/v1',
});

/**
 * Google provider instance for Gemini models
 */
export const googleProvider = google;

/**
 * Available model configurations
 */
export const MODELS = {
  CUSTOM_GEMMA: 'google/gemma-3-270m',
  GOOGLE_GEMINI_FLASH: 'gemini-2.5-flash',
} as const;
