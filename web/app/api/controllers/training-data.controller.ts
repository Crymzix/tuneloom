import { Context } from 'hono';
import { streamText } from 'ai';
import { googleProvider, MODELS } from '../config/providers';
import { TRAINING_DATA_CONFIG } from '../config/constants';
import { TrainingDataRequest } from '../types';
import { ApiError } from '../middleware/error-handler';
import { requireRecaptcha } from '../utils/recaptcha';

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
            // Get validated data from middleware
            const { prompt, recaptchaToken } = c.get('validatedData') as TrainingDataRequest;

            await requireRecaptcha(recaptchaToken);

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
