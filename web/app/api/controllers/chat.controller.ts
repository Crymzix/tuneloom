import { Context } from 'hono';
import { streamText, convertToModelMessages } from 'ai';
import { customProvider } from '../config/providers';
import { ChatRequest } from '../types';
import { ApiError } from '../middleware/error-handler';

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
            const { modelId, messages } = c.get('validatedData') as ChatRequest;

            const result = streamText({
                model: customProvider(modelId),
                messages: convertToModelMessages(messages),
            });

            return result.toUIMessageStreamResponse();
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
