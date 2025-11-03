import { UIMessage } from 'ai';

/**
 * Model behavior settings for generation
 */
export interface ModelSettings {
    temperature?: number;
    topP?: number;
    topK?: number;
    maxTokens?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
}

/**
 * Request body for chat endpoint
 */
export interface ChatRequest {
    modelId: string;
    messages: UIMessage[];
    apiKey?: string;
    recaptchaToken?: string;
    settings?: ModelSettings;
}

/**
 * Request body for completion endpoint
 */
export interface CompletionRequest {
    modelId: string;
    prompt: string;
    apiKey?: string;
    recaptchaToken?: string;
    settings?: ModelSettings;
}

/**
 * Request body for training data generation endpoint
 */
export interface TrainingDataRequest {
    prompt: string;
    recaptchaToken?: string;
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
    cloudRunJobName?: string;
    modelVersionId: string;
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
    apiKeyId?: string;
    inferenceUrl?: string; // Points to the active version's endpoint

    // Version tracking
    activeVersionId: string | null; // Currently deployed version
    latestVersionId: string | null; // Most recently created version
    versionCount: number; // Total number of versions

    metadata?: {
        description?: string;
        tags?: string[];
    };
}

/**
 * Model version status
 */
export type ModelVersionStatus = 'building' | 'ready' | 'failed';

/**
 * Model version document stored in Firestore subcollection
 * Path: models/{modelId}/versions/{versionId}
 * Each fine-tune job creates a new version
 */
export interface ModelVersion {
    id: string;
    modelId: string;
    modelName: string;
    userId: string;

    // Version identification
    versionNumber: number; // Sequential: 1, 2, 3...
    versionLabel: string; // "v1", "v2", "v3"...

    // Fine-tune job that created this version
    fineTuneJobId: string;

    // GCS storage path: models/{modelName}/{versionLabel}
    adapterPath: string;

    // Status
    status: ModelVersionStatus;

    // Model configuration (snapshot from fine-tune job)
    baseModel: string;
    config: FineTuneJobConfig;

    // Training metrics
    metrics?: {
        finalLoss?: number;
        evalLoss?: number;
        trainRuntime?: number;
        trainSamplesPerSecond?: number;
        [key: string]: unknown; // Allow additional metrics
    };

    // Timestamps
    createdAt: Date;
    updatedAt: Date;
    readyAt?: Date; // When version became ready for use
    failedAt?: Date; // When version build failed
}

/**
 * Model API key document
 */
export interface ModelApiKey {
    keyId: string;
    keyHash: string;
    keySecretEncrypted: string; // Encrypted version of the actual API key for display
    userId: string;
    modelId: string;
    modelName: string;
    type: 'fine-tuned' | 'base';
    createdAt: Date;
    lastUsedAt: Date | null;
    expiresAt: Date | null;
    isActive: boolean;
    modelVersionId?: string; // If set, key is pinned to this version; if null, uses active version
    metadata?: {
        jobId?: string;
        name?: string;
    };
}

/**
 * Fine-tune settings
 */
export interface FineTuneSettings {
    epochs?: number;
    learningRate?: number;
    loraRank?: number;
    loraAlpha?: number;
    loraDropout?: number;
}

/**
 * Request body for starting a fine-tune job
 */
export interface StartFineTuneRequest {
    modelName?: string;
    modelId?: string;
    baseModel: string;
    settings?: FineTuneSettings;
    recaptchaToken?: string;
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
