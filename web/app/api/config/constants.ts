/**
 * API configuration constants
 */
export const API_CONFIG = {
    MAX_DURATION: 30, // Maximum duration for streaming responses in seconds
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
    GEMMA_2_2B: "google/gemma-2-2b",
    CODEGEMMA_2B: "google/codegemma-2b",
    CODEGEMMA_7B: "google/codegemma-7b",

    // Meta
    LLAMA_3_2_1B: "meta-llama/Llama-3.2-1B",
    LLAMA_3_2_3B: "meta-llama/Llama-3.2-3B",

    // Alibaba Cloud
    QWEN2_5_0_5B: "Qwen/Qwen2.5-0.5B",
    QWEN2_5_1_5B: "Qwen/Qwen2.5-1.5B",
    QWEN2_5_3B: "Qwen/Qwen2.5-3B",
    QWEN2_5_7B: "Qwen/Qwen2.5-7B",
    QWEN2_5_CODER_7B: "Qwen/Qwen2.5-Coder-7B",

    // Microsoft
    PHI_3_5_MINI: "microsoft/Phi-3.5-mini",
    PHI_3_SMALL: "microsoft/Phi-3-small-8k",

    // Mistral AI
    MINISTRAL_3B: "ministral/Ministral-3b",
    MISTRAL_7B_V0_3: "mistralai/Mistral-7B-v0.3",

    // DeepSeek AI
    DEEPSEEK_CODER_6_7B: "deepseek-ai/deepseek-coder-6.7b",
    DEEPSEEK_LLM_7B: "deepseek-ai/deepseek-llm-7b",

    // Stability AI
    STABLELM_2_1_6B: "stabilityai/stablelm-2-1_6b",

    // BigCode
    STARCODER2_3B: "bigcode/starcoder2-3b",
    STARCODER2_7B: "bigcode/starcoder2-7b",
} as const;