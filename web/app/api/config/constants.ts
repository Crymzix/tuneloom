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
