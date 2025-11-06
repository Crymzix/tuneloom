import { Context } from 'hono';
import { generateText } from 'ai';
import { googleProvider, MODELS } from '../config/providers';
import { TRAINING_DATA_CONFIG, AGENT_ROLES } from '../config/constants';
import { TrainingDataRequest, TrainingExample } from '../types';
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

            // Use agentic pipeline for parallel generation
            const examples = await TrainingDataController.generateTrainingDataWithAgents(
                prompt,
                numExamples || TRAINING_DATA_CONFIG.DEFAULT_NUM_EXAMPLES,
                numAgents || TRAINING_DATA_CONFIG.DEFAULT_NUM_AGENTS,
                diverseAgents || false
            );

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

            const examples = TrainingDataController.parseExamples(result.text);
            return Response.json(examples);
        } catch (error) {
            console.error('Legacy generation error:', error);
            throw new ApiError(
                500,
                'Failed to generate training data',
                'Generation Error'
            );
        }
    }

    /**
     * Multi-agent parallel generation with timeout safeguards
     */
    private static async generateTrainingDataWithAgents(
        prompt: string,
        totalExamples: number,
        numAgents: number,
        useDiverseAgents: boolean
    ): Promise<TrainingExample[]> {
        const examplesPerAgent = Math.ceil(totalExamples / numAgents);

        // Create agent promises with timeout protection
        const agentPromises = Array.from({ length: numAgents }, (_, i) => {
            const agentRole = useDiverseAgents
                ? AGENT_ROLES[i % AGENT_ROLES.length]
                : { name: 'standard', temperature: 0.7, systemPrompt: '' };

            return TrainingDataController.generateWithAgent(
                prompt,
                examplesPerAgent,
                agentRole.systemPrompt,
                agentRole.temperature
            );
        });

        // Race against timeout
        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => {
                reject(new ApiError(
                    408,
                    `Generation timed out after ${TRAINING_DATA_CONFIG.TIMEOUT_MS / 1000} seconds`,
                    'Timeout Error'
                ));
            }, TRAINING_DATA_CONFIG.TIMEOUT_MS);
        });

        // Execute all agents in parallel with timeout protection
        let results: TrainingExample[][];
        try {
            results = await Promise.race([
                Promise.all(agentPromises),
                timeoutPromise
            ]);
        } catch (error) {
            console.error('Agent generation failed:', error);
            throw error;
        }

        // Merge all results
        const allExamples = results.flat();
        console.log(`Generated ${allExamples.length} total examples before deduplication`);

        // Deduplicate by input
        const deduplicatedExamples = TrainingDataController.deduplicateExamples(allExamples);
        console.log(`${deduplicatedExamples.length} examples after deduplication`);

        return deduplicatedExamples;
    }

    /**
     * Generate examples with a single agent
     */
    private static async generateWithAgent(
        prompt: string,
        numExamples: number,
        agentSystemPrompt: string,
        temperature: number
    ): Promise<TrainingExample[]> {
        try {
            const fullSystemPrompt = agentSystemPrompt
                ? `${agentSystemPrompt}\n\n${TRAINING_DATA_CONFIG.SYSTEM_PROMPT}`
                : TRAINING_DATA_CONFIG.SYSTEM_PROMPT;

            const result = await generateText({
                model: googleProvider(MODELS.GOOGLE_GEMINI_FLASH),
                system: fullSystemPrompt,
                prompt: `${prompt}\n\nGenerate exactly ${numExamples} diverse training examples.`,
                temperature,
            });

            const parsed = TrainingDataController.parseExamples(result.text);
            return parsed;
        } catch (error) {
            console.error('Agent generation error:', error);
            // Return empty array on failure - other agents may succeed
            return [];
        }
    }

    /**
     * Parse examples from LLM response, handling various formats
     */
    private static parseExamples(text: string): TrainingExample[] {
        try {
            let parsed = JSON.parse(text);

            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                if (Array.isArray(parsed.examples)) {
                    parsed = parsed.examples;
                } else if (Array.isArray(parsed.data)) {
                    parsed = parsed.data;
                }
            }

            if (!Array.isArray(parsed)) {
                console.error('Parsed response is not an array');
                return [];
            }

            return parsed.filter(item =>
                item &&
                typeof item === 'object' &&
                typeof item.input === 'string' &&
                typeof item.output === 'string' &&
                item.input.trim().length > 0 &&
                item.output.trim().length > 0
            );
        } catch (error) {
            const codeBlockMatch = text.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
            if (codeBlockMatch) {
                try {
                    const parsed = JSON.parse(codeBlockMatch[1]);
                    if (Array.isArray(parsed)) {
                        return parsed.filter(item =>
                            item &&
                            typeof item === 'object' &&
                            typeof item.input === 'string' &&
                            typeof item.output === 'string'
                        );
                    }
                } catch {
                    // Fall through to return empty array
                }
            }

            console.error('Failed to parse examples:', error);
            return [];
        }
    }

    /**
     * Deduplicate examples by input text
     */
    private static deduplicateExamples(examples: TrainingExample[]): TrainingExample[] {
        const seen = new Map<string, TrainingExample>();

        for (const example of examples) {
            const normalizedInput = example.input.toLowerCase().trim();

            // Keep first occurrence of each unique input
            if (!seen.has(normalizedInput)) {
                seen.set(normalizedInput, example);
            }
        }

        return Array.from(seen.values());
    }
}
