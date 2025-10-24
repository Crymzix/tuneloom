import { UIMessage } from 'ai';

/**
 * Request body for chat endpoint
 */
export interface ChatRequest {
    messages: UIMessage[];
}

/**
 * Request body for training data generation endpoint
 */
export interface TrainingDataRequest {
    prompt: string;
}

/**
 * Training data example structure
 */
export interface TrainingExample {
    input: string;
    output: string;
}

/**
 * Error response structure
 */
export interface ErrorResponse {
    error: string;
    message: string;
    statusCode: number;
}

/**
 * API Response types
 */
export type ApiResponse<T = unknown> = {
    success: true;
    data: T;
} | {
    success: false;
    error: ErrorResponse;
};
