import { createWebhook, FatalError } from "workflow";
import { getAdminFirestore } from "../../../lib/firebase-admin";
import { getJobsClient } from "../config/providers";
import { FineTuneJob, FineTuneJobConfig, Model, ModelApiKey, ModelVersion } from "../types";
import crypto from 'crypto';
import { encrypt } from "../utils/encryption";

/**
 * Parameters for queuing a fine-tune job
 */
export interface QueueFineTuneJobParams {
    jobId: string;
    modelVersionLabel: string;
    userId: string;
    config: FineTuneJobConfig;
    webhookUrl: string;
}

export async function queueFineTuneJob(jobId: string) {
    "use workflow";

    try {
        const {
            job,
            modelVersion
        } = await fetchJobData(jobId);

        const webhook = createWebhook();

        const cloudRunJobName = await executeCloudRunJob({
            jobId,
            modelVersionLabel: modelVersion.versionLabel,
            userId: job.userId,
            config: job.config,
            webhookUrl: webhook.url,
        });

        // Workflow pauses until an HTTP request is received at the webhook URL
        const request = await webhook;
        console.log(`Received webhook request for job ${jobId}:`, request.method, request.url);
        const data = await request.json() as { success: boolean };

        if (!data.success) {
            throw new FatalError('Fine-tune job failed.');
        }

        // Update model and model version if job completed successfully. 
        // We can only get to this step if the job was successful.
        await updateModelVersioning(
            job.modelId,
            job.modelVersionId
        );

        await updateJob(jobId, {
            cloudRunJobName,
        });

        // Create API key
        await generateApiKeyForModel(
            job.config.outputModelName,
            job.modelId,
            job.userId
        );

        console.log(`Fine-tune job ${jobId} queued successfully: ${cloudRunJobName}`);
    } catch (error) {
        console.error('Error queuing fine-tune job:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to queue job';
        await markJobAsFailed(jobId, errorMessage);
    }
}

async function fetchJobData(jobId: string) {
    "use step";
    const firestore = getAdminFirestore();

    const jobDoc = await firestore
        .collection('fine-tune-jobs')
        .doc(jobId)
        .get();

    if (!jobDoc.exists) {
        // Job not found is a non-retryable error
        throw new FatalError('Job not found');
    }

    const jobData = jobDoc.data() as Omit<FineTuneJob, 'id'>;

    const modelVersionDoc = await firestore
        .collection('models')
        .doc(jobData.modelId)
        .collection('versions')
        .doc(jobData.modelVersionId)
        .get();

    if (!modelVersionDoc.exists) {
        throw new FatalError('Model version not found for the fine-tune job');
    }

    const modelVersionData = modelVersionDoc.data() as ModelVersion;

    // Convert to plain object to ensure serializability
    const job = JSON.parse(JSON.stringify(jobData)) as Omit<FineTuneJob, 'id'>
    const modelVersion = JSON.parse(JSON.stringify(modelVersionData)) as ModelVersion;

    return {
        job,
        modelVersion
    }
}

async function updateJob(jobId: string, data: {
    cloudRunJobName: string,
}) {
    "use step";
    const firestore = getAdminFirestore();

    await firestore
        .collection('fine-tune-jobs')
        .doc(jobId)
        .update({
            cloudRunJobName: data.cloudRunJobName,
            updatedAt: new Date(),
        } as Partial<FineTuneJob>);
}

async function markJobAsFailed(jobId: string, errorMessage: string) {
    "use step";
    const firestore = getAdminFirestore();

    await firestore
        .collection('fine-tune-jobs')
        .doc(jobId)
        .update({
            status: 'failed',
            error: errorMessage,
            failedAt: new Date(),
            updatedAt: new Date(),
        });
    return await firestore.runTransaction(async (transaction) => {
        const jobRef = firestore
            .collection('fine-tune-jobs')
            .doc(jobId);

        const jobDoc = await transaction.get(jobRef);
        const jobData = jobDoc.data() as FineTuneJob;
        if (!jobDoc.exists) {
            throw new Error('Job not found when marking as failed');
        }

        const versionRef = firestore
            .collection('models')
            .doc(jobData.modelId)
            .collection('versions')
            .doc(jobData.modelVersionId);

        const now = new Date();

        transaction.update(jobRef, {
            status: 'failed',
            error: errorMessage,
            failedAt: now,
            updatedAt: now,
        } as Partial<FineTuneJob>);

        transaction.update(versionRef, {
            status: 'failed',
            error: errorMessage,
            failedAt: now,
            updatedAt: now,
        } as Partial<ModelVersion>);
    });
}

async function executeCloudRunJob(params: QueueFineTuneJobParams): Promise<string> {
    "use step";
    const { jobId, config } = params;

    const client = getJobsClient();
    const projectId = await client.getProjectId()
    const name = `projects/${projectId}/locations/europe-west1/jobs/finetune-job`;

    const args = [
        `--base-model=${config.baseModel}`,
        `--output-model-name=${config.outputModelName}`,
        `--training-data-path=${config.trainingDataPath}`,
        `--gcs-bucket=${config.gcsBucket}`,
        `--job-id=${jobId}`,
        `--version-label=${params.modelVersionLabel}`,
        `--webhook-url=${params.webhookUrl}`,
    ];

    // Fine-tune settings
    if (config.loraR !== undefined) {
        args.push(`--lora-r=${config.loraR}`);
    }
    if (config.loraAlpha !== undefined) {
        args.push(`--lora-alpha=${config.loraAlpha}`);
    }
    if (config.loraDropout !== undefined) {
        args.push(`--lora-dropout=${config.loraDropout}`);
    }
    if (config.numTrainEpochs !== undefined) {
        args.push(`--num-train-epochs=${config.numTrainEpochs}`);
    }
    if (config.learningRate !== undefined) {
        args.push(`--learning-rate=${config.learningRate}`);
    }

    try {
        // Execute the job
        const [execution] = await client.runJob({
            name,
            overrides: {
                containerOverrides: [
                    {
                        args,
                    }
                ]
            }
        });

        console.log(`Cloud Run Job execution started: ${execution.name}`);
        if (!execution.name) {
            throw new Error('Cloud Run Job execution name is undefined');
        }
        return execution.name;
    } catch (error) {
        console.error('Error creating Cloud Run Job:', error);

        // Permission and quota errors are non-retryable
        if (error instanceof Error) {
            if (error.message.includes('permission denied')) {
                throw new FatalError('Permission denied: Check service account permissions for Cloud Run.');
            }
            if (error.message.includes('quota')) {
                throw new FatalError('Cloud Run quota exceeded. Please try again later.');
            }
        }

        throw new FatalError(`Failed to execute Cloud Run Job: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

async function updateModelVersioning(
    modelId: string,
    modelVersionId: string
) {
    "use step";

    const firestore = getAdminFirestore();

    return await firestore.runTransaction(async (transaction) => {
        const modelRef = firestore
            .collection('models')
            .doc(modelId);
        const modelDoc = await transaction.get(modelRef);
        const model = modelDoc.data() as Model;
        if (!modelDoc.exists) {
            throw new FatalError('Model not found when updating versioning');
        }

        const versionRef = modelRef
            .collection('versions')
            .doc(modelVersionId);

        const now = new Date();
        const version: Partial<ModelVersion> = {
            status: 'ready',
            updatedAt: now,
            readyAt: now,
        };

        transaction.update(versionRef, version);

        if (model.versionCount === 1) {
            // First version, set as active
            const updateData: Partial<Model> = {
                updatedAt: now,
                activeVersionId: modelVersionId,
            };

            transaction.update(modelRef, updateData);
        }
    });
}

async function generateApiKeyForModel(modelName: string, modelId: string, userId: string) {
    "use step";
    const firestore = getAdminFirestore();

    const keySecret = `sk_${crypto.randomBytes(32).toString('base64url')}`;
    const keyId = `ak_${crypto.randomBytes(16).toString('base64url')}`;
    const keyHash = crypto.createHash('sha256').update(keySecret).digest('hex');

    // Encrypt the key secret for storage
    const keySecretEncrypted = encrypt(keySecret);

    return await firestore.runTransaction(async (transaction) => {
        const apiKeyQuery = firestore
            .collection('api-keys')
            .where('modelId', '==', modelId)
            .limit(1);

        const apiKeySnapshot = await transaction.get(apiKeyQuery);
        if (!apiKeySnapshot.empty) {
            // API key already exists for this model
            return;
        }

        const apiKeyRef = firestore
            .collection('api-keys')
            .doc(keyId);

        transaction.set(apiKeyRef, {
            keyId,
            keyHash,
            keySecretEncrypted,
            userId,
            modelId,
            modelName,
            createdAt: new Date(),
            lastUsedAt: null,
            expiresAt: null,
            isActive: true,
            type: 'fine-tuned',
        } as ModelApiKey);

        const modelRef = firestore
            .collection('models')
            .doc(modelId);
        transaction.update(modelRef, {
            apiKeyId: keyId,
            inferenceUrl: `${process.env.OPENAI_COMPATIBLE_BASE_URL}/${modelName}`
        } as Partial<Model>);
    })
}