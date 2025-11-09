import { sleep } from "workflow";
import { generateText } from 'ai';
import { googleProvider, MODELS } from '../config/providers';
import { TRAINING_DATA_CONFIG, AGENT_ROLES } from '../config/constants';
import { TrainingDataWorkflowResult, TrainingExample } from '../types';
import { deduplicateExamples, parseExamples } from "../utils/training-data";

/**
 * Parameters for the training data generation workflow
 */
export interface GenerateTrainingDataWorkflowParams {
    prompt: string,
    totalExamples: number,
    numAgents: number,
    useDiverseAgents: boolean
}

/**
 * Main workflow function for generating training data using multiple agents
 *
 * This workflow orchestrates parallel agent execution with timeout protection
 * and deduplication of results. Each agent runs as a durable step that can
 * be resumed if the workflow is interrupted.
 *
 * @param prompt - The user's description of what training data to generate
 * @param totalExamples - Total number of examples to generate across all agents
 * @param numAgents - Number of parallel agents to use for generation
 * @param useDiverseAgents - Whether to use agents with different roles/temperatures
 * @returns Deduplicated training examples with metadata
 */
export async function generateTrainingDataWorkflow(params: GenerateTrainingDataWorkflowParams): Promise<TrainingDataWorkflowResult> {
    "use workflow";
    const { prompt, totalExamples, numAgents, useDiverseAgents } = params;
    const examplesPerAgent = Math.ceil(totalExamples / numAgents);

    console.log(`Starting workflow: ${numAgents} agents, ${examplesPerAgent} examples each`);

    // Create agent generation promises - execute in parallel
    const agentPromises = Array.from({ length: numAgents }, (_, i) => {
        const agentRole = useDiverseAgents
            ? AGENT_ROLES[i % AGENT_ROLES.length]
            : { name: 'standard', temperature: 0.7, systemPrompt: '' };

        // Each agent is a durable step
        return generateWithAgentStep(
            prompt,
            examplesPerAgent,
            agentRole.systemPrompt,
            agentRole.temperature,
            i // agent index for logging
        );
    });

    // Execute all agents in parallel with timeout protection
    // Uses Promise.race to implement timeout as recommended in docs
    // Convert timeout from milliseconds to seconds for sleep()
    const timeoutSeconds = Math.floor(TRAINING_DATA_CONFIG.TIMEOUT_MS / 1000);
    const results = await Promise.race([
        Promise.all(agentPromises),
        sleep(`${timeoutSeconds}s`).then(() => {
            throw new Error(
                `Generation timed out after ${timeoutSeconds} seconds`
            );
        })
    ]);

    // Merge all results from agents
    const mergedExamples = results.flat();
    console.log(`Generated ${mergedExamples.length} total examples before deduplication`);

    const deduplicatedExamples = deduplicateExamples(mergedExamples);

    return {
        examples: deduplicatedExamples,
        metadata: {
            totalGenerated: mergedExamples.length,
            afterDeduplication: deduplicatedExamples.length,
            numAgentsUsed: numAgents,
            diverseAgents: useDiverseAgents
        }
    };
}

/**
 * Step: Generate training examples using a single agent
 *
 * This step is durable - if the workflow is interrupted, completed agent
 * executions don't need to re-run. Each agent runs independently and
 * handles its own errors gracefully.
 *
 * @param prompt - The user's description
 * @param numExamples - Number of examples this agent should generate
 * @param agentSystemPrompt - Role-specific system prompt (optional)
 * @param temperature - Sampling temperature for this agent
 * @param agentIndex - Index of this agent for logging purposes
 * @returns Array of training examples (empty if agent fails)
 */
async function generateWithAgentStep(
    prompt: string,
    numExamples: number,
    agentSystemPrompt: string,
    temperature: number,
    agentIndex: number
): Promise<TrainingExample[]> {
    "use step";

    try {
        console.log(`Agent ${agentIndex} starting (temp=${temperature}, examples=${numExamples})`);

        // Combine role-specific prompt with base system prompt
        const fullSystemPrompt = agentSystemPrompt
            ? `${agentSystemPrompt}\n\n${TRAINING_DATA_CONFIG.SYSTEM_PROMPT}`
            : TRAINING_DATA_CONFIG.SYSTEM_PROMPT;

        // Call LLM to generate examples
        const result = await generateText({
            model: googleProvider(MODELS.GOOGLE_GEMINI_FLASH),
            system: fullSystemPrompt,
            prompt: `${prompt}\n\nGenerate exactly ${numExamples} diverse training examples.`,
            temperature,
        });

        // Parse and validate the response
        const parsed = parseExamples(result.text);

        console.log(`Agent ${agentIndex} completed: generated ${parsed.length} examples`);
        return parsed;
    } catch (error) {
        console.error(`Agent ${agentIndex} failed:`, error);
        // Return empty array - other agents may succeed
        // This allows partial success rather than complete failure
        return [];
    }
}
