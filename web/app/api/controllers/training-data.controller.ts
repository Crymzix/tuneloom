import { Context } from 'hono';
import { streamText } from 'ai';
import { googleProvider, MODELS } from '../config/providers';
import { TRAINING_DATA_CONFIG } from '../config/constants';
import { TrainingDataRequest } from '../types';
import { ApiError } from '../middleware/error-handler';

/**
 * Training Data Controller
 * Handles generation of training data for fine-tuning
 */
export class TrainingDataController {
    /**
     * POST /api/generate-training-data
     * Generate training data examples based on user prompt
     */
    static async generateTrainingData(c: Context): Promise<Response> {
        try {
            const { prompt }: TrainingDataRequest = await c.req.json();

            if (!prompt || prompt.trim().length === 0) {
                throw new ApiError(
                    400,
                    'Prompt is required and cannot be empty',
                    'Validation Error'
                );
            }

            if (prompt.length < 10) {
                throw new ApiError(
                    400,
                    'Prompt must be at least 10 characters long',
                    'Validation Error'
                );
            }

            if (prompt.length > 5000) {
                throw new ApiError(
                    400,
                    'Prompt cannot exceed 5000 characters',
                    'Validation Error'
                );
            }

            const result = streamText({
                model: googleProvider(MODELS.GOOGLE_GEMINI_FLASH),
                system: TRAINING_DATA_CONFIG.SYSTEM_PROMPT,
                prompt,
            });

            return result.toUIMessageStreamResponse();
        } catch (error) {
            if (error instanceof ApiError) {
                throw error;
            }

            console.error('Training data generation error:', error);
            throw new ApiError(
                500,
                'Failed to generate training data',
                'Generation Error'
            );
        }
    }
}
