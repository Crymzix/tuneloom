/**
 * API configuration constants
 */
export const API_CONFIG = {
    BASE_PATH: '/api',
} as const;

/**
 * Training data generation configuration
 */
export const TRAINING_DATA_CONFIG = {
    MIN_EXAMPLES: 5,
    MAX_EXAMPLES: 10,
    DEFAULT_NUM_EXAMPLES: 10,
    DEFAULT_NUM_AGENTS: 10,
    MAX_AGENTS: 50, // Limit to avoid rate limits and timeouts
    TIMEOUT_MS: 270000, // 270 seconds (30s buffer before Vercel's 300s limit)
    SYSTEM_PROMPT: `You are a helpful assistant that generates training data for fine-tuning language models.

Based on the user's description, generate an array of training data examples. Each example should have an "input" field (the prompt/question) and an "output" field (the expected completion/answer).

Generate at least 5-10 diverse examples that match the user's requirements.

IMPORTANT: Your response MUST be a valid JSON array of objects with this exact structure:
[
  {
    "input": "example input/prompt",
    "output": "example output/completion"
  }
]

Do not include any additional text, explanations, or markdown formatting. Only return the raw JSON array.`,
} as const;

/**
 * Agent role configurations for diverse synthetic data generation
 */
export const AGENT_ROLES = [
    {
        name: 'standard',
        temperature: 0.7,
        systemPrompt: `You are a helpful assistant that generates typical, well-structured training examples.
Focus on common use cases and standard patterns that represent the most frequent scenarios.`,
    },
    {
        name: 'creative',
        temperature: 1.0,
        systemPrompt: `You are a creative assistant that generates unusual and innovative training examples.
Focus on edge cases, rare scenarios, and creative interpretations that push boundaries.`,
    },
    {
        name: 'technical',
        temperature: 0.5,
        systemPrompt: `You are a technical expert that generates precise and detailed training examples.
Focus on technical accuracy, specialized terminology, and domain-specific knowledge.`,
    },
    {
        name: 'adversarial',
        temperature: 0.9,
        systemPrompt: `You are an analytical assistant that generates challenging training examples.
Focus on ambiguous cases, complex reasoning, boundary conditions, and examples that test model limits.`,
    },
] as const;


export const MODEL_IDS = {
    // Google
    GEMMA_3_270M: "google/gemma-3-270m",
    GEMMA_3_1B: "google/gemma-3-1b",
    GEMMA_3_4B: "google/gemma-3-4b",

    // Meta
    LLAMA_3_2_1B: "meta-llama/Llama-3.2-1B",
    LLAMA_3_2_3B: "meta-llama/Llama-3.2-3B",

    // Alibaba Cloud
    QWEN3_0_6B: "Qwen/Qwen3-0.6B",
    QWEN3_1_7B: "Qwen/Qwen3-1.7B",
    QWEN3_4B: "Qwen/Qwen3-4B",
    QWEN3_8B: "Qwen/Qwen3-8B",

    // Microsoft
    PHI_4_MINI_INSTRUCT: "microsoft/Phi-4-mini-instruct",
    PHI_4_MINI_FLASH_REASONING: "microsoft/Phi-4-mini-flash-reasoning",

    // Mistral AI
    MISTRAL_7B: "mistralai/Mistral-7B-Instruct-v0.3",

    // DeepSeek AI
    DEEPSEEK_R1_DISTILL_QWEN_1_5B: "deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B",
    DEEPSEEK_R1_DISTILL_QWEN_7B: "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B",

    // IBM
    GRANITE_4_0_H_350M: "ibm-granite/granite-4.0-h-350m",
    GRANITE_4_0_H_1B: "ibm-granite/granite-4.0-h-1b",
} as const;