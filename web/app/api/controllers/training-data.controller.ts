import { Context } from 'hono';
import { generateText } from 'ai';
import { googleProvider, MODELS } from '../config/providers';
import { TRAINING_DATA_CONFIG, AGENT_ROLES } from '../config/constants';
import { TrainingDataRequest, TrainingDataWorkflowResult, TrainingExample } from '../types';
import { ApiError } from '../middleware/error-handler';
import { requireRecaptcha } from '../utils/recaptcha';
import { start } from 'workflow/api';
import { generateTrainingDataWorkflow, GenerateTrainingDataWorkflowParams } from '../workflows/training-data-workflow';
import { parseExamples } from '../utils/training-data';

/**
 * Training Data Controller
 * Handles generation of training data for fine-tuning
 */
export class TrainingDataController {
    /**
     * POST /api/generate-training-data
     * Generate training data examples based on user prompt
     * Supports both single-agent streaming and multi-agent parallel generation
     */
    static async generateTrainingData(c: Context): Promise<Response> {
        try {
            // Get validated data from middleware
            const {
                prompt,
                recaptchaToken,
                numExamples,
                numAgents,
                useAgenticPipeline,
                diverseAgents
            } = c.get('validatedData') as TrainingDataRequest;

            await requireRecaptcha(recaptchaToken);

            if (!useAgenticPipeline) {
                return await TrainingDataController.generateTrainingDataLegacy(prompt);
            }

            const params = {
                prompt,
                totalExamples: numExamples || TRAINING_DATA_CONFIG.DEFAULT_NUM_EXAMPLES,
                numAgents: numAgents || TRAINING_DATA_CONFIG.DEFAULT_NUM_AGENTS,
                useDiverseAgents: diverseAgents || false
            } as GenerateTrainingDataWorkflowParams;

            const run = await start(generateTrainingDataWorkflow, [params]);
            // Wait for the workflow to complete
            const examples = await run.returnValue;

            return Response.json(examples);
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

    /**
     * Legacy single-agent generation
     */
    private static async generateTrainingDataLegacy(prompt: string): Promise<Response> {
        try {
            const result = await generateText({
                model: googleProvider(MODELS.GOOGLE_GEMINI_FLASH),
                system: TRAINING_DATA_CONFIG.SYSTEM_PROMPT,
                prompt,
                temperature: 0.7,
            });

            const examples = parseExamples(result.text);
            return Response.json({
                examples,
                metadata: {
                    totalGenerated: examples.length,
                    afterDeduplication: examples.length,
                    numAgentsUsed: 0,
                    diverseAgents: false
                }
            } as TrainingDataWorkflowResult);
        } catch (error) {
            console.error('Legacy generation error:', error);
            throw new ApiError(
                500,
                'Failed to generate training data',
                'Generation Error'
            );
        }
    }

}
