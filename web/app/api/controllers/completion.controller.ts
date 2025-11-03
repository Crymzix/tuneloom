import { Context } from 'hono';
import { streamText } from 'ai';
import { createCustomProvider, customProvider } from '../config/providers';
import { CompletionRequest } from '../types';
import { ApiError } from '../middleware/error-handler';
import { MODEL_IDS } from '../config/constants';
import { requireRecaptcha } from '../utils/recaptcha';

/**
 * Completion Controller
 * Handles text completion streaming requests using custom provider
 */
export class CompletionController {
    /**
     * POST /api/completion
     * Stream text completions using the custom model
     */
    static async streamCompletion(c: Context): Promise<Response> {
        try {
            // Get validated data from middleware
            const { modelId, prompt, apiKey, recaptchaToken, settings } = c.get('validatedData') as CompletionRequest;

            await requireRecaptcha(recaptchaToken);

            // Build streamText options with model settings
            const baseOptions = {
                prompt,
                ...(settings?.temperature !== undefined && { temperature: settings.temperature }),
                ...(settings?.topP !== undefined && { topP: settings.topP }),
                ...(settings?.topK !== undefined && { topK: settings.topK }),
                ...(settings?.maxTokens !== undefined && { maxOutputTokens: settings.maxTokens }),
                ...(settings?.frequencyPenalty !== undefined && { frequencyPenalty: settings.frequencyPenalty }),
                ...(settings?.presencePenalty !== undefined && { presencePenalty: settings.presencePenalty }),
            };

            if (Object.values(MODEL_IDS).includes(modelId as any)) {
                const result = streamText({
                    model: customProvider(modelId),
                    ...baseOptions,
                });

                return result.toUIMessageStreamResponse();
            } else {
                if (!apiKey) {
                    throw new ApiError(400, 'API key is required for custom models', 'Bad Request');
                }
                const provider = createCustomProvider(modelId, apiKey)
                const result = streamText({
                    model: provider(modelId),
                    ...baseOptions,
                });

                return result.toUIMessageStreamResponse();
            }
        } catch (error) {
            if (error instanceof ApiError) {
                throw error;
            }

            console.error('Completion streaming error:', error);
            throw new ApiError(
                500,
                'Failed to stream completion response',
                'Stream Error'
            );
        }
    }
}
