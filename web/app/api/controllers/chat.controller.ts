import { Context } from 'hono';
import { streamText, convertToModelMessages } from 'ai';
import { createCustomProvider, customProvider } from '../config/providers';
import { ChatRequest } from '../types';
import { ApiError } from '../middleware/error-handler';
import { MODEL_IDS } from '../config/constants';
import { requireRecaptcha } from '../utils/recaptcha';

/**
 * Chat Controller
 * Handles chat streaming requests using custom provider
 */
export class ChatController {
    /**
     * POST /api/chat
     * Stream chat responses using the custom model
     */
    static async streamChat(c: Context): Promise<Response> {
        try {
            // Get validated data from middleware
            const { modelId, messages, apiKey, recaptchaToken, settings } = c.get('validatedData') as ChatRequest;

            await requireRecaptcha(recaptchaToken);

            // Build streamText options with model settings
            const baseOptions = {
                messages: convertToModelMessages(messages),
                ...(settings?.temperature !== undefined && { temperature: settings.temperature }),
                ...(settings?.topP !== undefined && { topP: settings.topP }),
                ...(settings?.topK !== undefined && { topK: settings.topK }),
                ...(settings?.maxTokens !== undefined && { maxOutputTokens: settings.maxTokens }),
                ...(settings?.frequencyPenalty !== undefined && { frequencyPenalty: settings.frequencyPenalty }),
                ...(settings?.presencePenalty !== undefined && { presencePenalty: settings.presencePenalty }),
            };

            if ((Object.values(MODEL_IDS) as string[]).includes(modelId)) {
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

            console.error('Chat streaming error:', error);
            throw new ApiError(
                500,
                'Failed to stream chat response',
                'Stream Error'
            );
        }
    }
}
