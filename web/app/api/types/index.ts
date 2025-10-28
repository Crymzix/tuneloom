import { UIMessage } from 'ai';

/**
 * Request body for chat endpoint
 */
export interface ChatRequest {
    modelId: string;
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
 * Fine-tune job status
 */
export type FineTuneJobStatus = 'queued' | 'running' | 'completed' | 'failed';

/**
 * Fine-tune job configuration based on the Python FineTuneJob schema
 */
export interface FineTuneJobConfig {
    // Model configuration
    baseModel: string;
    outputModelName: string;
    trainingDataPath: string;
    gcsBucket: string;
    gcsBaseModelPath?: string;
    gcsOutputPath?: string;

    // Quantization
    use4bit?: boolean;
    use8bit?: boolean;

    // LoRA parameters
    loraR?: number;
    loraAlpha?: number;
    loraDropout?: number;

    // Training parameters
    learningRate?: number;
    numTrainEpochs?: number;
    perDeviceTrainBatchSize?: number;
    gradientAccumulationSteps?: number;
    maxSeqLength?: number;
    warmupSteps?: number;
    loggingSteps?: number;
    saveSteps?: number;
    evalSteps?: number;

    // Precision
    fp16?: boolean;
    bf16?: boolean;

    // Weights & Biases
    useWandb?: boolean;
    wandbProject?: string;
    wandbRunName?: string;
}

/**
 * Fine-tune job document stored in Firestore
 */
export interface FineTuneJob {
    id: string;
    userId: string;
    modelId: string;
    config: FineTuneJobConfig;
    status: FineTuneJobStatus;
    progress: number;
    createdAt: Date;
    updatedAt: Date;
    startedAt?: Date;
    completedAt?: Date;
    failedAt?: Date;
    error?: string;
    modelUrl?: string;
    cloudRunJobName?: string;
}

/**
 * Model document stored in Firestore
 * Represents a fine-tuned model owned by a user
 */
export interface Model {
    id: string;
    userId: string;
    name: string;
    baseModel: string;
    status: 'active' | 'archived';
    createdAt: Date;
    updatedAt: Date;
    metadata?: {
        description?: string;
        tags?: string[];
    };
}

/**
 * Model API key document
 *
 */
export interface ModelApiKey {
    keyId: string;
    keyHash: string;
    userId: string;
    modelId: string;
    modelName: string;
    type: 'fine-tuned' | 'base';
    createdAt: Date;
    lastUsedAt: Date | null;
    expiresAt: Date | null;
    isActive: boolean;
    metadata?: {
        jobId?: string;
        name?: string;
    };
}

/**
 * Request body for starting a fine-tune job
 */
export interface StartFineTuneRequest {
    modelName: string;
    baseModel: string;
}

/**
 * Response for starting a fine-tune job
 */
export interface StartFineTuneResponse {
    jobId: string;
    status: FineTuneJobStatus;
    message: string;
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
