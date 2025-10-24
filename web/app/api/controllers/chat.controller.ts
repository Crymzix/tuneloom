import { Context } from 'hono';
import { streamText, convertToModelMessages } from 'ai';
import { customProvider, MODELS } from '../config/providers';
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
            const { messages }: ChatRequest = await c.req.json();

            if (!messages || messages.length === 0) {
                throw new ApiError(400, 'Messages array is required and cannot be empty', 'Validation Error');
            }

            const result = streamText({
                model: customProvider(MODELS.CUSTOM_GEMMA),
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
