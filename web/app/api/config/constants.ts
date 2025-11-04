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

} as const;